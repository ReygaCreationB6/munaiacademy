import { store } from '../core/store.js';
import { lessons } from '../data/lessons.js';
import { layout, bindLayout } from './_layout.js';

export const dashboard = {
  path: '/dashboard',
  ariaTitle: 'Dashboard',
  render() { return layout('Dashboard', this.body()); },

  init() {
    // Wires up the sidebar, mobile menu, quota mount, and account footer.
    // Without this, the sidebar renders but nothing is interactive.
    try { bindLayout(); } catch (err) { console.error('[dashboard] bindLayout:', err); }
  },

  body() {
    const s = store.get();
    const conf = s.conference || {};
    const speeches = s.speeches || [];
    const progress = s.progress || {};

    const total = lessons.length;
    const done = Object.values(progress).filter(Boolean).length;
    const pct = total > 0 ? Math.round((done / total) * 100) : 0;

    // Skill approximation from saved speech scores.
    const skillVals = { Speech: 0, Debate: 0, Research: 0, Diplomacy: 0, 'Resolution Writing': 0 };
    for (const sp of speeches) {
      if (!sp?.scores) continue;
      skillVals.Speech = Math.max(skillVals.Speech, sp.scores.content || 0);
      skillVals.Diplomacy = Math.max(skillVals.Diplomacy, sp.scores.diplomacy || 0);
    }
    const skills = ['Speech', 'Debate', 'Research', 'Diplomacy', 'Resolution Writing'];

    const recs = [
      'Practice opening speech',
      "Research your country's position",
      'Practice POIs',
      'Improve diplomatic vocabulary',
      'Complete position paper',
      'Practice moderated caucus'
    ];

    const recent = speeches.slice(-5).reverse();

    return `
      <div class="card">
        <div class="card-header"><div>
          <div class="card-title">Welcome back, ${escape((s.profile && s.profile.name) || 'Delegate')}.</div>
          <div class="card-sub">${escape(conf.committee || '—')} · ${escape(conf.country || '—')} · ${escape(conf.topic || '—')}</div>
        </div>
        <span class="badge badge-gold">XP ${Number(s.xp) || 0}</span></div>

        <div class="mt-2">
          <div class="skill-row"><span class="skill-name">MUN Preparation</span><span class="skill-val">${pct}%</span></div>
          <div class="progress progress-lg"><div class="progress-bar" style="width:${pct}%"></div></div>
        </div>
      </div>

      <div class="grid-4 mt-2">
        ${stat('Lessons', `${done}/${total}`, 'Completed')}
        ${stat('Speeches', String(speeches.length), 'Saved')}
        ${stat('Practice', `${Number(s.xp) || 0} XP`, 'Total earned')}
        ${stat('Conference', escape(conf.committee || '—'), 'Active')}
      </div>

      <div class="grid-2 mt-2">
        <div class="card">
          <div class="card-header"><div class="card-title">Recommended Practice</div></div>
          <ul style="list-style:none;padding:0;margin:0;">
            ${recs.map(r => `<li style="padding:8px 0;border-bottom:1px solid var(--line);font-size:14px;">${r}</li>`).join('')}
          </ul>
          <div class="mt-2"><a class="btn btn-primary btn-sm" href="#/practice">Open Practice Arena</a></div>
        </div>

        <div class="card">
          <div class="card-header"><div class="card-title">Skills Overview</div></div>
          ${skills.map(k => skillBar(k, skillVals[k])).join('')}
        </div>
      </div>

      <div class="card mt-2">
        <div class="card-header">
          <div class="card-title">Recent Activity</div>
          <a class="btn btn-ghost btn-sm" href="#/coach">Ask Coach</a>
        </div>
        ${recent.length === 0
        ? `<div class="empty"><div class="empty-icon">◎</div>No activity yet. Start with a lesson or ask the coach.</div>`
        : `<ul style="list-style:none;padding:0;margin:0;">
              ${recent.map(sp => `
                <li style="padding:10px 0;border-bottom:1px solid var(--line);font-size:14px;">
                  <b>${escape(sp.title || 'Speech')}</b>
                  <span class="muted"> · ${escape(new Date(sp.createdAt || Date.now()).toLocaleDateString())}</span>
                </li>`).join('')}
             </ul>`}
      </div>`;
  }
};

function stat(label, value, sub) {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
}
function skillBar(name, val) {
  const v = Math.max(0, Math.min(100, Number(val) || 0));
  return `<div class="skill"><div class="skill-row"><span class="skill-name">${name}</span><span class="skill-val">${v}</span></div><div class="progress"><div class="progress-bar" style="width:${v}%"></div></div></div>`;
}
function escape(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}