import { auth } from '../core/auth.js';
import { escapeHtml } from '../core/ui.js';
import { icons } from '../core/icons.js';
import { quota } from '../core/quota.js';
import { cloudSync } from '../core/cloudSync.js';

export function layout(title, body, opts = {}) {
  const cls = opts.full ? 'page page-full' : opts.narrow ? 'page page-narrow' : 'page';
  return `
    <div class="app-shell">
      ${sidebar()}
      <div class="main">
        <header class="topbar">
          <button class="mobile-menu-btn" id="menuBtn" aria-label="Open menu">
            ${icons.menu}
          </button>
          <h1 class="topbar-title">${title}</h1>
          <div class="topbar-spacer"></div>
          <div class="quota-mount" id="quotaMount" role="button" tabindex="0" aria-label="AI quota"></div>
          ${opts.actions || ''}
        </header>
        <main class="${cls}">${body}</main>
      </div>
    </div>
    ${mobileTabs()}`;
}

function sidebar() {
  const link = (href, label, icon) =>
    `<a class="nav-link" href="#${href}" data-path="${href}">
      <span class="nav-icon">${icon}</span>
      <span>${label}</span>
    </a>`;
  return `
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header">
        <a href="#/dashboard" class="brand">
          <span class="brand-mark">M</span>
          <span class="brand-text">
            <span class="brand-name">MUN AI Academy</span>
            <span class="brand-sub">Delegate Console</span>
          </span>
        </a>
      </div>
      <nav class="sidebar-nav">
        ${link('/dashboard', 'Dashboard', icons.dashboard)}
        ${link('/guide', 'Guide', icons.book)}
        <div class="nav-group">Learn</div>
        ${link('/learn', 'Learn MUN', icons.book)}
        ${link('/knowledge', 'Knowledge Base', icons.search)}
        <div class="nav-group">Prepare</div>
        ${link('/research', 'Country Research', icons.globe)}
        ${link('/speech', 'Speech Trainer', icons.mic)}
        ${link('/paper', 'Position Paper', icons.file)}
        ${link('/resolution', 'Resolution Builder', icons.fileCheck)}
        <div class="nav-group">Practice</div>
        ${link('/debate', 'Debate Trainer', icons.message)}
        ${link('/poi', 'POI Trainer', icons.help)}
        ${link('/practice', 'Practice Arena', icons.target)}
        <div class="nav-group">Multiplayer</div>
        ${link('/rooms', 'Multiplayer Rooms', icons.globe)}
        <div class="nav-group">Simulate</div>
        ${link('/simulate', 'Conference Simulation', icons.play)}
        <div class="nav-group">AI</div>
        ${link('/coach', 'AI Coach', icons.sparkle)}
        ${link('/educator', 'Educator Hub', icons.book)}
        ${link('/author', 'Author Content', icons.file)}
        ${link('/settings', 'AI Settings', icons.sliders)}
        <div class="nav-group">Progress</div>
        ${link('/analytics', 'Analytics', icons.bar)}
        ${link('/achievements', 'Achievements', icons.check)}
      </nav>
      <div class="sidebar-footer" id="sidebarAccount"></div>
    </aside>`;
}

function mobileTabs() {
  const tab = (href, label, icon) =>
    `<a class="mobile-tab" href="#${href}" data-path="${href}">
      ${icon}<span>${label}</span>
    </a>`;
  return `
    <nav class="mobile-tabbar">
      ${tab('/dashboard', 'Home', icons.dashboard)}
      ${tab('/learn', 'Learn', icons.book)}
      ${tab('/coach', 'Coach', icons.sparkle)}
      ${tab('/analytics', 'Stats', icons.bar)}
      ${tab('/settings', 'Setup', icons.sliders)}
    </nav>`;
}

export function bindLayout() {
  const menuBtn = document.getElementById('menuBtn');
  const sidebar = document.getElementById('sidebar');

  if (menuBtn && sidebar) {
    menuBtn.onclick = (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('open');
    };
  }

  document.querySelectorAll('.nav-link, .mobile-tab').forEach(a => {
    a.addEventListener('click', () => {
      if (window.innerWidth <= 768 && sidebar) sidebar.classList.remove('open');
    });
  });

  if (!window.__munaiSidebarOutside) {
    window.__munaiSidebarOutside = true;
    document.addEventListener('click', e => {
      if (window.innerWidth > 768) return;
      const sb = document.getElementById('sidebar');
      if (!sb?.classList.contains('open')) return;
      if (sb.contains(e.target)) return;
      if (e.target.closest('#menuBtn')) return;
      sb.classList.remove('open');
    });
  }

  const path = location.hash.replace(/^#/, '') || '/dashboard';
  document.querySelectorAll('.nav-link').forEach(a => {
    a.classList.toggle('active', a.dataset.path === path);
  });
  document.querySelectorAll('.mobile-tab').forEach(a => {
    a.classList.toggle('active', a.dataset.path === path);
  });

  // Mount the quota indicator into the new topbar.
  const quotaEl = document.getElementById('quotaMount');
  if (quotaEl) quota.mount(quotaEl);

  renderAccountFooter();
}

function renderAccountFooter() {
  const el = document.getElementById('sidebarAccount');
  if (!el) return;
  const user = auth.getUser();
  const available = auth.isAvailable();

  if (!available) {
    el.innerHTML = `<span class="status">Local mode · no cloud</span>`;
    return;
  }
  if (!user) {
    el.innerHTML = `<span class="status">Not signed in</span>
                    <a href="#/login">Sign in to sync</a>`;
    return;
  }
  el.innerHTML = `
    <span class="email" title="${escapeHtml(user.email || '')}">${escapeHtml(user.email || 'Signed in')}</span>
    <span class="status">Cloud sync active</span>
    <button id="signOutBtn">Sign out</button>`;
  document.getElementById('signOutBtn').onclick = async () => {
    if (!confirm('Sign out? Your local data stays on this device.')) return;
    cloudSync.cancelPending();   // drop any queued writes — user is leaving
    await auth.signOut();
    location.hash = '/dashboard';
    location.reload();
  };
}