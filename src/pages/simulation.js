import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast } from '../core/ui.js';
import { SimulationEngine } from '../simulation/engine/SimulationEngine.js';
import { COUNTRY_PROFILES } from '../simulation/delegates/countryProfiles.js';
import { PHASE_LABEL, motionsAvailable } from '../simulation/engine/procedures.js';
import { CrisisDirector } from '../simulation/crisis/CrisisDirector.js';
import { listScenarios } from '../simulation/crisis/scenarios.js';
import { track } from '../analytics/metrics.js';
import * as shortcuts from '../core/shortcuts.js';
import { sharedSim } from '../core/sharedSim.js';

let engine = null;
let view = 'setup';
let lastState = null;
let unregisterShortcuts = null;
let mounted = false;

let sharedState = {
  sessions: [],
  loading: false,
  refreshTimer: null,
  handlersBound: false
};

const $ = (id) => document.getElementById(id);

if (typeof window !== 'undefined' && !window.__simulationCleanupInstalled) {
  window.__simulationCleanupInstalled = true;
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#/simulate')) return;
    if (window._crisisInterval) {
      clearInterval(window._crisisInterval);
      window._crisisInterval = null;
    }
    if (unregisterShortcuts) { try { unregisterShortcuts(); } catch { } unregisterShortcuts = null; }
  });
}

