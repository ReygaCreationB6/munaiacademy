import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { sharedSim } from '../core/sharedSim.js';
import { escapeHtml, toast, openModal } from '../core/ui.js';

let state = null;
let code = null;
let mounted = false;
let timerInterval = null;
let unsubscribers = [];

const $ = (id) => document.getElementById(id);

if (typeof window !== 'undefined' && !window.__simRoomCleanupInstalled) {
    window.__simRoomCleanupInstalled = true;
    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#/sim/shared/')) return;
        mounted = false;
        stopTimerLoop();
        unsubscribers.forEach(fn => { try { fn(); } catch { } });
        unsubscribers = [];
    });
}

export const simRoom = {
    path: '/sim/shared/:code',
    ariaTitle: 'Shared Simulation',

    render(ctx) {
        code = (ctx?.params?.code || '').toUpperCase();
        return layout('Shared Simulation', this.body(), { full: true });
    },

    init() {
        mounted = true;
        stopTimerLoop();
        try { bindLayout(); } catch (err) { console.error('[simRoom] bindLayout:', err); }

        unsubscribers.forEach(fn => { try { fn(); } catch { } });
        unsubscribers = [];

        sharedSim.clearAll();
        state = null;

        const s = store.get();
        const conf = s.conference || {};
        const prof = s.profile || {};
        const info = {
            code,
            name: prof.name || 'Delegate',
            country: conf.country || 'Chad'
        };
        sharedSim.setCode(code);

        unsubscribers.push(sharedSim.on('state', m => this.onState(m.state)));
        unsubscribers.push(sharedSim.on('error', m => {
            toast(m.message);
            if (/not found|full/i.test(m.message)) {
                sharedSim.clearCode();
                location.hash = '/simulate';
            }
        }));
        unsubscribers.push(sharedSim.on('disconnected', () => this.setStatus('Reconnecting', 'warn')));

        // Composer
        const input = $('simInput');
        const sendBtn = $('simSend');
        if (sendBtn) sendBtn.onclick = () => this.sendChat();
        if (input) {
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
            };
        }

        const leaveBtn = $('simLeave');
        if (leaveBtn) leaveBtn.onclick = () => this.leave();

        sharedSim.connect()
            .then(() => sharedSim.send({ type: 'join-session', code, name: info.name, country: info.country }))
            .catch(() => this.setStatus('Offline', 'error'));

        startTimerLoop();
    },

    body() {
        return `
      <div class="rm-shell">
        <header class="rm-topbar">
          <button class="rm-leave" id="simLeave" title="Leave session">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H9"/>
              <path d="M6.5 8H14M11 5l3 3-3 3"/>
            </svg>
          </button>
          <div class="rm-topbar-main">
            <div class="rm-title" id="srTitle">Connecting…</div>
            <div class="rm-meta" id="srMeta"></div>
          </div>
          <div class="rm-topbar-right">
            <span class="badge badge-gold mono" id="srCode">${escapeHtml(code)}</span>
            <span class="rm-status" id="srStatus"></span>
          </div>
        </header>

        <div class="rm-body">
          <aside class="rm-side">
            <div class="rm-side-block">
              <div class="rm-side-head"><span class="rm-side-label">Delegates</span>
                <span class="rm-side-count" id="srDelegateCount">0</span></div>
              <div id="srDelegates" class="rm-side-list"></div>
            </div>

            <div class="rm-side-block">
              <div class="rm-side-head"><span class="rm-side-label">Motions</span>
                <button class="rm-mini-btn" id="srMotionAdd">+</button></div>
              <div id="srMotions" class="rm-side-list"></div>
            </div>

            <div class="rm-side-block" id="srVoteSection" hidden>
              <div class="rm-side-head"><span class="rm-side-label">Vote in progress</span></div>
              <div id="srVote"></div>
            </div>
          </aside>

          <main class="rm-main">
            <div class="rm-speaker" id="srSpeaker" hidden>
              <div class="rm-speaker-ring">
                <svg viewBox="0 0 40 40" aria-hidden="true">
                  <circle class="ring-bg" cx="20" cy="20" r="17"/>
                  <circle class="ring-fg" id="srRing" cx="20" cy="20" r="17"/>
                </svg>
                <span class="rm-speaker-time" id="srTimer">0:00</span>
              </div>
              <div class="rm-speaker-body">
                <span class="rm-speaker-label">Now speaking</span>
                <div class="rm-speaker-name" id="srSpeakerName">—</div>
              </div>
            </div>

            <div class="rm-transcript" id="srTranscript"></div>

            <div class="rm-composer">
              <div class="rm-composer-actions" id="srComposerActions"></div>
              <div class="rm-composer-row">
                <textarea id="simInput" placeholder="Speak to the committee…" rows="1"></textarea>
                <button class="rm-send" id="simSend" title="Send">
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M14 8L2 2l2.5 6L2 14z"/>
                  </svg>
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>`;
    },

    onState(s) {
        if (!mounted) return;
        state = s;

        const t = $('srTitle');
        if (t) t.textContent = `${s.committee}`;
        const m = $('srMeta');
        if (m) m.textContent = `${s.topic} · ${s.phase}${s.subPhase && s.subPhase !== 'idle' ? ' · ' + s.subPhase : ''}`;

        this.renderDelegates(s);
        this.renderMotions(s);
        this.renderVote(s);
        this.renderSpeaker(s);
        this.renderTranscript(s);
        this.renderActions(s);
        this.setStatus('');
    },

    setStatus(text, kind = '') {
        const el = $('srStatus');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'rm-status' + (kind ? ' ' + kind : '');
    },

    renderDelegates(s) {
        const el = $('srDelegates');
        const count = $('srDelegateCount');
        const humans = s.humans || [];
        const ais = s.aiDelegates || [];
        if (count) count.textContent = String(humans.length + ais.length);
        if (!el) return;

        const me = sharedSim.sessionId;
        el.innerHTML = `
      ${humans.map(h => {
            const active = s.currentSpeaker?.id === h.id;
            return `<div class="rm-delegate${h.id === me ? ' me' : ''}">
          <span class="rm-avatar" data-code="${countryCode(h.country)}">${countryCode(h.country)}</span>
          <div class="rm-delegate-info">
            <div class="rm-delegate-name">${escapeHtml(h.country || h.name)}
              ${h.id === me ? `<span class="rm-you">you</span>` : ''}
              ${h.isHost ? `<span class="rm-chair-badge">Host</span>` : ''}
            </div>
            <div class="rm-delegate-sub">${escapeHtml(h.name || '')}</div>
          </div>
        </div>`;
        }).join('')}
      ${ais.map(a => {
            const active = s.currentSpeaker?.id === a.id;
            return `<div class="rm-delegate rm-delegate-ai${active ? ' thinking' : ''}">
          <span class="rm-avatar" data-code="${countryCode(a.country)}">${countryCode(a.country)}</span>
          <div class="rm-delegate-info">
            <div class="rm-delegate-name">${escapeHtml(a.country)} <span class="rm-ai-badge">AI</span></div>
          </div>
        </div>`;
        }).join('')}`;
    },

    renderMotions(s) {
        const el = $('srMotions');
        if (!el) return;
        const recent = (s.motions || []).slice(-6).reverse();
        if (!recent.length) { el.innerHTML = `<div class="rm-empty">No motions yet.</div>`; return; }
        const isHost = s.hostId === sharedSim.sessionId;
        el.innerHTML = recent.map(m => `
      <div class="rm-motion rm-motion-${m.status}">
        <div class="rm-motion-head">
          <span class="rm-motion-author">${escapeHtml(m.by.country || m.by.name)}</span>
          <span class="rm-motion-kind">${escapeHtml(m.kind || 'generic')}</span>
          <span class="rm-motion-status">${m.status}</span>
        </div>
        <div class="rm-motion-text">${escapeHtml(m.text)}</div>
        ${isHost && m.status === 'pending' ? `
          <div class="rm-motion-actions">
            <button class="rm-decision pass" data-motion="${m.id}" data-decision="passed">Pass</button>
            <button class="rm-decision fail" data-motion="${m.id}" data-decision="failed">Fail</button>
            <button class="rm-decision table" data-motion="${m.id}" data-decision="tabled">Table</button>
          </div>` : ''}
      </div>`).join('');
        el.querySelectorAll('[data-motion]').forEach(b => {
            b.onclick = () => sharedSim.send({
                type: 'rule-motion', motionId: b.dataset.motion, decision: b.dataset.decision
            });
        });
    },

    renderVote(s) {
        const section = $('srVoteSection');
        const el = $('srVote');
        if (!section || !el) return;
        if (!s.vote) { section.hidden = true; el.innerHTML = ''; return; }
        section.hidden = false;
        const v = s.vote;
        const me = sharedSim.sessionId;
        const myVote = v.votes.yes.find(x => x.id === me) ? 'yes'
            : v.votes.no.find(x => x.id === me) ? 'no'
                : v.votes.abstain.find(x => x.id === me) ? 'abstain' : null;
        const isHost = s.hostId === me;
        if (v.phase === 'open') {
            el.innerHTML = `
        <div class="rm-vote-question">${escapeHtml(v.text)}</div>
        <div class="rm-vote-grid">
          <button class="rm-vote-btn yes${myVote === 'yes' ? ' active' : ''}" data-vote="yes"><span class="label">Yes</span><span class="count">${v.votes.yes.length}</span></button>
          <button class="rm-vote-btn no${myVote === 'no' ? ' active' : ''}" data-vote="no"><span class="label">No</span><span class="count">${v.votes.no.length}</span></button>
          <button class="rm-vote-btn abstain${myVote === 'abstain' ? ' active' : ''}" data-vote="abstain"><span class="label">Abs</span><span class="count">${v.votes.abstain.length}</span></button>
        </div>
        ${isHost ? `<button class="rm-close-vote" id="srCloseVote">Close vote</button>` : ''}`;
            el.querySelectorAll('[data-vote]').forEach(b => {
                b.onclick = () => sharedSim.send({ type: 'cast-vote', vote: b.dataset.vote });
            });
            const close = $('srCloseVote');
            if (close) close.onclick = () => sharedSim.send({ type: 'close-vote' });
        } else {
            const r = v.result || { yes: 0, no: 0, abstain: 0, passed: false };
            el.innerHTML = `
        <div class="rm-vote-question">${escapeHtml(v.text)}</div>
        <div class="rm-vote-result ${r.passed ? 'passed' : 'failed'}">${r.passed ? 'PASSED' : 'FAILED'}</div>
        <div class="rm-vote-tally">
          <span class="yes">${r.yes} yes</span>
          <span class="no">${r.no} no</span>
          <span class="abs">${r.abstain} abstain</span>
        </div>`;
        }
    },

    renderSpeaker(s) {
        const el = $('srSpeaker');
        if (!el) return;
        if (!s.currentSpeaker) { el.hidden = true; return; }
        el.hidden = false;
        const name = $('srSpeakerName');
        if (name) name.textContent = s.currentSpeaker.country;
    },

    renderTranscript(s) {
        const el = $('srTranscript');
        if (!el) return;
        const near = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        el.innerHTML = (s.transcript || []).map(e => renderEntry(e)).join('');
        if (near) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
    },

    renderActions(s) {
        const el = $('srComposerActions');
        if (!el) return;
        const me = sharedSim.sessionId;
        const isHost = s.hostId === me;
        const btns = [];

        if (s.phase === 'lobby' && isHost) {
            btns.push({ key: 'start', label: 'Start session', primary: true });
        }
        if (s.phase === 'session') {
            const isMyFloor = s.currentSpeaker?.id === me;
            if (isMyFloor) {
                btns.push({ key: 'deliver', label: 'Deliver speech', primary: true });
                btns.push({ key: 'end-speech', label: 'End speech' });
            } else if (!s.currentSpeaker) {
                btns.push({ key: 'raise', label: 'Raise hand' });
            }
            btns.push({ key: 'motion', label: 'Propose motion' });
            if (isHost && (!s.vote || s.vote.phase === 'closed')) {
                btns.push({ key: 'vote', label: 'Start vote' });
            }
        }

        el.innerHTML = btns.map(b => `
      <button class="rm-action${b.primary ? ' primary' : ''}" data-action="${b.key}">${b.label}</button>
    `).join('');

        el.querySelectorAll('[data-action]').forEach(b => {
            b.onclick = () => this.runAction(b.dataset.action);
        });
    },

    runAction(key) {
        switch (key) {
            case 'start': sharedSim.send({ type: 'start-session' }); return;
            case 'raise': sharedSim.send({ type: 'speak-request' }); return;
            case 'deliver': return this.deliverSpeech();
            case 'end-speech': sharedSim.send({ type: 'end-speech' }); return;
            case 'motion': return this.openMotion();
            case 'vote': return this.openVote();
        }
    },

    deliverSpeech() {
        const input = $('simInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return toast('Write your speech first.');
        sharedSim.send({ type: 'deliver-speech', text });
        input.value = '';
    },

    sendChat() {
        const input = $('simInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        // If it's the speaker's turn, treat Enter as delivering a speech.
        if (state?.currentSpeaker?.id === sharedSim.sessionId) {
            sharedSim.send({ type: 'deliver-speech', text });
        } else {
            sharedSim.send({ type: 'chat', text });
        }
        input.value = '';
    },

    openMotion() {
        openModal({
            title: 'Propose a motion',
            body: `
        <div class="field">
          <label>Motion type</label>
          <select id="srMtKind">
            <option value="open-mod">Open a moderated caucus</option>
            <option value="open-unmod">Open an unmoderated caucus</option>
            <option value="introduce-res">Introduce a draft resolution</option>
            <option value="close-debate">Close debate</option>
            <option value="generic">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Motion text</label>
          <textarea id="srMtText" rows="3" placeholder="Motion to open a moderated caucus on…"></textarea>
        </div>`,
            footer: `<button class="btn btn-ghost" id="srMtCancel">Cancel</button>
               <button class="btn btn-primary" id="srMtSend">Propose</button>`
        });
        $('srMtCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('srMtSend').onclick = () => {
            const text = $('srMtText').value.trim();
            const kind = $('srMtKind').value;
            if (!text) return toast('Write the motion.');
            sharedSim.send({ type: 'propose-motion', text, kind });
            document.querySelector('.modal-backdrop')?.remove();
        };
    },

    openVote() {
        openModal({
            title: 'Start a vote',
            body: `<div class="field"><label>Vote question</label><input id="srVtText" placeholder="e.g. Adopt draft resolution 1.1" /></div>`,
            footer: `<button class="btn btn-ghost" id="srVtCancel">Cancel</button>
               <button class="btn btn-primary" id="srVtSend">Start</button>`
        });
        $('srVtCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('srVtSend').onclick = () => {
            const text = $('srVtText').value.trim();
            if (!text) return toast('Write the vote question.');
            sharedSim.send({ type: 'start-vote', text });
            document.querySelector('.modal-backdrop')?.remove();
        };
    },

    leave() {
        if (!confirm('Leave the shared simulation?')) return;
        sharedSim.send({ type: 'leave-session' });
        sharedSim.clearCode();
        document.body.classList.remove('room-active');
        location.hash = '/simulate';
    }
};

/* ---------------- helpers ---------------- */

function countryCode(country) {
    if (!country) return '??';
    const cleaned = String(country).replace(/^(the|The)\s+/, '').trim();
    const words = cleaned.split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

function renderEntry(e) {
    if (e.kind === 'system') {
        return `<div class="rm-entry system"><span>${escapeHtml(e.content)}</span></div>`;
    }
    if (e.kind === 'chair') {
        return `
      <div class="rm-entry chair">
        <span class="rm-entry-chair-tag">Chair</span>
        <div class="rm-entry-body"><div class="rm-entry-text">${escapeHtml(e.content)}</div></div>
      </div>`;
    }
    if (e.kind === 'motion') {
        return `
      <div class="rm-entry motion">
        <div class="rm-entry-motion-tag">Motion</div>
        <div class="rm-entry-body">
          <div class="rm-entry-author">${escapeHtml(e.from || '')}</div>
          <div class="rm-entry-text">${escapeHtml(e.content)}</div>
        </div>
      </div>`;
    }
    if (e.kind === 'delegate' || e.kind === 'chat' || e.kind === 'user') {
        const isMe = e.kind === 'user';
        const aiBadge = e.isAI ? `<span class="rm-ai-badge">AI</span>` : '';
        return `
      <div class="rm-entry chat${isMe ? ' me' : ''}">
        <span class="rm-avatar small" data-code="${countryCode(e.country || e.speaker)}">${countryCode(e.country || e.speaker)}</span>
        <div class="rm-entry-body">
          <div class="rm-entry-head">
            <span class="rm-entry-author">${escapeHtml(e.speaker || e.from || '')}</span>
            ${aiBadge}
            <span class="rm-entry-time">${fmtTime(e.ts)}</span>
          </div>
          <div class="rm-entry-text">${escapeHtml(e.content || '')}</div>
        </div>
      </div>`;
    }
    return `<div class="rm-entry"><div class="rm-entry-body">${escapeHtml(e.content || '')}</div></div>`;
}

function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function startTimerLoop() {
    stopTimerLoop();
    timerInterval = setInterval(() => {
        if (!mounted || !state) return;
        const el = $('srTimer');
        const ring = $('srRing');
        if (!el || !state.currentSpeaker) return;
        const start = state.currentSpeakerStartedAt;
        const dur = state.currentSpeakerDuration || 45;
        const elapsed = (Date.now() - start) / 1000;
        const remaining = Math.max(0, dur - elapsed);
        const pct = Math.max(0, Math.min(1, 1 - elapsed / dur));
        el.textContent = fmtMMSS(Math.ceil(remaining));
        el.classList.toggle('overtime', elapsed > dur);
        if (ring) {
            const C = 2 * Math.PI * 17;
            ring.style.strokeDasharray = String(C);
            ring.style.strokeDashoffset = String(C * (1 - pct));
            ring.style.stroke = elapsed > dur ? 'var(--red)' : 'var(--accent)';
        }
    }, 250);
}

function stopTimerLoop() {
    if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
}

function fmtMMSS(sec) {
    const m = Math.floor(sec / 60);
    const s = String(Math.floor(sec % 60)).padStart(2, '0');
    return `${m}:${s}`;
}