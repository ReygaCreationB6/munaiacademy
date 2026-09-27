/**
 * Browser-side Sentry. Loaded lazily from CDN, no-op if DSN isn't set.
 * Called once at boot from main.js.
 */

let installed = false;
let initStarted = false;

const CONFIG_TIMEOUT_MS = 5000;

async function fetchConfig() {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), CONFIG_TIMEOUT_MS);
    try {
        const r = await fetch('/api/config', { cache: 'no-store', signal: ctrl.signal });
        if (!r.ok) throw new Error('config fetch failed');
        return await r.json();
    } finally {
        clearTimeout(t);
    }
}

export async function install() {
    if (installed || initStarted) return;
    initStarted = true;

    try {
        const cfg = await fetchConfig();
        if (!cfg || !cfg.sentryBrowserDsn) {
            // No DSN configured — Sentry is a no-op.
            installed = true;
            return;
        }

        const mod = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/@sentry/browser@8/+esm');

        mod.init({
            dsn: cfg.sentryBrowserDsn,
            environment: location.hostname === 'localhost' ? 'development' : 'production',
            tracesSampleRate: 0.1,
            ignoreErrors: [
                'ResizeObserver loop limit exceeded',
                'Non-Error promise rejection captured',
                'AbortError',
                /Loading chunk \d+ failed/,
                /net::ERR_BLOCKED_BY_CLIENT/,   // ad blockers
                /NetworkError when attempting to fetch resource/
            ],
            beforeSend(event) {
                // Scrub user messages so we don't accidentally store content
                // the user typed into their MUN papers.
                if (event && event.request && event.request.data) delete event.request.data;
                return event;
            }
        });

        // Expose the SDK so errorBoundary can forward uncaught errors.
        if (window && typeof window === 'object') {
            window.Sentry = window.Sentry || mod;
        }

        installed = true;
    } catch (err) {
        // Silent — error tracking must never break the app.
        // Log at debug level so dev sees it but users don't.
        if (location.hostname === 'localhost') {
            console.info('[sentry] not installed:', err && err.message ? err.message : err);
        }
    }
}