export const simulation = {
  path: '/simulate',
  ariaTitle: 'Conference Simulation',

  render() {
    const body = view === 'setup' ? this.setupHtml()
      : view === 'live' ? this.liveHtml()
        : this.reportHtml();
    return layout('Conference Simulation', body, { narrow: false });
  },

  init() {
    mounted = true;

    if (window._crisisInterval) { clearInterval(window._crisisInterval); window._crisisInterval = null; }
    try { bindLayout(); } catch (err) { console.error('[simulation] bindLayout:', err); }
    if (unregisterShortcuts) { try { unregisterShortcuts(); } catch { } unregisterShortcuts = null; }

    if (view === 'setup') this.bindSetup();
    else if (view === 'live') this.bindLive();
    else this.bindReport();
  },

  rerender() {
    const app = $('app');
    if (app) app.innerHTML = this.render();
    this.init();
  },

  destroy() {
    if (sharedState.refreshTimer) {
      clearInterval(sharedState.refreshTimer);
      sharedState.refreshTimer = null;
    }
  },

  /* ---------------- SETUP ---------------- */

  setupHtml() {
    const s = store.get();
    const conf = s.conference || {};
    const countries = Object.keys(COUNTRY_PROFILES);
    const scenarios = listScenarios();

    return `
      <div class="card">
        <div class="card-header"><div>
          <div class="card-title">Conference Simulation</div>
          <div class="card-sub">Standard is single-player. Crisis adds dynamic events. Shared runs the same engine across multiple humans.</div>
        </div></div>

        <div class="field">
          <label>Mode</label>
          <select id="simMode">
            <option value="standard">Standard — single-player</option>
            <option value="crisis">Crisis — dynamic events</option>
            <option value="shared">Shared — multiplayer</option>
          </select>
        </div>

        <div id="standardFields">
          <div id="crisisFields" style="display:none;">
            <div class="field">
              <label>Crisis Scenario</label>
              <select id="simScenario">
                ${scenarios.map(sc => `<option value="${sc.key}">${escapeHtml(sc.name)} — ${escapeHtml(sc.description)}</option>`).join('')}
              </select>
            </div>
          </div>

          <div class="field">
            <label>Your Country</label>
            <select id="simCountry">
              ${countries.map(c => `<option ${c === conf.country ? 'selected' : ''}>${c}</option>`).join('')}
            </select>
            <p class="muted" style="font-size:12.5px;margin-top:6px;">All other countries will be represented by AI delegates.</p>
          </div>

          <div class="field-row">
            <div class="field"><label>Committee</label><input id="simCommittee" value="${escapeHtml(conf.committee || 'UNHRC')}" /></div>
            <div class="field"><label>Difficulty</label>
              <select id="simDifficulty">
                <option value="easy">Easy</option>
                <option value="medium" selected>Medium</option>
                <option value="hard">Hard</option>
              </select>
            </div>
          </div>

          <div class="field"><label>Topic</label><input id="simTopic" value="${escapeHtml(conf.topic || '')}" /></div>

          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary" id="simStart">Begin Simulation</button>
          </div>
        </div>

        <div id="sharedFields" style="display:none;">
          <div class="field-row">
            <div class="field"><label>Your display name</label><input id="sharedName" value="${escapeHtml((s.profile?.name) || 'Host')}" /></div>
            <div class="field"><label>Your country</label><input id="sharedCountry" value="${escapeHtml(conf.country || 'Chad')}" /></div>
          </div>

          <div class="field-row">
            <div class="field"><label>Committee</label><input id="sharedCommittee" value="${escapeHtml(conf.committee || 'UNHRC')}" /></div>
            <div class="field"><label>Topic</label><input id="sharedTopic" value="${escapeHtml(conf.topic || '')}" /></div>
          </div>

          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary" id="sharedCreate">Create shared session</button>
            <button class="btn btn-ghost" id="sharedJoin">Join by code</button>
            <button class="btn btn-ghost btn-sm" id="sharedRefresh">Refresh</button>
          </div>

          <div class="mt-2">
            <div class="label-small mb-1">Open sessions</div>
            <div id="sharedList"><p class="muted" style="font-size:12.5px;">Loading…</p></div>
          </div>
        </div>
      </div>`;
  },

  bindSetup() {
    const modeSel = $('simMode');
    const standardFields = $('standardFields');
    const sharedFields = $('sharedFields');
    const crisisFields = $('crisisFields');

    const refreshFields = () => {
      const v = modeSel.value;
      standardFields.style.display = v === 'shared' ? 'none' : 'block';
      sharedFields.style.display = v === 'shared' ? 'block' : 'none';
      crisisFields.style.display = v === 'crisis' ? 'block' : 'none';
    };
    refreshFields();
    modeSel.onchange = refreshFields;

    const startBtn = $('simStart');
    if (startBtn) startBtn.onclick = () => this.startSimulation();

    // Shared-sim handlers
    const createBtn = $('sharedCreate');
    if (createBtn) createBtn.onclick = () => this.createShared();

    const joinBtn = $('sharedJoin');
    if (joinBtn) joinBtn.onclick = () => this.joinShared();

    const refreshBtn = $('sharedRefresh');
    if (refreshBtn) refreshBtn.onclick = () => this.refreshShared();

    if (modeSel.value === 'shared') this.initSharedList();
  },

  /* ---------------- SINGLE-PLAYER START ---------------- */

  startSimulation() {
    const mode = $('simMode')?.value || 'standard';
    if (mode === 'shared') return;   // handled by shared buttons

    const config = {
      country: $('simCountry')?.value || 'Chad',
      committee: $('simCommittee')?.value.trim() || 'UNHRC',
      topic: $('simTopic')?.value.trim() || 'Climate Change and Human Rights',
      difficulty: $('simDifficulty')?.value || 'medium'
    };

    let crisisDirector = null;
    if (mode === 'crisis') {
      const scenarioKey = $('simScenario')?.value;
      crisisDirector = new CrisisDirector({ scenarioKey, difficulty: config.difficulty });
      config.crisisDirector = crisisDirector;
      config.crisisMode = true;
      config.scenarioKey = scenarioKey;
    }

    const currentConf = store.get().conference || {};
    store.set({
      conference: {
        ...currentConf,
        committee: config.committee,
        country: config.country,
        topic: config.topic
      }
    });

    view = 'live';
    engine = new SimulationEngine({
      ai, config,
      isDemo: ai.provider?.constructor?.name === 'MockProvider',
      onEvent: state => this.onStateChange(state)
    });
    this.rerender();
    engine.start();
  },

  /* ---------------- SHARED SIM ---------------- */

  initSharedList() {
    if (!sharedState.handlersBound) {
      sharedState.handlersBound = true;
      sharedSim.on('sessions', m => {
        sharedState.sessions = Array.isArray(m.sessions) ? m.sessions : [];
        this.renderSharedList();
      });
      sharedSim.on('session-created', m => {
        sharedSim.setCode(m.code);
        location.hash = `/sim/shared/${m.code}`;
      });
      sharedSim.on('error', m => toast(m.message));
    }

    sharedSim.connect()
      .then(() => this.refreshShared())
      .catch(() => {
        const el = $('sharedList');
        if (el) el.innerHTML = `<p class="muted" style="font-size:12.5px;">Could not reach the server.</p>`;
      });

    if (sharedState.refreshTimer) clearInterval(sharedState.refreshTimer);
    sharedState.refreshTimer = setInterval(() => this.refreshShared(), 5000);
  },

  refreshShared() {
    sharedSim.send({ type: 'list-sessions' });
  },

  renderSharedList() {
    const el = $('sharedList');
    if (!el) return;
    if (!sharedState.sessions.length) {
      el.innerHTML = `<p class="muted" style="font-size:12.5px;">No open sessions. Create one to get started.</p>`;
      return;
    }
    el.innerHTML = sharedState.sessions.map(s => `
      <div class="mx-session-card">
        <div class="info">
          <div class="t">${escapeHtml(s.committee)} · <span class="mono">${escapeHtml(s.code)}</span></div>
          <div class="s">${escapeHtml(s.topic)} · ${s.humanCount} human${s.humanCount === 1 ? '' : 's'} + ${s.aiCount} AI · ${escapeHtml(s.phase)}</div>
        </div>
        <button class="btn btn-primary btn-sm" data-join="${escapeHtml(s.code)}">Join</button>
      </div>`).join('');
    el.querySelectorAll('[data-join]').forEach(b => {
      b.onclick = () => {
        const code = $('sharedCode');
        if (code) code.value = b.dataset.join;
        this.joinShared(b.dataset.join);
      };
    });
  },

  createShared() {
    console.log('[createShared] clicked');
    const name = $('sharedName')?.value.trim() || 'Host';
    const userCountry = $('sharedCountry')?.value.trim() || 'Chad';
    const committee = $('sharedCommittee')?.value.trim() || 'UNHRC';
    const topic = $('sharedTopic')?.value.trim() || 'Open agenda';

    store.set({
      profile: { ...store.get().profile, name },
      conference: { ...store.get().conference, country: userCountry, committee, topic }
    });

    sharedSim.connect()
      .then(() => sharedSim.send({
        type: 'create-session',
        hostName: name,
        userCountry,
        committee,
        topic,
        difficulty: 'medium'
      }))
      .catch(() => toast('Could not reach the server.'));
  },

  joinShared(prefilledCode) {
    const name = $('sharedName')?.value.trim() || 'Delegate';
    const country = $('sharedCountry')?.value.trim() || 'Chad';

    const promptForCode = () => {
      if (prefilledCode) return prefilledCode;
      const code = window.prompt('Enter the session code:');
      return code ? code.trim().toUpperCase() : null;
    };

    const code = promptForCode();
    if (!code || code.length !== 6) return toast('Invalid session code.');

    store.set({
      profile: { ...store.get().profile, name },
      conference: { ...store.get().conference, country }
    });

    sharedSim.connect()
      .then(() => {
        sharedSim.setCode(code);
        sharedSim.send({ type: 'join-session', code, name, country });
        location.hash = `/sim/shared/${code}`;
      })
      .catch(() => toast('Could not reach the server.'));
  },

  /* ---------------- LIVE (single-player) ---------------- */

  liveHtml() {
    const state = engine?.state || {};
    const isCrisis = !!state.crisisMode;
    return `
      <div id="simAria" class="sr-only" aria-live="polite" aria-atomic="false"></div>
      <div class="sim-grid" id="simGrid">
        <div class="card sim-roster" id="simRoster">
          <div class="label-small mb-1">Delegates</div>
          <div id="rosterList"></div>
        </div>
        <div>
          <div class="sim-mobile-roster" id="mobileRoster"></div>
          <div class="card sim-top" id="simTop">
            <div class="flex between items-center">
              <div><div class="card-title" id="phaseLabel">—</div>
              <div class="card-sub" id="simMeta">—</div></div>
              <div class="flex gap-2 items-center">
                <span class="badge" id="speakerBadge">—</span>
                <span class="badge badge-gold" id="xpBadge">XP 0</span>
                ${isCrisis ? `<button class="btn btn-ghost btn-sm" id="forceCrisis" title="Trigger the next crisis event"><svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5L3.5 8.5h3.5L7 14.5l4.5-7h-3.5z"/></svg>Crisis</button>` : ''}
              </div>
            </div>
          </div>
          <div class="card mt-2">
            <div class="card-header"><div class="card-title">Transcript</div>
              <button class="btn btn-ghost btn-sm" id="simEnd">End session</button></div>
            <div id="transcript" class="sim-transcript-scroll"></div>
          </div>
          <div class="card mt-2" id="actionPanel"></div>
        </div>
      </div>`;
  },

  bindLive() {
    const endBtn = $('simEnd');
    if (endBtn) endBtn.onclick = () => {
      if (!confirm('End this session now?')) return;
      if (window._crisisInterval) { clearInterval(window._crisisInterval); window._crisisInterval = null; }
      engine?.destroy();
      this.finish();
    };

    const crisisBtn = $('forceCrisis');
    if (crisisBtn) crisisBtn.addEventListener('click', () => {
      if (!engine?.crisisDirector) { toast('Enable Crisis mode in setup to use this.'); return; }
      engine.forceCrisis();
    });

    unregisterShortcuts = shortcuts.register('sim-live', {
      'mod+enter': () => this.triggerPrimaryAction()
    });

    if (engine?.state) {
      try { this.onStateChange(engine.state); } catch (err) { console.error('[simulation] replay:', err); }
    }
  },

  triggerPrimaryAction() {
    const panel = $('actionPanel');
    if (!panel) return;
    const primary =
      panel.querySelector('#speakBtn') ||
      panel.querySelector('#poiAnswerBtn') ||
      panel.querySelector('#crisisSubmit') ||
      panel.querySelector('#chatSend') ||
      panel.querySelector('#resSubmit') ||
      panel.querySelector('[data-vote="yes"]') ||
      panel.querySelector('[data-fv="yes"]') ||
      panel.querySelector('[data-opt]') ||
      panel.querySelector('[data-motion]');
    if (primary) primary.click();
  },

  announce(text) {
    const live = $('simAria');
    if (live) live.textContent = text;
  },

  onStateChange(state) {
    if (!mounted) return;
    lastState = state;

    const roster = $('rosterList');
    if (roster) {
      roster.innerHTML = (engine?.delegates || []).map(d => {
        const active = state.currentSpeaker === d.country;
        const isUser = d.isUser;
        return `<div style="display:flex;align-items:center;gap:8px;padding:7px 8px;border-radius:5px;background:${active ? 'rgba(91,146,229,.12)' : 'transparent'};margin-bottom:3px;">
          <span style="width:8px;height:8px;border-radius:50%;background:${active ? 'var(--accent)' : 'var(--ink-300)'};"></span>
          <span style="flex:1;font-size:13.5px;${isUser ? 'font-weight:600;color:var(--ink);' : 'color:var(--ink-2);'}">${escapeHtml(d.country)}${isUser ? ' (you)' : ''}</span>
        </div>`;
      }).join('');
    }

    const mobile = $('mobileRoster');
    if (mobile) {
      mobile.innerHTML = (engine?.delegates || []).map(d => {
        const active = state.currentSpeaker === d.country;
        const cls = ['chip'];
        if (active) cls.push('active');
        if (d.isUser) cls.push('you');
        return `<span class="${cls.join(' ')}">${escapeHtml(d.country)}${d.isUser ? ' (you)' : ''}</span>`;
      }).join('');
    }

    const phaseLabel = $('phaseLabel');
    if (phaseLabel) phaseLabel.textContent = PHASE_LABEL[state.phase] || state.phase;
    const meta = $('simMeta');
    if (meta) meta.textContent = `${state.committee} · ${state.topic}${state.crisisMode ? ' · CRISIS' : ''}`;
    const badge = $('speakerBadge');
    if (badge) badge.textContent = state.currentSpeaker ? `Floor: ${state.currentSpeaker}` : 'No speaker';
    const xp = $('xpBadge');
    if (xp) {
      const total = state.score.speeches * 5
        + state.score.motionsPassed * 5
        + state.score.poisAnswered * 3
        + state.score.votesCast * 2
        + (state.score.crisisXP || 0);
      xp.textContent = `XP ${total}`;
    }

    const t = $('transcript');
    if (t) {
      const near = t.scrollHeight - t.scrollTop - t.clientHeight < 80;
      t.innerHTML = state.transcript.map(renderEntry).join('');
      if (near) t.scrollTop = t.scrollHeight;
    }

    const last = state.transcript.slice(-1)[0];
    if (last && (last.kind === 'delegate' || last.kind === 'chair' || last.kind === 'crisis')) {
      const prefix = last.kind === 'crisis' ? 'Crisis update: ' : `${last.speaker}: `;
      this.announce(prefix + (last.content || '').slice(0, 200));
    }

    this.renderActions(state);
  },

  renderActions(state) {
    const panel = $('actionPanel');
    if (!panel) return;
    const pending = state.pendingUserInput;
    if (!pending) {
      panel.innerHTML = `<div class="muted" style="font-size:13.5px;">Waiting…</div>`;
      return;
    }

    switch (pending.type) {
      case 'crisis-response': {
        const ev = pending.event;
        panel.innerHTML = `
          <div style="background:var(--gold-tint);border:1px solid rgba(166,132,44,.35);padding:16px;border-radius:8px;margin-bottom:14px;">
            <div class="label-small" style="color:var(--gold);">${escapeHtml((ev.type || '').toUpperCase())} · ${escapeHtml(ev.severity || '')}</div>
            <div style="font-family:var(--font-serif);font-weight:600;color:var(--ink);margin-top:4px;font-size:16px;">${escapeHtml(ev.title)}</div>
            <div style="font-size:13.5px;color:var(--ink-2);margin-top:8px;line-height:1.5;">${escapeHtml(ev.description)}</div>
            ${ev._window ? `<div class="mt-2" style="color:var(--gold);"><b>Response window: <span id="crisisTimer">${ev._window}</span>s</b></div>` : ''}
          </div>
          <div class="flex gap-2" style="flex-wrap:wrap;margin-bottom:14px;">
            ${(ev.options || []).map(o => `<button class="btn btn-ghost btn-sm" data-opt="${o.key}">${escapeHtml(o.text)}</button>`).join('')}
          </div>
          <div class="field">
            <label>Or write your own response</label>
            <textarea id="crisisCustom" rows="3" placeholder="Deliver a statement as your delegation…"></textarea>
          </div>
          <div class="flex between items-center">
            <span class="muted" id="crisisWords">0 words</span>
            <button class="btn btn-primary" id="crisisSubmit">Respond</button>
          </div>`;

        const ta = panel.querySelector('#crisisCustom');
        if (ta) {
          ta.oninput = () => {
            const wc = ta.value.trim().split(/\s+/).filter(Boolean).length;
            const w = panel.querySelector('#crisisWords');
            if (w) w.textContent = `${wc} words`;
          };
          ta.focus();
        }

        panel.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
          if (window._crisisInterval) { clearInterval(window._crisisInterval); window._crisisInterval = null; }
          this._trackCrisis(ev, b.dataset.opt, false);
          engine.resolveCrisis({ optionKey: b.dataset.opt, customText: '' });
        });
        panel.querySelector('#crisisSubmit').onclick = () => {
          const text = ta?.value.trim() || '';
          if (window._crisisInterval) { clearInterval(window._crisisInterval); window._crisisInterval = null; }
          this._trackCrisis(ev, 'custom', false);
          engine.resolveCrisis({ optionKey: 'custom', customText: text });
        };

        if (ev._expiresAt) {
          if (window._crisisInterval) { clearInterval(window._crisisInterval); window._crisisInterval = null; }
          const timerEl = panel.querySelector('#crisisTimer');
          window._crisisInterval = setInterval(() => {
            if (!mounted || !location.hash.startsWith('#/simulate')) {
              clearInterval(window._crisisInterval);
              window._crisisInterval = null;
              return;
            }
            const remaining = Math.max(0, Math.ceil((ev._expiresAt - Date.now()) / 1000));
            if (timerEl && timerEl.isConnected) timerEl.textContent = String(remaining);
            if (remaining <= 0) {
              clearInterval(window._crisisInterval);
              window._crisisInterval = null;
              this._trackCrisis(ev, 'expired', true);
              engine.resolveCrisis({ optionKey: null, customText: '', expired: true });
            }
          }, 500);
        }
        return;
      }

      case 'motion-floor':
        panel.innerHTML = `
          <div class="card-title">Your move</div>
          <div class="card-sub mb-2">Propose a motion, or yield the floor.</div>
          <div class="flex gap-2" style="flex-wrap:wrap;">
            ${(pending.allowed || motionsAvailable(state.phase).map(m => m.key)).map(k => {
          const m = motionsAvailable(state.phase).find(x => x.key === k);
          if (!m) return '';
          return `<button class="btn btn-ghost btn-sm" data-motion="${m.key}">${m.name}</button>`;
        }).join('')}
            <button class="btn btn-ghost btn-sm" data-yield>Yield the floor</button>
          </div>`;
        panel.querySelectorAll('[data-motion]').forEach(b => b.onclick = () => this.proposeMotion(b.dataset.motion));
        panel.querySelector('[data-yield]').onclick = () => this.yield();
        return;

      case 'motion-vote':
        panel.innerHTML = `
          <div class="card-title">Vote on the motion</div>
          <div class="card-sub mb-2">${escapeHtml(pending.motion.name)} — proposed by ${escapeHtml(pending.proposer)}${pending.seconder ? `, seconded by ${escapeHtml(pending.seconder)}` : ''}.</div>
          <div class="flex gap-2">
            <button class="btn btn-primary" data-vote="yes">Yes</button>
            <button class="btn btn-ghost" data-vote="no">No</button>
            <button class="btn btn-ghost" data-vote="abstain">Abstain</button>
          </div>`;
        panel.querySelectorAll('[data-vote]').forEach(b => b.onclick = () => {
          const v = b.dataset.vote;
          const resolve = pending.resolve;
          engine.clearPending();
          engine.state.motionInProgress = null;
          engine.resolveMotionVote(v, pending.motion);
          resolve?.(v === 'yes');
        });
        return;

      case 'speak':
        panel.innerHTML = `
          <div class="card-title">Your turn to speak</div>
          <div class="card-sub mb-2">${pending.phase} · ${pending.time}s</div>
          <textarea id="userSpeech" rows="5" placeholder="Deliver your speech as the delegate…"></textarea>
          <div class="flex between items-center mt-1">
            <span class="muted" id="spCount">0 words</span>
            <button class="btn btn-primary btn-sm" id="speakBtn">Deliver speech</button>
          </div>`;
        const ta2 = panel.querySelector('#userSpeech');
        if (ta2) {
          ta2.focus();
          ta2.oninput = () => {
            const wc = ta2.value.trim().split(/\s+/).filter(Boolean).length;
            const w = panel.querySelector('#spCount');
            if (w) w.textContent = `${wc} words`;
          };
        }
        panel.querySelector('#speakBtn').onclick = () => {
          const text = ta2?.value.trim() || '';
          if (!text) return toast('Write something first.');
          engine.userSpeak(text);
        };
        return;

      case 'poi-answer':
        panel.innerHTML = `
          <div class="card-title">Point of Information</div>
          <div class="card-sub mb-2">From ${escapeHtml(pending.asker)}: <em>${escapeHtml(pending.poi)}</em></div>
          <textarea id="poiAnswer" rows="3" placeholder="Your response…"></textarea>
          <div class="flex gap-2 mt-1">
            <button class="btn btn-primary btn-sm" id="poiAnswerBtn">Answer</button>
            <button class="btn btn-ghost btn-sm" id="poiDeclineBtn">Decline</button>
          </div>`;
        const pa = panel.querySelector('#poiAnswer');
        if (pa) pa.focus();
        panel.querySelector('#poiAnswerBtn').onclick = () => {
          const text = pa?.value.trim() || '';
          if (!text) return toast('Write a response.');
          engine.answerPOI(text);
        };
        panel.querySelector('#poiDeclineBtn').onclick = () => engine.declinePOI();
        return;

      case 'chat':
        panel.innerHTML = `
          <div class="card-title">Unmoderated caucus — negotiate</div>
          <div class="card-sub mb-2">Topic: ${escapeHtml(pending.topic)}</div>
          <div class="flex gap-2">
            <input id="chatInput" style="flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:14px;" placeholder="Propose language, ask a delegate…" />
            <button class="btn btn-primary btn-sm" id="chatSend">Send</button>
            <button class="btn btn-ghost btn-sm" id="chatEnd">End caucus</button>
          </div>`;
        const ci = panel.querySelector('#chatInput');
        if (ci) ci.focus();
        const send = () => {
          const v = ci?.value.trim() || '';
          if (!v) return;
          if (ci) ci.value = '';
          engine.userChatMessage(v);
        };
        panel.querySelector('#chatSend').onclick = send;
        if (ci) ci.onkeydown = e => { if (e.key === 'Enter') send(); };
        panel.querySelector('#chatEnd').onclick = () => engine.endUnmodCaucus();
        return;

      case 'submit-resolution':
        panel.innerHTML = `
          <div class="card-title">Draft Resolution</div>
          <div class="card-sub mb-2">Write the operative clauses your bloc will sponsor.</div>
          <textarea id="resText" rows="9" placeholder="The ${escapeHtml(state.committee)},\n\n1. Requests the establishment of…\n2. Calls upon Member States to…"></textarea>
          <div class="flex gap-2 mt-1">
            <button class="btn btn-primary btn-sm" id="resSubmit">Submit draft</button>
            <button class="btn btn-ghost btn-sm" id="resDraft">Ask AI to draft</button>
          </div>`;
        const rt = panel.querySelector('#resText');
        if (rt) rt.focus();
        panel.querySelector('#resSubmit').onclick = () => {
          const text = rt?.value.trim() || '';
          if (text.length < 80) return toast('Write a bit more.');
          engine.submitResolution(text);
        };
        panel.querySelector('#resDraft').onclick = async () => {
          const btn = panel.querySelector('#resDraft');
          if (!btn || btn.disabled) return;
          btn.disabled = true;
          btn.textContent = 'Drafting…';
          try {
            const out = await ai.chat({
              mode: 'resolutionReviewer',
              userText: `Draft 3 operative clauses for a resolution in the ${state.committee} on "${state.topic}". The sponsor is ${state.userCountry}. Return only the clauses, numbered.`,
              history: [], context: {},
              fallback: () =>
                `1. Requests the establishment of a dedicated trust fund under the auspices of the United Nations, financed through assessed contributions and voluntary pledges, with disbursement beginning within 12 months of adoption;\n` +
                `2. Calls upon Member States to submit biennial reports to the Secretariat detailing progress on implementation, to be reviewed by the relevant subsidiary body;\n` +
                `3. Encourages the Secretary-General to coordinate technical assistance and capacity-building for developing States, in consultation with relevant UN agencies.`
            });
            if (rt) rt.value = out.trim();
          } catch {
            toast('Could not reach AI — write it manually.');
          } finally {
            if (btn) { btn.disabled = false; btn.textContent = 'Ask AI to draft'; }
          }
        };
        return;

      case 'final-vote':
        panel.innerHTML = `
          <div class="card-title">Final Vote on the Draft Resolution</div>
          <div class="card-sub mb-2">Cast your country's vote. Roll call voting — doors are closed.</div>
          <div class="flex gap-2">
            <button class="btn btn-primary" data-fv="yes">Yes</button>
            <button class="btn btn-ghost" data-fv="no">No</button>
            <button class="btn btn-ghost" data-fv="abstain">Abstain</button>
          </div>`;
        panel.querySelectorAll('[data-fv]').forEach(b => b.onclick = () => engine.submitFinalVote(b.dataset.fv));
        return;
    }
  },

  proposeMotion(key) {
    const m = motionsAvailable(engine.state.phase).find(x => x.key === key);
    if (!m) return;
    if (m.params && m.params.length) {
      engine.userProposeMotion(key, m.defaults || {});
      return;
    }
    engine.userProposeMotion(key, {});
  },

  yield() {
    engine.clearPending();
    engine.runGSLCycle();
  },

  finish() {
    view = 'report';
    this.rerender();
  },

  _trackCrisis(ev, choice, expired) {
    try {
      track('crisis-choice', {
        eventId: ev.id, title: ev.title, type: ev.type, severity: ev.severity,
        choice, expired
      });
    } catch { }
  },

  /* ---------------- REPORT ---------------- */

  reportHtml() {
    const s = lastState;
    if (!s) return `<div class="card"><div class="empty">No simulation data.</div></div>`;
    const score = s.score;
    const overall = score.speeches * 5
      + score.motionsPassed * 5
      + score.poisAnswered * 3
      + score.votesCast * 2
      + (score.crisisXP || 0);
    const votes = s.voteResults;

    return `
      <div class="card">
        <div class="card-header"><div>
          <div class="card-title">Simulation Report</div>
          <div class="card-sub">${escapeHtml(s.committee)} · ${escapeHtml(s.topic)} · You: ${escapeHtml(s.userCountry)}${s.crisisMode ? ' · Crisis mode' : ''}</div>
        </div>
        <span class="badge badge-gold">${overall} XP</span></div>

        <div class="grid-4 mt-2">
          ${statCard('Speeches', score.speeches, '')}
          ${statCard('Motions passed', score.motionsPassed, '')}
          ${statCard('POIs answered', score.poisAnswered, '')}
          ${statCard('Words spoken', score.wordsSpoken, '')}
        </div>
      </div>

      ${votes ? `
        <div class="card mt-2">
          <div class="card-title">Vote Result</div>
          <p class="mt-2"><b>${votes.passed ? 'ADOPTED' : 'NOT ADOPTED'}</b> — ${votes.yesCount} in favour, ${votes.noCount} against, ${votes.abstainCount} abstaining.</p>
        </div>` : ''}

      ${(s.crisisLog && s.crisisLog.length) ? `
        <div class="card mt-2">
          <div class="card-title">Crisis Log</div>
          <p class="muted">${s.crisisLog.length} event${s.crisisLog.length === 1 ? '' : 's'} handled.</p>
          <ul style="line-height:1.8;font-size:14px;">
            ${s.crisisLog.map(r => `<li><b>${escapeHtml(r.title)}</b> — ${escapeHtml(r.choice)}${r.expired ? ' (expired)' : ''}</li>`).join('')}
          </ul>
        </div>` : ''}

      <div class="card mt-2">
        <div class="card-title">Performance Analysis</div>
        <div class="mt-2" style="font-size:14.5px;line-height:1.7;">
          <p><b>What you did well</b></p>
          <ul>
            ${score.speeches >= 1 ? '<li>You engaged the floor with substantive speeches.</li>' : ''}
            ${score.poisAnswered >= 1 ? '<li>You handled Points of Information under pressure.</li>' : ''}
            ${score.motionsPassed >= 1 ? '<li>You successfully moved the committee forward procedurally.</li>' : ''}
            ${score.speeches + score.poisAnswered + score.motionsPassed === 0 ? '<li>You completed a full simulation — that is a start.</li>' : ''}
          </ul>
          <p><b>Areas to develop</b></p>
          <ul>
            ${score.speeches < 2 ? '<li>Speak more often — every GSL cycle is an opportunity.</li>' : ''}
            ${score.poisAnswered < 1 ? '<li>Practice POI handling — try the POI Trainer.</li>' : ''}
            ${score.motionsPassed < 1 ? '<li>Propose more motions — they shape the flow of debate.</li>' : ''}
          </ul>
        </div>
      </div>

      <div class="card mt-2">
        <div class="flex between items-center">
          <div>
            <div class="card-title">Next Steps</div>
            <p class="muted">Save this report to your progress, or run a new simulation.</p>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost" id="newSim">New Simulation</button>
            <button class="btn btn-primary" id="saveReport">Save to Progress</button>
          </div>
        </div>
      </div>`;
  },

  bindReport() {
    const newBtn = $('newSim');
    if (newBtn) newBtn.addEventListener('click', () => {
      engine = null;
      view = 'setup';
      this.rerender();
    });
    const saveBtn = $('saveReport');
    if (saveBtn) saveBtn.addEventListener('click', () => {
      const s = lastState;
      if (!s) return;
      const st = store.get();
      const overall = s.score.speeches * 5
        + s.score.motionsPassed * 5
        + s.score.poisAnswered * 3
        + s.score.votesCast * 2
        + (s.score.crisisXP || 0);
      const speeches = [...(st.speeches || [])];
      speeches.push({
        id: Date.now().toString(),
        title: `Simulation · ${s.committee}${s.crisisMode ? ' (Crisis)' : ''}`,
        text: `Score: ${overall} XP · ${s.score.speeches} speeches · ${s.score.motionsPassed} motions · ${s.score.poisAnswered} POIs`,
        scores: { content: 0, diplomacy: 0 },
        feedback: JSON.stringify(s.voteResults || {}),
        createdAt: Date.now()
      });
      store.set({ speeches, xp: (st.xp || 0) + overall });
      try {
        track('simulation', {
          committee: s.committee, country: s.userCountry, difficulty: s.difficulty,
          crisisMode: !!s.crisisMode, speeches: s.score.speeches,
          motionsPassed: s.score.motionsPassed, poisAnswered: s.score.poisAnswered,
          wordsSpoken: s.score.wordsSpoken, crisisXP: s.score.crisisXP || 0,
          crisisEvents: s.crisisLog?.length || 0,
          voteAdopted: s.voteResults?.passed || false,
          xpEarned: overall
        });
      } catch { }
      toast(`Saved · +${overall} XP`);
    });
  }
};

/* ------------------------------------------------------------------ */
/* Rendering helpers                                                  */
/* ------------------------------------------------------------------ */

function renderEntry(e) {
  if (e.kind === 'crisis') {
    return `
      <div class="crisis-card">
        <div class="label-small">Crisis Director</div>
        <div class="crisis-title">${escapeHtml(e.content)}</div>
        <div class="crisis-desc">${escapeHtml(e.description || '')}</div>
      </div>`;
  }

  const speaker = e.speaker || '?';
  const avatar = speaker === 'Chair' ? 'C' : speaker === 'You' ? 'U' : String(speaker).slice(0, 2);
  const roleLabel =
    e.kind === 'chair' ? 'Chair' :
      e.kind === 'system' ? 'System' :
        e.kind === 'rollcall' ? 'Roll call' :
          e.kind === 'vote' ? 'Vote' :
            speaker;
  const body = e.kind === 'system'
    ? `<em class="muted">${escapeHtml(e.content)}</em>`
    : markdownLite(e.content);
  const avatarBg =
    e.kind === 'chair' ? 'background:var(--ink);' :
      e.kind === 'user' ? 'background:var(--accent);color:#fff;' :
        'background:var(--blue-500);color:#fff;';

  return `
    <div class="chat-msg ${e.kind === 'user' ? 'user' : ''}" style="margin-bottom:14px;">
      <div class="chat-avatar" style="${avatarBg}">${escapeHtml(avatar)}</div>
      <div class="chat-body">
        <div class="chat-role">${escapeHtml(roleLabel)}${e.personality ? ` · ${escapeHtml(e.personality)}` : ''}</div>
        <div class="chat-content">${body}</div>
      </div>
    </div>`;
}

function statCard(label, value, sub) {
  return `<div class="stat"><div class="stat-label">${label}</div><div class="stat-value">${value}</div><div class="stat-sub">${sub}</div></div>`;
}