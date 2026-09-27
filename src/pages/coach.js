import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast, openModal } from '../core/ui.js';

const MODES = [
    { key: 'coach', label: 'Coach', short: 'C', hint: 'General guidance, mixed style' },
    { key: 'teacher', label: 'Teacher', short: 'T', hint: 'Explains concepts step by step' },
    { key: 'chair', label: 'Chair', short: 'Ch', hint: 'Procedural authority, enforces rules' },
    { key: 'delegate', label: 'Delegate', short: 'D', hint: 'In-character country representative' },
    { key: 'opponent', label: 'Opponent', short: 'O', hint: 'Challenges your arguments' },
    { key: 'researcher', label: 'Researcher', short: 'R', hint: 'Evidence-focused, cites sources' },
    { key: 'speechEvaluator', label: 'Speech Evaluator', short: 'S', hint: 'Structured feedback on speeches' },
    { key: 'positionPaperReviewer', label: 'Paper Reviewer', short: 'P', hint: 'Reviews position papers' },
    { key: 'resolutionReviewer', label: 'Resolution Reviewer', short: 'Rs', hint: 'Reviews resolutions' }
];

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const modeInfo = key => MODES.find(m => m.key === key) || MODES[0];

/* Module-scoped state */
let currentId = null;
let sidebarOpen = false;
const streaming = {};           // { [convId]: { content, target } }
let searchQuery = '';
let shortcutsHandler = null;    // single active keydown handler

const $ = (id) => document.getElementById(id);

/* One-time hashchange cleanup — leaves the coach page cleans up the
   document-level keydown handler. Installed once per session. */
if (typeof window !== 'undefined' && !window.__coachCleanupInstalled) {
    window.__coachCleanupInstalled = true;
    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#/coach')) return;
        if (shortcutsHandler) {
            document.removeEventListener('keydown', shortcutsHandler);
            shortcutsHandler = null;
        }
    });
}

/* ------------------------------------------------------------------ */
/* Store helpers                                                      */
/* ------------------------------------------------------------------ */
function convs() { return store.get().conversations || {}; }
function get(id) { return convs()[id] || null; }
function current() { return currentId ? get(currentId) : null; }

function update(id, patch) {
    const all = { ...convs() };
    if (!all[id]) return;
    all[id] = { ...all[id], ...patch, updatedAt: Date.now() };
    store.set({ conversations: all });
}

function create(mode) {
    const id = uid();
    const c = {
        id,
        title: 'New conversation',
        mode: mode || 'coach',
        pinned: false,
        messages: [],
        createdAt: Date.now(),
        updatedAt: Date.now()
    };
    store.set({ conversations: { ...convs(), [id]: c } });
    currentId = id;
    return c;
}

function remove(id) {
    const all = { ...convs() };
    delete all[id];
    store.set({ conversations: all });
    delete streaming[id];
    if (currentId === id) {
        const list = ordered();
        currentId = list.length ? list[0].id : null;
    }
}

function ensureMigrated() {
    const all = convs();
    let dirty = false;
    for (const id of Object.keys(all)) {
        const c = all[id];
        if (!c.mode) { c.mode = 'coach'; dirty = true; }
        if (typeof c.pinned !== 'boolean') { c.pinned = false; dirty = true; }
        if (!c.createdAt) { c.createdAt = c.updatedAt || Date.now(); dirty = true; }
        if (!c.title || c.title === 'New conversation') {
            const first = (c.messages || []).find(m => m.role === 'user');
            if (first) { c.title = autoTitle(first.content); dirty = true; }
        }
    }
    if (dirty) store.set({ conversations: all });
}

function ordered() {
    const all = Object.values(convs());
    const pinned = all.filter(c => c.pinned).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    const rest = all.filter(c => !c.pinned).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return [...pinned, ...rest];
}

function grouped() {
    const all = ordered();
    const now = new Date();
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const day = 86400000;

    const buckets = { Pinned: [], Today: [], Yesterday: [], 'Previous 7 days': [], 'Previous 30 days': [], Older: [] };
    for (const c of all) {
        if (c.pinned) { buckets.Pinned.push(c); continue; }
        const t = c.updatedAt || c.createdAt || 0;
        if (t >= startOfDay) buckets.Today.push(c);
        else if (t >= startOfDay - day) buckets.Yesterday.push(c);
        else if (t >= startOfDay - day * 7) buckets['Previous 7 days'].push(c);
        else if (t >= startOfDay - day * 30) buckets['Previous 30 days'].push(c);
        else buckets.Older.push(c);
    }
    return Object.entries(buckets).filter(([, list]) => list.length);
}

