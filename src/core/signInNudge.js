/**
 * Nudges anonymous users to sign in after they've invested enough work
 * that losing it would be painful. Shows at most once every 30 days.
 */

import { auth } from './auth.js';
import { openModal } from './ui.js';

const KEY = 'munai.nudge.v1';
const COOLDOWN_MS = 30 * 24 * 60 * 60 * 1000;
const NUDGE_DELAY_MS = 90_000;

let installed = false;
let timerId = null;

/* Safe storage — never throws. */
function readState() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return { count: 0, lastShown: 0 };
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return { count: 0, lastShown: 0 };
        return {
            count: Number(parsed.count) || 0,
            lastShown: Number(parsed.lastShown) || 0
        };
    } catch {
        // Corrupted value — reset to defaults so the app doesn't break.
        return { count: 0, lastShown: 0 };
    }
}

function writeState(state) {
    try {
        localStorage.setItem(KEY, JSON.stringify(state));
    } catch { /* ignore */ }
}

export function install(store) {
    // Only one nudge timer per session.
    if (installed) return;
    installed = true;

    // Don't nudge signed-in users.
    if (auth.isSignedIn()) return;

    const state = readState();

    function shouldNudge() {
        if (auth.isSignedIn()) return false;
        if (Date.now() - state.lastShown < COOLDOWN_MS) return false;

        // Only nudge after real investment.
        let s;
        try { s = store.get(); } catch { return false; }
        const speeches = (s.speeches || []).length;
        const papers = (s.positionPapers || []).length;
        const resolutions = (s.resolutions || []).length;
        const lessonsDone = Object.values(s.progress || {}).filter(Boolean).length;
        return (speeches + papers + resolutions + lessonsDone) >= 5;
    }

    function show() {
        state.lastShown = Date.now();
        state.count++;
        writeState(state);

        let handle;
        try {
            handle = openModal({
                title: 'Keep your work safe',
                body: `
          <p>You've built up real work on this device — speeches, drafts, lessons.</p>
          <p class="muted" style="font-size:13px;">
            Signing in saves it to the cloud so it follows you to another browser or device.
            It also keeps it safe if you clear your browser data.
          </p>`,
                footer: `
          <button class="btn btn-ghost" id="nudgeLater">Not now</button>
          <a class="btn btn-primary" href="#/login" id="nudgeSignin">Sign in</a>`
            });
        } catch (err) {
            console.warn('[signInNudge] could not open modal:', err && err.message ? err.message : err);
            return;
        }

        const { close, root } = handle;
        const later = root.querySelector('#nudgeLater');
        const signin = root.querySelector('#nudgeSignin');
        if (later) later.onclick = () => close();
        if (signin) signin.onclick = () => close();
    }

    // Clear any previous timer (guards against a hot-reload scenario
    // where install() is called twice despite the flag).
    if (timerId) clearTimeout(timerId);

    timerId = setTimeout(() => {
        timerId = null;
        try {
            if (shouldNudge()) show();
        } catch (err) {
            console.warn('[signInNudge] check failed:', err && err.message ? err.message : err);
        }
    }, NUDGE_DELAY_MS);
}

export function reset() {
    if (timerId) { clearTimeout(timerId); timerId = null; }
    installed = false;
    try { localStorage.removeItem(KEY); } catch { /* ignore */ }
}