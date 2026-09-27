import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/ui.js';
import {
  computeSkills, computeHeatmap, computeStreak, computeDeltas,
  computeTotals, SKILL_KEYS
} from '../analytics/metrics.js';
import { getRecommendations } from '../analytics/recommender.js';

export const analytics = {
  path: '/analytics',
  ariaTitle: 'Analytics',
  render() { return layout('Analytics', this.body()); },

  init() {
    try { bindLayout(); } catch (err) { console.error('[analytics] bindLayout:', err); }
  },

  body() {
    let skills, heat, streak, deltas, totals, recs;
    try {
      skills = computeSkills();
      heat = computeHeatmap(12);
      streak = computeStreak();
      deltas = computeDeltas();
      totals = computeTotals();
      recs = getRecommendations();
    } catch (err) {
      console.error('[analytics] computation failed:', err);
      return `<div class="card"><div class="card-title">Analytics unavailable</div>
        <p class="muted">We couldn't compute your analytics right now. Try reloading, or clear a few entries.</p></div>`;
    }

    const s = store.get();
    const overall = Math.round(
      SKILL_KEYS.reduce((n, k) => n + (Number(skills[k]) || 0), 0) / SKILL_KEYS.length
    );

    return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Your Progress</div>
            <div class="card-sub">Skills derived from saved work across every module.</div>
          </div>
          <span class="badge badge-gold">${Number(s.xp) || 0} XP</span>
        </div>
        <div class="an-grid mt-2">
          ${stat('Current streak', `${streak.current}d`, `${streak.longest}d longest`)}
          ${stat('This week', String(totals.inWeek), `${totals.inMonth} in last 30 days`)}
          ${stat('Overall skill', String(overall), 'Average across 5 skills')}
          ${stat('Total events', String(totals.total), 'Recorded activity')}
        </div>
      </div>

      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Skill Breakdown</div></div>
        ${SKILL_KEYS.map(k => {
      const v = Math.max(0, Math.min(100, Number(skills[k]) || 0));
      const delta = k === 'Speech' ? deltas.content : k === 'Diplomacy' ? deltas.diplomacy : null;
      const deltaEl = (delta != null && delta !== 0)
        ? `<span class="${delta > 0 ? 'delta-up' : 'delta-down'}">${delta > 0 ? '+' : ''}${delta}</span>`
        : '';
      return `
            <div class="skill">
              <div class="skill-row">
                <span class="skill-name">${escapeHtml(k)}${deltaEl}</span>
                <span class="skill-val">${v}</span>
              </div>
              <div class="progress"><div class="progress-bar" style="width:${v}%"></div></div>
            </div>`;
    }).join('')}
        <p class="muted mt-2" style="font-size:12px;">
          Delta compares the first half of your saved scores to the second half.
        </p>
      </div>

      <div class="card mt-2">
        <div class="card-header">
          <div>
            <div class="card-title">Activity Heatmap</div>
            <div class="card-sub">Last 12 weeks. Darker cells mean more practice events.</div>
          </div>
        </div>
        <div class="hm-wrap">
          <div class="hm-labels">
            <div>Sun</div><div>Mon</div><div>Tue</div><div>Wed</div><div>Thu</div><div>Fri</div><div>Sat</div>
          </div>
          <div class="hm-grid">
            ${(heat.days || []).map(d =>
      `<div class="hm-cell l${Number(d.level) || 0}" title="${escapeHtml(d.date)} · ${d.count} event${d.count === 1 ? '' : 's'}"></div>`
    ).join('')}
          </div>
        </div>
        <div class="hm-legend">
          <span>Less</span>
          <div class="hm-cell l0"></div>
          <div class="hm-cell l1"></div>
          <div class="hm-cell l2"></div>
          <div class="hm-cell l3"></div>
          <div class="hm-cell l4"></div>
          <span>More</span>
          <span style="margin-left:auto;">${Number(heat.total) || 0} total in 12 weeks</span>
        </div>
      </div>

      <div class="card mt-2">
        <div class="card-header">
          <div>
            <div class="card-title">Recommended Next</div>
            <div class="card-sub">Based on your skill profile and recent activity.</div>
          </div>
        </div>
        ${(recs || []).map(r => `
          <div class="rec-card ${escapeHtml(r.priority || 'low')}">
            <div class="rec-title">${escapeHtml(r.title || '')}</div>
            <div class="rec-desc">${escapeHtml(r.description || '')}</div>
            <div class="rec-cta"><a class="btn btn-primary btn-sm" href="${escapeHtml(r.cta?.href || '#/dashboard')}">${escapeHtml(r.cta?.label || 'Open')}</a></div>
          </div>`).join('')}
      </div>

      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Activity Breakdown</div></div>
        ${renderBreakdown(totals.byKind || {})}
      </div>`;
  }
};

function stat(label, value, sub) {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
}

function renderBreakdown(byKind) {
  const entries = Object.entries(byKind);
  if (!entries.length) {
    return `<p class="muted" style="font-size:13px;">No activity yet. Complete a lesson or save a speech to see data here.</p>`;
  }
  const total = entries.reduce((n, [, v]) => n + v, 0);
  const labels = {
    'lesson-complete': 'Lessons completed',
    'speech': 'Speeches saved',
    'position-paper': 'Position papers',
    'resolution': 'Resolutions',
    'simulation': 'Simulations',
    'crisis-choice': 'Crisis responses',
    'research': 'Research sessions'
  };
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => {
      const pct = total > 0 ? Math.round((v / total) * 100) : 0;
      return `<div class="skill">
        <div class="skill-row">
          <span class="skill-name">${escapeHtml(labels[k] || k)}</span>
          <span class="skill-val">${v} · ${pct}%</span>
        </div>
        <div class="progress"><div class="progress-bar" style="width:${pct}%"></div></div>
      </div>`;
    }).join('');
}