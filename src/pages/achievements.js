import { layout, bindLayout } from './_layout.js';
import {
    ACHIEVEMENTS,
    TIERS,
    getUnlockedSet,
    getUnlockedAt,
    countsByCategory,
    overallProgress
} from '../analytics/achievements.js';
import { escapeHtml } from '../core/ui.js';

const TIER_LABEL = {
    bronze: 'Bronze',
    silver: 'Silver',
    gold: 'Gold',
    platinum: 'Platinum'
};

export const achievementsPage = {
    path: '/achievements',
    ariaTitle: 'Achievements',

    render() {
        return layout('Achievements', this.body(), { narrow: false });
    },

    init() {
        try { bindLayout(); } catch (err) { console.error('[achievements] bindLayout:', err); }
    },

    body() {
        const { unlocked, total } = overallProgress();
        const unlockedSet = getUnlockedSet();
        const pct = Math.round((unlocked / total) * 100);
        const byCategory = countsByCategory();

        // Group achievements by category, preserving ACHIEVEMENTS order.
        const grouped = {};
        for (const a of ACHIEVEMENTS) {
            (grouped[a.category] ||= []).push(a);
        }

        return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Achievements</div>
            <div class="card-sub">Badges earned by practicing across the platform.</div>
          </div>
          <span class="badge badge-gold">${unlocked} / ${total}</span>
        </div>

        <div class="ach-progress">
          <div class="ach-progress-bar">
            <div class="ach-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="ach-progress-label">${pct}% complete</div>
        </div>

        <div class="ach-category-grid">
          ${byCategory.map(c => `
            <div class="ach-category-stat">
              <div class="ach-category-name">${escapeHtml(c.category)}</div>
              <div class="ach-category-count">
                <b>${c.unlocked}</b> <span class="muted">/ ${c.total}</span>
              </div>
            </div>`).join('')}
        </div>
      </div>

      ${Object.entries(grouped).map(([category, items]) => {
            const visible = items.filter(a => !a.hidden || unlockedSet.has(a.id));
            if (!visible.length) return '';
            const catUnlocked = visible.filter(a => unlockedSet.has(a.id)).length;

            return `
          <div class="card mt-2">
            <div class="card-header">
              <div>
                <div class="card-title">${escapeHtml(category)}</div>
                <div class="card-sub">${catUnlocked} of ${visible.length} unlocked</div>
              </div>
            </div>

            <div class="ach-grid">
              ${visible.map(a => this.badge(a, unlockedSet.has(a.id))).join('')}
            </div>
          </div>`;
        }).join('')}`;
    },

    badge(a, unlocked) {
        const unlockedAt = unlocked ? getUnlockedAt(a.id) : null;
        const when = unlockedAt ? new Date(unlockedAt).toLocaleDateString(undefined, {
            year: 'numeric', month: 'short', day: 'numeric'
        }) : '';

        return `
      <div class="ach-badge ach-tier-${a.tier}${unlocked ? ' unlocked' : ' locked'}">
        <div class="ach-tier-chip">${TIER_LABEL[a.tier] || a.tier}</div>
        <div class="ach-badge-name">${escapeHtml(a.hidden && !unlocked ? 'Hidden achievement' : a.name)}</div>
        <div class="ach-badge-desc">${escapeHtml(a.description)}</div>
        ${unlocked && when ? `<div class="ach-badge-when">Unlocked ${escapeHtml(when)}</div>` : ''}
      </div>`;
    }
};