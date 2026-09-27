import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast } from '../core/ui.js';
import { downloadTxt, downloadMarkdown, downloadWord, printPdf } from '../utils/exporters.js';
import { track } from '../analytics/metrics.js';

let draft = null;
let lastReview = null;   // replaces window._lastPPReview

const $ = (id) => document.getElementById(id);

function blankDraft() {
    const conf = store.get().conference || {};
    return {
        id: null,
        committee: conf.committee || '',
        country: conf.country || '',
        topic: conf.topic || '',
        background: '',
        position: '',
        previousAction: '',
        solutions: '',
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
}

const FIELDS = ['committee', 'country', 'topic', 'background', 'position', 'previousAction', 'solutions'];

export const positionPaper = {
    path: '/paper',
    ariaTitle: 'Position Paper',
    render() { return layout('Position Paper Builder', this.body(), { narrow: true }); },

    init() {
        try { bindLayout(); } catch (err) { console.error('[positionPaper] bindLayout:', err); }

        if (!draft) draft = blankDraft();
        const d = draft;

        // Hydrate inputs from draft.
        FIELDS.forEach(k => {
            const el = $('pp_' + k);
            if (el) el.value = d[k] || '';
        });

        // Live-bind inputs back to draft.
        FIELDS.forEach(k => {
            const el = $('pp_' + k);
            if (!el) return;
            el.oninput = () => {
                draft[k] = el.value;
                draft.updatedAt = Date.now();
                updateWordCount();
            };
        });

        // Auto-grow only the position paper textareas.
        FIELDS.forEach(k => {
            const el = $('pp_' + k);
            if (el && el.tagName === 'TEXTAREA') autoGrow(el);
        });

        updateWordCount();

        // Actions — every binding null-guarded.
        if ($('ppReview')) $('ppReview').onclick = () => this.review();
        if ($('ppSave')) $('ppSave').onclick = () => this.save();
        if ($('ppNew')) $('ppNew').onclick = () => { draft = blankDraft(); lastReview = null; this.rerender(); };
        if ($('ppExportTxt')) $('ppExportTxt').onclick = () => this.export('txt');
        if ($('ppExportMd')) $('ppExportMd').onclick = () => this.export('md');
        if ($('ppExportDoc')) $('ppExportDoc').onclick = () => this.export('doc');
        if ($('ppExportPdf')) $('ppExportPdf').onclick = () => this.export('pdf');
        if ($('ppAskCoach')) $('ppAskCoach').onclick = () => {
            sessionStorage.setItem('munai.pendingPrompt',
                `Review my position paper draft about "${draft.topic}" for ${draft.committee}. Focus on country alignment and realism.\n\n${serialize(draft)}`);
            location.hash = '/coach';
        };

        this.loadPicker();
    },

    body() {
        return `
      <div class="card">
        <div class="card-header">
          <div><div class="card-title">Position Paper</div>
          <div class="card-sub">Committee · Country · Topic — then the four standard sections.</div></div>
          <button class="btn btn-ghost btn-sm" id="ppNew">New Paper</button>
        </div>
        <div class="field-row">
          <div class="field"><label>Committee</label><input id="pp_committee" /></div>
          <div class="field"><label>Country</label><input id="pp_country" /></div>
        </div>
        <div class="field"><label>Topic</label><input id="pp_topic" /></div>
        <div class="field"><label>Saved papers</label><select id="ppPicker"><option value="">— Load a saved paper —</option></select></div>
      </div>

      <div class="card mt-2">
        <div class="card-title">I. Background / Context</div>
        <div class="card-sub mb-1">What is the problem, why does it matter, and what is the international context?</div>
        <textarea id="pp_background" rows="6" placeholder="Describe the global situation…"></textarea>
      </div>

      <div class="card mt-2">
        <div class="card-title">II. Country Position</div>
        <div class="card-sub mb-1">What does your country believe, and why? Tie it to national interests.</div>
        <textarea id="pp_position" rows="6" placeholder="Our country believes…"></textarea>
      </div>

      <div class="card mt-2">
        <div class="card-title">III. Previous International Action</div>
        <div class="card-sub mb-1">Treaties, UN resolutions, commitments your country has supported or opposed.</div>
        <textarea id="pp_previousAction" rows="5" placeholder="Our country has supported…"></textarea>
      </div>

      <div class="card mt-2">
        <div class="card-title">IV. Proposed Solutions</div>
        <div class="card-sub mb-1">Concrete, fundable, and realistic for your country's position.</div>
        <textarea id="pp_solutions" rows="6" placeholder="We propose that…"></textarea>
      </div>

      <div class="card mt-2">
        <div class="flex between items-center">
          <span class="muted" id="ppCount">0 words</span>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" id="ppAskCoach">Ask Coach</button>
            <button class="btn btn-ghost btn-sm" id="ppSave">Save</button>
            <button class="btn btn-primary" id="ppReview">AI Review</button>
          </div>
        </div>
      </div>

      <div class="card mt-2">
        <div class="card-title">Export</div>
        <div class="flex gap-2 mt-2" style="flex-wrap:wrap;">
          <button class="btn btn-ghost btn-sm" id="ppExportTxt">TXT</button>
          <button class="btn btn-ghost btn-sm" id="ppExportMd">Markdown</button>
          <button class="btn btn-ghost btn-sm" id="ppExportDoc">DOCX</button>
          <button class="btn btn-ghost btn-sm" id="ppExportPdf">PDF (print)</button>
        </div>
      </div>

      <div id="ppResult" class="mt-2"></div>`;
    },

    rerender() {
        const app = $('app');
        if (app) app.innerHTML = this.render();
        this.init();
    },

    async review() {
        if (!draft) return;
        const paper = serialize(draft);
        if (paper.length < 200) return toast('Write more before requesting a review.');

        const out = $('ppResult');
        if (!out) return;
        out.innerHTML = `<div class="card"><div class="flex gap-2 items-center"><div class="spinner" style="border-color:rgba(15,37,71,.2);border-top-color:var(--navy-800)"></div> Reviewing…</div></div>`;

        const prompt = `Review this MUN position paper.

Committee: ${draft.committee}
Country: ${draft.country}
Topic: ${draft.topic}

${paper}

Structure your feedback as:
STRUCTURE
• ...

COUNTRY ALIGNMENT
• ...

EVIDENCE & REALISM
• ...

DIPLOMATIC TONE
• ...

WEAKEST SECTION
• ...

NEXT STEP
One specific action.`;

        try {
            const reply = await ai.chat({
                mode: 'positionPaperReviewer',
                userText: prompt,
                history: [],
                context: {},
                fallback: () => `STRUCTURE\n• The four sections are present.\n\nCOUNTRY ALIGNMENT\n• Review whether the country's position is stated clearly.\n\nEVIDENCE & REALISM\n• Add specific treaties or resolutions.\n\nDIPLOMATIC TONE\n• Check for overly strong language.\n\nWEAKEST SECTION\n• The Proposed Solutions section usually benefits from added specificity.\n\nNEXT STEP\nRefine the funding mechanism for your main proposal.`
            });
            lastReview = reply;
            out.innerHTML = `<div class="card"><div class="card-title">AI Review</div><div class="mt-2" style="font-size:14.5px;line-height:1.65;">${markdownLite(reply)}</div></div>`;
        } catch (err) {
            out.innerHTML = `<div class="card"><span class="badge badge-red">Error</span> ${escapeHtml(err.message)}</div>`;
        }
    },

    save() {
        if (!draft) return;
        const s = store.get();
        const isNew = !draft.id;
        draft.updatedAt = Date.now();

        const papers = [...(s.positionPapers || [])];

        if (draft.id) {
            const i = papers.findIndex(p => p.id === draft.id);
            if (i >= 0) papers[i] = { ...draft };
            else papers.push({ ...draft });
        } else {
            draft.id = Date.now().toString();
            draft.createdAt = Date.now();
            papers.push({ ...draft });
        }

        store.set({ positionPapers: papers, xp: (s.xp || 0) + 10 });

        const wordCount = [draft.background, draft.position, draft.previousAction, draft.solutions]
            .join(' ').trim().split(/\s+/).filter(Boolean).length;
        try {
            track('position-paper', {
                isNew,
                wordCount,
                hasResearch: !!(draft.previousAction && draft.previousAction.length > 40)
            });
        } catch { }

        toast('Position paper saved · +10 XP');
        this.loadPicker();
    },

    loadPicker() {
        const sel = $('ppPicker');
        if (!sel) return;
        const list = store.get().positionPapers || [];
        sel.innerHTML = `<option value="">— Load a saved paper —</option>` +
            list.map(p => `<option value="${p.id}">${escapeHtml(p.country)} · ${escapeHtml(p.committee)} · ${escapeHtml((p.topic || '').slice(0, 40))}</option>`).join('');
        sel.onchange = () => {
            const id = sel.value;
            if (!id) return;
            const p = (store.get().positionPapers || []).find(x => x.id === id);
            if (p) { draft = { ...p }; lastReview = null; this.rerender(); }
        };
    },

    export(kind) {
        if (!draft) return;
        try {
            const bodyHtml = toHtml(draft);
            const base = `${draft.country || 'Country'}-${(draft.committee || 'Committee').replace(/\s+/g, '_')}-PositionPaper`;
            if (kind === 'txt') downloadTxt(`${base}.txt`, toTxt(draft));
            else if (kind === 'md') downloadMarkdown(`${base}.md`, toMarkdown(draft));
            else if (kind === 'doc') downloadWord(`${base}.doc`, { title: base, bodyHtml });
            else if (kind === 'pdf') printPdf({ title: base, bodyHtml });
            toast('Exported');
        } catch (err) {
            console.error('[positionPaper] export failed:', err);
            toast('Export failed');
        }
    }
};

function serialize(d) {
    return [
        `I. Background\n${d.background || '(empty)'}`,
        `II. Country Position\n${d.position || '(empty)'}`,
        `III. Previous International Action\n${d.previousAction || '(empty)'}`,
        `IV. Proposed Solutions\n${d.solutions || '(empty)'}`
    ].join('\n\n');
}

function toTxt(d) {
    return [
        `POSITION PAPER`,
        `Committee: ${d.committee}`,
        `Country: ${d.country}`,
        `Topic: ${d.topic}`,
        '',
        `I. BACKGROUND / CONTEXT`,
        d.background,
        '',
        `II. COUNTRY POSITION`,
        d.position,
        '',
        `III. PREVIOUS INTERNATIONAL ACTION`,
        d.previousAction,
        '',
        `IV. PROPOSED SOLUTIONS`,
        d.solutions
    ].join('\n');
}

function toMarkdown(d) {
    return [
        `# Position Paper`,
        ``,
        `**Committee:** ${d.committee}  `,
        `**Country:** ${d.country}  `,
        `**Topic:** ${d.topic}`,
        ``,
        `## I. Background / Context`,
        d.background,
        ``,
        `## II. Country Position`,
        d.position,
        ``,
        `## III. Previous International Action`,
        d.previousAction,
        ``,
        `## IV. Proposed Solutions`,
        d.solutions
    ].join('\n');
}

function toHtml(d) {
    const esc = s => String(s || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    const para = t => esc(t).split(/\n{2,}/).map(p => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('');
    return `
    <h1>Position Paper</h1>
    <div class="meta"><b>Committee:</b> ${esc(d.committee)}<br>
    <b>Country:</b> ${esc(d.country)}<br>
    <b>Topic:</b> ${esc(d.topic)}</div>
    <h2>I. Background / Context</h2>${para(d.background)}
    <h2>II. Country Position</h2>${para(d.position)}
    <h2>III. Previous International Action</h2>${para(d.previousAction)}
    <h2>IV. Proposed Solutions</h2>${para(d.solutions)}`;
}

function updateWordCount() {
    if (!draft) return;
    const text = [draft.background, draft.position, draft.previousAction, draft.solutions].join(' ');
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const el = $('ppCount');
    if (el) el.textContent = `${words} words`;
}

function autoGrow(el) {
    const grow = () => {
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 400) + 'px';
    };
    el.addEventListener('input', grow);
    grow();
}