import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast, openModal } from '../core/ui.js';
import { track } from '../analytics/metrics.js';

const CHALLENGES = [
    { key: 'speech', title: 'Speech Challenge', desc: 'Write and deliver a 60-second opening speech. AI scores content, diplomacy, structure, and specificity.', icon: 'mic', href: '#/speech', xp: 15, mode: 'navigate' },
    { key: 'poi', title: 'POI Sprint', desc: 'Rapid-fire Points of Information. Answer five in a row and see how your scores trend.', icon: 'help', href: '#/poi', xp: 12, mode: 'navigate' },
    { key: 'debate', title: 'Debate Sprint', desc: 'Three-round debate against a hostile AI delegate. Tests rebuttal and defence under pressure.', icon: 'message', href: '#/debate', xp: 20, mode: 'navigate' },
    { key: 'research', title: 'Research Sprint', desc: 'Generate a full dossier on a country and committee you have not studied yet.', icon: 'globe', href: '#/research', xp: 15, mode: 'navigate' },
    { key: 'rewrite', title: 'Diplomatic Rewrite', desc: 'Take an aggressive sentence and rewrite it as a diplomatic statement. AI explains each change.', icon: 'file', xp: 8, mode: 'rewrite' },
    { key: 'rebuttal', title: 'Rapid Rebuttal', desc: 'AI fires a hostile statement. You have 30 seconds of writing time to rebut it. Scored on impact.', icon: 'bolt', xp: 10, mode: 'rebuttal' }
];

const ICONS = {
    mic: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="2" width="4" height="7" rx="2"/><path d="M3.5 7.5a4.5 4.5 0 0 0 9 0"/><path d="M8 12v2"/></svg>`,
    help: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M6.5 6.5a1.75 1.75 0 1 1 2.5 1.5c-.5.25-.5.75-.5 1"/><circle cx="8" cy="11.5" r="0.5" fill="currentColor"/></svg>`,
    message: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.5l-3.5 3v-3a1 1 0 0 1-1-1z"/></svg>`,
    globe: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="8" cy="8" r="6"/><path d="M2 8h12"/><ellipse cx="8" cy="8" rx="3" ry="6"/></svg>`,
    file: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M9 2v4h4"/><path d="M5 9h6M5 11.5h4"/></svg>`,
    bolt: `<svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5L3.5 8.5h3.5L7 14.5l4.5-7h-3.5z"/></svg>`
};

const $ = (id) => document.getElementById(id);

