import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast } from '../core/ui.js';
import { downloadTxt, downloadMarkdown, downloadWord, printPdf } from '../utils/exporters.js';
import { track } from '../analytics/metrics.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const $ = (id) => document.getElementById(id);

let draft = null;

function blankResolution() {
    const conf = store.get().conference || {};
    return {
        id: null,
        committee: conf.committee || '',
        topic: conf.topic || '',
        sponsors: '',
        signatories: '',
        preamble: [
            { id: uid(), text: 'Recalling the Universal Declaration of Human Rights and its commitment to protect fundamental freedoms for all persons,' },
            { id: uid(), text: 'Deeply concerned by the disproportionate impact of climate change on vulnerable populations in developing States,' }
        ],
        operative: [
            { id: uid(), text: 'Requests the establishment of a UNFCCC-coordinated Climate Adaptation Fund, financed through assessed contributions from Annex I Parties and voluntary contributions from multilateral institutions, with an initial capitalization target of USD 100 billion by 2030;' },
            { id: uid(), text: 'Calls upon Member States to submit biennial national adaptation plans to the Secretariat, detailing measurable targets and reporting progress on implementation;' },
            { id: uid(), text: 'Encourages the creation of a technical assistance mechanism, managed by UNDP, to build institutional capacity in Least Developed Countries for climate-resilient infrastructure;' }
        ],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

export const resolutionBuilder = {
    path: '/resolution',
    ariaTitle: 'Resolution Builder',
    render() { return layout('Resolution Builder', this.body(), { narrow: false }); },

    init() {
        try { bindLayout(); } catch (err) { console.error('[resolutionBuilder] bindLayout:', err); }

        if (!draft) draft = blankResolution();
        const d = draft;

        if ($('rs_committee')) $('rs_committee').value = d.committee || '';
        if ($('rs_topic')) $('rs_topic').value = d.topic || '';
        if ($('rs_sponsors')) $('rs_sponsors').value = d.sponsors || '';
        if ($('rs_signatories')) $('rs_signatories').value = d.signatories || '';

        if ($('rs_committee')) $('rs_committee').oninput = e => draft.committee = e.target.value;
        if ($('rs_topic')) $('rs_topic').oninput = e => draft.topic = e.target.value;
        if ($('rs_sponsors')) $('rs_sponsors').oninput = e => draft.sponsors = e.target.value;
        if ($('rs_signatories')) $('rs_signatories').oninput = e => draft.signatories = e.target.value;

        renderClauses('preamble');
        renderClauses('operative');

        if ($('rsAddPre')) $('rsAddPre').onclick = () => { draft.preamble.push({ id: uid(), text: '' }); renderClauses('preamble'); };
        if ($('rsAddOp')) $('rsAddOp').onclick = () => { draft.operative.push({ id: uid(), text: '' }); renderClauses('operative'); };

        if ($('rsNew')) $('rsNew').onclick = () => { draft = blankResolution(); this.rerender(); };
        if ($('rsSave')) $('rsSave').onclick = () => this.save();
        if ($('rsReview')) $('rsReview').onclick = () => this.review();
        if ($('rsCheck')) $('rsCheck').onclick = () => this.check();
        if ($('rsExportTxt')) $('rsExportTxt').onclick = () => this.export('txt');
        if ($('rsExportMd')) $('rsExportMd').onclick = () => this.export('md');
        if ($('rsExportDoc')) $('rsExportDoc').onclick = () => this.export('doc');
        if ($('rsExportPdf')) $('rsExportPdf').onclick = () => this.export('pdf');
        if ($('rsAskCoach')) $('rsAskCoach').onclick = () => {
            sessionStorage.setItem('munai.pendingPrompt',
                `Help me improve this draft resolution on "${draft.topic}". Which clauses are weakest and why?\n\n${serialize(draft)}`);
            location.hash = '/coach';
        };

        this.loadPicker();
    },

    body() {
        return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Draft Resolution</div>
          <div class="card-sub">Preambulatory clauses set context. Operative clauses take action.</div></div>
          <button class="btn btn-ghost btn-sm" id="rsNew">New Resolution</button>
        </div>
        <div class="field-row">
          <div class="field"><label>Committee</label><input id="rs_committee" /></div>
          <div class="field"><label>Topic</label><input id="rs_topic" /></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Sponsors</label><input id="rs_sponsors" placeholder="Chad, Kenya, Brazil" /></div>
          <div class="field"><label>Signatories</label><input id="rs_signatories" placeholder="Germany, Japan…" /></div>
        </div>
        <div class="field"><label>Saved resolutions</label><select id="rsPicker"><option value="">— Load a saved resolution —</option></select></div>
      </div>

      <div class="card mt-2">
        <div class="card-header">
          <div><div class="card-title">Preambulatory Clauses</div>
          <div class="card-sub">Begin with an italicized participle: <em>Recalling, Noting, Deeply concerned, Alarmed by…</em></div></div>
          <button class="btn btn-ghost btn-sm" id="rsAddPre">+ Add clause</button>
        </div>
        <div id="preList"></div>
      </div>

      <div class="card mt-2">
        <div class="card-header">
          <div><div class="card-title">Operative Clauses</div>
          <div class="card-sub">Each clause should have: <b>Actor · Action · Mechanism · Funding · Timeline · Monitoring</b></div></div>
          <button class="btn btn-ghost btn-sm" id="rsAddOp">+ Add clause</button>
        </div>
        <div id="opList"></div>
      </div>

      <div class="card mt-2">
        <div class="flex between items-center">
          <span class="muted" id="rsStats">—</span>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" id="rsAskCoach">Ask Coach</button>
            <button class="btn btn-ghost btn-sm" id="rsSave">Save</button>
            <button class="btn btn-ghost btn-sm" id="rsCheck">Quick Check</button>
            <button class="btn btn-primary" id="rsReview">AI Review</button>
          </div>
        </div>
      </div>

      <div class="card mt-2">
        <div class="card-title">Export</div>
        <div class="flex gap-2 mt-2" style="flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="rsExportTxt">TXT</button>
          <button class="btn btn-ghost btn-sm" id="rsExportMd">Markdown</button>
          <button class="btn btn-ghost btn-sm" id="rsExportDoc">DOCX</button>
          <button class="btn btn-ghost btn-sm" id="rsExportPdf">PDF (print)</button>
        </div>
      </div>

      <div id="rsResult" class="mt-2"></div>`;
    },

    rerender() {
        const app = $('app');
        if (app) app.innerHTML = this.render();
        this.init();
    },

    async review() {
        if (!draft) return;
        const body = serialize(draft);
        if (body.length < 200) return toast('Add more clauses before reviewing.');
        const out = $('rsResult');
        if (!out) return;
        out.innerHTML = `<div class="card"><div class="flex gap-2 items-center"><div class="spinner" style="border-color:rgba(15,37,71,.2);border-top-color:var(--navy-800)"></div> Reviewing resolution…</div></div>`;

        const prompt = `Review this MUN draft resolution.

Committee: ${draft.committee}
Topic: ${draft.topic}
Sponsors: ${draft.sponsors}
Signatories: ${draft.signatories}

${body}

Structure your review as:
STRENGTHS
• ...

WEAK CLAUSES
• Clause N — issue — suggested fix (do NOT rewrite the whole clause, explain the gap)

FEASIBILITY ANALYSIS
• Funding
• Mechanism
• Monitoring
• Timeline

COUNTRY-POLICY CONSISTENCY
• ...

NEXT STEP
One specific action.`;

        try {
            const reply = await ai.chat({
                mode: 'resolutionReviewer',
                userText: prompt,
                history: [],
                context: {},
                fallback: () => `STRENGTHS\n• Clauses are structurally sound.\n\nWEAK CLAUSES\n• Strengthen the funding mechanism and monitoring provisions.\n\nFEASIBILITY ANALYSIS\n• Funding: needs a specific source.\n• Mechanism: name the responsible body.\n• Monitoring: add a reporting cycle.\n• Timeline: add a review date.\n\nCOUNTRY-POLICY CONSISTENCY\n• Confirm the clauses align with the sponsor's stated interests.\n\nNEXT STEP\nAdd a funding clause to Operative 1.`
            });
            out.innerHTML = `<div class="card"><div class="card-title">AI Review</div><div class="mt-2" style="font-size:14.5px;line-height:1.65;">${markdownLite(reply)}</div></div>`;
        } catch (err) {
            out.innerHTML = `<div class="card"><span class="badge badge-red">Error</span> ${escapeHtml(err.message)}</div>`;
        }
    },

    check() {
        if (!draft) return;
        const out = $('rsResult');
        if (!out) return;

        const issues = [];
        const ops = draft.operative;
        if (ops.length < 2) issues.push({ lvl: 'warn', msg: 'Most resolutions need at least 3–4 operative clauses.' });

        ops.forEach((c, i) => {
            const t = (c.text || '').toLowerCase();
            if (!/\b(requests?|calls? upon|urges?|decides?|establishes?|recommends?|encourages?|invites?|authorizes?|affirms?|demands?|condemns?|supports?|endorses?|welcomes?|notes?)\b/.test(t))
                issues.push({ lvl: 'warn', msg: `Operative ${i + 1}: does not start with a clear operative verb.` });
            if (!/(fund|financ|budget|assessed|contribution|USD|grant|loan)/.test(t))
                issues.push({ lvl: 'info', msg: `Operative ${i + 1}: no funding mechanism mentioned.` });
            if (!/(by 20\d\d|within \d+ (year|month)|biennial|annual|deadline|timeline|period)/.test(t))
                issues.push({ lvl: 'info', msg: `Operative ${i + 1}: no timeline or review period.` });
            if (!/(monitor|report|review|verify|assess|inspect)/.test(t))
                issues.push({ lvl: 'info', msg: `Operative ${i + 1}: no monitoring or reporting clause.` });
            if ((c.text || '').split(/\s+/).length > 60)
                issues.push({ lvl: 'warn', msg: `Operative ${i + 1}: over 60 words — consider splitting into sub-clauses.` });
        });

        const seen = new Map();
        ops.forEach((c, i) => {
            const key = (c.text || '').trim().slice(0, 60).toLowerCase();
            if (!key) return;
            if (seen.has(key)) issues.push({ lvl: 'warn', msg: `Operative ${i + 1} looks duplicated with Operative ${seen.get(key) + 1}.` });
            else seen.set(key, i);
        });

        draft.preamble.forEach((c, i) => {
            if (/^(decides|requests|calls upon|establishes)/i.test((c.text || '').trim()))
                issues.push({ lvl: 'warn', msg: `Preamble ${i + 1}: uses an operative verb — preambulatory clauses should begin with participles (Recalling, Noting…).` });
            if (!(c.text || '').trim().endsWith(','))
                issues.push({ lvl: 'info', msg: `Preamble ${i + 1}: preambulatory clauses conventionally end with a comma.` });
        });

        if (!issues.length) {
            out.innerHTML = `<div class="card"><div class="badge badge-green">✓ Quick check passed</div>
        <p class="muted mt-1" style="font-size:13.5px;">All clauses include the core structural elements. Run the AI Review for deeper analysis.</p></div>`;
            return;
        }

        const grouped = issues.reduce((a, i) => { (a[i.lvl] ||= []).push(i.msg); return a; }, {});
        out.innerHTML = `<div class="card">
      <div class="card-title">Quick Check</div>
      ${grouped.warn ? `<h3 class="mt-2">Warnings</h3><ul style="font-size:14px;">${grouped.warn.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
      ${grouped.info ? `<h3 class="mt-2">Suggestions</h3><ul style="font-size:14px;">${grouped.info.map(m => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}
    </div>`;
    },

    save() {
        if (!draft) return;
        const s = store.get();
        const isNew = !draft.id;
        draft.updatedAt = Date.now();

        const list = [...(s.resolutions || [])];
        if (draft.id) {
            const i = list.findIndex(r => r.id === draft.id);
            if (i >= 0) list[i] = { ...draft };
            else list.push({ ...draft });
        } else {
            draft.id = Date.now().toString();
            draft.createdAt = Date.now();
            list.push({ ...draft });
        }

        store.set({ resolutions: list, xp: (s.xp || 0) + 15 });
        try {
            track('resolution', {
                isNew,
                preambleCount: draft.preamble.length,
                operativeCount: draft.operative.length
            });
        } catch { }
        toast('Resolution saved · +15 XP');
        this.loadPicker();
    },

    loadPicker() {
        const sel = $('rsPicker');
        if (!sel) return;
        const list = store.get().resolutions || [];
        sel.innerHTML = `<option value="">— Load a saved resolution —</option>` +
            list.map(r => `<option value="${r.id}">${escapeHtml(r.committee)} · ${escapeHtml((r.topic || '').slice(0, 40))}</option>`).join('');
        sel.onchange = () => {
            const id = sel.value;
            if (!id) return;
            const r = (store.get().resolutions || []).find(x => x.id === id);
            if (r) { draft = JSON.parse(JSON.stringify(r)); this.rerender(); }
        };
    },

    export(kind) {
        if (!draft) return;
        try {
            const base = `${(draft.committee || 'Committee').replace(/\s+/g, '_')}-Resolution`;
            const bodyHtml = toHtml(draft);
            if (kind === 'txt') downloadTxt(`${base}.txt`, toTxt(draft));
            else if (kind === 'md') downloadMarkdown(`${base}.md`, toMarkdown(draft));
            else if (kind === 'doc') downloadWord(`${base}.doc`, { title: base, bodyHtml });
            else if (kind === 'pdf') printPdf({ title: base, bodyHtml });
            toast('Exported');
        } catch (err) {
            console.error('[resolutionBuilder] export failed:', err);
            toast('Export failed');
        }
    }
};

function renderClauses(kind) {
    if (!draft) return;
    const list = kind === 'preamble' ? $('preList') : $('opList');
    if (!list) return;
    const items = kind === 'preamble' ? draft.preamble : draft.operative;

    list.innerHTML = items.map((c, i) => `
    <div class="clause-row" data-id="${c.id}" data-kind="${kind}" style="display:grid;grid-template-columns:${kind === 'preamble' ? '1fr' : 'auto 1fr'} auto;gap:8px;align-items:start;margin-bottom:8px;">
      ${kind === 'operative' ? `<div class="clause-num" style="font-family:var(--font-serif);font-weight:600;color:var(--navy-800);padding:10px 4px;min-width:26px;text-align:right;">${i + 1}.</div>` : ''}
      <textarea class="clause-text" rows="2" style="width:100%;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font-family:${kind === 'preamble' ? 'var(--font-serif)' : 'inherit'};font-size:14px;line-height:1.5;resize:vertical;" placeholder="${kind === 'preamble' ? 'Recalling that…' : 'Requests that…'}">${escapeHtml(c.text)}</textarea>
      <button class="clause-del btn btn-ghost btn-sm" title="Remove" style="margin-top:4px;">×</button>
    </div>`).join('');

    list.querySelectorAll('.clause-text').forEach(ta => {
        ta.addEventListener('input', () => {
            const row = ta.closest('.clause-row');
            const id = row.dataset.id;
            const k = row.dataset.kind;
            const arr = k === 'preamble' ? draft.preamble : draft.operative;
            const item = arr.find(x => x.id === id);
            if (item) item.text = ta.value;
            updateStats();
        });
    });

    list.querySelectorAll('.clause-del').forEach(btn => {
        btn.onclick = () => {
            const row = btn.closest('.clause-row');
            const id = row.dataset.id;
            const k = row.dataset.kind;
            if (k === 'preamble') draft.preamble = draft.preamble.filter(x => x.id !== id);
            else draft.operative = draft.operative.filter(x => x.id !== id);
            renderClauses(k);
            updateStats();
        };
    });

    updateStats();
}

function updateStats() {
    const el = $('rsStats');
    if (!el || !draft) return;
    const totalWords = [...draft.preamble, ...draft.operative].reduce((n, c) =>
        n + ((c.text || '').trim().split(/\s+/).filter(Boolean).length), 0);
    el.textContent = `${draft.preamble.length} preambulatory · ${draft.operative.length} operative · ${totalWords} words`;
}

function serialize(d) {
    return [
        'Preambulatory Clauses:',
        ...d.preamble.map((c, i) => `${i + 1}. ${c.text}`),
        '',
        'Operative Clauses:',
        ...d.operative.map((c, i) => `${i + 1}. ${c.text}`)
    ].join('\n');
}

function toTxt(d) {
    const pre = d.preamble.map((c, i) => `  ${i + 1}. ${c.text}`).join('\n');
    const op = d.operative.map((c, i) => `  ${i + 1}. ${c.text}`).join('\n');
    return [
        `DRAFT RESOLUTION`,
        `Committee: ${d.committee}`,
        `Topic: ${d.topic}`,
        `Sponsors: ${d.sponsors}`,
        `Signatories: ${d.signatories}`,
        '',
        `The ${d.committee},`,
        '',
        pre,
        '',
        op
    ].join('\n');
}

function toMarkdown(d) {
    const pre = d.preamble.map(c => `- *${c.text}*`).join('\n');
    const op = d.operative.map((c, i) => `${i + 1}. ${c.text}`).join('\n');
    return [
        `# Draft Resolution`,
        ``,
        `**Committee:** ${d.committee}  `,
        `**Topic:** ${d.topic}  `,
        `**Sponsors:** ${d.sponsors}  `,
        `**Signatories:** ${d.signatories}`,
        ``,
        `*The ${d.committee},*`,
        ``,
        pre,
        ``,
        op
    ].join('\n');
}

function toHtml(d) {
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const pre = d.preamble.map(c => `<div style="margin:4px 0;font-style:italic;">${esc(c.text)}</div>`).join('');
    const op = d.operative.map((c, i) => `<div style="margin:8px 0;"><b>${i + 1}.</b> ${esc(c.text)}</div>`).join('');
    return `
    <h1>Draft Resolution</h1>
    <div class="meta"><b>Committee:</b> ${esc(d.committee)}<br>
      <b>Topic:</b> ${esc(d.topic)}<br>
      <b>Sponsors:</b> ${esc(d.sponsors)}<br>
      <b>Signatories:</b> ${esc(d.signatories)}</div>
    <p><i>The ${esc(d.committee)},</i></p>
    ${pre}
    ${op}`;
}