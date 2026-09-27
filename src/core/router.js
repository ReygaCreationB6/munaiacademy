export class Router {
    constructor(routes) {
        this.routes = routes;
        this._resolving = false;
        this._pendingHash = null;
        window.addEventListener('hashchange', () => this.resolve());
    }

    start() { this.resolve(); }

    navigate(path) {
        if (location.hash === '#' + path) return;
        location.hash = path;
    }

    resolve() {
        // Reentrancy guard: if resolve is called while a previous one is
        // still running (e.g. from inside a page's init), queue one retry.
        if (this._resolving) {
            this._pendingHash = location.hash;
            return;
        }
        this._resolving = true;

        try {
            this._resolveOnce();
        } finally {
            this._resolving = false;
            // If a hashchange happened while we were resolving, process it.
            if (this._pendingHash !== null && this._pendingHash !== location.hash) {
                const next = this._pendingHash;
                this._pendingHash = null;
                setTimeout(() => {
                    if (location.hash === next) this.resolve();
                }, 0);
            } else {
                this._pendingHash = null;
            }
        }
    }

    _resolveOnce() {
        const fullPath = location.hash.replace(/^#/, '') || '/';
        const [path, queryStr] = fullPath.split('?');
        const query = Object.fromEntries(new URLSearchParams(queryStr || ''));

        let fallback = null;
        for (const r of this.routes) {
            if (r.path === '*') { fallback = r; continue; }
            const params = matchPath(r.path, path);
            if (params !== null) return this._render(r, { params, query });
        }
        if (fallback) this._render(fallback, { params: {}, query });
    }

    _render(route, ctx) {
        const app = document.getElementById('app');
        if (!app) return;

        let html;
        try {
            html = route.render(ctx);
        } catch (err) {
            console.error('[router] render failed for', route.path, err);
            html = renderFatal('Failed to render this page.');
        }

        app.innerHTML = html || '';

        if (route.init) {
            try {
                route.init(ctx);
            } catch (err) {
                console.error('[router] init failed for', route.path, err);
                app.innerHTML = renderFatal('This page failed to initialize.');
            }
        }

        try { window.scrollTo(0, 0); } catch { }
    }
}

function matchPath(pattern, path) {
    if (!pattern.includes(':')) return pattern === path ? {} : null;
    const patParts = pattern.split('/').filter(Boolean);
    const pathParts = path.split('/').filter(Boolean);
    if (patParts.length !== pathParts.length) return null;
    const params = {};
    for (let i = 0; i < patParts.length; i++) {
        const pat = patParts[i];
        const seg = pathParts[i];
        if (pat.startsWith(':')) params[pat.slice(1)] = decodeURIComponent(seg);
        else if (pat !== seg) return null;
    }
    return params;
}

function renderFatal(message) {
    return `
      <div style="padding:48px 24px;text-align:center;font-family:var(--font-body);">
        <div style="max-width:400px;margin:0 auto;padding:32px 28px;border:1px solid var(--line);border-radius:12px;background:var(--surface);">
          <h2 style="font-family:var(--font-serif);font-size:18px;color:var(--ink);margin:0 0 8px;">Something went wrong</h2>
          <p style="color:var(--ink-4);font-size:13.5px;line-height:1.55;margin:0 0 20px;">${escapeHtml(message)}</p>
          <button class="btn btn-primary" onclick="location.reload()">Reload</button>
          <a class="btn btn-ghost" href="#/dashboard" style="margin-left:8px;">Dashboard</a>
        </div>
      </div>`;
}

function escapeHtml(s = '') {
    return String(s).replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}