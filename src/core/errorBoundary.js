/**
 * Global error capture — routes uncaught errors to Sentry and shows a
 * friendly recovery UI instead of a blank page.
 */

let installed = false;

/* Throttle map: prevents the same error message from flooding Sentry
   and the console. Entries expire after a cooldown window. */
const RECENT_ERROR_TTL_MS = 5000;
const recentErrors = new Map();

function shouldReport(key) {
    const now = Date.now();
    const last = recentErrors.get(key);
    if (last && now - last < RECENT_ERROR_TTL_MS) return false;
    recentErrors.set(key, now);

    // Trim the map occasionally so it doesn't grow unbounded.
    if (recentErrors.size > 200) {
        for (const [k, v] of recentErrors) {
            if (now - v > RECENT_ERROR_TTL_MS) recentErrors.delete(k);
        }
    }
    return true;
}

export function install() {
    if (installed) return;
    installed = true;

    window.addEventListener('error', (e) => {
        // Ignore errors from third-party ad blockers etc.
        if (e.message === 'Script error.' || !e.filename) return;
        const err = e.error || new Error(e.message);
        report(err, { source: e.filename, line: e.lineno });
    });

    window.addEventListener('unhandledrejection', (e) => {
        // Ignore aborted fetches — those are normal.
        if (e.reason && e.reason.name === 'AbortError') return;
        const err = e.reason instanceof Error ? e.reason : new Error(String(e.reason));
        report(err, { source: 'unhandledrejection' });
    });
}

function report(err, extra) {
    const key = (err && err.message ? err.message : 'unknown') + '|' + (extra && extra.source || '');
    if (!shouldReport(key)) return;

    try {
        if (window.Sentry && typeof window.Sentry.captureException === 'function') {
            window.Sentry.captureException(err, { extra });
        }
    } catch { /* never let Sentry break the app */ }

    try {
        console.error('[error]', err, extra);
    } catch { /* console unavailable */ }
}

/**
 * Call this in a top-level catch to render a recovery card.
 * Note: the `message` argument is escaped before insertion.
 */
export function renderFatal(container, message = 'Something went wrong.', retry = null) {
    if (!container) return;

    const safeMessage = escapeHtml(String(message || 'Something went wrong.'));

    container.innerHTML = `
    <div style="padding:40px;text-align:center;font-family:var(--font-body);">
      <div style="max-width:400px;margin:0 auto;padding:28px;border:1px solid var(--line);border-radius:12px;background:var(--surface);">
        <h2 style="font-family:var(--font-serif);font-size:18px;color:var(--ink);margin:0 0 8px;">${safeMessage}</h2>
        <p style="color:var(--ink-4);font-size:13.5px;line-height:1.55;margin:0 0 16px;">
          The page hit an unexpected error. Your saved work is safe — reloading usually fixes it.
        </p>
        <button class="btn btn-primary" id="fatalRetry" style="margin-right:8px;">Reload page</button>
        <a class="btn btn-ghost" href="#/dashboard">Go to dashboard</a>
      </div>
    </div>`;

    const retryBtn = container.querySelector('#fatalRetry');
    if (retryBtn) {
        retryBtn.onclick = () => {
            if (typeof retry === 'function') {
                try { retry(); } catch (err) { console.error('[renderFatal retry]', err); location.reload(); }
            } else {
                location.reload();
            }
        };
    }
}

function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c]));
}