function matchesQuery(c, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    if ((c.title || '').toLowerCase().includes(needle)) return true;
    return (c.messages || []).some(m => m.content.toLowerCase().includes(needle));
}

function autoTitle(text) {
    const clean = String(text).replace(/\s+/g, ' ').trim();
    return clean.length > 40 ? clean.slice(0, 40) + '…' : clean;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export const coach = {
    path: '/coach',
    ariaTitle: 'AI Coach',

    render() { return layout('AI Coach', this.body(), { full: true }); },

    init() {
        try { bindLayout(); } catch (err) { console.error('[coach] bindLayout:', err); }

        ensureMigrated();
        if (!current()) {
            const list = ordered();
            currentId = list.length ? list[0].id : create('coach').id;
        }

        this.renderSidebar();
        this.renderMain();
        this.bindEvents();
        this.bindShortcuts();

        const pending = sessionStorage.getItem('munai.pendingPrompt');
        if (pending) {
            sessionStorage.removeItem('munai.pendingPrompt');
            const ta = $('cxInput');
            if (ta) {
                ta.value = pending;
                setTimeout(() => this.send(), 150);
            }
        }
    },

    body() {
        return `
      <div class="cx-layout">
        <div class="cx-backdrop" id="cxBackdrop"></div>
        <aside class="cx-sidebar" id="cxSidebar">${sidebarShell()}</aside>
        <main class="cx-main" id="cxMain">${mainShell()}</main>
      </div>`;
    },

    renderSidebar() {
        const root = $('cxSidebar');
        if (!root) return;
        const groups = grouped();

        const listHtml = groups.length === 0
            ? `<div class="cx-empty">No conversations yet.<br>Start one with the button above.</div>`
            : groups.map(([label, items]) => {
                const visible = items.filter(c => matchesQuery(c, searchQuery));
                if (!visible.length) return '';
                return `
            <div class="cx-group-label">${label}</div>
            ${visible.map(c => convItem(c)).join('')}`;
            }).join('');

        root.innerHTML = `
      <div class="cx-sidebar-top">
        <button class="cx-new-btn" id="cxNew">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M8 3v10M3 8h10"/></svg>
          New chat
        </button>
        <div class="cx-search">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><circle cx="7" cy="7" r="4.5"/><path d="M10.5 10.5l3 3"/></svg>
          <input id="cxSearch" placeholder="Search conversations" value="${escapeHtml(searchQuery)}" />
        </div>
      </div>
      <div class="cx-list" id="cxList">${listHtml}</div>`;

        const list = $('cxList');
        if (list) {
            list.onclick = (e) => {
                const actionEl = e.target.closest('[data-action]');
                if (actionEl) {
                    e.stopPropagation();
                    const id = actionEl.dataset.id;
                    if (actionEl.dataset.action === 'delete') this.deleteConv(id);
                    else if (actionEl.dataset.action === 'rename') this.renameConv(id);
                    return;
                }
                const item = e.target.closest('.cx-item');
                if (item) this.selectConv(item.dataset.id);
            };
            list.oncontextmenu = (e) => {
                const item = e.target.closest('.cx-item');
                if (!item) return;
                e.preventDefault();
                this.showItemMenu(e.clientX, e.clientY, item.dataset.id);
            };
        }

        const newBtn = $('cxNew');
        if (newBtn) newBtn.onclick = () => this.newConv();

        const search = $('cxSearch');
        if (search) {
            search.oninput = () => {
                searchQuery = search.value;
                this.renderSidebar();
                const s = $('cxSearch');
                if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
            };
        }
    },

    renderMain() {
        const conv = current();
        const root = $('cxMain');
        if (!root) return;

        if (!conv) {
            root.innerHTML = `
        <header class="cx-header">
          <button class="cx-menu-btn" id="cxMenuBtn" aria-label="Menu">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
          </button>
          <div class="cx-header-title"><h2>AI Coach</h2></div>
        </header>
        <div class="cx-scroll" id="cxScroll">
          <div class="cx-no-conv">
            <h2>No conversation open</h2>
            <p>Pick a role and start chatting.</p>
            <button class="btn btn-primary" id="cxStartNew">New chat</button>
          </div>
        </div>`;
            const s = $('cxStartNew');
            if (s) s.onclick = () => this.newConv();
            const m = $('cxMenuBtn');
            if (m) m.onclick = () => this.toggleSidebar();
            return;
        }

        root.innerHTML =
            headerShell(conv) +
            `<div class="cx-scroll" id="cxScroll"></div>
       <button class="cx-scroll-btn" id="cxScrollBtn" hidden title="Scroll to bottom">
         <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3v10M4 9l4 4 4-4"/></svg>
       </button>` +
            composerShell();

        this.renderHistory(conv);

        const renameBtn = $('cxRename');
        if (renameBtn) renameBtn.onclick = () => this.renameConv(conv.id);
        const exportBtn = $('cxExport');
        if (exportBtn) exportBtn.onclick = () => this.exportConv(conv.id);
        const clearBtn = $('cxClear');
        if (clearBtn) clearBtn.onclick = () => this.clearConv(conv.id);
        const menuBtn = $('cxMenuBtn');
        if (menuBtn) menuBtn.onclick = () => this.toggleSidebar();

        const scroll = $('cxScroll');
        const scrollBtn = $('cxScrollBtn');
        if (scroll && scrollBtn) {
            scroll.onscroll = () => {
                const far = scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight > 240;
                scrollBtn.hidden = !far;
            };
            scrollBtn.onclick = () => scroll.scrollTo({ top: scroll.scrollHeight, behavior: 'smooth' });
        }
    },

    renderHistory(conv) {
        const scroll = $('cxScroll');
        if (!scroll) return;
        scroll.innerHTML = '';

        if (!conv.messages.length && !streaming[conv.id]) {
            const m = modeInfo(conv.mode);
            scroll.innerHTML = `
        <div class="cx-empty-main">
          <div class="cx-role-chip">${escapeHtml(m.label)}</div>
          <h2>How can I help you prepare?</h2>
          <p>${escapeHtml(m.hint)}. I know your committee, country, and topic.</p>
          <div class="cx-suggestions">
            ${suggestionsFor(conv.mode).map(t =>
                `<button class="cx-suggestion" data-p="${escapeHtml(t)}">${escapeHtml(t)}</button>`
            ).join('')}
          </div>
        </div>`;
            scroll.querySelectorAll('.cx-suggestion').forEach(b => b.onclick = () => {
                const ta = $('cxInput');
                if (ta) ta.value = b.dataset.p;
                this.send();
            });
            return;
        }

        conv.messages.forEach((m, i) => {
            const el = appendMsg(m.role, m.content, false, i);
            attachMessageActions(el, i, this);
        });

        const st = streaming[conv.id];
        if (st) {
            const el = appendMsg('assistant', '', true);
            st.target = el?.querySelector('.chat-content') || null;
            if (st.content && st.target) st.target.innerHTML = markdownLite(st.content);
        }

        scroll.scrollTop = scroll.scrollHeight;
    },

    selectConv(id) {
        if (!get(id)) return;
        if (id === currentId) { this.closeSidebar(); return; }
        currentId = id;
        this.renderSidebar();
        this.renderMain();
        this.bindEvents();
        this.closeSidebar();
    },

    newConv() {
        openModal({
            title: 'New conversation',
            body: `
        <p class="muted" style="font-size:13px;margin-bottom:14px;">Pick the role the AI should take.</p>
        <div class="mode-grid">
          ${MODES.map(m => `
            <button class="mode-option" data-mode="${m.key}">
              <span class="mode-option-label">${m.label}</span>
              <span class="mode-option-hint">${m.hint}</span>
            </button>`).join('')}
        </div>`,
            footer: `<button class="btn btn-ghost" id="cxNewCancel">Cancel</button>`
        });
        document.querySelectorAll('[data-mode]').forEach(b => {
            b.onclick = () => {
                create(b.dataset.mode);
                document.querySelector('.modal-backdrop')?.remove();
                this.renderSidebar();
                this.renderMain();
                this.bindEvents();
                const ta = $('cxInput');
                if (ta) ta.focus();
            };
        });
        const cancel = $('cxNewCancel');
        if (cancel) cancel.onclick = () => document.querySelector('.modal-backdrop')?.remove();
    },

    deleteConv(id) {
        const c = get(id);
        if (!c) return;
        if (c.messages.length && !confirm(`Delete "${c.title}"?`)) return;
        remove(id);
        if (!currentId) create('coach');
        this.renderSidebar();
        this.renderMain();
        this.bindEvents();
        toast('Deleted');
    },

    renameConv(id) {
        const c = get(id);
        if (!c) return;
        openModal({
            title: 'Rename conversation',
            body: `<input id="cxRenameInput" value="${escapeHtml(c.title)}" style="width:100%;padding:10px 12px;border:1px solid var(--line-strong);border-radius:6px;font-family:inherit;font-size:14px;" />`,
            footer: `<button class="btn btn-ghost" id="cxRnCancel">Cancel</button>
               <button class="btn btn-primary" id="cxRnSave">Save</button>`
        });
        const inp = $('cxRenameInput');
        if (inp) { inp.focus(); inp.select(); }
        const save = () => {
            const v = inp?.value.trim() || 'Untitled';
            update(id, { title: v });
            document.querySelector('.modal-backdrop')?.remove();
            this.renderSidebar();
            if (id === currentId) this.renderMain();
            this.bindEvents();
        };
        if (inp) inp.onkeydown = e => { if (e.key === 'Enter') save(); };
        const saveBtn = $('cxRnSave');
        if (saveBtn) saveBtn.onclick = save;
        const cancelBtn = $('cxRnCancel');
        if (cancelBtn) cancelBtn.onclick = () => document.querySelector('.modal-backdrop')?.remove();
    },

    clearConv(id) {
        const c = get(id);
        if (!c) return;
        if (!c.messages.length) return toast('Already empty.');
        openModal({
            title: 'Clear this conversation?',
            body: `<p>Erases all messages in <b>${escapeHtml(c.title)}</b>. Cannot be undone.</p>`,
            footer: `<button class="btn btn-ghost" id="cxClCancel">Cancel</button>
               <button class="btn btn-danger" id="cxClOk">Clear</button>`
        });
        const ok = $('cxClOk');
        if (ok) ok.onclick = () => {
            update(id, { messages: [], title: 'New conversation' });
            document.querySelector('.modal-backdrop')?.remove();
            this.renderSidebar();
            this.renderMain();
            this.bindEvents();
            toast('Cleared');
        };
        const cancel = $('cxClCancel');
        if (cancel) cancel.onclick = () => document.querySelector('.modal-backdrop')?.remove();
    },

    exportConv(id) {
        const c = get(id);
        if (!c || !c.messages.length) return toast('Nothing to export.');
        const m = modeInfo(c.mode);
        const lines = [
            `# ${c.title}`, ``,
            `**Role:** ${m.label}  `,
            `**Created:** ${new Date(c.createdAt).toLocaleString()}  `,
            `**Messages:** ${c.messages.length}`, ``, `---`, ``
        ];
        for (const msg of c.messages) {
            lines.push(msg.role === 'user' ? `## You` : `## Assistant`, '', msg.content, '');
        }
        try {
            const blob = new Blob([lines.join('\n')], { type: 'text/markdown;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${c.title.replace(/[^a-z0-9-_ ]/gi, '_')}.md`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
            toast('Exported');
        } catch {
            toast('Export failed');
        }
    },

    showItemMenu(x, y, id) {
        const c = get(id);
        if (!c) return;
        const items = [
            { action: 'open', label: 'Open', run: () => this.selectConv(id) },
            { action: 'rename', label: 'Rename', run: () => this.renameConv(id) },
            { action: 'pin', label: c.pinned ? 'Unpin' : 'Pin to top', run: () => { update(id, { pinned: !c.pinned }); this.renderSidebar(); this.bindEvents(); } },
            {
                action: 'dup', label: 'Duplicate', run: () => {
                    const copy = { ...c, id: uid(), title: c.title + ' (copy)', pinned: false, createdAt: Date.now(), updatedAt: Date.now() };
                    store.set({ conversations: { ...convs(), [copy.id]: copy } });
                    currentId = copy.id;
                    this.renderSidebar();
                    this.renderMain();
                    this.bindEvents();
                }
            },
            { separator: true },
            { action: 'export', label: 'Export markdown', run: () => this.exportConv(id) },
            { action: 'delete', label: 'Delete', run: () => this.deleteConv(id), danger: true }
        ];
        showContextMenu(x, y, items);
    },

    toggleSidebar() {
        sidebarOpen = !sidebarOpen;
        $('cxSidebar')?.classList.toggle('open', sidebarOpen);
        $('cxBackdrop')?.classList.toggle('open', sidebarOpen);
    },
    closeSidebar() {
        if (!sidebarOpen) return;
        sidebarOpen = false;
        $('cxSidebar')?.classList.remove('open');
        $('cxBackdrop')?.classList.remove('open');
    },

    bindEvents() {
        const input = $('cxInput');
        const sendBtn = $('cxSend');
        if (!input || !sendBtn) return;

        sendBtn.onclick = () => this.send();

        input.oninput = () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 200) + 'px';
            sendBtn.disabled = !input.value.trim();
        };
        input.onkeydown = e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.send(); }
            else if (e.key === 'Escape') { input.value = ''; input.style.height = 'auto'; sendBtn.disabled = true; }
        };

        sendBtn.disabled = !input.value.trim();

        const backdrop = $('cxBackdrop');
        if (backdrop) backdrop.onclick = () => this.closeSidebar();
    },

    async send() {
        const input = $('cxInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;

        const conv = current();
        if (!conv) return;
        if (streaming[conv.id]) return toast('Still generating…');

        const st = { content: '', target: null };
        streaming[conv.id] = st;

        input.value = '';
        input.style.height = 'auto';
        const sendBtn = $('cxSend');
        if (sendBtn) sendBtn.disabled = true;

        conv.messages.push({ role: 'user', content: text });
        update(conv.id, {
            messages: conv.messages,
            title: conv.messages.length === 1 ? autoTitle(text) : conv.title
        });

        this.renderSidebar();
        this.renderMain();
        this.bindEvents();

        const s = store.get();
        const ctx = { ...s.conference, experience: s.profile.experience };

        try {
            await ai.stream(
                { mode: conv.mode, userText: text, history: conv.messages.slice(0, -1), context: ctx, opts: {} },
                chunk => {
                    st.content += chunk;
                    if (currentId === conv.id && st.target?.isConnected) {
                        st.target.innerHTML = markdownLite(st.content);
                        const sc = $('cxScroll');
                        if (sc) {
                            const near = sc.scrollHeight - sc.scrollTop - sc.clientHeight < 160;
                            if (near) sc.scrollTop = sc.scrollHeight;
                        }
                    }
                }
            );

            const content = st.content.trim() || '_No response. Try regenerating._';
            conv.messages.push({ role: 'assistant', content });
            update(conv.id, { messages: conv.messages });
        } catch (err) {
            conv.messages.push({ role: 'assistant', content: `**AI error** — ${err.message}` });
            update(conv.id, { messages: conv.messages });
        } finally {
            delete streaming[conv.id];
            if (currentId === conv.id) {
                this.renderHistory(conv);
                this.bindEvents();
            }
        }
    },

    /**
     * Regenerate the assistant reply at `assistantIndex`.
     * Falls back to regenerating the last reply if no index is given.
     */
    async regenerate(assistantIndex) {
        const conv = current();
        if (!conv || streaming[conv.id]) return;
        if (!conv.messages.length) return;

        // Find the user message immediately before the target assistant message.
        let userIdx = -1;
        if (typeof assistantIndex === 'number' && assistantIndex >= 0 && conv.messages[assistantIndex]?.role === 'assistant') {
            for (let i = assistantIndex - 1; i >= 0; i--) {
                if (conv.messages[i].role === 'user') { userIdx = i; break; }
            }
        }
        if (userIdx < 0) {
            // Fallback: last user message in the conversation.
            for (let i = conv.messages.length - 1; i >= 0; i--) {
                if (conv.messages[i].role === 'user') { userIdx = i; break; }
            }
        }
        if (userIdx < 0) return;

        const userMsg = conv.messages[userIdx];
        conv.messages = conv.messages.slice(0, userIdx + 1);
        update(conv.id, { messages: conv.messages });

        const st = { content: '', target: null };
        streaming[conv.id] = st;
        this.renderHistory(conv);

        const s = store.get();
        const ctx = { ...s.conference, experience: s.profile.experience };

        try {
            await ai.stream(
                { mode: conv.mode, userText: userMsg.content, history: conv.messages.slice(0, -1), context: ctx, opts: {} },
                chunk => {
                    st.content += chunk;
                    if (currentId === conv.id && st.target?.isConnected) {
                        st.target.innerHTML = markdownLite(st.content);
                    }
                }
            );
            const content = st.content.trim() || '_No response. Try again._';
            conv.messages.push({ role: 'assistant', content });
            update(conv.id, { messages: conv.messages });
        } catch (err) {
            conv.messages.push({ role: 'assistant', content: `**AI error** — ${err.message}` });
            update(conv.id, { messages: conv.messages });
        } finally {
            delete streaming[conv.id];
            if (currentId === conv.id) { this.renderHistory(conv); this.bindEvents(); }
        }
    },

    bindShortcuts() {
        // Never accumulate listeners — remove the previous one first.
        if (shortcutsHandler) {
            document.removeEventListener('keydown', shortcutsHandler);
            shortcutsHandler = null;
        }
        shortcutsHandler = (e) => {
            if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'o') { e.preventDefault(); this.newConv(); }
            if (e.ctrlKey && e.key.toLowerCase() === 'k') { e.preventDefault(); $('cxSearch')?.focus(); }
            if (e.key === 'Escape') this.closeSidebar();
        };
        document.addEventListener('keydown', shortcutsHandler);
    },

    rerender() {
        const app = $('app');
        if (app) app.innerHTML = this.render();
        this.init();
    }
};

