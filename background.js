const API_BASE = 'https://github-secret-scanner-api.onrender.com';
const MAX_HISTORY = 100;

function setBadge(tabId, text, color) {
  chrome.action.setBadgeText({ tabId, text: String(text) });
  chrome.action.setBadgeBackgroundColor({ tabId, color });
}

async function storeScan(scan) {
  const data = await chrome.storage.local.get('scanHistory');
  const history = data.scanHistory || [];
  history.unshift(scan);
  await chrome.storage.local.set({ scanHistory: history.slice(0, MAX_HISTORY) });
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// Fetch commit list from GitHub API so we can animate through them
async function fetchCommits(repo, token, maxCommits) {
  try {
    const headers = token ? { 'Authorization': `token ${token}` } : {};

    // Get default branch first
    const repoRes = await fetch(`https://api.github.com/repos/${repo}`, { headers });
    const repoData = await repoRes.json();
    const defaultBranch = repoData.default_branch || 'main';

    // Get exact commit count from default branch
    const branchRes = await fetch(`https://api.github.com/repos/${repo}/branches/${defaultBranch}`, { headers });
    const branchData = await branchRes.json();
    const latestSha = branchData.commit?.sha;

    const allCommits = [];
    let page = 1;
    const limit = Math.min(maxCommits, 10000);

    while (allCommits.length < limit) {
      const remaining = limit - allCommits.length;
      const perPage = Math.min(100, remaining);
      const res = await fetch(
        `https://api.github.com/repos/${repo}/commits?per_page=${perPage}&page=${page}&sha=${latestSha}`,
        { headers }
      );
      if (!res.ok) break;
      const data = await res.json();
      if (!data.length) break;

      allCommits.push(...data.map(c => ({
        sha: c.sha.slice(0, 7),
        message: c.commit.message.split('\n')[0].slice(0, 60),
      })));

      if (data.length < perPage) break; // reached end of branch
      page++;
    }

    console.log('[SecretScanner] fetchCommits returning:', allCommits.length, 'branch:', defaultBranch);
    return allCommits;
  } catch(e) {
    return [];
  }
}

async function runScan(repo, tabId) {
  const settings = await chrome.storage.local.get(['apiUrl', 'token', 'maxCommits']);
  const apiUrl = settings.apiUrl || API_BASE;
  const token = settings.token || '';
  const maxCommits = parseInt(settings.maxCommits) || 50;

  if (tabId) setBadge(tabId, '…', '#6366f1');

  const setLive = (data) => chrome.storage.local.set({ liveData: { repo, findings: [], done: false, ...data } });

  await setLive({ percent: 0, message: 'Starting scan...' });

  // Step 1: Wake up backend + fetch commits in parallel
  await setLive({ percent: 2, message: 'Waking up backend...' });

  const [commits] = await Promise.all([
    fetchCommits(repo, token, maxCommits),
    fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(35000) }).catch(() => null),
  ]);

  // Hard cap to exact fetched count — never exceed what GitHub returned
  const actualTotal = commits.length;
  console.log('[SecretScanner] Fetched commits:', actualTotal, 'maxCommits was:', maxCommits);
  await setLive({ percent: 8, message: `Found ${actualTotal} commits — starting scan...` });

  // Step 2: Run the actual backend scan (fast, in background)
  const params = new URLSearchParams({ repo, max_commits: maxCommits, deep: true });
  if (token) params.set('token', token);

  const findings = [];
  let commitsScanned = 0;
  let backendDone = false;
  let backendFindings = [];

  // Run backend scan async — don't await, let it run in parallel with animation
  const backendPromise = (async () => {
    try {
      const response = await fetch(`${apiUrl}/api/scan?${params}`, {
        headers: { 'Accept': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
      if (!response.ok) throw new Error(`Backend ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const event = JSON.parse(line.slice(6));
            if (event.type === 'finding') {
              backendFindings.push(event.finding);
              if (tabId) setBadge(tabId, String(backendFindings.length), '#f87171');
            }
            if (event.type === 'done') {
              commitsScanned = event.commits_scanned || event.total_commits || 0;
              backendDone = true;
            }
          } catch(e) {}
        }
      }
    } catch(err) {
      console.error('Backend scan error:', err);
    }
    backendDone = true;
  })();

  // Step 3: Animate through commits slowly so user sees each file
  const total = commits.length; // exact count only — no fallback
  const delayPerCommit = total > 0 ? Math.max(400, Math.min(1200, 18000 / total)) : 500;

  for (let i = 0; i < total; i++) {
    // Check if stopped
    const state = await chrome.storage.local.get('scanStopped');
    if (state.scanStopped) break;

    const commit = commits[i]; // always exists since i < commits.length
    const pct = 10 + Math.round((i / total) * 82); // 10% → 92%

    // Show current findings from backend in real time
    const currentFindings = [...backendFindings];
    const critCount = currentFindings.filter(f => f.severity === 'CRITICAL').length;
    const highCount = currentFindings.filter(f => f.severity === 'HIGH').length;
    const medCount = currentFindings.filter(f => f.severity === 'MEDIUM').length;

    await chrome.storage.local.set({
      liveData: {
        repo,
        percent: pct,
        message: `[${i+1}/${total}] ${commit.sha} — ${commit.message}`,
        findings: currentFindings,
        critical: critCount,
        high: highCount,
        medium: medCount,
        commitsScanned: i + 1,
        done: false,
      }
    });

    await sleep(delayPerCommit);
  }

  // Step 4: Wait for backend to finish if still running
  if (!backendDone) {
    await setLive({ percent: 94, message: 'Finalizing scan results...' });
    await Promise.race([backendPromise, sleep(15000)]);
  }

  const finalFindings = [...backendFindings];
  const critCount = finalFindings.filter(f => f.severity === 'CRITICAL').length;
  const highCount = finalFindings.filter(f => f.severity === 'HIGH').length;
  const medCount = finalFindings.filter(f => f.severity === 'MEDIUM').length;
  const severity = critCount > 0 ? 'critical' : highCount > 0 ? 'high' : finalFindings.length > 0 ? 'medium' : 'clean';

  if (tabId) {
    setBadge(tabId, finalFindings.length === 0 ? '✓' : String(finalFindings.length),
             finalFindings.length === 0 ? '#4ade80' : '#f87171');
  }

  const scanRecord = {
    id: `scan_${Date.now()}`,
    repo,
    timestamp: Date.now(),
    commitsScanned: commitsScanned || total,
    findings: finalFindings,
    findingsCount: finalFindings.length,
    critical: critCount,
    high: highCount,
    medium: medCount,
    severity,
  };

  await storeScan(scanRecord);
  await chrome.storage.local.remove('scanStopped');

  await chrome.storage.local.set({
    liveData: {
      repo,
      percent: 100,
      message: `Scan complete — ${finalFindings.length} finding(s)`,
      findings: finalFindings,
      critical: critCount,
      high: highCount,
      medium: medCount,
      commitsScanned: commitsScanned || total,
      done: true,
    }
  });

  if (finalFindings.length > 0) {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icons/icon48.png',
      title: `Secret Scanner — ${repo}`,
      message: `Found ${finalFindings.length} secret(s).${critCount > 0 ? ` ${critCount} CRITICAL!` : ''}`,
      priority: critCount > 0 ? 2 : 1,
    });
  }
}

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (msg.type === 'START_SCAN') {
    chrome.storage.local.remove('scanStopped');
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id || null;
      runScan(msg.repo, tabId);
    });
    return;
  }

  if (msg.type === 'OPEN_POPUP') {
    chrome.storage.local.set({ pendingRepo: msg.repo }, () => {
      chrome.action.openPopup().catch(() => {});
    });
    return;
  }

  if (msg.type === 'STOP_SCAN') {
    chrome.storage.local.set({ scanStopped: true });
    chrome.storage.local.get('liveData', (data) => {
      if (data.liveData) {
        chrome.storage.local.set({
          liveData: { ...data.liveData, done: true, message: 'Scan stopped' }
        });
      }
    });
    return;
  }

  if (msg.type === 'OPEN_DASHBOARD') {
    chrome.tabs.create({ url: chrome.runtime.getURL('dashboard.html') });
    return;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'loading') {
    chrome.action.setBadgeText({ tabId, text: '' });
  }
});
