import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ws } from '../core/ws.js';
import { escapeHtml, toast, openModal } from '../core/ui.js';

let state = null;
let code = null;
let timerInterval = null;
let isLeaving = false;
let unsubscribers = [];
let mounted = false;
let lastTypingSentAt = 0;

const $ = (id) => document.getElementById(id);

if (typeof window !== 'undefined' && !window.__roomCleanupInstalled) {
    window.__roomCleanupInstalled = true;
    window.addEventListener('hashchange', () => {
        if (location.hash.startsWith('#/room/')) return;
        mounted = false;
        document.body.classList.remove('room-active');
        stopTimerLoop();
        unsubscribers.forEach(fn => { try { fn(); } catch { } });
        unsubscribers = [];
    });
}

const INTENT_LABEL = {
    support: { label: 'supports', color: 'var(--green)' },
    challenge: { label: 'challenges', color: 'var(--red)' },
    question: { label: 'asks', color: 'var(--accent)' },
    propose: { label: 'proposes', color: 'var(--gold)' },
    defend: { label: 'defends', color: '#7a5c9c' },
    clarify: { label: 'clarifies', color: 'var(--ink-3)' },
    neutral: { label: 'speaks', color: 'var(--ink-4)' }
};

export const room = {
    path: '/room/:code',
    ariaTitle: 'Room',

    render(ctx) {
        code = (ctx?.params?.code || '').toUpperCase();
        return layout('Room', this.body(), { full: true });
    },

    init() {
        mounted = true;
        document.body.classList.add('room-active');
        lastTypingSentAt = 0;
        stopTimerLoop();
        try { bindLayout(); } catch (err) { console.error('[room] bindLayout:', err); }

        unsubscribers.forEach(fn => { try { fn(); } catch { } });
        unsubscribers = [];

        ws.clearAll();
        state = null;
        isLeaving = false;

        const s = store.get();
        const conf = s.conference || {};
        const prof = s.profile || {};
        const info = { code, name: prof.name || 'Delegate', country: conf.country || 'Chad' };
        ws.setRoom(info);

        unsubscribers.push(ws.on('state', m => this.onState(m.state)));
        unsubscribers.push(ws.on('error', m => {
            toast(m.message);
            if (/not found|full/i.test(m.message)) {
                ws.clearRoom();
                document.body.classList.remove('room-active');
                location.hash = '/rooms';
            }
        }));
        unsubscribers.push(ws.on('connected', () => this.onReconnect()));
        unsubscribers.push(ws.on('disconnected', () => this.setStatus('Reconnecting', 'warn')));

        const leaveBtn = $('roomLeave');
        if (leaveBtn) leaveBtn.onclick = () => this.leave();

        const input = $('rmChatInput');
        const sendBtn = $('rmChatSend');
        const scrollBtn = $('rmScrollBtn');
        if (sendBtn) sendBtn.onclick = () => this.sendChat();
        if (input) {
            input.oninput = () => {
                input.style.height = 'auto';
                input.style.height = Math.min(input.scrollHeight, 160) + 'px';

                const now = Date.now();
                if (input.value.trim() && now - lastTypingSentAt > 2000) {
                    lastTypingSentAt = now;
                    ws.send({ type: 'typing' });
                }
            };
            input.onkeydown = (e) => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); this.sendChat(); }
            };
        }
        if (scrollBtn) {
            scrollBtn.onclick = () => {
                const t = $('rmTranscript');
                if (t) t.scrollTo({ top: t.scrollHeight, behavior: 'smooth' });
            };
        }

        ws.connect()
            .then(() => ws.send({ type: 'join-room', ...info }))
            .catch(() => this.setStatus('Offline', 'error'));

        startTimerLoop();
    },

    body() {
        return `
      <div class="rm-shell">
        <header class="rm-topbar">
          <button class="rm-leave" id="roomLeave" title="Leave room" aria-label="Leave room">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 3H3.5A1.5 1.5 0 0 0 2 4.5v7A1.5 1.5 0 0 0 3.5 13H9"/>
              <path d="M6.5 8H14M11 5l3 3-3 3"/>
            </svg>
          </button>
          <div class="rm-topbar-main">
            <div class="rm-title" id="rmTitle">Connecting…</div>
            <div class="rm-meta" id="rmMeta"></div>
          </div>
          <div class="rm-topbar-right">
            <button class="rm-code-chip" id="rmCodeChip" title="Copy room code">
              <span class="rm-code-label">Code</span>
              <span class="rm-code-value" id="rmCode">${escapeHtml(code || '')}</span>
            </button>
            <span class="rm-status" id="rmStatus"></span>
          </div>
        </header>

        <div class="rm-body">
          <aside class="rm-side">
            <div class="rm-side-block" id="rmChairBlock" hidden>
              <div class="rm-side-head"><span class="rm-side-label">Chair</span></div>
              <div id="rmChairList"></div>
            </div>

            <div class="rm-side-block">
              <div class="rm-side-head">
                <span class="rm-side-label">Delegates</span>
                <span class="rm-side-count" id="rmDelegateCount">0</span>
              </div>
              <div id="rmDelegates" class="rm-side-list"></div>
            </div>

            <div class="rm-side-block" id="rmAiBlock" hidden>
              <div class="rm-side-head">
                <span class="rm-side-label">AI Delegate Fill</span>
                <button class="rm-mini-btn" id="rmAiToggle" title="Toggle AI fill">…</button>
              </div>
              <div id="rmAiList" class="rm-side-list"></div>
              <div class="rm-ai-size">
                <label for="rmAiSize" class="small muted">Target size</label>
                <input id="rmAiSize" type="number" min="3" max="20" step="1" value="6" />
              </div>
            </div>

            <div class="rm-side-block">
              <div class="rm-side-head"><span class="rm-side-label">Speaking queue</span></div>
              <div id="rmQueue" class="rm-side-list"></div>
              <button class="rm-hand-btn" id="rmQueueBtn">Raise hand</button>
              <button class="rm-hand-btn primary" id="rmNextBtn" hidden>Advance to next speaker</button>
            </div>

            <div class="rm-side-block">
              <div class="rm-side-head">
                <span class="rm-side-label">Motions</span>
                <button class="rm-mini-btn" id="rmMotionAdd">+</button>
              </div>
              <div id="rmMotions" class="rm-side-list"></div>
            </div>

            <div class="rm-side-block" id="rmVoteSection" hidden>
              <div class="rm-side-head"><span class="rm-side-label">Vote in progress</span></div>
              <div id="rmVote"></div>
            </div>
          </aside>

          <main class="rm-main">
            <div class="rm-speaker" id="rmSpeaker" hidden>
              <div class="rm-speaker-ring">
                <svg viewBox="0 0 40 40" aria-hidden="true">
                  <circle class="ring-bg" cx="20" cy="20" r="17" />
                  <circle class="ring-fg" id="rmSpeakerRingFg" cx="20" cy="20" r="17" />
                </svg>
                <span class="rm-speaker-time" id="rmSpeakerTimer">0:00</span>
              </div>
              <div class="rm-speaker-body">
                <span class="rm-speaker-label">Now speaking</span>
                <div class="rm-speaker-name" id="rmSpeakerName">—</div>
              </div>
              <div class="rm-speaker-actions" id="rmSpeakerActions"></div>
            </div>

            <div class="rm-transcript" id="rmTranscript"></div>

            <button class="rm-scroll-btn" id="rmScrollBtn" hidden title="Scroll to newest">
              <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3v10M4 9l4 4 4-4"/>
              </svg>
            </button>

            <div class="rm-composer">
              <div class="rm-composer-actions" id="rmComposerActions"></div>
              <div class="rm-typing-indicator" id="rmTyping" hidden></div>
              <div class="rm-composer-row">
                <textarea id="rmChatInput" placeholder="Speak to the committee…" rows="1"></textarea>
                <button class="rm-send" id="rmChatSend" title="Send" aria-label="Send">
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
        const prev = state;
        state = s;

        const titleEl = $('rmTitle');
        if (titleEl) titleEl.textContent = s.name;
        const metaEl = $('rmMeta');
        if (metaEl) {
            const role = s.roleMode === 'delegate' ? 'Delegate (AI chair)' : 'Chair';
            metaEl.textContent = `${s.committee} · ${s.topic} · ${role}`;
        }

        this.renderChair(s);
        this.renderDelegates(s);
        this.renderAiDelegates(s);
        this.renderQueue(s);
        this.renderMotions(s);
        this.renderVote(s);
        this.renderSpeaker(s);
        this.renderTranscript(s, prev);
        this.renderComposerActions(s);
        this.renderTypingIndicator(s);

        if (prev) {
            const known = new Set(prev.delegates.map(d => d.id));
            for (const d of s.delegates.filter(x => !known.has(x.id))) {
                if (d.id !== ws.sessionId) toast(`${d.country || d.name} joined`);
            }
        }

        this.setStatus(s.phase === 'ended' ? 'Ended' : '', s.phase === 'ended' ? 'warn' : '');

        const chip = $('rmCodeChip');
        if (chip && !chip._bound) {
            chip._bound = true;
            chip.onclick = () => {
                try { navigator.clipboard.writeText(s.code); toast('Room code copied'); }
                catch { toast('Could not copy'); }
            };
        }

        const motionAdd = $('rmMotionAdd');
        if (motionAdd && !motionAdd._bound) {
            motionAdd._bound = true;
            motionAdd.onclick = () => {
                if (state?.phase !== 'session') return toast('Session has not started.');
                this.openMotion();
            };
        }
    },

    onReconnect() {
        this.setStatus('Reconnecting', 'warn');
        ws.send({ type: 'list-rooms' });
        if (ws.currentRoom) ws.send({ type: 'join-room', ...ws.currentRoom });
    },

    setStatus(text, kind = '') {
        const el = $('rmStatus');
        if (!el) return;
        el.textContent = text || '';
        el.className = 'rm-status' + (kind ? ' ' + kind : '');
    },

    renderChair(s) {
        const block = $('rmChairBlock');
        const el = $('rmChairList');
        if (!block || !el) return;
        if (!s.aiChair) { block.hidden = true; return; }
        block.hidden = false;
        el.innerHTML = `
      <div class="rm-delegate rm-delegate-chair">
        <span class="rm-avatar rm-avatar-chair" data-code="${countryCode(s.aiChair.country)}">${countryCode(s.aiChair.country)}</span>
        <div class="rm-delegate-info">
          <div class="rm-delegate-name">
            ${escapeHtml(s.aiChair.country)}
            <span class="rm-ai-badge">AI</span>
            <span class="rm-chair-badge">Chair</span>
          </div>
        </div>
      </div>`;
    },

    renderDelegates(s) {
        const el = $('rmDelegates');
        const count = $('rmDelegateCount');
        const humans = s.delegates || [];
        const ais = s.aiDelegates || [];
        if (count) count.textContent = String(humans.length + ais.length);
        if (!el) return;

        if (!humans.length) {
            el.innerHTML = `<div class="rm-empty">No human delegates yet.</div>`;
            return;
        }
        const me = ws.sessionId;
        const sorted = humans.slice().sort((a, b) =>
            a.isHost === b.isHost ? (a.joinedAt || 0) - (b.joinedAt || 0) : (a.isHost ? -1 : 1)
        );
        el.innerHTML = sorted.map(d => `
      <div class="rm-delegate${d.id === me ? ' me' : ''}">
        <span class="rm-avatar" data-code="${countryCode(d.country)}">${countryCode(d.country)}</span>
        <div class="rm-delegate-info">
          <div class="rm-delegate-name">
            ${escapeHtml(d.country || d.name)}
            ${d.id === me ? `<span class="rm-you">you</span>` : ''}
          </div>
          <div class="rm-delegate-sub">
            ${escapeHtml(d.name || '')}
            ${d.isHost ? `<span class="rm-chair-badge">Host</span>` : ''}
          </div>
        </div>
        <span class="rm-presence" data-present="${d.present}"></span>
      </div>`).join('');
    },

    renderAiDelegates(s) {
        const block = $('rmAiBlock');
        const el = $('rmAiList');
        const toggle = $('rmAiToggle');
        const sizeInput = $('rmAiSize');
        if (!block || !el) return;

        const isHost = s.hostId === ws.sessionId;
        const enabled = !!(s.aiSettings && s.aiSettings.enabled);
        const target = (s.aiSettings && s.aiSettings.targetSize) || 6;
        const ais = s.aiDelegates || [];

        block.hidden = !(isHost || ais.length);

        if (toggle) {
            toggle.textContent = enabled ? 'On' : 'Off';
            toggle.classList.toggle('rm-toggle-on', enabled);
            toggle.disabled = !isHost;
            if (isHost && !toggle._bound) {
                toggle._bound = true;
                toggle.onclick = () => ws.send({ type: 'ai-fill-toggle' });
            }
        }

        if (sizeInput && isHost && !sizeInput._bound) {
            sizeInput._bound = true;
            sizeInput.value = String(target);
            sizeInput.onchange = () => {
                const v = Math.max(3, Math.min(20, Number(sizeInput.value) || 6));
                ws.send({ type: 'ai-target-size', size: v });
            };
        }

        if (!ais.length) {
            el.innerHTML = `<div class="rm-empty">${enabled ? 'Waiting for seats to fill…' : 'Disabled.'}</div>`;
            return;
        }

        const thinkingCountry = s.thinking && s.thinking.until > Date.now() ? s.thinking.country : null;

        el.innerHTML = ais.map(d => {
            const isThinking = thinkingCountry === d.country;
            const personality = shortPersonality(d.personality?.name);
            return `
        <div class="rm-delegate rm-delegate-ai${isThinking ? ' thinking' : ''}">
          <span class="rm-avatar" data-code="${countryCode(d.country)}">${countryCode(d.country)}</span>
          <div class="rm-delegate-info">
            <div class="rm-delegate-name">
              ${escapeHtml(d.country)}
              <span class="rm-ai-badge">AI</span>
            </div>
            <div class="rm-delegate-sub">
              <span class="rm-personality-badge">${escapeHtml(personality)}</span>
            </div>
          </div>
        </div>`;
        }).join('');
    },

    renderQueue(s) {
        const el = $('rmQueue');
        if (!el) return;
        const me = ws.sessionId;
        if (!s.queue.length) {
            el.innerHTML = `<div class="rm-empty">Queue is empty.</div>`;
        } else {
            el.innerHTML = s.queue.map((q, i) => `
        <div class="rm-queue-item${q.id === me ? ' me' : ''}">
          <span class="rm-queue-index">${i + 1}</span>
          <span class="rm-queue-country">${escapeHtml(q.country || q.name)}</span>
          ${q.id === me ? `<span class="rm-you">you</span>` : ''}
        </div>`).join('');
        }

        const btn = $('rmQueueBtn');
        if (btn) {
            const inQueue = s.queue.some(q => q.id === me);
            const isCurrent = s.currentSpeaker?.id === me;
            const can = s.phase === 'session' && !isCurrent;
            btn.textContent = isCurrent ? 'You have the floor' : inQueue ? 'Lower hand' : 'Raise hand';
            btn.disabled = !can;
            btn.classList.toggle('active', inQueue);
            btn.onclick = () => {
                if (inQueue) ws.send({ type: 'cancel-speak' });
                else ws.send({ type: 'speak-request' });
            };
        }

        const nextBtn = $('rmNextBtn');
        if (nextBtn) {
            const isHumanChair = s.hostId === me && s.roleMode === 'chair';
            nextBtn.hidden = !(isHumanChair && s.phase === 'session' && s.queue.length);
            nextBtn.onclick = () => ws.send({ type: 'next-speaker' });
        }
    },

    renderMotions(s) {
        const el = $('rmMotions');
        if (!el) return;
        const recent = s.motions.slice(-6).reverse();
        if (!recent.length) {
            el.innerHTML = `<div class="rm-empty">No motions yet.</div>`;
            return;
        }
        const humanIsChair = s.hostId === ws.sessionId && s.roleMode === 'chair';
        el.innerHTML = recent.map(m => `
      <div class="rm-motion rm-motion-${m.status}">
        <div class="rm-motion-head">
          <span class="rm-motion-author">
            ${escapeHtml(m.by.country || m.by.name)}
            ${m.by.isAI ? `<span class="rm-ai-badge">AI</span>` : ''}
          </span>
          <span class="rm-motion-kind">${escapeHtml(m.kind || 'generic')}</span>
          <span class="rm-motion-status">${m.status}</span>
        </div>
        <div class="rm-motion-text">${escapeHtml(m.text)}</div>
        ${humanIsChair && m.status === 'pending' ? `
          <div class="rm-motion-actions">
            <button class="rm-decision pass" data-motion="${m.id}" data-decision="passed">Pass</button>
            <button class="rm-decision fail" data-motion="${m.id}" data-decision="failed">Fail</button>
            <button class="rm-decision table" data-motion="${m.id}" data-decision="tabled">Table</button>
          </div>` : ''}
      </div>`).join('');
        el.querySelectorAll('[data-motion]').forEach(b => {
            b.onclick = () => ws.send({
                type: 'rule-motion',
                motionId: b.dataset.motion,
                decision: b.dataset.decision
            });
        });
    },

    renderVote(s) {
        const section = $('rmVoteSection');
        const el = $('rmVote');
        if (!section || !el) return;
        if (!s.vote) { section.hidden = true; el.innerHTML = ''; return; }
        section.hidden = false;

        const v = s.vote;
        const me = ws.sessionId;
        const myVote = v.votes.yes.find(x => x.id === me) ? 'yes'
            : v.votes.no.find(x => x.id === me) ? 'no'
                : v.votes.abstain.find(x => x.id === me) ? 'abstain' : null;
        const humanIsChair = s.hostId === me && s.roleMode === 'chair';

        if (v.phase === 'open') {
            el.innerHTML = `
        <div class="rm-vote-question">${escapeHtml(v.text)}</div>
        <div class="rm-vote-grid">
          <button class="rm-vote-btn yes${myVote === 'yes' ? ' active' : ''}" data-vote="yes">
            <span class="label">Yes</span><span class="count">${v.votes.yes.length}</span>
          </button>
          <button class="rm-vote-btn no${myVote === 'no' ? ' active' : ''}" data-vote="no">
            <span class="label">No</span><span class="count">${v.votes.no.length}</span>
          </button>
          <button class="rm-vote-btn abstain${myVote === 'abstain' ? ' active' : ''}" data-vote="abstain">
            <span class="label">Abs</span><span class="count">${v.votes.abstain.length}</span>
          </button>
        </div>
        ${humanIsChair ? `<button class="rm-close-vote" id="rmCloseVote">Close vote</button>` : ''}`;
            el.querySelectorAll('[data-vote]').forEach(b => {
                b.onclick = () => ws.send({ type: 'cast-vote', vote: b.dataset.vote });
            });
            const closeVote = $('rmCloseVote');
            if (closeVote) closeVote.onclick = () => ws.send({ type: 'close-vote' });
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
        const el = $('rmSpeaker');
        if (!el) return;
        if (!s.currentSpeaker) { el.hidden = true; return; }
        el.hidden = false;
        const nameEl = $('rmSpeakerName');
        if (nameEl) nameEl.textContent = `${s.currentSpeaker.country || s.currentSpeaker.name}`;
        const me = ws.sessionId;
        const isHumanChair = s.hostId === me && s.roleMode === 'chair';
        const isSpeaker = s.currentSpeaker.id === me;
        const actions = $('rmSpeakerActions');
        if (!actions) return;
        actions.innerHTML = (isHumanChair || isSpeaker)
            ? `<button class="rm-speaker-end" id="rmEndSpeaker">End speech</button>`
            : '';
        const endBtn = $('rmEndSpeaker');
        if (endBtn) endBtn.onclick = () => ws.send({ type: 'end-speaker' });
    },

    renderTranscript(s, prev) {
        const el = $('rmTranscript');
        if (!el) return;
        const shouldScroll = !prev || nearBottom(el);
        const totalHumans = (s.delegates || []).length;
        const totalAI = (s.aiDelegates || []).length + (s.aiChair ? 1 : 0);
        const showLobby = s.phase === 'lobby' && totalHumans === 1 && totalAI === 0;

        if (showLobby) {
            el.innerHTML = lobbyHero(s);
            const invite = $('rmInvite');
            if (invite) invite.onclick = () => {
                try {
                    const url = `${location.origin}${location.pathname}#/room/${s.code}`;
                    navigator.clipboard.writeText(url);
                    toast('Invite link copied');
                } catch { toast('Could not copy'); }
            };
        } else {
            const parts = (s.transcript || []).map(e => renderEntry(e, s));
            const thinking = s.thinking;
            if (thinking && thinking.until > Date.now()) {
                parts.push(renderThinkingEntry(thinking, s));
            }
            if (!parts.length) {
                el.innerHTML = `<div class="rm-transcript-empty">The session has not started yet.</div>`;
            } else {
                el.innerHTML = parts.join('');
            }
        }

        if (shouldScroll) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
        el.onscroll = () => {
            const b = $('rmScrollBtn');
            if (!b) return;
            b.hidden = el.scrollHeight - el.scrollTop - el.clientHeight < 240;
        };

        el.querySelectorAll('[data-target-ref]').forEach(chip => {
            chip.onclick = () => {
                const target = el.querySelector(`[data-entry-id="${chip.dataset.targetRef}"]`);
                if (!target) return;
                target.scrollIntoView({ behavior: 'smooth', block: 'center' });
                target.classList.add('rm-flash');
                setTimeout(() => target.classList.remove('rm-flash'), 1200);
            };
        });
    },

    renderTypingIndicator(s) {
        const el = $('rmTyping');
        if (!el) return;

        const me = ws.sessionId;
        const now = Date.now();
        const typers = Object.entries(s.typingUsers || {})
            .filter(([id, t]) => id !== me && t && t.until > now)
            .map(([, t]) => t.country || t.name || 'Someone');

        if (!typers.length) {
            el.hidden = true;
            el.textContent = '';
            return;
        }

        let text;
        if (typers.length === 1) {
            text = `${typers[0]} is typing`;
        } else if (typers.length === 2) {
            text = `${typers[0]} and ${typers[1]} are typing`;
        } else {
            text = `${typers[0]}, ${typers[1]}, and ${typers.length - 2} more are typing`;
        }

        el.hidden = false;
        el.innerHTML = `${escapeHtml(text)}<span class="rm-typing-dots"><span>.</span><span>.</span><span>.</span></span>`;
    },

    renderComposerActions(s) {
        const el = $('rmComposerActions');
        if (!el) return;
        const isHost = s.hostId === ws.sessionId;
        const humanIsChair = isHost && s.roleMode === 'chair';
        const btns = [];

        if (s.phase === 'lobby' && isHost) {
            btns.push({ key: 'start', label: 'Start session', primary: true });
        }
        if (s.phase === 'session') {
            btns.push({ key: 'motion', label: 'Propose motion' });
            if (humanIsChair) {
                if (!s.vote || s.vote.phase === 'closed') btns.push({ key: 'vote', label: 'Start vote' });
                btns.push({ key: 'end', label: 'End session', danger: true });
            }
            if (isHost) {
                btns.push({
                    key: 'swap-role',
                    label: s.roleMode === 'chair' ? 'Hand over chair' : 'Take chair back'
                });
            }
        }

        el.innerHTML = btns.map(b => `
      <button class="rm-action${b.primary ? ' primary' : ''}${b.danger ? ' danger' : ''}" data-action="${b.key}">${b.label}</button>
    `).join('');

        el.querySelectorAll('[data-action]').forEach(b => {
            b.onclick = () => this.runAction(b.dataset.action);
        });
    },

    runAction(key) {
        switch (key) {
            case 'start': ws.send({ type: 'start-session' }); return;
            case 'motion': return this.openMotion();
            case 'vote': return this.openStartVote();
            case 'end':
                if (confirm('End the session for everyone?')) ws.send({ type: 'end-session' });
                return;
            case 'swap-role': {
                const next = state?.roleMode === 'chair' ? 'delegate' : 'chair';
                ws.send({ type: 'set-role', roleMode: next });
                return;
            }
        }
    },

    openMotion() {
        openModal({
            title: 'Propose a motion',
            body: `
        <div class="field">
          <label>Motion type</label>
          <select id="mtKind">
            <option value="open-mod">Open a moderated caucus</option>
            <option value="open-unmod">Open an unmoderated caucus</option>
            <option value="introduce-res">Introduce a draft resolution</option>
            <option value="close-debate">Close debate</option>
            <option value="generic">Other</option>
          </select>
        </div>
        <div class="field">
          <label>Motion text</label>
          <textarea id="mtText" rows="3" placeholder="e.g. Motion to open a moderated caucus on climate finance, 30 seconds, 10 minutes."></textarea>
        </div>`,
            footer: `<button class="btn btn-ghost" id="mtCancel">Cancel</button>
               <button class="btn btn-primary" id="mtSend">Propose</button>`
        });
        const cancel = $('mtCancel');
        if (cancel) cancel.onclick = () => document.querySelector('.modal-backdrop')?.remove();
        const send = $('mtSend');
        if (send) send.onclick = () => {
            const text = $('mtText')?.value.trim() || '';
            const kind = $('mtKind')?.value || 'generic';
            if (!text) return toast('Write the motion.');
            ws.send({ type: 'propose-motion', text, kind });
            document.querySelector('.modal-backdrop')?.remove();
        };
    },

    openStartVote() {
        openModal({
            title: 'Start a vote',
            body: `<div class="field"><label>Vote question</label><input id="vtText" placeholder="e.g. Adopt draft resolution 1.1 as amended" /></div>`,
            footer: `<button class="btn btn-ghost" id="vtCancel">Cancel</button>
               <button class="btn btn-primary" id="vtSend">Start</button>`
        });
        const cancel = $('vtCancel');
        if (cancel) cancel.onclick = () => document.querySelector('.modal-backdrop')?.remove();
        const send = $('vtSend');
        if (send) send.onclick = () => {
            const text = $('vtText')?.value.trim() || '';
            if (!text) return toast('Write the vote question.');
            ws.send({ type: 'start-vote', text });
            document.querySelector('.modal-backdrop')?.remove();
        };
    },

    sendChat() {
        const input = $('rmChatInput');
        if (!input) return;
        const text = input.value.trim();
        if (!text) return;
        ws.send({ type: 'chat', text });
        input.value = '';
        input.style.height = 'auto';
        lastTypingSentAt = 0;
    },

    leave() {
        if (isLeaving) return;
        isLeaving = true;
        if (!confirm('Leave the room?')) { isLeaving = false; return; }
        ws.send({ type: 'leave-room' });
        ws.clearRoom();
        document.body.classList.remove('room-active');
        location.hash = '/rooms';
    }
};