/* ------------------------------------------------------------------ */
/* Shells                                                              */
/* ------------------------------------------------------------------ */
function sidebarShell() { return ''; }
function mainShell() { return ''; }

function headerShell(conv) {
    const m = conv ? modeInfo(conv.mode) : null;
    return `
    <header class="cx-header">
      <button class="cx-menu-btn" id="cxMenuBtn" aria-label="Menu">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M2 4h12M2 8h12M2 12h12"/></svg>
      </button>
      <div class="cx-header-title">
        <h2>${conv ? escapeHtml(conv.title) : 'AI Coach'}</h2>
        ${m ? `<span class="cx-role-chip">${escapeHtml(m.label)}</span>` : ''}
      </div>
      <div class="cx-header-actions">
        ${conv ? `
          <button class="cx-icon-btn" id="cxRename" title="Rename">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z"/></svg>
          </button>
          <button class="cx-icon-btn" id="cxExport" title="Export markdown">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v9M4.5 8l3.5 3.5L11.5 8M3 13.5h10"/></svg>
          </button>
          <button class="cx-icon-btn danger" id="cxClear" title="Clear messages">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 4h11M6 4V2.5h4V4M4 4l.5 9.5h7L12 4M6.5 7v4M9.5 7v4"/></svg>
          </button>
        ` : ''}
      </div>
    </header>`;
}

