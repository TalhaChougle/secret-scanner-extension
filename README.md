# 🔍 Secret Scanner — GitHub Security Extension

A Chrome extension that scans GitHub repositories for exposed secrets, API keys, tokens, and passwords — right from your browser.

Built as a portfolio project by [Talha Chougle](https://github.com/TalhaChougle), an aspiring penetration tester.

---

## What it does

Ever pushed code and wondered *"did I accidentally leave an API key in there?"* — Secret Scanner answers that question in seconds.

It scans through a repo's commit history, runs pattern matching against 14+ secret detection rules, and tells you exactly what was found and where.

No setup. No CLI. Just install and scan.

---

## Features

- **One-click scanning** — floating button appears on any GitHub repo page
- **Live commit-by-commit progress** — watch it scan each commit in real time
- **Finds the serious stuff** — API keys, AWS credentials, GitHub tokens, private keys, passwords, and more
- **Risk scoring** — findings rated CRITICAL, HIGH, or MEDIUM
- **Scan history** — every scan saved locally so you can revisit results
- **Pipeline view** — see exactly how the scan agent works under the hood
- **Clean popup UI** — all tabs accessible from the extension icon

---

## Installation

Secret Scanner isn't on the Chrome Web Store yet. Install it manually in under a minute:

1. Download this repo as a ZIP → click the green **Code** button → **Download ZIP**
2. Extract the ZIP on your computer
3. Open Chrome and go to `chrome://extensions`
4. Enable **Developer mode** (toggle in the top right)
5. Click **Load unpacked**
6. Select the extracted folder
7. The Secret Scanner icon will appear in your toolbar

---

## Setup

After installing, you need a free GitHub token so the scanner can read repository data without hitting rate limits.

**Getting your token:**
1. Go to [github.com/settings/tokens](https://github.com/settings/tokens)
2. Click **Generate new token (classic)**
3. Give it any name (e.g. `secret-scanner`)
4. Set expiration to **No expiration**
5. Check only **`public_repo`** under the repo section
6. Click **Generate token** and copy it immediately

**Adding it to the extension:**
1. Click the Secret Scanner icon in your toolbar
2. Go to the **Settings** tab
3. Paste your token into the GitHub Token field
4. Click **Save Settings**

That's it. You only do this once.

---

## How to use

1. Navigate to any public GitHub repository
2. Click the **Scan for Secrets** button that appears at the bottom right of the page
3. The extension popup opens and starts scanning
4. Watch it go through each commit live
5. Results show up under CRITICAL / HIGH / MEDIUM counters
6. Full findings are listed below with file paths and matched patterns
7. Check the **History** tab to revisit past scans
8. Check the **Pipeline** tab to see how the scan agent works

---

## How it works
Scan Triggered
↓
Service Worker (background orchestrator)
↓
GitHub API (fetches commit history)
↓
Render Backend (streams scan via SSE)
↓
Pattern Matcher (14+ regex rules)
↓
Risk Scorer (CRITICAL · HIGH · MEDIUM)
↓
Results saved to chrome.storage

The backend runs on Render — no setup needed on your end. The extension connects to it automatically.

---

## Tech stack

- **Frontend** — Vanilla JS, HTML/CSS (Chrome Extension MV3)
- **Backend** — Python / FastAPI hosted on Render
- **APIs** — GitHub REST API, SSE streaming
- **Storage** — chrome.storage.local

---

## Screenshots

<img width="527" height="617" alt="image" src="https://github.com/user-attachments/assets/d3d34fec-ec16-4172-836c-1167a79d6b8f" />

<img width="522" height="587" alt="image" src="https://github.com/user-attachments/assets/3d9c94f5-75b4-43cb-ad38-fcbe38982191" />

<img width="522" height="616" alt="image" src="https://github.com/user-attachments/assets/5b8bcd5d-168e-4bab-9958-0fcfb30847d9" />



---

## Disclaimer

This tool is built for **ethical security research and educational purposes only**. Only scan repositories you own or have explicit permission to test. The developer is not responsible for any misuse.

---

## Author

**Talha Chougle**
Aspiring Penetration Tester · CTF Player · Security Researcher

[GitHub](https://github.com/TalhaChougle)

---

*Built with curiosity and too many late nights.*
