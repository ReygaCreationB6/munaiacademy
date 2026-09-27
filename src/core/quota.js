import { store } from './store.js';
import { escapeHtml, openModal } from './ui.js';

const POLL_INTERVAL = 20000;   // 20s — authoritative sync
const TICK_INTERVAL = 1000;    // 1s  — smooth countdown
const $ = (id) => document.getElementById(id);

let data = null;
let mode = 'idle';             // 'idle' | 'ready' | 'demo' | 'unavailable'
const subs = new Set();
let pollTimer = null;
let tickTimer = null;
let lastTickAt = 0;
let inflight = null;
let currentUnsub = null;
let visibilityBound = false;

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export const quota = {
    get: () => ({ mode, data }),

    onChange(fn) {
        subs.add(fn);
        try { fn({ mode, data }); }
        catch (err) { console.error('[quota subscriber]', err); }
        return () => { subs.delete(fn); };
    },

    start() {
        if (pollTimer) return;
        refresh();
        pollTimer = setInterval(refresh, POLL_INTERVAL);
        if (!visibilityBound) {
            document.addEventListener('visibilitychange', onVisibility);
            visibilityBound = true;
        }
        startTicker();
    },

    stop() {
        if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
        stopTicker();
        if (visibilityBound) {
            document.removeEventListener('visibilitychange', onVisibility);
            visibilityBound = false;
        }
    },

    refresh,
    mount(el) {
        if (currentUnsub) { currentUnsub(); currentUnsub = null; }
        if (!el) return;
        el.onclick = () => openDetails();
        el.onkeydown = (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetails(); }
        };
        currentUnsub = this.onChange(state => render(el, state));
    },
    openDetails
};

/* ------------------------------------------------------------------ */
/* Polling                                                            */
/* ------------------------------------------------------------------ */

function refresh() {
    if (inflight) return inflight;

    const p = (async () => {
        try {
            const cfg = store.get().aiConfig || {};
            if (cfg.provider === 'mock') {
                mode = 'demo';
                data = null;
                return;
            }

            const byo = cfg.provider === 'openai' && !!cfg.apiKey;
            const url = '/api/quota' + (byo ? '?byo=1' : '');

            const r = await fetch(url, { cache: 'no-store' });
            if (!r.ok) throw new Error('quota fetch failed');
            data = await r.json();
            mode = 'ready';
        } catch {
            mode = 'unavailable';
            data = null;
        } finally {
            lastTickAt = Date.now();
            notify();
        }
    })();

    inflight = p;
    // Clear inflight once the promise settles — but only if no newer call
    // has replaced it in the meantime.
    p.finally(() => { if (inflight === p) inflight = null; });

    return p;
}

/* ------------------------------------------------------------------ */
/* Ticker                                                             */
/* ------------------------------------------------------------------ */

function startTicker() {
    if (tickTimer) return;
    lastTickAt = Date.now();
    tickTimer = setInterval(tick, TICK_INTERVAL);
}

function stopTicker() {
    if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
}

function tick() {
    if (!data) return;
    const now = Date.now();
    const elapsed = Math.floor((now - lastTickAt) / 1000);
    if (elapsed <= 0) return;
    lastTickAt = now;

    let resync = false;

    for (const key of ['burst', 'daily']) {
        const bucket = data[key];
        if (!bucket) continue;
        if (bucket.resetIn > 0) {
            bucket.resetIn = Math.max(0, bucket.resetIn - elapsed);
            if (bucket.resetIn === 0) resync = true;
        }
    }

    notify();
    if (resync) refresh();
}

function onVisibility() {
    if (document.visibilityState === 'visible') {
        refresh();
        lastTickAt = Date.now();
        startTicker();
    } else {
        stopTicker();
    }
}

function notify() {
    const snapshot = { mode, data };
    for (const fn of subs) {
        try { fn(snapshot); }
        catch (err) { console.error('[quota subscriber]', err); }
    }
}