function composerShell() {
    return `
    <div class="cx-composer">
      <div class="cx-composer-inner">
        <textarea id="cxInput" placeholder="Ask anything — 'help me defend this POI'…" rows="1"></textarea>
        <button class="cx-send-btn" id="cxSend" disabled aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 8L2 2l2.5 6L2 14z"/></svg>
        </button>
      </div>
      <div class="cx-hint">
        <span><kbd>Enter</kbd> send · <kbd>Shift</kbd>+<kbd>Enter</kbd> newline · <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd> new chat · <kbd>Ctrl</kbd>+<kbd>K</kbd> search</span>
      </div>
    </div>`;
}

function convItem(c) {
    const m = modeInfo(c.mode);
    const active = c.id === currentId ? ' active' : '';
    return `
    <div class="cx-item${active}" data-id="${c.id}" title="${escapeHtml(c.title)}">
      <span class="cx-item-dot">${escapeHtml(m.short)}</span>
      <div class="cx-item-body">
        <div class="cx-item-title">${escapeHtml(c.title)}</div>
        <div class="cx-item-sub">${escapeHtml(m.label)}${c.pinned ? ' · Pinned' : ''}</div>
      </div>
      <div class="cx-item-actions">
        <button class="cx-icon-btn" data-action="rename" data-id="${c.id}" title="Rename">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 2.5l2.5 2.5L5 13.5H2.5V11z"/></svg>
        </button>
        <button class="cx-icon-btn danger" data-action="delete" data-id="${c.id}" title="Delete">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 4h10M6 4V2.5h4V4M4 4l.5 9.5h7L12 4"/></svg>
        </button>
      </div>
    </div>`;
}

