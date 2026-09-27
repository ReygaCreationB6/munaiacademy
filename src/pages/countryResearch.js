import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast } from '../core/ui.js';
import { track } from '../analytics/metrics.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const $ = (id) => document.getElementById(id);

let renderToken = 0;
let generating = false;

export const countryResearch = {
    path: '/research',
    ariaTitle: 'Country Research',
    render() { return layout('Country Research', this.body(), { full: true }); },

    init() {
        renderToken++;
        generating = false;

        try { bindLayout(); } catch (err) { console.error('[countryResearch] bindLayout:', err); }

        const s = store.get().conference || {};
        if ($('crCountry')) $('crCountry').value = s.country || '';
        if ($('crCommittee')) $('crCommittee').value = s.committee || '';
        if ($('crTopic')) $('crTopic').value = s.topic || '';
        if ($('crContext')) $('crContext').value = '';

        if ($('crGenerate')) $('crGenerate').onclick = () => this.generate();
        if ($('crReset')) $('crReset').onclick = () => this.reset();

        this.renderHistory();
    },

    body() {
        return `
      <div class="mx-page">
        <div class="mx-setup">
          <div class="mx-setup-title">Research a country, committee, and topic</div>
          <div class="mx-setup-sub">
            The AI produces a structured dossier: country profile, policy position, topic research, and MUN strategy.
            Every factual claim is tagged with a source level so you know what to trust and what to verify before conference.
          </div>

          <div class="field-row">
            <div class="field"><label>Country</label><input id="crCountry" placeholder="Chad" /></div>
            <div class="field"><label>Committee</label><input id="crCommittee" placeholder="UNHRC" /></div>
          </div>
          <div class="field"><label>Topic</label><input id="crTopic" placeholder="Protecting Human Rights in the Face of Climate Change" /></div>
          <div class="field">
            <label>Additional context (optional)</label>
            <input id="crContext" placeholder="e.g. focus on LDC adaptation funding and the Sahel" />
          </div>

          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary" id="crGenerate">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"/></svg>
              Generate dossier
            </button>
            <button class="btn btn-ghost" id="crReset">Reset</button>
          </div>
        </div>

        <div id="crResult" class="mt-2"></div>

        <div class="card mt-2">
          <div class="card-header"><div class="card-title">Previous research</div></div>
          <div id="crHistory"></div>
        </div>
      </div>`;
    },

    reset() {
        const el = $('crResult');
        if (el) el.innerHTML = '';
    },

    async generate() {
        if (generating) return;

        const country = $('crCountry')?.value.trim() || '';
        const committee = $('crCommittee')?.value.trim() || '';
        const topic = $('crTopic')?.value.trim() || '';
        const context = $('crContext')?.value.trim() || '';

        if (!country || !committee || !topic) return toast('Fill in country, committee, and topic.');

        generating = true;
        const token = renderToken;

        const btn = $('crGenerate');
        if (btn) { btn.disabled = true; btn.textContent = 'Generating…'; }

        const out = $('crResult');
        if (out) {
            out.innerHTML = `
        <div class="mx-dossier" id="crDossier">
          <div class="flex items-center gap-2 mb-2">
            <div class="spinner"></div>
            <span class="muted">Researching ${escapeHtml(country)}…</span>
          </div>
        </div>`;
        }

        let full = '';
        const prompt = `Build a research dossier for an MUN delegate.

Country: ${country}
Committee: ${committee}
Topic: ${topic}
${context ? `Additional focus: ${context}` : ''}

Return exactly four sections using these exact headings:

## Country Profile
## Policy Position
## Topic Research
## MUN Strategy

CRITICAL — for every factual claim, prefix the sentence or bullet with one of these tags:
[VERIFIED] — you are confident this comes from UN, World Bank, IMF, government, treaty, or well-documented sources
[ANALYSIS] — your interpretation or synthesis of multiple sources
[STRATEGY] — a suggested tactical approach for the delegate
[VERIFY] — you are uncertain; the delegate should double-check before using

Rules:
- Never invent resolution numbers, dates, statistics, or quotes. If unsure, use [VERIFY].
- Be specific to ${country} and its actual position on ${topic}.
- Aim for 600–900 words total across all four sections.
- No emojis. No filler opening. Start directly with the first heading.`;

        try {
            await ai.stream(
                { mode: 'researcher', userText: prompt, history: [], context: { country, committee, topic }, opts: { maxTokens: 2400 } },
                chunk => {
                    full += chunk;
                    if (token !== renderToken) return;
                    const live = $('crDossier');
                    if (live) live.innerHTML = `<div class="mx-dossier-inner">${tagMarkdown(full)}</div>`;
                }
            );

            // Route changed while streaming — do not touch the DOM, do not save.
            if (token !== renderToken) return;

            const session = { id: uid(), country, committee, topic, context, content: full, createdAt: Date.now() };
            const list = [session, ...(store.get().researchSessions || [])].slice(0, 40);

            // Merge into the existing conference object rather than replacing it.
            const currentConf = store.get().conference || {};
            store.set({
                researchSessions: list,
                xp: store.get().xp + 15,
                conference: { ...currentConf, country, committee, topic }
            });

            try { track('research', { country, committee, topic }); } catch { }
            toast('Dossier saved · +15 XP');
            this.renderHistory();

            const dossier = $('crDossier');
            if (dossier) {
                const bar = document.createElement('div');
                bar.className = 'flex gap-2 mt-2';
                bar.innerHTML = `
          <button class="btn btn-ghost btn-sm" id="crExport">Export as Markdown</button>
          <button class="btn btn-ghost btn-sm" id="crCopy">Copy</button>`;
                dossier.after(bar);
                if ($('crExport')) $('crExport').onclick = () => this.exportDossier(session);
                if ($('crCopy')) $('crCopy').onclick = () => {
                    try { navigator.clipboard.writeText(full); toast('Copied'); } catch { toast('Copy failed'); }
                };
            }
        } catch (err) {
            if (token !== renderToken) return;
            const live = $('crResult');
            if (live) live.innerHTML = `<div class="badge badge-red">AI error</div><p class="mt-1">${escapeHtml(err.message)}</p>`;
        } finally {
            generating = false;
            const b = $('crGenerate');
            if (b) {
                b.disabled = false;
                b.innerHTML = `
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"/></svg>
          Generate dossier`;
            }
        }
    },

    exportDossier(s) {
        try {
            const lines = [
                `# Research Dossier — ${s.country}`,
                ``,
                `**Committee:** ${s.committee}  `,
                `**Topic:** ${s.topic}  `,
                `**Generated:** ${new Date(s.createdAt).toLocaleString()}`,
                ``,
                `---`,
                ``,
                s.content
            ];
            const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${s.country.replace(/\s+/g, '_')}_${s.committee.replace(/\s+/g, '_')}_research.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast('Exported');
        } catch (err) {
            toast('Export failed');
            console.error('[countryResearch] export:', err);
        }
    },

    renderHistory() {
        const el = $('crHistory');
        if (!el) return;
        const list = store.get().researchSessions || [];
        if (!list.length) {
            el.innerHTML = `<p class="muted" style="font-size:13px;">No research sessions yet.</p>`;
            return;
        }
        el.innerHTML = list.map(s => `
      <div class="mx-session-card" data-id="${s.id}">
        <div class="info">
          <div class="t">${escapeHtml(s.country)} · ${escapeHtml(s.committee)}</div>
          <div class="s">${escapeHtml(s.topic)} · ${new Date(s.createdAt).toLocaleDateString()}</div>
        </div>
        <button class="btn btn-ghost btn-sm" data-act="load">Load</button>
        <button class="btn btn-ghost btn-sm" data-act="delete">×</button>
      </div>`).join('');

        // Single delegated listener, rebound every time the list rerenders.
        el.onclick = (e) => {
            const card = e.target.closest('.mx-session-card');
            if (!card) return;
            const id = card.dataset.id;
            const act = e.target.closest('[data-act]')?.dataset.act;
            if (act === 'delete') {
                const list = (store.get().researchSessions || []).filter(s => s.id !== id);
                store.set({ researchSessions: list });
                this.renderHistory();
            } else if (act === 'load') {
                const s = (store.get().researchSessions || []).find(x => x.id === id);
                if (!s) return;
                if ($('crCountry')) $('crCountry').value = s.country;
                if ($('crCommittee')) $('crCommittee').value = s.committee;
                if ($('crTopic')) $('crTopic').value = s.topic;
                if ($('crContext')) $('crContext').value = s.context || '';
                const out = $('crResult');
                if (!out) return;
                out.innerHTML = `
          <div class="mx-dossier">${tagMarkdown(s.content)}</div>
          <div class="flex gap-2 mt-2">
            <button class="btn btn-ghost btn-sm" id="crExport">Export as Markdown</button>
          </div>`;
                if ($('crExport')) $('crExport').onclick = () => this.exportDossier(s);
            }
        };
    }
};

/* ---------- Tag renderer ---------- */
function tagMarkdown(text) {
    let pre = String(text).replace(/\[(VERIFIED|ANALYSIS|STRATEGY|VERIFY)\]/g, (_, tag) => {
        const cls = tag.toLowerCase();
        return `\u0001TAG_${cls}\u0001`;
    });

    let html = markdownLite(pre);

    const labels = { verified: 'Verified', analysis: 'Analysis', strategy: 'Strategy', verify: 'Verify' };
    for (const key of Object.keys(labels)) {
        html = html.replace(new RegExp(`\\u0001TAG_${key}\\u0001`, 'g'), `<span class="mx-tag ${key}">${labels[key]}</span>`);
    }
    return html;
}