/* ------------------------------------------------------------------ */
/* Formatting                                                         */
/* ------------------------------------------------------------------ */

function fmtPill(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return 'now';
    if (sec < 60) return `${Math.ceil(sec)}s`;
    if (sec < 3600) {
        const m = Math.floor(sec / 60);
        const s = Math.floor(sec % 60);
        return `${m}:${String(s).padStart(2, '0')}`;
    }
    if (sec < 86400) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = Math.floor(sec % 60);
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    const d = Math.floor(sec / 86400);
    const h = Math.floor((sec % 86400) / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return m ? `${d}d ${h}h ${m}m` : `${d}d ${h}h`;
}

function fmtLong(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return 'a moment';
    if (sec < 60) return `${Math.ceil(sec)} second${sec >= 2 ? 's' : ''}`;
    const m = Math.floor(sec / 60);
    if (m < 60) {
        const s = Math.floor(sec % 60);
        return s ? `${m} min ${s}s` : `${m} minute${m === 1 ? '' : 's'}`;
    }
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm ? `${h} hour${h === 1 ? '' : 's'} ${rm} min` : `${h} hour${h === 1 ? '' : 's'}`;
    const d = Math.floor(h / 24);
    const rh = h % 24;
    return rh ? `${d} day${d === 1 ? '' : 's'} ${rh}h` : `${d} day${d === 1 ? '' : 's'}`;
}

/* ------------------------------------------------------------------ */
/* Topbar render                                                      */
/* ------------------------------------------------------------------ */

function render(el, state) {
    if (!el) return;

    if (state.mode === 'demo') {
        el.className = 'quota-mount quota-demo';
        el.innerHTML = `<span class="quota-pip"></span><span class="quota-label">Demo</span>`;
        el.title = 'Demo mode — unlimited simulated responses';
        return;
    }

    if (state.mode === 'unavailable' || !state.data) {
        el.className = 'quota-mount quota-unavailable';
        el.innerHTML = `<span class="quota-pip"></span><span class="quota-label">—</span>`;
        el.title = 'Quota unavailable';
        return;
    }

    const { burst, daily, isBYO } = state.data;
    const burstEmpty = burst && burst.remaining <= 0 && burst.resetIn > 0;
    const dailyEmpty = daily && daily.remaining <= 0 && daily.resetIn > 0;

    if (burstEmpty || dailyEmpty) {
        const which = burstEmpty ? burst : daily;
        el.className = 'quota-mount quota-exhausted';
        el.innerHTML = `
      <span class="quota-pip"></span>
      <span class="quota-label">${isBYO ? 'Reset' : 'Resets'}</span>
      <span class="quota-time">${fmtPill(which.resetIn)}</span>`;
        el.title = `${burstEmpty ? 'Per-minute' : 'Daily'} limit reached — resets in ${fmtLong(which.resetIn)}`;
        return;
    }

    const pct = daily.limit > 0 ? daily.remaining / daily.limit : 0;
    let level = 'ok';
    if (pct < 0.1) level = 'critical';
    else if (pct < 0.3) level = 'low';

    el.className = `quota-mount quota-${level}`;
    el.innerHTML = `
    <span class="quota-bar"><span class="quota-fill" style="width:${Math.max(2, pct * 100).toFixed(1)}%"></span></span>
    <span class="quota-count">${daily.remaining}</span>`;
    el.title =
        `${daily.remaining} of ${daily.limit} AI calls remaining today\n` +
        `Resets in ${fmtLong(daily.resetIn)}\n` +
        `Per-minute: ${burst.remaining} of ${burst.limit} available`;
}

/* ------------------------------------------------------------------ */
/* Details modal                                                      */
/* ------------------------------------------------------------------ */

let modalTicker = null;

function openDetails() {
    if (mode === 'demo') {
        openModal({
            title: 'AI quota',
            body: `
        <p class="muted" style="font-size:13.5px;line-height:1.6;">
          You are in <b>Demo mode</b>. Responses are simulated locally and are not
          rate-limited. Switch to <b>Built-in AI</b> in AI Settings to use the real
          model (with quota shown in the topbar).
        </p>`,
            footer: `<a class="btn btn-primary" href="#/settings">Open AI Settings</a>`
        });
        return;
    }

    if (!data) {
        openModal({
            title: 'AI quota',
            body: `<p class="muted">Quota information is not available right now. Try again in a moment.</p>`
        });
        return;
    }

    const { close, root } = openModal({
        title: 'AI quota',
        body: renderDetailsBody(),
        footer: `
      <button class="btn btn-ghost" id="quotaClose">Close</button>
      <a class="btn btn-primary" href="#/settings" id="quotaSettings">AI Settings</a>`
    });

    // Live-tick by replacing the modal body content directly — no nested
    // wrapper div. The old code targeted an inner #quotaBody element and
    // each tick nested another copy inside it, growing the DOM by one
    // level per second.
    stopModalTicker();
    const modalBody = root.querySelector('.modal-body');
    modalTicker = setInterval(() => {
        if (!modalBody || !modalBody.isConnected) { stopModalTicker(); return; }
        modalBody.innerHTML = renderDetailsBody();
    }, 1000);

    const closeBtn = $('quotaClose');
    if (closeBtn) closeBtn.onclick = () => { stopModalTicker(); close(); };
    const settings = $('quotaSettings');
    if (settings) settings.onclick = () => { stopModalTicker(); close(); };
}

function stopModalTicker() {
    if (modalTicker) { clearInterval(modalTicker); modalTicker = null; }
}

/** Returns the inner content of the modal body — no wrapper element. */
function renderDetailsBody() {
    if (!data) return `<p class="muted">Quota information is not available.</p>`;

    const d = data;
    const burst = d.burst || { remaining: 0, limit: 0, used: 0, resetIn: 0 };
    const daily = d.daily || { remaining: 0, limit: 0, used: 0, resetIn: 0 };
    const source = d.isBYO ? 'Your own API key' : 'Built-in AI (free tier)';
    const burstBlocked = burst.remaining <= 0;
    const dailyBlocked = daily.remaining <= 0;

    const burstPct = burst.limit > 0 ? (burst.remaining / burst.limit) * 100 : 0;
    const dailyPct = daily.limit > 0 ? (daily.remaining / daily.limit) * 100 : 0;

    return `
    <p class="muted" style="font-size:13px;margin-bottom:16px;">
      ${escapeHtml(source)}
    </p>

    <div class="quota-detail${burstBlocked ? ' blocked' : ''}">
      <div class="quota-detail-head">
        <span class="quota-detail-label">Per minute</span>
        <span class="quota-detail-value">${burst.remaining} / ${burst.limit}</span>
      </div>
      <div class="quota-detail-bar"><div style="width:${Math.max(2, burstPct).toFixed(1)}%"></div></div>
      <div class="quota-detail-reset">
        ${burstBlocked ? '<b>Blocked.</b> ' : ''}Resets in ${escapeHtml(fmtLong(burst.resetIn))} · ${burst.used} used
      </div>
    </div>

    <div class="quota-detail${dailyBlocked ? ' blocked' : ''}">
      <div class="quota-detail-head">
        <span class="quota-detail-label">Today</span>
        <span class="quota-detail-value">${daily.remaining} / ${daily.limit}</span>
      </div>
      <div class="quota-detail-bar"><div style="width:${Math.max(2, dailyPct).toFixed(1)}%"></div></div>
      <div class="quota-detail-reset">
        ${dailyBlocked ? '<b>Blocked.</b> ' : ''}Resets in ${escapeHtml(fmtLong(daily.resetIn))} · ${daily.used} used
      </div>
    </div>

    ${!d.isBYO ? `
      <div class="quota-hint">
        Need more? Connect your own API key in AI Settings for higher limits and no shared queue.
      </div>` : ''}`;
}