/* ================== helpers ================== */

function countryCode(country) {
    if (!country) return '??';
    const cleaned = String(country).replace(/^(the|The)\s+/, '').trim();
    const words = cleaned.split(/\s+/);
    if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
    return words.slice(0, 3).map(w => w[0]).join('').toUpperCase();
}

function shortPersonality(name) {
    if (!name) return 'Delegate';
    return String(name).replace(/^The\s+/, '').replace(/\s+Delegate$/, '');
}

function lobbyHero(s) {
    return `
    <div class="rm-lobby">
      <div class="rm-lobby-tag">Waiting room</div>
      <h2>${escapeHtml(s.name)}</h2>
      <p class="rm-lobby-sub">
        ${s.roleMode === 'delegate'
            ? 'You are participating as a delegate. An AI chair will preside when the session starts.'
            : 'You are chairing the committee. Delegates join from the Multiplayer Rooms page.'}
      </p>
      <div class="rm-lobby-code">
        <div class="rm-lobby-label">Room code</div>
        <div class="rm-lobby-code-value">${escapeHtml(s.code)}</div>
      </div>
      <div class="rm-lobby-buttons">
        <button class="rm-lobby-btn primary" id="rmInvite">Copy invite link</button>
      </div>
      <div class="rm-lobby-detail">
        <div class="rm-lobby-detail-row"><span class="k">Committee</span><span class="v">${escapeHtml(s.committee)}</span></div>
        <div class="rm-lobby-detail-row"><span class="k">Topic</span><span class="v">${escapeHtml(s.topic)}</span></div>
        <div class="rm-lobby-detail-row"><span class="k">Role</span><span class="v">${s.roleMode === 'delegate' ? 'Delegate (AI chair)' : 'Chair'}</span></div>
      </div>
    </div>`;
}

