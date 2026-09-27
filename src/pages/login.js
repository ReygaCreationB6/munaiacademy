import { auth } from '../core/auth.js';
import { toast, escapeHtml } from '../core/ui.js';

export const login = {
  path: '/login',
  ariaTitle: 'Sign In',
  render() { return this.html(); },

  init() {
    this.bind();
    // If already signed in, bounce to dashboard.
    if (auth.isSignedIn()) {
      location.hash = '/dashboard';
      return;
    }
  },

  html() {
    const available = auth.isAvailable();
    return `
      <div style="min-height:100vh;display:grid;place-items:center;background:var(--off-white);padding:24px;">
        <div style="max-width:420px;width:100%;">
          <div style="text-align:center;margin-bottom:24px;">
            <div class="brand-mark" style="width:44px;height:44px;margin:0 auto 12px;font-size:20px;">M</div>
            <h1 style="font-size:1.6rem;margin:0;">MUN AI Academy</h1>
            <p class="muted" style="margin-top:6px;">Sign in to sync your progress across devices</p>
          </div>

          ${!available ? this.unavailableBlock() : `
            <div class="card">
              <div class="field">
                <label for="loginEmail">Email</label>
                <input id="loginEmail" type="email" autocomplete="email" placeholder="you@example.com" />
              </div>
              <div class="field">
                <label for="loginPass">Password</label>
                <input id="loginPass" type="password" autocomplete="current-password" placeholder="••••••••" />
              </div>

              <div class="flex gap-2 mt-2">
                <button class="btn btn-primary" id="btnSignIn" style="flex:1;">Sign In</button>
                <button class="btn btn-ghost" id="btnSignUp" style="flex:1;">Create Account</button>
              </div>

              <div style="text-align:center;margin-top:16px;">
                <button class="btn btn-ghost btn-sm" id="btnMagic">Send magic link instead</button>
              </div>

              <div id="authMsg" class="mt-2"></div>
            </div>

            <p class="muted mt-3" style="font-size:12.5px;text-align:center;">
              Data on this device will be offered to the cloud on first sign-in.
            </p>
          `}

          <div style="text-align:center;margin-top:20px;">
            <a href="#/dashboard" style="font-size:13px;color:var(--ink-500);">Continue without an account →</a>
          </div>
        </div>
      </div>`;
  },

  unavailableBlock() {
    return `
      <div class="card">
        <div class="badge badge-red">Accounts not configured</div>
        <p class="mt-2 muted" style="font-size:13.5px;line-height:1.6;">
          This deployment has no Supabase project connected.
          Add <span class="mono">SUPABASE_URL</span> and <span class="mono">SUPABASE_ANON_KEY</span>
          to the server's <span class="mono">.env</span> file, restart, and reload.
        </p>
        <p class="muted" style="font-size:13px;">
          Until then, the app runs entirely offline with local storage — everything works,
          it just won't sync between devices.
        </p>
      </div>`;
  },

  bind() {
    if (!auth.isAvailable()) return;

    const email = () => document.getElementById('loginEmail').value.trim();
    const pass = () => document.getElementById('loginPass').value;

    const showMsg = (kind, text) => {
      const el = document.getElementById('authMsg');
      const cls = kind === 'error' ? 'badge-red' : kind === 'ok' ? 'badge-green' : '';
      el.innerHTML = `<div class="badge ${cls}">${escapeHtml(text)}</div>`;
    };

    const busy = (btn, on, label) => {
      btn.disabled = on;
      if (on) { btn.dataset.orig = btn.textContent; btn.textContent = label; }
      else if (btn.dataset.orig) btn.textContent = btn.dataset.orig;
    };

    document.getElementById('btnSignIn').onclick = async () => {
      const btn = document.getElementById('btnSignIn');
      if (!email() || !pass()) return showMsg('error', 'Enter email and password.');
      busy(btn, true, 'Signing in…');
      try {
        await auth.signIn(email(), pass());
        await this.afterAuth();
      } catch (err) {
        console.error('[login] sign-in error:', err);
        showMsg('error', err.message || 'Sign-in failed.');
      } finally {
        busy(btn, false);
      }
    };

    document.getElementById('btnSignUp').onclick = async () => {
      const btn = document.getElementById('btnSignUp');
      if (!email() || !pass()) return showMsg('error', 'Enter email and password.');
      if (pass().length < 6) return showMsg('error', 'Password must be at least 6 characters.');
      busy(btn, true, 'Creating…');
      try {
        const res = await auth.signUp(email(), pass());
        if (res.needsConfirmation) {
          showMsg('ok', 'Check your email to confirm, then sign in.');
        } else {
          await this.afterAuth();
        }
      } catch (err) {
        console.error('[login] sign-up error:', err);
        showMsg('error', err.message || 'Sign-up failed.');
      } finally {
        busy(btn, false);
      }
    };

    document.getElementById('btnMagic').onclick = async () => {
      if (!email()) return showMsg('error', 'Enter your email first.');
      try {
        await auth.signInWithMagicLink(email());
        showMsg('ok', 'Magic link sent — check your email.');
      } catch (err) {
        showMsg('error', err.message || 'Could not send link.');
      }
    };

    // Enter key on password field submits
    // Enter key on password field submits
    const passInput = document.getElementById('loginPass');
    if (passInput) passInput.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const btn = document.getElementById('btnSignIn');
        if (btn) btn.click();
      }
    };
  },

  async afterAuth() {
    // Hand off to main.js's first-sign-in reconciliation flow,
    // which will offer "restore from cloud" or "upload local".
    window.dispatchEvent(new CustomEvent('munai:signed-in'));
    location.hash = '/dashboard';
  }
};