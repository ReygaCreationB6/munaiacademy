import { layout, bindLayout } from './_layout.js';
import { auth } from '../core/auth.js';
import { author } from '../core/author.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast, openModal } from '../core/ui.js';

const $ = (id) => document.getElementById(id);

const LEVELS = ['Beginner', 'Intermediate', 'Advanced'];

/* ------------------------------------------------------------------ */
/* Module state                                                        */
/* ------------------------------------------------------------------ */

const state = {
    status: 'idle',    // 'idle' | 'loading' | 'ready' | 'error'
    error: null,
    tab: 'lessons',
    lessons: [],
    scenarios: [],
    me: null
};

let loadPromise = null;

/* ------------------------------------------------------------------ */
/* Loading                                                             */
/* ------------------------------------------------------------------ */

function ensureLoaded() {
    if (state.status === 'ready' || state.status === 'error') return loadPromise;
    if (loadPromise) return loadPromise;

    state.status = 'loading';
    state.error = null;

    // IMPORTANT: assign loadPromise BEFORE the first rerender().
    // Otherwise init() re-enters and calls ensureLoaded() again while
    // loadPromise is still null — infinite recursion.
    loadPromise = (async () => {
        try {
            const me = await author.me();
            const [lessonsRes, scenariosRes] = await Promise.all([
                author.listLessons(),
                author.listScenarios()
            ]);
            state.me = me;
            state.lessons = Array.isArray(lessonsRes?.lessons) ? lessonsRes.lessons : [];
            state.scenarios = Array.isArray(scenariosRes?.scenarios) ? scenariosRes.scenarios : [];
            state.status = 'ready';
            state.error = null;
        } catch (err) {
            console.error('[author] bootstrap failed:', err);
            state.status = 'error';
            state.error = err?.message || 'Could not load content.';
        } finally {
            loadPromise = null;
            rerender();
        }
    })();

    // Now safe — loadPromise is set, so any re-entry hits the guard above.
    rerender();

    return loadPromise;
}

function resetAndReload() {
    state.status = 'idle';
    state.error = null;
    state.lessons = [];
    state.scenarios = [];
    state.me = null;
    loadPromise = null;
    ensureLoaded();
}

