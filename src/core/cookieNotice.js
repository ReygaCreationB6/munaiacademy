/**
 * Minimal cookie / storage notice. Since we only use essential storage
 * (auth cookies from Supabase + localStorage for drafts), we're exempt
 * from EU cookie consent requirements — but a clear notice is good
 * practice and makes users feel safer.
 */

const KEY = 'munai.cookie.notice.v1';

function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); } catch { /* ignore */ }
}
function lsRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
}

let installed = false;

export function install() {
    if (installed) return;

    // Already dismissed.
    if (lsGet(KEY) === 'seen') {
        installed = true;
        return;
    }

    // Already on screen (hot-reload safety).
    if (document.querySelector('.cn-bar')) {
        installed = true;
        return;
    }

    installed = true;

    const el = document.createElement('div');
    el.className = 'cn-bar';
    el.innerHTML = `
    <div class="cn-text">
      We use essential cookies and local storage to keep you signed in and to save your drafts.
      No tracking cookies. <a href="#/legal/privacy">Learn more</a>.
    </div>
    <button class="cn-btn" id="cnAccept">Got it</button>`;
    document.body.appendChild(el);

    const btn = el.querySelector('#cnAccept');
    if (btn) btn.onclick = () => {
        lsSet(KEY, 'seen');
        el.classList.add('cn-leaving');
        setTimeout(() => el.remove(), 240);
    };
}

export function reset() {
    lsRemove(KEY);
    installed = false;
    document.querySelectorAll('.cn-bar').forEach(el => el.remove());
}