function appendMsg(role, content, isStreaming = false, index = -1) {
    const scroll = $('cxScroll');
    if (!scroll) return null;
    if (scroll.querySelector('.cx-empty-main')) scroll.innerHTML = '';

    const el = document.createElement('div');
    el.className = `chat-msg ${role}`;
    el.dataset.index = index;
    el.innerHTML = `
    <div class="chat-avatar">${role === 'user' ? 'You' : 'AI'}</div>
    <div class="chat-body">
      <div class="chat-role">${role === 'user' ? 'You' : 'Assistant'}</div>
      <div class="chat-content">${isStreaming
            ? '<div class="typing"><span></span><span></span><span></span></div>'
            : markdownLite(content)}</div>
    </div>`;
    scroll.appendChild(el);
    scroll.scrollTop = scroll.scrollHeight;
    return el;
}

function attachMessageActions(el, index, self) {
    if (!el || el.querySelector('.chat-actions')) return;
    const conv = current();
    if (!conv) return;
    const msg = conv.messages[index];
    if (!msg) return;

    const body = el.querySelector('.chat-body');
    const actions = document.createElement('div');
    actions.className = 'chat-actions';

    if (msg.role === 'assistant') {
        actions.innerHTML = `<button data-act="copy">Copy</button><button data-act="regen">Regenerate</button>`;
    } else {
        actions.innerHTML = `<button data-act="copy">Copy</button>`;
    }
    body.appendChild(actions);

    actions.querySelector('[data-act="copy"]').onclick = () => {
        navigator.clipboard.writeText(msg.content);
        toast('Copied');
    };
    const regen = actions.querySelector('[data-act="regen"]');
    if (regen) regen.addEventListener('click', () => self.regenerate(index));
}