function renderThinkingEntry(thinking, s) {
    return `
    <div class="rm-entry chat thinking" data-entry-id="thinking-${escapeHtml(thinking.country)}">
      <span class="rm-avatar small" data-code="${countryCode(thinking.country)}">${countryCode(thinking.country)}</span>
      <div class="rm-entry-body">
        <div class="rm-entry-head">
          <span class="rm-entry-author">${escapeHtml(thinking.country)}</span>
          <span class="rm-ai-badge">AI</span>
          <span class="rm-entry-drafting">is drafting a response</span>
        </div>
        <div class="typing"><span></span><span></span><span></span></div>
      </div>
    </div>`;
}

function renderEntry(e, s) {
    if (e.kind === 'system') {
        return `<div class="rm-entry system"><span>${escapeHtml(e.content)}</span></div>`;
    }
    if (e.kind === 'chair') {
        return `
      <div class="rm-entry chair" data-entry-id="${e.id}">
        <span class="rm-entry-chair-tag">Chair</span>
        <div class="rm-entry-body">
          <div class="rm-entry-text">${escapeHtml(e.content)}</div>
        </div>
      </div>`;
    }
    if (e.kind === 'motion') {
        return `
      <div class="rm-entry motion" data-entry-id="${e.id}">
        <div class="rm-entry-motion-tag">Motion</div>
        <div class="rm-entry-body">
          <div class="rm-entry-author">${escapeHtml(e.from || '')}</div>
          <div class="rm-entry-text">${escapeHtml(e.content)}</div>
        </div>
      </div>`;
    }
    if (e.kind === 'chat' || e.kind === 'delegate') {
        const me = s.delegates.find(d => d.id === ws.sessionId);
        const isMe = me && (e.from === me.name || e.from === me.country);
        const intent = e.intent && INTENT_LABEL[e.intent] ? e.intent : 'neutral';
        const intentMeta = INTENT_LABEL[intent];
        const aiBadge = e.isAI ? `<span class="rm-ai-badge">AI</span>` : '';
        const personalityBadge = e.personality && e.isAI
            ? `<span class="rm-personality-badge">${escapeHtml(shortPersonality(e.personality))}</span>`
            : '';
        const targetChip = e.target
            ? `<button type="button" class="rm-target-chip" data-target-ref="${e.replyToId || ''}" ${e.replyToId ? '' : 'disabled'}>
           <span class="arrow">→</span>${escapeHtml(e.target)}
         </button>`
            : '';
        const intentChip = `<span class="rm-intent-chip" data-intent="${intent}">${escapeHtml(intentMeta.label)}</span>`;

        return `
      <div class="rm-entry chat${isMe ? ' me' : ''}" data-entry-id="${e.id}" data-intent="${intent}">
        <span class="rm-avatar small" data-code="${countryCode(e.country)}">${countryCode(e.country)}</span>
        <div class="rm-entry-body">
          <div class="rm-entry-head">
            <span class="rm-entry-author">${escapeHtml(e.from || '')}</span>
            ${aiBadge}
            ${personalityBadge}
            <span class="rm-entry-country">${escapeHtml(e.country || '')}</span>
            <span class="rm-entry-time">${fmtTime(e.ts)}</span>
          </div>
          <div class="rm-entry-meta">
            ${intentChip}
            ${targetChip}
          </div>
          <div class="rm-entry-text">${escapeHtml(e.content)}</div>
        </div>
      </div>`;
    }
    return `<div class="rm-entry" data-entry-id="${e.id}"><div class="rm-entry-body">${escapeHtml(e.content || '')}</div></div>`;
}

function fmtTime(ts) {
    return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function nearBottom(el) {
    return el.scrollHeight - el.scrollTop - el.clientHeight < 120;
}

function startTimerLoop() {
    stopTimerLoop();
    timerInterval = setInterval(() => {
        if (!mounted) { stopTimerLoop(); return; }

        const el = $('rmSpeakerTimer');
        const ring = $('rmSpeakerRingFg');
        if (el && state?.currentSpeaker) {
            const start = state.currentSpeaker.startedAt;
            const dur = state.currentSpeaker.duration || 60;
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
        }

        if (state && state.thinking && state.thinking.until <= Date.now()) {
            const t = document.querySelector('.rm-entry.thinking');
            if (t) t.remove();
        }

        const typingEl = $('rmTyping');
        if (typingEl && !typingEl.hidden && state) {
            const me = ws.sessionId;
            const stillTyping = Object.entries(state.typingUsers || {})
                .some(([id, t]) => id !== me && t && t.until > Date.now());
            if (!stillTyping) {
                typingEl.hidden = true;
                typingEl.textContent = '';
            }
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