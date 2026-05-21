import re
import os
import asyncio
import httpx
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
import json

app = FastAPI(title="GitHub Secret Scanner API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Secret patterns ────────────────────────────────────────────────────────────
PATTERNS = [
    {"type": "AWS Access Key",         "severity": "CRITICAL", "regex": r"AKIA[0-9A-Z]{16}"},
    {"type": "AWS Secret Key",         "severity": "CRITICAL", "regex": r"(?i)aws.{0,20}secret.{0,20}['\"][0-9a-zA-Z/+]{40}['\"]"},
    {"type": "GitHub Token",           "severity": "CRITICAL", "regex": r"ghp_[a-zA-Z0-9]{36}"},
    {"type": "GitHub OAuth",           "severity": "CRITICAL", "regex": r"gho_[a-zA-Z0-9]{36}"},
    {"type": "GitHub App Token",       "severity": "CRITICAL", "regex": r"(ghu|ghs|ghr)_[a-zA-Z0-9]{36}"},
    {"type": "GitHub Fine-grained",    "severity": "CRITICAL", "regex": r"github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}"},
    {"type": "Stripe Secret Key",      "severity": "CRITICAL", "regex": r"sk_live_[0-9a-zA-Z]{24,}"},
    {"type": "Stripe Publishable Key", "severity": "HIGH",     "regex": r"pk_live_[0-9a-zA-Z]{24,}"},
    {"type": "Stripe Test Key",        "severity": "MEDIUM",   "regex": r"sk_test_[0-9a-zA-Z]{24,}"},
    {"type": "Twilio API Key",         "severity": "CRITICAL", "regex": r"SK[0-9a-fA-F]{32}"},
    {"type": "Twilio Account SID",     "severity": "HIGH",     "regex": r"AC[a-zA-Z0-9]{32}"},
    {"type": "SendGrid API Key",       "severity": "CRITICAL", "regex": r"SG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}"},
    {"type": "Mailgun API Key",        "severity": "HIGH",     "regex": r"key-[0-9a-zA-Z]{32}"},
    {"type": "Google API Key",         "severity": "HIGH",     "regex": r"AIza[0-9A-Za-z\\-_]{35}"},
    {"type": "Google OAuth",           "severity": "HIGH",     "regex": r"[0-9]+-[0-9A-Za-z_]{32}\\.apps\\.googleusercontent\\.com"},
    {"type": "Firebase URL",           "severity": "MEDIUM",   "regex": r"https://[a-zA-Z0-9-]+\\.firebaseio\\.com"},
    {"type": "Slack Token",            "severity": "CRITICAL", "regex": r"xox[baprs]-[0-9a-zA-Z-]{10,}"},
    {"type": "Slack Webhook",          "severity": "HIGH",     "regex": r"https://hooks\\.slack\\.com/services/T[a-zA-Z0-9_]+/B[a-zA-Z0-9_]+/[a-zA-Z0-9_]+"},
    {"type": "Discord Token",          "severity": "CRITICAL", "regex": r"[MN][a-zA-Z0-9]{23}\.[a-zA-Z0-9-_]{6}\.[a-zA-Z0-9-_]{27}"},
    {"type": "Discord Webhook",        "severity": "HIGH",     "regex": r"https://discord(app)?\\.com/api/webhooks/[0-9]+/[a-zA-Z0-9_-]+"},
    {"type": "Telegram Bot Token",     "severity": "CRITICAL", "regex": r"[0-9]{8,10}:[a-zA-Z0-9_-]{35}"},
    {"type": "Twitter API Key",        "severity": "HIGH",     "regex": r"(?i)twitter.{0,20}['\"][0-9a-zA-Z]{18,25}['\"]"},
    {"type": "Twitter Secret",         "severity": "HIGH",     "regex": r"(?i)twitter.{0,20}secret.{0,20}['\"][0-9a-zA-Z]{35,44}['\"]"},
    {"type": "Facebook Token",         "severity": "HIGH",     "regex": r"EAACEdEose0cBA[0-9A-Za-z]+"},
    {"type": "Heroku API Key",         "severity": "HIGH",     "regex": r"[hH]eroku.{0,20}[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"},
    {"type": "DigitalOcean Token",     "severity": "CRITICAL", "regex": r"dop_v1_[a-f0-9]{64}"},
    {"type": "NPM Token",              "severity": "CRITICAL", "regex": r"npm_[a-zA-Z0-9]{36}"},
    {"type": "PyPI Token",             "severity": "CRITICAL", "regex": r"pypi-AgEIcHlwaS5vcmc[a-zA-Z0-9_-]{50,}"},
    {"type": "Private Key",            "severity": "CRITICAL", "regex": r"-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----"},
    {"type": "PGP Private Key",        "severity": "CRITICAL", "regex": r"-----BEGIN PGP PRIVATE KEY BLOCK-----"},
    {"type": "JWT Token",              "severity": "HIGH",     "regex": r"eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+"},
    {"type": "Basic Auth URL",         "severity": "HIGH",     "regex": r"https?://[a-zA-Z0-9_-]+:[a-zA-Z0-9_-]+@[a-zA-Z0-9.-]+"},
    {"type": "Generic API Key",        "severity": "MEDIUM",   "regex": r"(?i)(api_key|apikey|api-key)\s*[=:]\s*['\"]?[a-zA-Z0-9_\-]{20,}['\"]?"},
    {"type": "Generic Secret",         "severity": "MEDIUM",   "regex": r"(?i)(secret|password|passwd|pwd)\s*[=:]\s*['\"]?[a-zA-Z0-9!@#$%^&*_\-]{8,}['\"]?"},
    {"type": "Generic Token",          "severity": "MEDIUM",   "regex": r"(?i)(token|auth_token|access_token)\s*[=:]\s*['\"]?[a-zA-Z0-9_\-\.]{20,}['\"]?"},
    {"type": "Connection String",      "severity": "HIGH",     "regex": r"(?i)(mongodb|mysql|postgres|redis|amqp)://[^\s\"']+"},
    {"type": "SSH Private Key",        "severity": "CRITICAL", "regex": r"-----BEGIN OPENSSH PRIVATE KEY-----"},
    {"type": "Databricks Token",       "severity": "CRITICAL", "regex": r"dapi[a-h0-9]{32}"},
    {"type": "Vault Token",            "severity": "CRITICAL", "regex": r"hvs\.[a-zA-Z0-9]{24}"},
    {"type": "OpenAI API Key",         "severity": "CRITICAL", "regex": r"sk-[a-zA-Z0-9]{48}"},
    {"type": "Anthropic API Key",      "severity": "CRITICAL", "regex": r"sk-ant-[a-zA-Z0-9\-]{90,}"},
    {"type": "Cloudflare API Key",     "severity": "CRITICAL", "regex": r"(?i)cloudflare.{0,20}['\"][a-f0-9]{37}['\"]"},
    {"type": "Artifactory Token",      "severity": "HIGH",     "regex": r"(?:\s|=|:|,|\"|\')AKC[a-zA-Z0-9]{10,}"},
]

COMPILED = [(p, re.compile(p["regex"])) for p in PATTERNS]

# Whitelist — skip test/example values
WHITELIST = [
    r"example", r"placeholder", r"your[_-]?key", r"your[_-]?token",
    r"<.*>", r"\$\{.*\}", r"xxxx", r"1234", r"test", r"dummy",
    r"changeme", r"replace", r"insert", r"put[_-]?your",
]
WHITELIST_RE = [re.compile(w, re.IGNORECASE) for w in WHITELIST]

SKIP_EXTENSIONS = {
    '.png', '.jpg', '.jpeg', '.gif', '.svg', '.ico', '.woff', '.woff2',
    '.ttf', '.eot', '.mp4', '.mp3', '.zip', '.tar', '.gz', '.pdf',
    '.lock', '.min.js', '.min.css',
}

def should_skip_file(filename):
    for ext in SKIP_EXTENSIONS:
        if filename.endswith(ext):
            return True
    return False

def is_whitelisted(value):
    for w in WHITELIST_RE:
        if w.search(value):
            return True
    return False

def scan_content(content, filename, commit_sha, author, date, repo):
    findings = []
    lines = content.split('\n')
    for i, line in enumerate(lines):
        if len(line) > 1000:
            continue
        for pattern, compiled in COMPILED:
            match = compiled.search(line)
            if match:
                matched_value = match.group(0)
                if is_whitelisted(matched_value):
                    continue
                findings.append({
                    "type": pattern["type"],
                    "severity": pattern["severity"],
                    "filename": filename,
                    "line_number": i + 1,
                    "line_content": line.strip()[:200],
                    "match": matched_value[:100],
                    "commit": commit_sha[:7] if commit_sha else "",
                    "commit_full": commit_sha,
                    "author": author,
                    "date": date,
                    "repo": repo,
                    "remediation": f"Rotate this {pattern['type']} immediately and remove from git history.",
                })
    return findings

async def get_commits(repo, token, max_commits, client):
    headers = {"Authorization": f"token {token}"} if token else {}
    headers["Accept"] = "application/vnd.github.v3+json"

    # Get default branch
    r = await client.get(f"https://api.github.com/repos/{repo}", headers=headers)
    default_branch = r.json().get("default_branch", "main")

    commits = []
    page = 1
    while len(commits) < max_commits:
        remaining = max_commits - len(commits)
        per_page = min(100, remaining)
        r = await client.get(
            f"https://api.github.com/repos/{repo}/commits",
            params={"per_page": per_page, "page": page, "sha": default_branch},
            headers=headers,
        )
        if r.status_code != 200:
            break
        data = r.json()
        if not data:
            break
        commits.extend(data)
        if len(data) < per_page:
            break
        page += 1

    return commits[:max_commits]

async def scan_commit(repo, commit_sha, token, client):
    headers = {"Authorization": f"token {token}"} if token else {}
    headers["Accept"] = "application/vnd.github.v3+json"
    r = await client.get(
        f"https://api.github.com/repos/{repo}/commits/{commit_sha}",
        headers=headers,
    )
    if r.status_code != 200:
        return []

    data = r.json()
    author = data.get("commit", {}).get("author", {}).get("name", "Unknown")
    date = data.get("commit", {}).get("author", {}).get("date", "")
    files = data.get("files", [])
    findings = []

    for f in files:
        filename = f.get("filename", "")
        if should_skip_file(filename):
            continue
        patch = f.get("patch", "")
        if not patch:
            continue
        # Only scan added lines (starting with +)
        added_lines = '\n'.join(
            line[1:] for line in patch.split('\n')
            if line.startswith('+') and not line.startswith('+++')
        )
        if added_lines:
            findings.extend(scan_content(added_lines, filename, commit_sha, author, date, repo))

    return findings

@app.get("/health")
async def health():
    return {"status": "ok", "service": "github-secret-scanner"}

@app.get("/api/scan")
async def scan(
    repo: str = Query(...),
    max_commits: int = Query(50),
    token: str = Query(""),
    deep: bool = Query(False),
):
    async def event_stream():
        async with httpx.AsyncClient(timeout=30) as client:
            try:
                commits = await get_commits(repo, token, max_commits, client)
                total = len(commits)

                yield f"data: {json.dumps({'type': 'progress', 'percent': 5, 'message': f'Found {total} commits'})}\n\n"

                all_findings = []
                for i, commit in enumerate(commits):
                    sha = commit["sha"]
                    msg = commit["commit"]["message"].split('\n')[0][:60]
                    pct = 10 + int((i / total) * 85) if total else 95

                    yield f"data: {json.dumps({'type': 'progress', 'percent': pct, 'message': f'[{i+1}/{total}] {sha[:7]} — {msg}'})}\n\n"

                    findings = await scan_commit(repo, sha, token, client)
                    for finding in findings:
                        all_findings.append(finding)
                        yield f"data: {json.dumps({'type': 'finding', 'finding': finding})}\n\n"

                    await asyncio.sleep(0.05)

                yield f"data: {json.dumps({'type': 'done', 'commits_scanned': total, 'total_findings': len(all_findings)})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
