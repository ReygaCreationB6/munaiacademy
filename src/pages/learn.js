import { store } from '../core/store.js';
import { lessonsByLevel } from '../data/lessons.js';
import { layout, bindLayout } from './_layout.js';
import { openModal, toast } from '../core/ui.js';
import { track } from '../analytics/metrics.js';

const $ = (id) => document.getElementById(id);

export const learn = {
  path: '/learn',
  ariaTitle: 'Learn MUN',
  render() { return layout('Learn MUN', this.body()); },

  init() {
    try { bindLayout(); } catch (err) { console.error('[learn] bindLayout:', err); }

    document.querySelectorAll('.lesson-item').forEach(el => {
      el.onclick = () => this.open(el.dataset.id, el.dataset.title, el.dataset.level);
    });
  },

  body() {
    const byLevel = lessonsByLevel();
    const progress = store.get().progress || {};

    return Object.entries(byLevel).map(([level, items]) => `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">${level}</div>
          <div class="card-sub">${items.length} lessons</div></div>
        </div>
        ${items.map(l => `
          <div class="lesson-item ${progress[l.id] ? 'done' : ''}"
               data-id="${escape(l.id)}"
               data-title="${escape(l.title)}"
               data-level="${escape(level)}">
            <div class="lesson-check">✓</div>
            <div class="lesson-meta">
              <div class="lesson-title">${escape(l.title)}</div>
              <div class="lesson-desc">${escape(l.desc)}</div>
            </div>
            <span class="lesson-tag">${level}</span>
          </div>`).join('')}
      </div>`).join('');
  },

  open(id, title, level) {
    const { close, root } = openModal({
      title,
      body: `
        <p class="muted">${escape(level)} lesson</p>
        <p>Ask the AI Coach to teach you this at your chosen depth, or mark it complete once you understand it.</p>
        <div class="field">
          <label>Explain this to me like I'm a…</label>
          <select id="mLevel">
            <option>Complete beginner</option>
            <option>Delegate with some experience</option>
            <option>Advanced delegate</option>
          </select>
        </div>`,
      footer: `
        <button class="btn btn-ghost" id="mAsk">Ask AI Coach</button>
        <button class="btn btn-primary" id="mDone">Mark Complete</button>`
    });

    const doneBtn = root.querySelector('#mDone');
    if (doneBtn) doneBtn.onclick = () => {
      const s = store.get();
      const wasDone = !!(s.progress && s.progress[id]);
      const prog = { ...(s.progress || {}), [id]: true };
      store.set({ progress: prog, xp: (s.xp || 0) + 10 });
      if (!wasDone) {
        try { track('lesson-complete', { lessonId: id, level, title }); } catch { }
      }
      toast('+10 XP · Lesson complete');
      close();
      const app = $('app');
      if (app) app.innerHTML = this.render();
      this.init();
    };

    const askBtn = root.querySelector('#mAsk');
    if (askBtn) askBtn.onclick = () => {
      const lvl = root.querySelector('#mLevel')?.value || 'Complete beginner';
      const prompt = `Teach me the MUN lesson "${title}" at a level suitable for: ${lvl}. Use Definition → Why it matters → Example → Key vocabulary → Quick check.`;
      sessionStorage.setItem('munai.pendingPrompt', prompt);
      close();
      location.hash = '/coach';
    };
  }
};

function escape(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}