export const practiceArena = {
    path: '/practice',
    ariaTitle: 'Practice Arena',
    render() { return layout('Practice Arena', this.body(), { full: true }); },

    init() {
        try { bindLayout(); } catch (err) { console.error('[practiceArena] bindLayout:', err); }
        document.querySelectorAll('.mx-challenge').forEach(el => {
            el.onclick = () => this.open(el.dataset.key);
        });
    },

    body() {
        const scores = store.get().practiceScores || {};
        const totalAttempts = Object.values(scores).reduce((n, s) => n + (s.count || 0), 0);
        const totalXp = Object.values(scores).reduce((n, s) => n + (s.best || 0), 0);
        const bestCount = Object.values(scores).filter(s => (s.best || 0) >= 8).length;

        return `
      <div class="mx-page">
        <div class="card">
          <div class="card-header"><div>
            <div class="card-title">Practice Arena</div>
            <div class="card-sub">Short, focused challenges. Each one exercises a specific MUN skill and rewards practice with XP.</div>
          </div></div>

          <div class="mx-stat-grid mt-2">
            <div class="stat"><div class="stat-label">Challenges completed</div><div class="stat-value">${totalAttempts}</div><div class="stat-sub">Across all modules</div></div>
            <div class="stat"><div class="stat-label">Personal bests</div><div class="stat-value">${bestCount}</div><div class="stat-sub">Scores ≥ 8/10</div></div>
            <div class="stat"><div class="stat-label">XP from practice</div><div class="stat-value">${totalXp}</div><div class="stat-sub">Sum of best scores</div></div>
            <div class="stat"><div class="stat-label">Total XP</div><div class="stat-value">${store.get().xp}</div><div class="stat-sub">Whole account</div></div>
          </div>
        </div>

        <div class="card mt-2">
          <div class="card-header"><div class="card-title">Challenges</div></div>
          <div class="mx-challenge-grid">
            ${CHALLENGES.map(c => {
            const s = scores[c.key] || {};
            return `
                <button class="mx-challenge" data-key="${c.key}">
                  <span class="mx-challenge-icon">${ICONS[c.icon] || ''}</span>
                  <span class="mx-challenge-title">${escapeHtml(c.title)}</span>
                  <span class="mx-challenge-desc">${escapeHtml(c.desc)}</span>
                  <span class="mx-challenge-foot">
                    <span class="mx-challenge-xp">+${c.xp} XP</span>
                    <span class="mx-challenge-best">${s.best ? `Best ${s.best}/10` : s.count ? `${s.count} plays` : 'Not attempted'}</span>
                  </span>
                </button>`;
        }).join('')}
          </div>
        </div>
      </div>`;
    },

    open(key) {
        const c = CHALLENGES.find(x => x.key === key);
        if (!c) return;
        if (c.mode === 'navigate') { location.hash = c.href.replace('#', ''); return; }
        if (c.mode === 'rewrite') return this.openRewrite();
        if (c.mode === 'rebuttal') return this.openRebuttal();
    },

    /* ---------- Diplomatic Rewrite ---------- */
    openRewrite() {
        const { close } = openModal({
            title: 'Diplomatic Rewrite',
            body: `
        <p class="muted" style="font-size:13px;margin-bottom:14px;">
          Paste an aggressive or casual sentence. The AI rewrites it in diplomatic language and explains each change.
        </p>
        <div class="field">
          <label>Original sentence</label>
          <textarea id="rwInput" rows="3" placeholder="e.g. Your country is completely wrong about climate finance."></textarea>
        </div>
        <div id="rwResult"></div>`,
            footer: `
        <button class="btn btn-ghost" id="rwCancel">Cancel</button>
        <button class="btn btn-primary" id="rwRun">Rewrite</button>`
        });

        let submitting = false;

        if ($('rwCancel')) $('rwCancel').onclick = () => close();

        if ($('rwRun')) $('rwRun').onclick = async () => {
            if (submitting) return;
            const text = $('rwInput')?.value.trim() || '';
            if (!text) return toast('Enter a sentence.');

            submitting = true;
            const btn = $('rwRun');
            if (btn) { btn.disabled = true; btn.textContent = 'Rewriting…'; }

            const out = $('rwResult');
            if (out) out.innerHTML = `<div class="flex items-center gap-2"><div class="spinner"></div><span class="muted">Rewriting…</span></div>`;

            const prompt = `Rewrite the following sentence in formal diplomatic MUN language.

Original: "${text}"

Return exactly:

**Diplomatic version:** the rewritten sentence

**Changes made:**
- list of specific changes, one per line, explaining WHAT was changed and WHY

**When to use this:** one sentence on the situation where this phrasing works best.

No emojis. No hashes.`;

            try {
                const reply = await ai.chat({ mode: 'coach', userText: prompt, history: [], context: {} });

                // Bail if the modal was dismissed while we waited.
                if (!$('rwResult')) return;

                out.innerHTML = `<div class="mx-poi-tip" style="background:var(--surface-muted);color:var(--ink-2);">${markdownLite(reply)}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary btn-sm" id="rwSave">Save as practice</button>
          </div>`;
                const save = $('rwSave');
                if (save) save.onclick = () => {
                    this.bumpScore('rewrite', 8);
                    toast('Saved · +8 XP');
                    close();
                };
            } catch (err) {
                const live = $('rwResult');
                if (live) live.innerHTML = `<div class="badge badge-red">AI error</div><p class="mt-1">${escapeHtml(err.message)}</p>`;
            } finally {
                submitting = false;
                const b = $('rwRun');
                if (b) { b.disabled = false; b.textContent = 'Rewrite'; }
            }
        };
    },

    /* ---------- Rapid Rebuttal ---------- */
    async openRebuttal() {
        const s = store.get().conference || {};
        const { close } = openModal({
            title: 'Rapid Rebuttal',
            body: `
        <p class="muted" style="font-size:13px;margin-bottom:14px;">
          The AI fires a hostile statement. Rebut it as the delegate of <b>${escapeHtml(s.country || 'your country')}</b>.
          You get 30 seconds of writing time.
        </p>
        <div id="rbStatement" class="mx-poi-quote" style="margin-bottom:14px;">Generating…</div>
        <div class="field">
          <label>Your rebuttal</label>
          <textarea id="rbInput" rows="3" placeholder="Defend your position…" disabled></textarea>
        </div>
        <div class="flex between items-center">
          <span class="muted" id="rbTimer">—</span>
          <span class="muted" id="rbWords">0 words</span>
        </div>
        <div id="rbResult"></div>`,
            footer: `
        <button class="btn btn-ghost" id="rbCancel">Cancel</button>
        <button class="btn btn-primary" id="rbSubmit" disabled>Submit</button>`
        });

        let timeLeft = 30;
        let timer = null;
        let finished = false;

        const stopTimer = () => { if (timer) { clearInterval(timer); timer = null; } };
        const dismiss = () => { stopTimer(); close(); };

        if ($('rbCancel')) $('rbCancel').onclick = () => dismiss();

        try {
            const prompt = `You are a hostile delegate in the ${s.committee || 'committee'} on the topic "${s.topic || 'the agenda'}".
Fire one aggressive but diplomatic attack against ${s.country || 'the user'}'s position. Two sentences max. No emojis. No headings.`;

            const statement = String(await ai.chat({ mode: 'opponent', userText: prompt, history: [], context: {} })).trim();

            // Modal may have been closed while the AI was generating.
            if (!$('rbStatement')) return;

            $('rbStatement').textContent = statement;

            const ta = $('rbInput');
            if (ta) {
                ta.disabled = false;
                ta.focus();
                ta.oninput = () => {
                    const wc = ta.value.trim().split(/\s+/).filter(Boolean).length;
                    if ($('rbWords')) $('rbWords').textContent = `${wc} words`;
                };
            }
            if ($('rbSubmit')) $('rbSubmit').disabled = false;

            // Timer that self-cleans when the modal disappears.
            timer = setInterval(() => {
                const timerEl = $('rbTimer');
                const submitBtn = $('rbSubmit');
                if (!timerEl || !submitBtn) { stopTimer(); return; }   // modal was closed
                timeLeft--;
                timerEl.textContent = `Time: ${timeLeft}s`;
                if (timeLeft <= 0) {
                    stopTimer();
                    timerEl.textContent = 'Time up';
                    if (!finished) submitBtn.click();
                }
            }, 1000);

            const timerEl = $('rbTimer');
            if (timerEl) timerEl.textContent = `Time: ${timeLeft}s`;

            if ($('rbSubmit')) $('rbSubmit').onclick = async () => {
                if (finished) return;
                finished = true;
                stopTimer();
                const answer = ta?.value.trim() || '';
                if (!answer) return dismiss();

                const out = $('rbResult');
                if (out) out.innerHTML = `<div class="flex items-center gap-2 mt-2"><div class="spinner"></div><span class="muted">Scoring…</span></div>`;
                const submitBtn = $('rbSubmit');
                if (submitBtn) submitBtn.disabled = true;

                const evalPrompt = `Debate statement: "${statement}"
Rebuttal by ${s.country || 'the delegate'}: "${answer}"

Score the rebuttal. Return exactly:

Impact: X/10 — one sentence
Diplomacy: X/10 — one sentence
Specificity: X/10 — one sentence

Overall: X/10

Coaching tip: One sentence.

No emojis. No hashes.`;

                try {
                    const reply = await ai.chat({ mode: 'speechEvaluator', userText: evalPrompt, history: [], context: {} });
                    if (!$('rbResult')) return;
                    const overall = +(/Overall\s*:\s*(\d+)/i.exec(reply)?.[1] || 0);
                    out.innerHTML = `<div class="mx-poi-eval mt-2">${markdownLite(reply)}</div>
            <div class="flex gap-2 mt-2">
              <button class="btn btn-primary btn-sm" id="rbSave">Save score</button>
            </div>`;
                    const save = $('rbSave');
                    if (save) save.onclick = () => {
                        this.bumpScore('rebuttal', overall);
                        toast(`Saved · +${overall * 2} XP`);
                        dismiss();
                    };
                } catch (err) {
                    if (!$('rbResult')) return;
                    out.innerHTML = `<div class="badge badge-red mt-2">AI error</div>`;
                }
            };
        } catch (err) {
            const el = $('rbStatement');
            if (el) el.textContent = 'Could not reach AI.';
            toast('AI error');
        }
    },

    bumpScore(key, score) {
        const all = { ...(store.get().practiceScores || {}) };
        const prev = all[key] || { best: 0, count: 0, lastPlayed: 0 };
        all[key] = {
            best: Math.max(prev.best || 0, score || 0),
            count: (prev.count || 0) + 1,
            lastPlayed: Date.now()
        };
        store.set({
            practiceScores: all,
            xp: store.get().xp + Math.round((score || 0) * 2)
        });
        try { track('practice', { challenge: key, score }); } catch { }

        const app = document.getElementById('app');
        if (app) app.innerHTML = this.render();
        this.init();
    }
};