function rerender() {
    const app = $('app');
    if (app) app.innerHTML = authorPage.render();
    authorPage.init();
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export const authorPage = {
    path: '/author',
    ariaTitle: 'Content Authoring',

    render() {
        if (!author.isConfigured()) return this.notConfiguredHtml();
        if (!auth.isSignedIn()) return this.signInPromptHtml();
        return layout('Content Authoring', this.body(), { narrow: false });
    },

    init() {
        try { bindLayout(); } catch (err) { console.error('[author] bindLayout:', err); }

        // Kick off the fetch. If it's already running or done, this is a no-op.
        if (!state.me && state.status !== 'error') ensureLoaded();

        // Bind interactive elements if we have content
        if (state.status === 'ready') this.bindPanel();
        if (state.status === 'error') {
            const retry = $('auRetry');
            if (retry) retry.onclick = () => resetAndReload();
        }
    },

    notConfiguredHtml() {
        return layout('Content Authoring', `
      <div class="card">
        <div class="card-title">Content authoring is not configured</div>
        <p class="muted">
          To enable custom lessons and scenarios, add your email to
          <span class="mono">AUTHOR_EMAILS</span> in the server's
          <span class="mono">.env</span>, run <span class="mono">supabase/author-schema.sql</span>,
          then restart the server.
        </p>
        <a class="btn btn-primary" href="#/dashboard">Back to dashboard</a>
      </div>`);
    },

    signInPromptHtml() {
        return layout('Content Authoring', `
      <div class="card">
        <div class="card-title">Sign in to author content</div>
        <p class="muted">The author page is restricted to allowlisted accounts.</p>
        <div class="flex gap-2 mt-2">
          <a class="btn btn-primary" href="#/login">Sign in</a>
          <a class="btn btn-ghost" href="#/dashboard">Back</a>
        </div>
      </div>`);
    },

    body() {
        if (state.status === 'loading' || state.status === 'idle') {
            return `<div class="card"><div class="flex gap-2 items-center"><div class="spinner"></div> Loading…</div></div>`;
        }
        if (state.status === 'error') {
            return `<div class="card">
        <span class="badge badge-red">Error</span>
        <p class="mt-2">${escapeHtml(state.error || 'Something went wrong.')}</p>
        <p class="muted" style="font-size:12.5px;">
          Check that <span class="mono">AUTHOR_EMAILS</span> includes your signed-in email, and that
          <span class="mono">SUPABASE_SERVICE_KEY</span> is set on the server.
        </p>
        <button class="btn btn-ghost btn-sm" id="auRetry">Try again</button>
      </div>`;
        }

        // status === 'ready'
        return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Content Authoring</div>
            <div class="card-sub">
              Signed in as <b>${escapeHtml(state.me?.user?.email || '')}</b>
              · ${state.lessons.length} custom lesson${state.lessons.length === 1 ? '' : 's'}
              · ${state.scenarios.length} custom scenario${state.scenarios.length === 1 ? '' : 's'}
            </div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" id="auImport">Import</button>
            <button class="btn btn-ghost btn-sm" id="auExport">Export</button>
          </div>
        </div>
      </div>

      <div class="ed-tabs" role="tablist">
        <button class="ed-tab${state.tab === 'lessons' ? ' active' : ''}" data-tab="lessons" role="tab">
          Lessons ${state.lessons.length ? `<span class="ed-tab-count">${state.lessons.length}</span>` : ''}
        </button>
        <button class="ed-tab${state.tab === 'scenarios' ? ' active' : ''}" data-tab="scenarios" role="tab">
          Scenarios ${state.scenarios.length ? `<span class="ed-tab-count">${state.scenarios.length}</span>` : ''}
        </button>
      </div>

      ${state.tab === 'lessons' ? this.lessonsPanel() : this.scenariosPanel()}`;
    },

    /* ---------------- Panels ---------------- */

    lessonsPanel() {
        return `
      <div class="card mt-2">
        <div class="card-header">
          <div>
            <div class="card-title">Custom lessons</div>
            <div class="card-sub">These appear alongside the built-in lessons on the Learn page.</div>
          </div>
          <button class="btn btn-primary btn-sm" id="auNewLesson">+ New lesson</button>
        </div>
        ${!state.lessons.length
                ? `<p class="muted" style="font-size:13px;">No custom lessons yet.</p>`
                : `<div class="au-list">${state.lessons.map(l => this.lessonRow(l)).join('')}</div>`}
      </div>`;
    },

    lessonRow(l) {
        return `
      <div class="au-row" data-id="${l.id}">
        <div class="au-row-main">
          <div class="au-row-title">${escapeHtml(l.title)}</div>
          <div class="au-row-sub">
            <span class="au-badge">${escapeHtml(l.level)}</span>
            <span class="mono">${escapeHtml(l.slug)}</span>
          </div>
          ${l.description ? `<div class="au-row-desc">${escapeHtml(l.description)}</div>` : ''}
        </div>
        <div class="au-row-actions">
          <button class="btn btn-ghost btn-sm" data-edit-lesson="${l.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del-lesson="${l.id}">Delete</button>
        </div>
      </div>`;
    },

    scenariosPanel() {
        return `
      <div class="card mt-2">
        <div class="card-header">
          <div>
            <div class="card-title">Custom crisis scenarios</div>
            <div class="card-sub">Each scenario is a chain of events with options and effects. Edit as JSON.</div>
          </div>
          <button class="btn btn-primary btn-sm" id="auNewScenario">+ New scenario</button>
        </div>
        ${!state.scenarios.length
                ? `<p class="muted" style="font-size:13px;">No custom scenarios yet.</p>`
                : `<div class="au-list">${state.scenarios.map(s => this.scenarioRow(s)).join('')}</div>`}
      </div>`;
    },

    scenarioRow(s) {
        const eventCount = Array.isArray(s.data?.events) ? s.data.events.length : 0;
        return `
      <div class="au-row" data-id="${s.id}">
        <div class="au-row-main">
          <div class="au-row-title">${escapeHtml(s.name)}</div>
          <div class="au-row-sub">
            <span class="au-badge">${eventCount} event${eventCount === 1 ? '' : 's'}</span>
            <span class="mono">${escapeHtml(s.scenario_key)}</span>
          </div>
          ${s.description ? `<div class="au-row-desc">${escapeHtml(s.description)}</div>` : ''}
        </div>
        <div class="au-row-actions">
          <button class="btn btn-ghost btn-sm" data-edit-scenario="${s.id}">Edit</button>
          <button class="btn btn-danger btn-sm" data-del-scenario="${s.id}">Delete</button>
        </div>
      </div>`;
    },

    /* ---------------- Bindings ---------------- */

    bindPanel() {
        document.querySelectorAll('.ed-tab').forEach(t => {
            t.onclick = () => { state.tab = t.dataset.tab; rerender(); };
        });

        const newL = $('auNewLesson');
        if (newL) newL.onclick = () => this.openLessonEditor(null);

        const newS = $('auNewScenario');
        if (newS) newS.onclick = () => this.openScenarioEditor(null);

        document.querySelectorAll('[data-edit-lesson]').forEach(b => {
            b.onclick = () => {
                const l = state.lessons.find(x => x.id === b.dataset.editLesson);
                if (l) this.openLessonEditor(l);
            };
        });
        document.querySelectorAll('[data-del-lesson]').forEach(b => {
            b.onclick = () => this.confirmDelete('lesson', b.dataset.delLesson);
        });

        document.querySelectorAll('[data-edit-scenario]').forEach(b => {
            b.onclick = () => {
                const s = state.scenarios.find(x => x.id === b.dataset.editScenario);
                if (s) this.openScenarioEditor(s);
            };
        });
        document.querySelectorAll('[data-del-scenario]').forEach(b => {
            b.onclick = () => this.confirmDelete('scenario', b.dataset.delScenario);
        });

        const exp = $('auExport');
        if (exp) exp.onclick = async () => {
            try { await author.exportAll(); toast('Exported'); }
            catch (err) { toast(err.message); }
        };
        const imp = $('auImport');
        if (imp) imp.onclick = () => this.openImport();
    },

    /* ---------------- Lesson editor ---------------- */

    openLessonEditor(existing) {
        const isEdit = !!existing;
        const l = existing || { slug: '', level: 'Beginner', title: '', description: '', content: '' };

        openModal({
            title: isEdit ? 'Edit lesson' : 'New lesson',
            body: `
        <div class="field-row">
          <div class="field">
            <label>Level</label>
            <select id="auLevel">${LEVELS.map(x => `<option ${x === l.level ? 'selected' : ''}>${x}</option>`).join('')}</select>
          </div>
          <div class="field">
            <label>Slug</label>
            <input id="auSlug" value="${escapeHtml(l.slug)}" placeholder="auto from title" />
          </div>
        </div>
        <div class="field"><label>Title</label><input id="auTitle" value="${escapeHtml(l.title)}" /></div>
        <div class="field"><label>One-line description</label><input id="auDesc" value="${escapeHtml(l.description)}" /></div>
        <div class="field">
          <label>Body (markdown, optional)</label>
          <textarea id="auContent" rows="8" placeholder="Lesson body…">${escapeHtml(l.content || '')}</textarea>
        </div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-ghost btn-sm" id="auDraftLesson">Draft body with AI</button>
        </div>`,
            footer: `
        <button class="btn btn-ghost" id="auLessonCancel">Cancel</button>
        <button class="btn btn-primary" id="auLessonSave">${isEdit ? 'Save' : 'Create'}</button>`
        });

        $('auLessonCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('auLessonSave').onclick = async () => {
            const payload = {
                slug: $('auSlug').value.trim(),
                level: $('auLevel').value,
                title: $('auTitle').value.trim(),
                description: $('auDesc').value.trim(),
                content: $('auContent').value
            };
            if (!payload.title) return toast('Title is required.');
            try {
                if (isEdit) await author.updateLesson(existing.id, payload);
                else await author.createLesson(payload);
                document.querySelector('.modal-backdrop')?.remove();
                toast(isEdit ? 'Lesson updated' : 'Lesson created');
                resetAndReload();
            } catch (err) { toast(err.message); }
        };

        $('auDraftLesson').onclick = async () => {
            const title = $('auTitle').value.trim() || 'this MUN topic';
            const level = $('auLevel').value;
            const btn = $('auDraftLesson');
            btn.disabled = true; btn.textContent = 'Drafting…';
            try {
                const out = await ai.chat({
                    mode: 'teacher',
                    userText: `Write a short MUN lesson titled "${title}" for a ${level}-level delegate. Format:

## Definition
One paragraph.

## Why it matters
One paragraph.

## Example
One paragraph.

## Key vocabulary
- term — definition (3–5 terms)

## Quick check
One question.

No emojis. No filler. Return markdown only.`,
                    history: [], context: {}
                });
                $('auContent').value = out;
                toast('Draft inserted — review before saving');
            } catch (err) { toast('AI error: ' + err.message); }
            finally { btn.disabled = false; btn.textContent = 'Draft body with AI'; }
        };
    },

    /* ---------------- Scenario editor ---------------- */

    openScenarioEditor(existing) {
        const isEdit = !!existing;
        const s = existing ? {
            scenario_key: existing.scenario_key,
            name: existing.name,
            description: existing.description,
            data: existing.data
        } : {
            scenario_key: '',
            name: '',
            description: '',
            data: EXAMPLE_SCENARIO
        };

        openModal({
            title: isEdit ? 'Edit scenario' : 'New scenario',
            body: `
        <p class="muted" style="font-size:12.5px;margin-bottom:12px;">
          Edit as JSON. Each event needs an <span class="mono">id</span>, <span class="mono">type</span>,
          <span class="mono">severity</span>, and at least one <span class="mono">option</span>.
        </p>
        <div class="field">
          <label>Scenario key (slug)</label>
          <input id="auSCKey" value="${escapeHtml(s.scenario_key)}" placeholder="e.g. climate-surge-2026" />
        </div>
        <div class="field">
          <label>Name</label>
          <input id="auSCName" value="${escapeHtml(s.name)}" />
        </div>
        <div class="field">
          <label>Description</label>
          <input id="auSCDesc" value="${escapeHtml(s.description)}" />
        </div>
        <div class="field">
          <label>Scenario JSON</label>
          <textarea id="auSCData" rows="16" style="font-family:var(--font-mono);font-size:12.5px;">${escapeHtml(JSON.stringify(s.data, null, 2))}</textarea>
        </div>
        <div class="flex gap-2 mt-1">
          <button class="btn btn-ghost btn-sm" id="auSCTemplate">Insert template</button>
          <button class="btn btn-ghost btn-sm" id="auSCValidate">Validate</button>
        </div>
        <div id="auSCStatus" class="mt-2"></div>`,
            footer: `
        <button class="btn btn-ghost" id="auSCCancel">Cancel</button>
        <button class="btn btn-primary" id="auSCSave">${isEdit ? 'Save' : 'Create'}</button>`
        });

        $('auSCCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();

        $('auSCTemplate').onclick = () => {
            $('auSCData').value = JSON.stringify(EXAMPLE_SCENARIO, null, 2);
        };

        $('auSCValidate').onclick = () => {
            const status = $('auSCStatus');
            try {
                const parsed = JSON.parse($('auSCData').value);
                if (!Array.isArray(parsed.events) || !parsed.events.length) throw new Error('Needs at least one event.');
                status.innerHTML = `<div class="badge badge-green">Valid JSON · ${parsed.events.length} event${parsed.events.length === 1 ? '' : 's'}</div>`;
            } catch (err) {
                status.innerHTML = `<div class="badge badge-red">${escapeHtml(err.message)}</div>`;
            }
        };

        $('auSCSave').onclick = async () => {
            let data;
            try { data = JSON.parse($('auSCData').value); }
            catch (err) { return toast('Invalid JSON: ' + err.message); }

            const payload = {
                key: $('auSCKey').value.trim(),
                name: $('auSCName').value.trim(),
                description: $('auSCDesc').value.trim(),
                events: data.events
            };
            if (!payload.key || !payload.name) return toast('Key and name are required.');

            try {
                if (isEdit) await author.updateScenario(existing.id, payload);
                else await author.createScenario(payload);
                document.querySelector('.modal-backdrop')?.remove();
                toast(isEdit ? 'Scenario updated' : 'Scenario created');
                resetAndReload();
            } catch (err) { toast(err.message); }
        };
    },

    /* ---------------- Import / Export ---------------- */

    openImport() {
        openModal({
            title: 'Import content',
            body: `
        <p class="muted" style="font-size:13px;">
          Select a JSON file previously exported from this page. Existing entries with the same
          slug or key are skipped — nothing is overwritten.
        </p>
        <div class="field mt-2">
          <input type="file" id="auImportFile" accept="application/json,.json" />
        </div>`,
            footer: `<button class="btn btn-ghost" id="auImpCancel">Cancel</button>`
        });
        $('auImpCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('auImportFile').onchange = async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            try {
                const text = await f.text();
                const payload = JSON.parse(text);
                const res = await author.importPayload(payload);
                document.querySelector('.modal-backdrop')?.remove();
                toast(`Imported ${res.created.lessons} lessons, ${res.created.scenarios} scenarios · ${res.created.skipped} skipped`);
                resetAndReload();
            } catch (err) { toast('Import failed: ' + err.message); }
        };
    },

    confirmDelete(kind, id) {
        const noun = kind === 'lesson' ? 'lesson' : 'scenario';
        if (!confirm(`Delete this ${noun}? This cannot be undone.`)) return;
        const run = kind === 'lesson' ? author.deleteLesson(id) : author.deleteScenario(id);
        run.then(() => {
            toast(`${noun[0].toUpperCase() + noun.slice(1)} deleted`);
            resetAndReload();
        }).catch(err => toast(err.message));
    }
};

/* ------------------------------------------------------------------ */
/* Example scenario template                                           */
/* ------------------------------------------------------------------ */

const EXAMPLE_SCENARIO = {
    key: 'example-scenario',
    name: 'Example Scenario',
    description: 'A short example with two events.',
    events: [
        {
            id: 'ev-1',
            title: 'First event',
            description: 'Something happens. Delegates must respond.',
            type: 'info',
            severity: 'low',
            minTurn: 3,
            triggersOn: ['GSL', 'MOD_CAUCUS'],
            aiReactions: false,
            options: [
                {
                    key: 'acknowledge',
                    text: 'Acknowledge publicly',
                    effects: [
                        { kind: 'shift-relation', target: '*', delta: 0.1 },
                        { kind: 'award-xp', amount: 4 },
                        { kind: 'narrative', text: 'Delegations note your willingness to engage.' }
                    ]
                },
                {
                    key: 'note',
                    text: 'Take note privately',
                    effects: [
                        { kind: 'narrative', text: 'The information enters the record.' }
                    ]
                }
            ]
        },
        {
            id: 'ev-2',
            title: 'Second event',
            description: 'An escalating situation demands a decision within the session.',
            type: 'urgent',
            severity: 'high',
            minTurn: 6,
            triggersOn: ['GSL', 'MOD_CAUCUS'],
            responseWindow: 90,
            aiReactions: true,
            options: [
                {
                    key: 'mobilize',
                    text: 'Act immediately',
                    effects: [
                        { kind: 'shift-relation', target: '*', delta: 0.2 },
                        { kind: 'award-xp', amount: 8 },
                        { kind: 'narrative', text: 'Your decisive response is praised.' }
                    ]
                },
                {
                    key: 'delay',
                    text: 'Defer to committee procedure',
                    effects: [
                        { kind: 'penalty-xp', amount: 3 },
                        { kind: 'narrative', text: 'The delay is noted by several delegations.' }
                    ]
                }
            ]
        }
    ]
};