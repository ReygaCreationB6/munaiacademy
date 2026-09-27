import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, toast } from '../core/ui.js';
import { track } from '../analytics/metrics.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/* ---- module state ---- */
let session = null;
let awaitingEvaluation = false;
let renderToken = 0;

const $ = (id) => document.getElementById(id);

/* Every async method captures the current renderToken at entry. After each
   await, it re-checks that no newer render has happened. If it has, the
   method bails out silently instead of touching a detached DOM. */
function currentToken() { return renderToken; }
function stale(token) { return token !== renderToken; }

export const poiTrainer = {
    path: '/poi',
    ariaTitle: 'POI Trainer',
    render() { return layout('POI Trainer', this.body(), { full: true }); },

    init() {
        // New mount = new token. Any async work still in flight from a previous
        // visit will see a stale token and exit.
        renderToken++;

        // Reset any state that shouldn't carry across route entries.
        session = null;
        awaitingEvaluation = false;

        try { bindLayout(); } catch (err) { console.error('[poiTrainer] bindLayout:', err); }

        const s = store.get().conference || {};
        if ($('poiCountry')) $('poiCountry').value = s.country || 'Chad';
        if ($('poiCommittee')) $('poiCommittee').value = s.committee || 'UNHRC';
        if ($('poiTopic')) $('poiTopic').value = s.topic || '';
        if ($('poiStart')) $('poiStart').onclick = () => this.start();
    },

    body() {
        return `
      <div class="mx-page">
        <div class="mx-setup">
          <div class="mx-setup-title">Train Points of Information</div>
          <div class="mx-setup-sub">
            The AI poses realistic POIs as an opposing delegate. You answer as your country.
            After each POI you receive a five-criteria evaluation and a coaching tip.
          </div>

          <div class="field-row">
            <div class="field"><label>Country</label><input id="poiCountry" /></div>
            <div class="field"><label>Committee</label><input id="poiCommittee" /></div>
          </div>
          <div class="field"><label>Topic</label><input id="poiTopic" /></div>

          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary" id="poiStart">Begin POI session</button>
          </div>
        </div>

        <div id="poiStage" class="mt-2"></div>
      </div>`;
    },

    async start() {
        const country = $('poiCountry')?.value.trim() || '';
        const committee = $('poiCommittee')?.value.trim() || '';
        const topic = $('poiTopic')?.value.trim() || '';
        if (!country || !committee || !topic) return toast('Fill in country, committee, and topic.');

        session = {
            id: uid(),
            country, committee, topic,
            pois: [],
            startedAt: Date.now()
        };
        this.renderStage();
        await this.nextPoi();
    },

    renderStage() {
        const el = $('poiStage');
        if (!el || !session) return;
        el.innerHTML = `
      <div class="mx-session">
        <div>
          <div class="card" id="poiCard"></div>
        </div>
        <aside class="mx-session-side">
          <h3>Session</h3>
          <div class="mx-side-row"><span class="k">POIs handled</span><span class="v" id="poiCount">0</span></div>
          <div class="mx-side-row"><span class="k">Average score</span><span class="v" id="poiAvg">—</span></div>
          <div class="mx-side-row"><span class="k">Best score</span><span class="v" id="poiBest">—</span></div>
          <div class="mt-2"><button class="btn btn-ghost btn-sm" id="poiEnd" style="width:100%;">End session</button></div>
        </aside>
      </div>`;
        if ($('poiEnd')) $('poiEnd').onclick = () => this.endSession();
        this.updateStats();
    },

    updateStats() {
        if (!session) return;
        const count = session.pois.length;
        const scores = session.pois.map(p => p.overall).filter(n => typeof n === 'number');
        const avg = scores.length ? (scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : '—';
        const best = scores.length ? Math.max(...scores) : '—';
        if ($('poiCount')) $('poiCount').textContent = count;
        if ($('poiAvg')) $('poiAvg').textContent = avg;
        if ($('poiBest')) $('poiBest').textContent = best;
    },

    async nextPoi() {
        const token = currentToken();
        const el = $('poiCard');
        if (!el || !session) return;
        el.innerHTML = `<div class="flex items-center gap-2"><div class="spinner"></div><span class="muted">Generating POI…</span></div>`;

        const prompt = `You are a delegate in the ${session.committee} on the topic "${session.topic}".

Generate ONE realistic Point of Information addressed to the delegate of ${session.country}.

The POI must:
- Be specific to the topic and to ${session.country}'s likely interests
- Be under 40 words
- Use formal MUN language (e.g. "Does the delegate not agree…", "Would the delegate clarify…", "How does the delegate reconcile…")
- Pose a genuine challenge, not a softball

Return only the POI text — no prefix, no quotation marks, no explanation.`;

        try {
            const raw = await ai.chat({
                mode: 'opponent',
                userText: prompt,
                history: [],
                context: { country: session.country, committee: session.committee, topic: session.topic },
                opts: { maxTokens: 120 }
            });

            // Bail out if the route changed while we waited.
            if (stale(token)) return;

            const poi = String(raw).trim().replace(/^["']|["']$/g, '');
            // Re-check session — endSession() may have nulled it while awaiting.
            if (!session) return;
            this.renderPoi(poi);
        } catch (err) {
            if (stale(token)) return;
            const live = $('poiCard');
            if (live) live.innerHTML = `<div class="badge badge-red">AI error</div><p class="mt-1">${escapeHtml(err.message)}</p>`;
        }
    },

    renderPoi(poi) {
        const el = $('poiCard');
        if (!el || !session) return;
        el.innerHTML = `
      <div class="mx-poi">
        <div class="mx-poi-head">
          <span class="label-small">Point of Information</span>
          <span class="badge badge-gold">Round ${session.pois.length + 1}</span>
        </div>
        <div class="mx-poi-quote">${escapeHtml(poi)}</div>
        <div class="mx-poi-answer">
          <textarea id="poiAnswer" rows="4" placeholder="Answer as ${escapeHtml(session.country)}…"></textarea>
          <div class="flex between items-center mt-2">
            <span class="muted" id="poiWords">0 words</span>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" id="poiSkip">Skip</button>
              <button class="btn btn-primary btn-sm" id="poiSubmit">Submit answer</button>
            </div>
          </div>
        </div>
        <div id="poiEval"></div>
      </div>`;

        const ta = $('poiAnswer');
        if (ta) {
            ta.focus();
            ta.oninput = () => {
                const wc = ta.value.trim().split(/\s+/).filter(Boolean).length;
                if ($('poiWords')) $('poiWords').textContent = `${wc} words`;
            };
        }
        if ($('poiSubmit')) $('poiSubmit').onclick = () => this.submit(poi);
        if ($('poiSkip')) $('poiSkip').onclick = () => this.nextPoi();
    },

    async submit(poi) {
        if (awaitingEvaluation) return;
        const ta = $('poiAnswer');
        const answer = ta?.value.trim() || '';
        if (!answer) return toast('Write your answer.');
        if (!session) return;

        awaitingEvaluation = true;
        const token = currentToken();
        const evalBox = $('poiEval');
        if (evalBox) evalBox.innerHTML = `<div class="mx-poi-eval"><div class="flex items-center gap-2"><div class="spinner"></div><span class="muted">Evaluating…</span></div></div>`;

        const prompt = `The delegate of ${session.country} was asked this POI in the ${session.committee} on "${session.topic}":

"${poi}"

Their answer:
"""
${answer}
"""

Evaluate the answer. Return exactly:

Relevance: X/10 — one sentence
Diplomacy: X/10 — one sentence
Conciseness: X/10 — one sentence
Evidence: X/10 — one sentence
Persuasiveness: X/10 — one sentence

Overall: X/10

Coaching tip: One specific, actionable improvement for the delegate.

No emojis. No headings with hashes. Keep each sentence under 20 words.`;

        try {
            const reply = await ai.chat({
                mode: 'speechEvaluator',
                userText: prompt,
                history: [],
                context: {},
                opts: { maxTokens: 400 }
            });

            if (stale(token)) return;
            if (!session) return;

            const parsed = parseEval(reply);
            this.renderEval(parsed);
            session.pois.push({
                poi,
                answer,
                overall: parsed.overall,
                scores: parsed.rows,
                tip: parsed.tip,
                ts: Date.now()
            });
            this.updateStats();
            try { track('poi', { committee: session.committee, country: session.country, score: parsed.overall }); } catch { }
        } catch (err) {
            if (stale(token)) return;
            const box = $('poiEval');
            if (box) box.innerHTML = `<div class="mx-poi-eval"><div class="badge badge-red">AI error</div><p class="mt-1">${escapeHtml(err.message)}</p></div>`;
        } finally {
            awaitingEvaluation = false;
        }
    },

    renderEval(parsed) {
        const evalBox = $('poiEval');
        if (!evalBox) return;
        evalBox.innerHTML = `
      <div class="mx-poi-eval">
        <div class="flex between items-center mb-2">
          <span class="label-small">Evaluation</span>
          <span class="mx-score ${scoreClass(parsed.overall)}">Overall ${parsed.overall}/10</span>
        </div>
        ${parsed.rows.map(r => `
          <div class="mx-poi-eval-row">
            <span class="crit">${escapeHtml(r.label)}</span>
            <span class="num">${r.value}/10</span>
            <span class="note">${escapeHtml(r.note)}</span>
          </div>`).join('')}
        ${parsed.tip ? `<div class="mx-poi-tip"><strong>Coaching tip</strong>${escapeHtml(parsed.tip)}</div>` : ''}
        <div class="flex gap-2 mt-2">
          <button class="btn btn-primary btn-sm" id="poiNext">Next POI</button>
        </div>
      </div>`;
        if ($('poiNext')) $('poiNext').onclick = () => this.nextPoi();
    },

    endSession() {
        if (!session) return this.rerender();
        if (!session.pois.length) {
            session = null;
            return this.rerender();
        }
        const scores = session.pois.map(p => p.overall).filter(n => typeof n === 'number');
        const avg = scores.length ? +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(1) : 0;
        const sessions = [{
            ...session,
            avgScore: avg,
            completedAt: Date.now()
        }, ...(store.get().poiSessions || [])].slice(0, 30);
        store.set({
            poiSessions: sessions,
            xp: store.get().xp + Math.round(avg * session.pois.length)
        });
        toast(`Session saved · avg ${avg}/10 · +${Math.round(avg * session.pois.length)} XP`);
        session = null;
        this.rerender();
    },

    rerender() {
        const app = document.getElementById('app');
        if (app) app.innerHTML = this.render();
        this.init();
    }
};

function parseEval(text) {
    const criteria = ['Relevance', 'Diplomacy', 'Conciseness', 'Evidence', 'Persuasiveness'];
    const rows = criteria.map(label => {
        const re = new RegExp(`${label}\\s*:\\s*(\\d+)\\s*[/／]\\s*10\\s*[—-]\\s*([^\\n]+)`, 'i');
        const m = text.match(re);
        return { label, value: m ? +m[1] : 0, note: m ? m[2].trim() : '' };
    });
    const overallM = text.match(/Overall\s*:\s*(\d+)/i);
    const overall = overallM ? +overallM[1] : 0;
    const tipM = text.match(/Coaching tip\s*:\s*([^\n]+)/i);
    return { rows, overall, tip: tipM ? tipM[1].trim() : '' };
}

function scoreClass(v) {
    if (v >= 8) return 'good';
    if (v >= 6) return 'mid';
    return 'poor';
}