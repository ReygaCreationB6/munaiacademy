/**
 * Minimal age gate. Shows once, remembers the answer.
 * Not verifiable identity — a good-faith declaration, which is what the
 * FTC expects for general-audience sites with an age restriction.
 */

const KEY = 'munai.age.answer.v1';
const MIN_AGE = 13;

/* Safe localStorage wrappers — Safari private mode and Firefox with
   cookies disabled can throw on any access. Return null / no-op. */
function lsGet(key) {
    try { return localStorage.getItem(key); } catch { return null; }
}
function lsSet(key, value) {
    try { localStorage.setItem(key, value); return true; } catch { return false; }
}
function lsRemove(key) {
    try { localStorage.removeItem(key); } catch { /* ignore */ }
}

let installed = false;

export function install() {
    if (installed) return;
    installed = true;

    const answer = lsGet(KEY);
    if (answer === 'yes') return;                    // Already confirmed
    if (answer === 'no') { showBlocked(); return; }  // Already declined
    showGate();
}

function showGate() {
    // Don't double-inject if the gate is already visible.
    if (document.querySelector('.ag-backdrop')) return;

    const el = document.createElement('div');
    el.className = 'ag-backdrop';
    el.innerHTML = `
    <div class="ag-modal" role="dialog" aria-modal="true" aria-labelledby="agTitle">
      <div class="ag-mark">M</div>
      <h1 id="agTitle" class="ag-title">Before you continue</h1>
      <p class="ag-body">
        MUN AI Academy is designed for students aged ${MIN_AGE} and older.
        Please confirm your age to use the platform.
      </p>
      <div class="ag-actions">
        <button class="btn btn-primary" id="agYes" style="flex:1;">I am ${MIN_AGE} or older</button>
        <button class="btn btn-ghost" id="agNo" style="flex:1;">I am under ${MIN_AGE}</button>
      </div>
      <p class="ag-foot">
        We do not collect personal information from users under ${MIN_AGE}.
        If you indicate you are under ${MIN_AGE}, access will be restricted.
        <a href="#/legal/privacy">Privacy Policy</a>.
      </p>
    </div>`;
    document.body.appendChild(el);

    const yesBtn = el.querySelector('#agYes');
    const noBtn = el.querySelector('#agNo');

    if (yesBtn) yesBtn.onclick = () => {
        lsSet(KEY, 'yes');
        el.remove();
    };
    if (noBtn) noBtn.onclick = () => {
        lsSet(KEY, 'no');
        el.remove();
        showBlocked();
    };
}

/**
 * Full-page block for users who declared themselves under age.
 * Replaces the entire body so nothing else is reachable — the app
 * shell, sidebar, modals, and any overlays are all removed.
 */
function showBlocked() {
    document.body.innerHTML = `
    <div style="min-height:100vh;display:grid;place-items:center;padding:24px;font-family:system-ui;background:#F4F6FA;">
      <div style="max-width:420px;text-align:center;padding:32px;background:#fff;border:1px solid #E4E8EF;border-radius:14px;">
        <div style="width:44px;height:44px;margin:0 auto 16px;border-radius:10px;background:#5B92E5;color:#fff;display:grid;place-items:center;font-weight:700;font-family:Georgia,serif;">M</div>
        <h1 style="font-family:Georgia,serif;font-size:20px;color:#0A0E14;margin:0 0 10px;">Access restricted</h1>
        <p style="color:#58616E;font-size:14px;line-height:1.6;margin:0 0 20px;">
          You indicated you are under ${MIN_AGE} years old. This platform is not available to users under ${MIN_AGE}.
        </p>
        <p style="color:#8A939F;font-size:12.5px;line-height:1.6;">
          If you made a mistake, you can
          <button id="agReset" style="background:none;border:none;color:#5B92E5;text-decoration:underline;cursor:pointer;font-family:inherit;font-size:inherit;padding:0;">
            change your answer
          </button>.
        </p>
      </div>
    </div>`;

    const resetBtn = document.getElementById('agReset');
    if (resetBtn) resetBtn.onclick = () => {
        lsRemove(KEY);
        location.reload();
    };
}

export function reset() {
    lsRemove(KEY);
    installed = false;
}