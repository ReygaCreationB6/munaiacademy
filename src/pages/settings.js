import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { toast, escapeHtml } from '../core/ui.js';
import { exportBackup, importBackup } from '../core/backup.js';
import { openDossier } from '../core/dossier.js';
import { auth } from '../core/auth.js';
import { cloudSync } from '../core/cloudSync.js';

const $ = (id) => document.getElementById(id);

export const settings = {
  path: '/settings',
  ariaTitle: 'AI Settings',
  render() { return layout('AI Settings', this.body()); },

  init() {
    try { bindLayout(); } catch (err) { console.error('[settings] bindLayout:', err); }

    const s = store.get().aiConfig || {};

    // --- Populate provider + credentials ---
    const prov = $('provSel');
    if (prov) prov.value = s.provider || 'proxy';

    const isBYO = s.provider === 'openai';
    if ($('baseUrl')) $('baseUrl').value = isBYO ? (s.baseUrl || '') : '';
    if ($('apiKey')) $('apiKey').value = isBYO ? (s.apiKey || '') : '';
    if ($('model')) $('model').value = isBYO ? (s.model || '') : '';
    if ($('temp')) $('temp').value = s.temperature ?? 0.7;
    if ($('maxTok')) $('maxTok').value = s.maxTokens ?? 2048;

    toggleProviderFields();

    if (prov) prov.onchange = () => {
      toggleProviderFields();
      if (prov.value !== 'openai') {
        if ($('baseUrl')) $('baseUrl').value = '';
        if ($('apiKey')) $('apiKey').value = '';
        if ($('model')) $('model').value = '';
      }
    };

    // --- Actions ---
    if ($('saveAI')) $('saveAI').onclick = () => this.save();
    if ($('testAI')) $('testAI').onclick = () => this.test();
    if ($('exportBackup')) $('exportBackup').onclick = () => exportBackup();
    if ($('openDossier')) $('openDossier').onclick = () => openDossier();

    if ($('resetAll')) $('resetAll').onclick = () => {
      if (!confirm('Reset all local data? This cannot be undone.')) return;
      try { store.reset(); } catch { }
      // Avoid the flash of the landing page — reload straight to settings.
      try { location.reload(); } catch { }
    };

    if ($('importBackupBtn') && $('importBackupFile')) {
      $('importBackupBtn').onclick = () => $('importBackupFile').click();
      $('importBackupFile').onchange = (e) => {
        const f = e.target.files?.[0];
        if (f) importBackup(f).catch(err => toast('Import failed: ' + err.message));
        e.target.value = '';
      };
    }

    // --- Async — no unhandled rejections ---
    this.checkServerHealth().catch(err => console.error('[settings] health check:', err));
    this.renderAccount();
  },

  renderAccount() {
    const card = $('accountCard');
    if (!card) return;

    const available = auth.isAvailable();
    const user = auth.getUser();

    if (!available) {
      card.innerHTML = `
        <div class="card-header"><div><div class="card-title">Account</div>
        <div class="card-sub">Cloud sync is optional. Add Supabase to your <span class="mono">.env</span> to enable it.</div></div></div>
        <p class="muted" style="font-size:13.5px;">
          Currently running in <b>local-only mode</b> — everything is stored in this browser.
          Progress won't follow you to another device, and clearing site data will erase it.
          Export a backup regularly.
        </p>`;
      return;
    }

    if (!user) {
      card.innerHTML = `
        <div class="card-header"><div><div class="card-title">Account</div>
        <div class="card-sub">Sign in to sync your progress across devices</div></div></div>
        <p class="muted" style="font-size:13.5px;">
          Your local data stays on this device until you sign in. On first sign-in,
          you'll be asked whether to upload this device's data or restore from the cloud.
        </p>
        <div class="flex gap-2 mt-2">
          <a class="btn btn-primary btn-sm" href="#/login">Sign in / Create account</a>
        </div>`;
      return;
    }

    card.innerHTML = `
      <div class="card-header"><div><div class="card-title">Account</div>
      <div class="card-sub">Signed in — cloud sync active</div></div>
      <span class="badge badge-green">✓ Synced</span></div>
      <p style="font-size:14px;margin:4px 0 12px;"><b>${escapeHtml(user.email || '')}</b></p>
      <div class="flex gap-2">
        <button class="btn btn-ghost btn-sm" id="accountSync">Sync now</button>
        <button class="btn btn-ghost btn-sm" id="accountSignOut">Sign out</button>
      </div>`;

    // Bind only after innerHTML is set — single authoritative binding.
    const syncBtn = $('accountSync');
    if (syncBtn) syncBtn.onclick = async () => {
      toast('Syncing…');
      try {
        await cloudSync.pushNow(store.get());
        toast('Synced to cloud');
      } catch (err) {
        console.error('[settings] sync failed:', err);
        toast('Sync failed — check the console');
      }
    };

    const signOut = $('accountSignOut');
    if (signOut) signOut.onclick = async () => {
      if (!confirm('Sign out? Your local data stays on this device.')) return;
      try {
        await auth.signOut();
      } catch (err) {
        console.error('[settings] sign out failed:', err);
      }
      location.reload();
    };
  },

  async checkServerHealth() {
    const badge = $('serverHealth');
    if (!badge) return;

    try {
      const r = await fetch('/api/health', { cache: 'no-store' });
      if (!r.ok) throw new Error('no-health-endpoint');
      const data = await r.json();

      if (data.hasServerKey) {
        badge.innerHTML = `
          <div class="badge badge-green">✓ Built-in AI is ready</div>
          <p class="muted mt-1" style="font-size:12.5px;">
            Server configured with <span class="mono">${escapeHtml(data.defaultModel || 'a model')}</span>
            via <span class="mono">${escapeHtml(shortHost(data.serverBase))}</span>.
          </p>`;
      } else {
        badge.innerHTML = `
          <div class="badge badge-red">Built-in AI needs a server key</div>
          <p class="muted mt-1" style="font-size:12.5px;">
            Add <span class="mono">AI_API_KEY=…</span> to your <span class="mono">.env</span> file and restart the server.
          </p>`;
      }
    } catch {
      badge.innerHTML = `
        <div class="badge">Static mode — no backend detected</div>
        <p class="muted mt-1" style="font-size:12.5px;">
          Start the server with <span class="mono">npm run dev</span>.
        </p>`;
    }
  },

  body() {
    return `
      <div class="card" id="accountCard"></div>

      <div class="card mt-2">
        <div class="card-header"><div>
          <div class="card-title">AI Configuration</div>
          <div class="card-sub">Choose which AI powers every module — Coach, Trainers, Simulation, Crisis.</div>
        </div></div>

        <div id="serverHealth" class="mb-2"></div>

        <div class="field">
          <label>Provider</label>
          <select id="provSel">
            <option value="proxy">Built-in AI (MUN AI Academy) — recommended</option>
            <option value="openai">Bring Your Own API Key</option>
            <option value="mock">Demo mode (offline simulation)</option>
          </select>
          <p class="muted" style="font-size:12.5px;margin-top:6px;line-height:1.6;">
            <b>Built-in AI</b> — routes through this platform's server. The model and key are managed
            entirely on the server via <span class="mono">.env</span>.<br>
            <b>Bring Your Own API Key</b> — connect straight from your browser to OpenAI, OpenRouter, Groq, Mistral, Ollama,
            LM Studio, or any OpenAI-compatible endpoint.<br>
            <b>Demo mode</b> — returns simulated responses so you can explore every feature without any API.
          </p>
        </div>

        <div id="customFields" style="display:none;">
          <div class="field"><label>Base URL</label><input id="baseUrl" placeholder="https://api.openai.com/v1" /></div>
          <div class="field"><label>API Key</label><input id="apiKey" type="password" placeholder="sk-…" /></div>
          <div class="field"><label>Model</label><input id="model" placeholder="gpt-4o-mini" /></div>
          <p class="muted" style="font-size:12.5px;">
            These are only used for the <b>Bring Your Own API Key</b> provider and are stored locally in this browser.
          </p>
        </div>

        <div class="field-row">
          <div class="field"><label>Temperature</label><input id="temp" type="number" step="0.1" min="0" max="2" /></div>
          <div class="field"><label>Max Tokens</label><input id="maxTok" type="number" min="64" max="32000" /></div>
        </div>

        <div class="flex gap-2 mt-2">
          <button class="btn btn-primary" id="saveAI">Save</button>
          <button class="btn btn-ghost" id="testAI">Test Connection</button>
        </div>
        <div id="testResult" class="mt-2"></div>
      </div>

      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Your Data</div></div>
        <div class="flex gap-2 mt-2" style="flex-wrap:wrap;">
          <button class="btn btn-primary btn-sm" id="exportBackup">Export backup (.json)</button>
          <button class="btn btn-ghost btn-sm" id="importBackupBtn">Import backup</button>
          <input type="file" id="importBackupFile" accept="application/json,.json" style="display:none" />
          <button class="btn btn-gold btn-sm" id="openDossier">Generate delegate dossier</button>
        </div>
        <p class="muted mt-2" style="font-size:12.5px;">
          The dossier opens in a new window and is print-ready — use your browser's "Save as PDF" to export it.
        </p>
      </div>

      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Reset</div></div>
        <p class="muted" style="font-size:13.5px;">
          Permanently erase all lessons, drafts, papers, resolutions, and analytics on this device.
          ${auth.isSignedIn() ? 'This does <b>not</b> delete your cloud copy.' : ''}
        </p>
        <button class="btn btn-danger btn-sm" id="resetAll">Reset all local data</button>
      </div>`;
  },

  save() {
    const provider = $('provSel')?.value || 'proxy';
    const cfg = {
      provider,
      temperature: +($('temp')?.value) || 0.7,
      maxTokens: +($('maxTok')?.value) || 2048,
      baseUrl: '',
      apiKey: '',
      model: ''
    };
    if (provider === 'openai') {
      cfg.baseUrl = $('baseUrl')?.value.trim() || '';
      cfg.apiKey = $('apiKey')?.value.trim() || '';
      cfg.model = $('model')?.value.trim() || '';
    }
    store.set({ aiConfig: cfg });
    toast('AI settings saved');
  },

  async test() {
    const out = $('testResult');
    if (!out) return;

    const provider = $('provSel')?.value || 'proxy';
    const providerName = provider === 'proxy' ? 'Built-in AI'
      : provider === 'openai' ? 'Your API endpoint'
        : 'Demo mode';

    out.innerHTML = `
      <div class="flex gap-2 items-center">
        <div class="spinner" style="border-color:rgba(15,37,71,.2);border-top-color:var(--navy-800)"></div>
        Testing ${providerName}…
      </div>`;

    try {
      const r = await ai.test();
      out.innerHTML = `
        <div class="badge badge-green">✓ ${providerName} connected</div>
        <div class="muted mt-1" style="font-size:13px;">
          Model: ${escapeHtml(String(r.model || 'default'))} · ${escapeHtml(String(r.ms || 0))} ms${r.note ? ' · ' + escapeHtml(r.note) : ''}
        </div>`;
    } catch (err) {
      out.innerHTML = `
        <div class="badge badge-red">Connection failed</div>
        <p class="mt-1 muted" style="font-size:13px;">
          ${escapeHtml(err.message || 'Unknown error')}<br>
          Check: API key · Base URL · Model name · Network.
        </p>`;
    }
  }
};

function toggleProviderFields() {
  const fields = $('customFields');
  const prov = $('provSel');
  if (!fields || !prov) return;
  fields.style.display = prov.value === 'openai' ? 'block' : 'none';
}

function shortHost(url) {
  if (!url) return 'default endpoint';
  try { return new URL(url).host; } catch { return url; }
}