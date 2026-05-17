# 🔍 GitHub Secret Scanner

> A browser extension that automatically scans GitHub repositories for leaked API keys, passwords, and credentials buried in commit history.

![Version](https://img.shields.io/badge/version-2.0.0-4dd9e0?style=flat-square)
![Manifest](https://img.shields.io/badge/manifest-v3-a371f7?style=flat-square)
![Browser](https://img.shields.io/badge/Browser-Extension-f87171?style=flat-square)

---

## 🚀 Quick Install (30 Seconds!)

### For Judges & Reviewers ⚡

📦 **[Download Extension Here](https://github.com/TalhaChougle/secret-scanner-extension/releases/latest/download/secret-scanner-extension.zip)**

**Installation Steps:**

1. Download `secret-scanner-extension.zip` from the link above
2. **Extract the ZIP file** to a folder on your computer
3. Open your browser and go to `chrome://extensions/`
4. Enable **"Developer mode"** (toggle in top-right corner)
5. Click **"Load unpacked"** button
6. Select the `secret-scanner-fixed` folder (from the extracted files)
7. Done! 🎉

**Total time: 30 seconds** ⏱️

> No server setup. No npm install. No terminal commands. Just install and use!

---

## 🧠 What It Does

GitHub Secret Scanner watches your back while you browse GitHub. The moment you open any repository, it injects a **"Scan for Secrets"** button directly onto the page. One click triggers a full pipeline scan across the repo's commit history — surfacing leaked credentials before attackers find them first.

### Detects
- 🔑 API Keys (OpenAI, AWS, Stripe, Google, etc.)
- 🔐 Passwords & tokens hardcoded in source
- 🪪 OAuth secrets & private keys
- 📄 `.env` file leaks in commit diffs

---

## ✨ Features

| Feature | Description |
|---|---|
| **One-click scan** | Floating "Scan for Secrets" button injected on every GitHub repo page |
| **Live commit animation** | Watch each commit being scanned in real time |
| **Risk scoring** | Findings rated `CRITICAL` / `HIGH` / `MEDIUM` |
| **Scan history** | Last 100 scans stored locally via browser storage |
| **Desktop notifications** | Instant alert when secrets are found |
| **Badge counter** | Extension icon shows live finding count during scan |
| **Full dashboard** | Detailed scan history with filtering and export |
| **Configurable** | Custom GitHub token, API endpoint, max commits |
| **Stop anytime** | Cancel a running scan mid-way |

---

## 🔄 How It Works — Scan Agent Pipeline

```
⚡ SCAN TRIGGERED  (button click on GitHub page)
        │
        ▼
⚙️  SERVICE WORKER  (background.js orchestrates everything)
        │
        ▼
📦 GITHUB API      (fetch commit list & diffs)
        │
        ▼
🌍 RENDER BACKEND  (stream scan results via SSE)
        │
        ▼
🔍 PATTERN MATCHER (regex across API keys · tokens · secrets)
        │
        ▼
📊 RISK SCORER     (CRITICAL · HIGH · MEDIUM classification)
       /│\
      / │ \
     ▼  ▼  ▼
🚨      💾      ✅
SECRETS  SAVE   CLEAN
FOUND   HISTORY
```

The backend runs on [Render](https://render.com) and streams results back via **Server-Sent Events (SSE)** so findings appear in real time as each commit is processed.

---

## 🗂️ Project Structure

```
secret-scanner-fixed/
├── manifest.json       # Browser extension manifest (v3)
├── popup.html          # Extension popup UI (tabs: Scan, Pipeline, History, Settings)
├── popup.js            # Popup logic — scan triggers, live updates, history render
├── background.js       # Service worker — orchestrates scan, SSE stream, badge
├── content.js          # Injected into GitHub pages — adds "Scan for Secrets" button
├── dashboard.html      # Full-screen scan history dashboard
└── icons/
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

---

## ⚙️ Configuration

Open the extension popup → **Settings** tab:

| Setting | Default | Description |
|---|---|---|
| GitHub Token | _(empty)_ | Personal access token for private repos & higher rate limits |
| API Endpoint | `https://github-secret-scanner-api.onrender.com` | Backend URL |
| Max Commits | `50` | How many commits to scan per run |

> Without a token, GitHub API allows ~60 requests/hour. With a token: 5,000/hour.

---

## 🛠️ Backend

The scan backend is a separate service hosted on Render:

- **Endpoint:** `https://github-secret-scanner-api.onrender.com`
- **Health check:** `GET /health`
- **Scan:** `GET /api/scan?repo=owner/repo&max_commits=50&deep=true`
- **Protocol:** Server-Sent Events (SSE) — streams `finding` and `done` events

> ⚠️ The Render free tier spins down after inactivity. The extension automatically wakes it up before scanning (adds ~10s on cold start).

---

## 🔒 Permissions

| Permission | Reason |
|---|---|
| `activeTab` | Read current GitHub tab URL to extract repo name |
| `storage` | Save scan history and settings locally |
| `notifications` | Alert when secrets are found |
| `tabs` | Open dashboard in a new tab |
| `https://github.com/*` | Inject scan button on GitHub pages |
| `https://github-secret-scanner-api.onrender.com/*` | Talk to the scan backend |

---

## 🧪 Testing It Out

1. Install the extension (see Quick Install above)
2. Navigate to any public GitHub repository
3. Look for the **"🔍 Scan for Secrets"** button in the bottom-right corner
4. Click it — the popup opens and the scan begins automatically
5. Watch commits animate in real time
6. Check the **Pipeline** tab to see the full agent flow
7. Check the **History** tab for past scans

**Good repos to test on** (known to have had leaked secrets in history):
- Any large open-source project with long commit history
- Your own repos (great for personal hygiene checks)

---

## 📋 Permissions Justification

This extension requests only the minimum permissions needed. No data is sent to third parties except the scan backend (`onrender.com`). Scan results and history are stored **locally only** via browser storage. No analytics, no tracking, no external logging.

---

## 📄 License

MIT — free to use, modify, and distribute.