function suggestionsFor(mode) {
    const byMode = {
        coach: ['Help me understand a moderated caucus', 'Test my opening speech', 'Give me three difficult POIs', 'What should I research about Chad?'],
        teacher: ['Explain preambulatory clauses', 'What is a working paper?', 'Teach me parliamentary procedure', 'Difference between a POI and a Point of Order?'],
        chair: ['Rule on an amendment', 'Enforce speaking time', 'Walk me through the voting procedure', 'What is a motion to suspend debate?'],
        delegate: ['Draft an opening statement for Chad', 'How should I respond to Germany?', "Defend my country's position", 'Write a 30-second GSL speech'],
        opponent: ['Challenge my climate finance proposal', 'Give me a hostile POI', 'Attack my resolution clause', 'What is the weakest part of my argument?'],
        researcher: ['Find UN resolutions on climate finance', 'What treaties has Chad signed?', 'Give me statistics on displacement', 'Summarize the Paris Agreement commitments'],
        speechEvaluator: ['Evaluate this opening speech', 'Score my 60-second speech', 'How can I sound more diplomatic?'],
        positionPaperReviewer: ['Review my position paper draft', 'Is my solution realistic?', 'Check my country alignment'],
        resolutionReviewer: ['Check my operative clauses', 'Is this funding mechanism feasible?', 'Find duplicate clauses in my draft']
    };
    return byMode[mode] || byMode.coach;
}

