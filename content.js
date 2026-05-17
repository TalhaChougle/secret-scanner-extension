(function () {
  'use strict';
  let currentRepo = null;

  function getRepo() {
    const m = window.location.pathname.match(/^\/([^/]+)\/([^/]+)/);
    if (!m) return null;
    const skip = ['settings','orgs','marketplace','explore','topics','trending','notifications','login','signup'];
    if (skip.includes(m[1])) return null;
    return `${m[1]}/${m[2].replace(/[?#].*/,'')}`;
  }

  function injectStyles() {
    if (document.getElementById('gss-styles')) return;
    const s = document.createElement('style');
    s.id = 'gss-styles';
    s.textContent = `
      #gss-btn {
        position: fixed;
        bottom: 28px;
        right: 28px;
        z-index: 999998;
        display: flex;
        align-items: center;
        gap: 10px;
        background: linear-gradient(135deg, #4dd9e0, #3b9fa5);
        color: #0f1117;
        border: none;
        border-radius: 32px;
        padding: 14px 26px;
        font-size: 14px;
        font-weight: 700;
        font-family: -apple-system, 'Inter', sans-serif;
        cursor: pointer;
        box-shadow: 0 4px 24px rgba(77,217,224,.45);
        transition: all .2s ease;
        letter-spacing: .3px;
        white-space: nowrap;
      }
      #gss-btn:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 32px rgba(77,217,224,.55);
      }
      #gss-btn:active {
        transform: translateY(0);
      }
    `;
    document.head.appendChild(s);
  }

  function injectButton() {
    if (document.getElementById('gss-btn')) return;
    const repo = getRepo();
    if (!repo) return;
    currentRepo = repo;
    injectStyles();

    const btn = document.createElement('button');
    btn.id = 'gss-btn';
    btn.innerHTML = `
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="11" cy="11" r="8"/>
        <path d="m21 21-4.35-4.35"/>
      </svg>
      Scan for Secrets
    `;
    btn.onclick = () => {
      chrome.runtime.sendMessage({ type: 'OPEN_POPUP', repo: currentRepo });
    };
    document.body.appendChild(btn);
  }

  function init() {
    const repo = getRepo();
    if (!repo) return;
    currentRepo = repo;
    injectButton();
  }

  init();

  const obs = new MutationObserver(() => {
    const repo = getRepo();
    if (repo && repo !== currentRepo) {
      currentRepo = repo;
      const btn = document.getElementById('gss-btn');
      if (btn) btn.remove();
      injectButton();
    } else if (!document.getElementById('gss-btn') && getRepo()) {
      injectButton();
    }
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();
