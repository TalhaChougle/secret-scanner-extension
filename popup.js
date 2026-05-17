const DEFAULT_API = 'https://github-secret-scanner-api.onrender.com';
let history = [];
let currentFindings = [];
let currentRepo = null;
let refreshTimer = null;

// ── Tab switching ─────────────────────────────────────────────────────────────
function goTab(id) {
  document.querySelectorAll('.ntab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('tab-' + id).classList.add('active');
  document.getElementById('page-' + id).classList.add('active');
  if (id === 'history') renderHistory();
  if (id === 'overview') renderOverview();
}

// ── Init ──────────────────────────────────────────────────────────────────────
async function init() {
  // Load settings
  const cfg = await chrome.storage.local.get(['apiUrl', 'token', 'maxCommits', 'autoScan', 'scanHistory']);
  history = cfg.scanHistory || [];
  document.getElementById('cfg-token').value = cfg.token || '';
  document.getElementById('cfg-max').value = cfg.maxCommits || 50;
  document.getElementById('cfg-api').value = cfg.apiUrl || DEFAULT_API;
  document.getElementById('cfg-auto').value = cfg.autoScan ? 'true' : 'false';

  // Check API status
  checkAPI(cfg.apiUrl || DEFAULT_API);

  // Check if floating button set a pending repo
  const pendingData = await chrome.storage.local.get('pendingRepo');
  if (pendingData.pendingRepo) {
    await chrome.storage.local.remove('pendingRepo');
  }

  // Get current tab repo
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  const m = url.match(/github\.com\/([^/]+)\/([^/]+)/);

  if (m) {
    currentRepo = `${m[1]}/${m[2].replace(/[?#].*/,'')}`;
    document.getElementById('repoName').textContent = currentRepo;
    document.getElementById('scanBtn').onclick = () => startScan(tab.id);
    document.getElementById('stopBtn').onclick = () => stopScan();

    // Show last scan result for this repo
    const last = history.find(s => s.repo === currentRepo);
    if (last) showLastScan(last);

    // Check if scan is in progress
    const liveData = (await chrome.storage.local.get('liveData')).liveData;
    if (liveData && !liveData.done && liveData.repo === currentRepo) {
      showLive(liveData);
    }
  } else {
    document.getElementById('repoName').textContent = 'Navigate to a GitHub repo';
    document.getElementById('scanBtn').disabled = true;
    document.getElementById('scanBtn').textContent = 'Open a GitHub repo first';
  }

  // Update badge counts
  updateTabBadges();

  // Start live polling
  startPolling();
}

// ── API status check ──────────────────────────────────────────────────────────
async function checkAPI(apiUrl) {
  const dot = document.getElementById('dot');
  try {
    const r = await fetch(`${apiUrl}/health`, { signal: AbortSignal.timeout(5000) });
    if (r.ok) {
      const d = await r.json();
      dot.className = 'hdot dot-on';
    } else throw new Error();
  } catch {
    dot.className = 'hdot dot-off';
  }
}

// ── Poll for live scan updates ────────────────────────────────────────────────
function startPolling() {
  refreshTimer = setInterval(async () => {
    const data = await chrome.storage.local.get(['liveData', 'scanHistory']);
    history = data.scanHistory || [];
    const live = data.liveData;

    if (live && !live.done) {
      showLive(live);
    } else if (live && live.done) {
      hideLive();
      // Refresh findings if this is current repo
      if (live.repo === currentRepo && live.findings) {
        currentFindings = live.findings;
        renderFindings();
        updateStats();
        showLastScan({ findingsCount: live.findings.length, critical: live.findings.filter(f=>f.severity==='CRITICAL').length, high: live.findings.filter(f=>f.severity==='HIGH').length, commitsScanned: live.commitsScanned || 0, findings: live.findings });
      }
    }
    updateTabBadges();
  }, 500);
}

function showLive(live) {
  const bar = document.getElementById('liveBar');
  bar.classList.add('active');
  document.getElementById('liveText').textContent = live.message || 'Scanning...';
  document.getElementById('livePct').textContent = (live.percent||0) + '%';
  document.getElementById('prog').style.display = 'block';
  const pf = document.getElementById('progFill');
  pf.style.width = (live.percent||0) + '%';
  pf.classList.add('scanning');
  document.getElementById('progText').textContent = live.message || '';
  document.getElementById('scanBtn').style.display = 'none';
  document.getElementById('stopBtn').style.display = 'block';
  document.getElementById('repoBadge').className = 'badge b-scanning';
  document.getElementById('repoBadge').textContent = 'SCANNING...';

  // Update all counters in real time
  document.getElementById('nCrit').textContent = live.critical ?? (live.findings ? live.findings.filter(f=>f.severity==='CRITICAL').length : 0);
  document.getElementById('nHigh').textContent = live.high ?? (live.findings ? live.findings.filter(f=>f.severity==='HIGH').length : 0);
  document.getElementById('nMed').textContent = live.medium ?? (live.findings ? live.findings.filter(f=>f.severity==='MEDIUM').length : 0);
  if (live.commitsScanned) document.getElementById('nCom').textContent = live.commitsScanned;

  // Show live findings
  if (live.findings && live.findings.length > 0) {
    currentFindings = live.findings;
    renderFindings();
  }
}

function hideLive() {
  document.getElementById('liveBar').classList.remove('active');
  const pf = document.getElementById('progFill');
  pf.classList.remove('scanning');
  pf.style.width = '100%';
  document.getElementById('scanBtn').style.display = 'flex';
  document.getElementById('stopBtn').style.display = 'none';
}

function showLastScan(scan) {
  const b = document.getElementById('repoBadge');
  if (scan.findingsCount === 0) {
    b.className = 'badge b-clean'; b.textContent = 'CLEAN';
  } else {
    b.className = 'badge b-found'; b.textContent = scan.findingsCount + ' SECRETS FOUND';
  }
  document.getElementById('nCrit').textContent = scan.critical || 0;
  document.getElementById('nHigh').textContent = scan.high || 0;
  document.getElementById('nMed').textContent = (scan.findingsCount||0) - (scan.critical||0) - (scan.high||0);
  document.getElementById('nCom').textContent = scan.commitsScanned || 0;

  if (scan.findings) {
    currentFindings = scan.findings;
    renderFindings();
  }
}

// ── Scan controls ─────────────────────────────────────────────────────────────
async function startScan(tabId) {
  if (!currentRepo) return;
  currentFindings = [];
  document.getElementById('findingsList').innerHTML = '';
  resetStats();
  document.getElementById('repoBadge').className = 'badge b-scanning';
  document.getElementById('repoBadge').textContent = 'SCANNING...';

  // Send directly to background — no content script involvement
  chrome.runtime.sendMessage({ type: 'START_SCAN', repo: currentRepo });
}

function stopScan() {
  chrome.runtime.sendMessage({ type: 'STOP_SCAN' });
  hideLive();
}

// ── Stats ─────────────────────────────────────────────────────────────────────
function resetStats() {
  ['nCrit','nHigh','nMed','nCom'].forEach(id => document.getElementById(id).textContent = '0');
}

function updateStats() {
  document.getElementById('nCrit').textContent = currentFindings.filter(f=>f.severity==='CRITICAL').length;
  document.getElementById('nHigh').textContent = currentFindings.filter(f=>f.severity==='HIGH').length;
  document.getElementById('nMed').textContent  = currentFindings.filter(f=>f.severity==='MEDIUM'||f.severity==='LOW').length;
}

function updateTabBadges() {
  const total = history.reduce((s,h)=>s+(h.findingsCount||0),0);
  const critTotal = history.reduce((s,h)=>s+(h.critical||0),0);
  const histTab = document.getElementById('tab-history');
  if (history.length > 0) histTab.innerHTML = `History <span class="ntab-badge">${history.length}</span>`;
}

// ── Render findings ───────────────────────────────────────────────────────────
function renderFindings() {
  const el = document.getElementById('findingsList');
  if (currentFindings.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">✅</div><div class="empty-title">No secrets found</div></div>';
    return;
  }
  el.innerHTML = currentFindings.map((f,i) => findingCard(f,i)).join('');
}

function findingCard(f, i) {
  const sev = (f.severity||'medium').toLowerCase();
  return `<div class="fcard" id="fc${i}">
    <div class="fcard-head" onclick="document.getElementById('fc${i}').classList.toggle('open')">
      <span class="fbadge fb-${sev}">${f.severity}</span>
      <div class="finfo">
        <div class="ftype">${f.type}</div>
        <div class="ffile">${f.filename||''}${f.line_number?':'+f.line_number:''}</div>
      </div>
      <span class="fchev">›</span>
    </div>
    <div class="fcard-body">
      <div class="fcode">${esc(f.line_content||'')}</div>
      <div class="frow"><span>Match</span><span>${f.match||'—'}</span></div>
      <div class="frow"><span>Author</span><span>${f.author||'—'}</span></div>
      <div class="frow"><span>Commit</span><span>${f.commit||'—'}</span></div>
      <div class="frow"><span>Date</span><span>${f.date||'—'}</span></div>
      <div class="frem">${f.remediation||''}</div>
      <div class="facts">
        ${f.commit_full&&f.repo?`<a href="https://github.com/${f.repo}/commit/${f.commit_full}" target="_blank" class="fact">View commit ↗</a>`:''}
        <button class="fact" onclick="navigator.clipboard.writeText('${(f.match||'').replace(/'/g,"\\'")}');this.textContent='Copied!'">Copy match</button>
      </div>
    </div>
  </div>`;
}

// ── Overview ──────────────────────────────────────────────────────────────────
function renderOverview() {
  const totalCrit  = history.reduce((s,h)=>s+(h.critical||0),0);
  const totalFinds = history.reduce((s,h)=>s+(h.findingsCount||0),0);
  const clean      = history.filter(h=>h.findingsCount===0).length;

  document.getElementById('ov-crit').textContent  = totalCrit;
  document.getElementById('ov-repos').textContent = history.length;
  document.getElementById('ov-total').textContent = totalFinds;
  document.getElementById('ov-clean').textContent = clean;

  const crits = history.flatMap(h=>h.findings||[]).filter(f=>f.severity==='CRITICAL').slice(0,5);
  const el = document.getElementById('ov-critical-list');
  if (crits.length === 0) {
    el.innerHTML = '<div class="empty" style="padding:20px"><div style="color:#4ade80;font-size:12px">✓ No critical findings across all scans</div></div>';
  } else {
    el.innerHTML = crits.map((f,i) => findingCard(f,i+'ov')).join('');
  }
}

// ── History ───────────────────────────────────────────────────────────────────
function renderHistory() {
  const el = document.getElementById('historyList');
  document.getElementById('hist-count').textContent = `${history.length} scan${history.length!==1?'s':''}`;

  if (history.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">📋</div><div class="empty-title">No scans yet</div><div>Scan some repos to see history here</div></div>';
    return;
  }

  el.innerHTML = history.map(s => {
    const cls = s.severity==='critical'?'hs-crit':s.severity==='high'?'hs-high':s.severity==='medium'?'hs-med':'hs-clean';
    const label = s.severity==='critical'?'CRITICAL':s.severity==='high'?'HIGH':s.severity==='medium'?'MEDIUM':'CLEAN';
    return `<div class="hist-item" onclick="window.open('https://github.com/${s.repo}','_blank')">
      <div class="hist-top">
        <span class="hist-repo">${s.repo}</span>
        <span class="hist-sev ${cls}">${label}</span>
      </div>
      <div class="hist-meta">
        <span>🕐 ${timeAgo(s.timestamp)}</span>
        <span>📝 ${s.commitsScanned||0} commits</span>
        <span>⚠ ${s.findingsCount||0} findings</span>
      </div>
    </div>`;
  }).join('');
}

// ── Settings ──────────────────────────────────────────────────────────────────
document.getElementById('saveBtn').onclick = async () => {
  const apiUrl    = document.getElementById('cfg-api').value.trim() || DEFAULT_API;
  const token     = document.getElementById('cfg-token').value.trim();
  const maxCommits= document.getElementById('cfg-max').value || 50;
  const autoScan  = document.getElementById('cfg-auto').value === 'true';
  await chrome.storage.local.set({ apiUrl, token, maxCommits, autoScan });
  const msg = document.getElementById('save-msg');
  msg.style.display = 'block';
  setTimeout(() => msg.style.display = 'none', 2000);
  checkAPI(apiUrl);
};

document.getElementById('clearBtn').onclick = async () => {
  if (!confirm('Clear all scan history?')) return;
  await chrome.storage.local.set({ scanHistory: [], liveData: null });
  history = [];
  renderHistory();
  renderOverview();
  updateTabBadges();
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function esc(t) { return String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

function timeAgo(ts) {
  const d=Date.now()-ts,m=Math.floor(d/60000),h=Math.floor(d/3600000),dy=Math.floor(d/86400000);
  if(dy>0)return`${dy}d ago`;if(h>0)return`${h}h ago`;if(m>0)return`${m}m ago`;return'just now';
}

// Cleanup on close
window.addEventListener('unload', () => { if(refreshTimer) clearInterval(refreshTimer); });

// ── Tab listeners (MV3 CSP blocks inline onclick) ─────────────────────────────
['scan','overview','history','pipeline','settings'].forEach(id => {
  document.getElementById('tab-' + id).addEventListener('click', () => goTab(id));
});

init();