/* ------------------------------------------------------------------ */
/* Context menu — single-instance, no listener leaks                  */
/* ------------------------------------------------------------------ */
let menuEl = null;
let menuDismissHandler = null;

function showContextMenu(x, y, items) {
    hideContextMenu();
    const menu = document.createElement('div');
    menu.className = 'context-menu';
    menu.innerHTML = items.map(i => i.separator
        ? `<div class="context-menu-sep"></div>`
        : `<button class="context-menu-item${i.danger ? ' danger' : ''}" data-action="${i.action}">${escapeHtml(i.label)}</button>`
    ).join('');
    document.body.appendChild(menu);

    const r = menu.getBoundingClientRect();
    menu.style.left = Math.min(x, window.innerWidth - r.width - 8) + 'px';
    menu.style.top = Math.min(y, window.innerHeight - r.height - 8) + 'px';

    menu.querySelectorAll('[data-action]').forEach(btn => {
        btn.onclick = () => {
            const found = items.find(i => i.action === btn.dataset.action);
            hideContextMenu();
            try { found?.run?.(); } catch (err) { console.error('[context-menu]', err); }
        };
    });

    menuEl = menu;
    menuDismissHandler = (e) => {
        if (menu.contains(e.target)) return;
        hideContextMenu();
    };
    setTimeout(() => {
        if (menuDismissHandler) {
            document.addEventListener('mousedown', menuDismissHandler, true);
        }
    }, 0);
}

function hideContextMenu() {
    if (menuDismissHandler) {
        document.removeEventListener('mousedown', menuDismissHandler, true);
        menuDismissHandler = null;
    }
    if (menuEl) { menuEl.remove(); menuEl = null; }
}