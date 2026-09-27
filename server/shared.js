/**
 * Shared Simulation rooms.
 *
 * A shared sim is a live WebSocket room where multiple humans participate
 * as delegates in the same Conference Simulation. The server owns the
 * procedural state (phases, motions, votes, transcript). AI delegates
 * fill any seats that humans haven't claimed.
 *
 * This is a different code path from the multiplayer "rooms" feature —
 * rooms are informal (chat, ad-hoc motions), while shared sims run the
 * deterministic SimulationEngine state machine.
 *
 * Sessions expire 3 hours after they go idle.
 */

import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX_DELEGATES = 15;
const SIM_TTL_MS = 1000 * 60 * 60 * 3;
const DISCONNECT_GRACE_MS = 20_000;

const AI_COUNTRIES = [
    'Germany', 'United States', 'China', 'India',
    'Brazil', 'Kenya', 'Maldives', 'Japan', 'Nigeria', 'Indonesia'
];

const newId = () => crypto.randomBytes(8).toString('hex');
const makeCode = () => {
    let out = '';
    for (let i = 0; i < 6; i++) out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    return out;
};

/* ------------------------------------------------------------------ */
/* Shared session                                                      */
/* ------------------------------------------------------------------ */

class SharedSession {
    constructor({ hostId, hostName, committee, topic, difficulty, userCountry }) {
        this.code = makeCode();
        this.hostId = hostId;
        this.committee = committee;
        this.topic = topic;
        this.difficulty = difficulty;
        this.createdAt = Date.now();
        this.updatedAt = this.createdAt;

        // Deterministic simulation state
        this.phase = 'lobby';           // 'lobby' | 'session' | 'ended'
        this.subPhase = 'idle';         // matches engine phase names
        this.transcript = [];
        this.speakersList = [];
        this.currentSpeaker = null;
        this.currentSpeakerStartedAt = 0;
        this.currentSpeakerDuration = 45;
        this.activeCaucus = null;
        this.motions = [];
        this.vote = null;
        this.voteResults = null;
        this.pendingInput = null;
        this.draftResolution = '';
        this.score = {
            speeches: 0,
            motionsPassed: 0,
            poisAnswered: 0,
            votesCast: 0,
            wordsSpoken: 0
        };

        // Participants
        this.humans = [];               // [{ id, name, country, isHost, present }]
        this.aiDelegates = [];          // [{ id, country, name, lastSpokeAt }]

        // Sockets: sessionId -> ws
        this.sockets = new Map();

        // Log sequence for transcript IDs
        this.logSeq = 0;

        // Runtime timers
        this._tick = null;

        this.addHuman({ id: hostId, name: hostName, country: userCountry, isHost: true });
        this.pushTranscript({
            kind: 'system',
            content: `${hostName} created the shared simulation`
        });
    }

    addHuman({ id, name, country, isHost = false }) {
        if (this.humans.find(h => h.id === id)) return;
        this.humans.push({
            id, name: name || 'Delegate', country: country || '—',
            isHost, present: true, joinedAt: Date.now()
        });
        this.updatedAt = Date.now();
    }

    removeHuman(id) {
        const was = this.humans.find(h => h.id === id);
        this.humans = this.humans.filter(h => h.id !== id);
        this.sockets.delete(id);
        this.updatedAt = Date.now();

        // If the host left, transfer to the earliest joiner.
        if (was && was.isHost) {
            const next = [...this.humans].sort((a, b) => a.joinedAt - b.joinedAt)[0];
            if (next) {
                this.hostId = next.id;
                for (const h of this.humans) h.isHost = (h.id === next.id);
                this.pushTranscript({
                    kind: 'system',
                    content: `${next.name} is now host`
                });
            } else {
                this.phase = 'ended';
            }
        }

        // If no humans left, end.
        if (!this.humans.length) this.phase = 'ended';
        return was;
    }

    pushTranscript(entry) {
        const e = { id: ++this.logSeq, ts: Date.now(), ...entry };
        this.transcript.push(e);
        if (this.transcript.length > 500) this.transcript = this.transcript.slice(-500);
        this.updatedAt = Date.now();
        return e;
    }

    /* ------------- AI delegates ------------- */

    spawnAIDelegates(n) {
        const taken = new Set([
            ...this.humans.map(h => h.country),
            ...this.aiDelegates.map(a => a.country)
        ].filter(Boolean));

        const available = AI_COUNTRIES.filter(c => !taken.has(c));
        let added = 0;
        for (let i = 0; i < n && i < available.length; i++) {
            const country = available[i];
            this.aiDelegates.push({
                id: 'ai_' + newId(),
                country,
                name: `Delegate of ${country}`,
                lastSpokeAt: 0,
                present: true
            });
            added++;
        }
        if (added) this.updatedAt = Date.now();
        return added;
    }

    /* ------------- Snapshot for broadcast ------------- */

    snapshot() {
        return {
            code: this.code,
            hostId: this.hostId,
            committee: this.committee,
            topic: this.topic,
            difficulty: this.difficulty,
            phase: this.phase,
            subPhase: this.subPhase,
            transcript: this.transcript,
            speakersList: this.speakersList,
            currentSpeaker: this.currentSpeaker,
            currentSpeakerStartedAt: this.currentSpeakerStartedAt,
            currentSpeakerDuration: this.currentSpeakerDuration,
            activeCaucus: this.activeCaucus,
            motions: this.motions,
            vote: this.vote,
            voteResults: this.voteResults,
            pendingInput: this.pendingInput,
            draftResolution: this.draftResolution,
            score: this.score,
            humans: this.humans,
            aiDelegates: this.aiDelegates,
            maxDelegates: MAX_DELEGATES,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt
        };
    }

    destroy() {
        if (this._tick) clearInterval(this._tick);
    }
}

/* ------------------------------------------------------------------ */
/* Manager                                                             */
/* ------------------------------------------------------------------ */

class SharedManager {
    constructor() {
        this.sessions = new Map();
        setInterval(() => this._cleanup(), 60_000).unref?.();
    }

    create(opts) {
        const session = new SharedSession(opts);
        this.sessions.set(session.code, session);
        return session;
    }

    get(code) { return this.sessions.get(String(code || '').toUpperCase()); }

    list() {
        return Array.from(this.sessions.values())
            .filter(s => s.phase !== 'ended')
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(s => ({
                code: s.code,
                committee: s.committee,
                topic: s.topic,
                phase: s.phase,
                humanCount: s.humans.length,
                aiCount: s.aiDelegates.length,
                maxDelegates: MAX_DELEGATES,
                updatedAt: s.updatedAt
            }));
    }

    _cleanup() {
        const now = Date.now();
        for (const [code, s] of this.sessions.entries()) {
            if (s.humans.length === 0 && now - s.updatedAt > SIM_TTL_MS) {
                s.destroy();
                this.sessions.delete(code);
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Broadcast helpers                                                   */
/* ------------------------------------------------------------------ */

function broadcast(session, msg) {
    const payload = JSON.stringify(msg);
    for (const socket of session.sockets.values()) {
        if (socket.readyState === socket.OPEN) socket.send(payload);
    }
}

function broadcastState(session) {
    broadcast(session, { type: 'state', state: session.snapshot() });
}

/* ------------------------------------------------------------------ */
/* Attach                                                              */
/* ------------------------------------------------------------------ */

export function attachSharedRoutes(wss) {
    const manager = new SharedManager();

    wss.on('connection', (ws, req) => {
        // Only handle shared-sim paths.
        if (!req.url || !req.url.startsWith('/ws/shared')) return;

        const conn = { sessionId: null, sessionCode: null };
        const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
        const err = (msg) => send({ type: 'error', message: msg });
        const getSession = () => conn.sessionCode ? manager.get(conn.sessionCode) : null;
        const isHost = (s) => conn.sessionId === s.hostId;

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', (raw) => {
            let msg;
            try { msg = JSON.parse(raw.toString()); }
            catch { return err('Invalid JSON'); }

            switch (msg.type) {

                case 'hello': {
                    conn.sessionId = String(msg.sessionId || newId()).slice(0, 64);
                    send({ type: 'hello', sessionId: conn.sessionId });
                    return;
                }

                case 'list-sessions': {
                    send({ type: 'sessions', sessions: manager.list() });
                    return;
                }

                case 'create-session': {
                    if (!conn.sessionId) return err('Not connected');
                    const s = manager.create({
                        hostId: conn.sessionId,
                        hostName: msg.hostName || 'Host',
                        userCountry: msg.userCountry || 'Chad',
                        committee: msg.committee || 'UNHRC',
                        topic: msg.topic || 'Open agenda',
                        difficulty: msg.difficulty || 'medium'
                    });
                    s.sockets.set(conn.sessionId, ws);
                    conn.sessionCode = s.code;
                    send({ type: 'session-created', code: s.code });
                    broadcastState(s);
                    return;
                }

                case 'join-session': {
                    if (!conn.sessionId) return err('Not connected');
                    const s = manager.get(msg.code);
                    if (!s) return err('Session not found');
                    if (s.humans.length >= MAX_DELEGATES &&
                        !s.humans.find(h => h.id === conn.sessionId)) {
                        return err('Session is full');
                    }
                    const existing = s.humans.find(h => h.id === conn.sessionId);
                    if (!existing) {
                        s.addHuman({
                            id: conn.sessionId,
                            name: msg.name || 'Delegate',
                            country: msg.country || '—'
                        });
                        s.pushTranscript({
                            kind: 'system',
                            content: `${msg.name || 'Delegate'} (${msg.country || '—'}) joined`
                        });
                    }
                    s.sockets.set(conn.sessionId, ws);
                    conn.sessionCode = s.code;
                    broadcastState(s);
                    return;
                }

                case 'leave-session': {
                    const s = getSession();
                    if (!s) { conn.sessionCode = null; return; }
                    const was = s.removeHuman(conn.sessionId);
                    if (was) s.pushTranscript({ kind: 'system', content: `${was.name} left` });
                    broadcastState(s);
                    conn.sessionCode = null;
                    return;
                }

                case 'start-session': {
                    const s = getSession();
                    if (!s || !isHost(s)) return;
                    s.phase = 'session';
                    s.subPhase = 'ROLL_CALL';
                    s.pushTranscript({ kind: 'system', content: 'Session started' });

                    const seatsLeft = Math.max(0, 8 - s.humans.length);
                    if (seatsLeft) {
                        s.spawnAIDelegates(seatsLeft);
                        s.pushTranscript({ kind: 'system', content: `AI delegates joined to fill empty seats.` });
                    }

                    s.pushTranscript({
                        kind: 'chair',
                        speaker: 'Chair',
                        content: `The ${s.committee} is now in session. Roll call: all delegations present.`
                    });

                    setTimeout(() => {
                        if (!manager.get(s.code)) return;
                        s.subPhase = 'GSL';
                        s.speakersList = [
                            ...s.humans.map(h => ({ country: h.country, isHuman: true })),
                            ...s.aiDelegates.map(a => ({ country: a.country, isHuman: false }))
                        ];
                        s.pushTranscript({
                            kind: 'chair',
                            speaker: 'Chair',
                            content: `The Chair will now read the General Speakers List: ${s.speakersList.map(x => x.country).join(', ')}.`
                        });
                        broadcastState(s);
                    }, 1500);

                    broadcastState(s);
                    return;
                }

                case 'speak-request': {
                    const s = getSession();
                    if (!s || s.phase !== 'session') return;
                    if (s.subPhase !== 'GSL' && s.subPhase !== 'MOD_CAUCUS') return;
                    const human = s.humans.find(h => h.id === conn.sessionId);
                    if (!human) return;

                    if (!s.currentSpeaker) {
                        s.currentSpeaker = {
                            id: human.id,
                            country: human.country,
                            isHuman: true
                        };
                        s.currentSpeakerStartedAt = Date.now();
                        s.currentSpeakerDuration = s.subPhase === 'MOD_CAUCUS' ? (s.activeCaucus?.speakerTime || 30) : 45;
                        s.pushTranscript({
                            kind: 'chair',
                            speaker: 'Chair',
                            content: `The Chair recognizes the delegate of ${human.country}.`
                        });
                    } else if (!s.speakersList.find(x => x.id === conn.sessionId)) {
                        s.speakersList.push({ id: conn.sessionId, country: human.country, isHuman: true });
                    }
                    broadcastState(s);
                    return;
                }

                case 'deliver-speech': {
                    const s = getSession();
                    if (!s || !s.currentSpeaker) return;
                    if (s.currentSpeaker.id !== conn.sessionId) return;
                    const text = String(msg.text || '').slice(0, 4000).trim();
                    if (!text) return;

                    s.pushTranscript({
                        kind: 'user',
                        speaker: 'You',
                        country: s.currentSpeaker.country,
                        content: text
                    });
                    s.score.speeches += 1;
                    s.score.wordsSpoken += text.split(/\s+/).length;

                    s.currentSpeaker = null;
                    broadcastState(s);

                    scheduleNextAI(s, manager);
                    return;
                }

                case 'end-speech': {
                    const s = getSession();
                    if (!s || !s.currentSpeaker) return;
                    const isSelf = s.currentSpeaker.id === conn.sessionId;
                    if (!isHost(s) && !isSelf) return;
                    s.currentSpeaker = null;
                    broadcastState(s);
                    scheduleNextAI(s, manager);
                    return;
                }

                case 'propose-motion': {
                    const s = getSession();
                    if (!s || s.phase !== 'session') return;
                    const human = s.humans.find(h => h.id === conn.sessionId);
                    if (!human) return;
                    const text = String(msg.text || '').slice(0, 300).trim();
                    if (!text) return;
                    const motion = {
                        id: newId(),
                        kind: msg.kind || 'generic',
                        by: { id: human.id, name: human.name, country: human.country, isHuman: true },
                        text, status: 'pending', ts: Date.now()
                    };
                    s.motions.push(motion);
                    s.pushTranscript({ kind: 'motion', from: human.name, content: `${human.name} moved: ${text}` });

                    if (!isHost(s)) {
                        setTimeout(() => {
                            const m = s.motions.find(x => x.id === motion.id);
                            if (!m || m.status !== 'pending') return;
                            m.status = ['open-mod', 'open-unmod'].includes(m.kind) ? 'passed' : 'tabled';
                            s.pushTranscript({
                                kind: 'chair',
                                speaker: 'Chair',
                                content: `The Chair rules the motion ${m.status === 'passed' ? 'in order' : 'out of order'}.`
                            });
                            broadcastState(s);
                        }, 1500);
                    }

                    broadcastState(s);
                    return;
                }

                case 'rule-motion': {
                    const s = getSession();
                    if (!s || !isHost(s)) return;
                    const m = s.motions.find(x => x.id === msg.motionId);
                    if (!m || !['passed', 'failed', 'tabled'].includes(msg.decision)) return;
                    m.status = msg.decision;
                    s.pushTranscript({
                        kind: 'chair',
                        speaker: 'Chair',
                        content: `The Chair rules the motion ${m.status === 'passed' ? 'in order' : 'out of order'}.`
                    });
                    broadcastState(s);
                    return;
                }

                case 'start-vote': {
                    const s = getSession();
                    if (!s || !isHost(s)) return;
                    const text = String(msg.text || '').slice(0, 300).trim();
                    if (!text) return err('Vote needs a question');
                    s.vote = {
                        id: newId(), text, phase: 'open',
                        votes: { yes: [], no: [], abstain: [] },
                        ts: Date.now(), result: null
                    };
                    s.pushTranscript({ kind: 'system', content: `Vote opened: ${text}` });

                    setTimeout(() => {
                        if (!manager.get(s.code) || !s.vote || s.vote.phase !== 'open') return;
                        for (const ai of s.aiDelegates) {
                            const r = Math.random();
                            const v = r < 0.55 ? 'yes' : r < 0.85 ? 'no' : 'abstain';
                            if (!s.vote.votes[v].find(x => x.id === ai.id)) {
                                s.vote.votes[v].push({ id: ai.id, country: ai.country, isAI: true });
                            }
                        }
                        broadcastState(s);
                    }, 2200);

                    broadcastState(s);
                    return;
                }

                case 'cast-vote': {
                    const s = getSession();
                    if (!s || !s.vote || s.vote.phase !== 'open') return;
                    const human = s.humans.find(h => h.id === conn.sessionId);
                    if (!human || !['yes', 'no', 'abstain'].includes(msg.vote)) return;
                    for (const k of ['yes', 'no', 'abstain']) {
                        s.vote.votes[k] = s.vote.votes[k].filter(x => x.id !== human.id);
                    }
                    s.vote.votes[msg.vote].push({ id: human.id, country: human.country });
                    s.score.votesCast += 1;
                    broadcastState(s);
                    return;
                }

                case 'close-vote': {
                    const s = getSession();
                    if (!s || !s.vote || !isHost(s)) return;
                    s.vote.phase = 'closed';
                    const y = s.vote.votes.yes.length;
                    const n = s.vote.votes.no.length;
                    const a = s.vote.votes.abstain.length;
                    const passed = y + n > 0 ? y > n : false;
                    s.vote.result = { yes: y, no: n, abstain: a, passed };
                    s.voteResults = s.vote.result;
                    s.pushTranscript({
                        kind: 'system',
                        content: `Vote closed — ${y} in favour, ${n} against, ${a} abstaining. ${passed ? 'PASSED' : 'FAILED'}`
                    });
                    broadcastState(s);
                    return;
                }

                case 'chat': {
                    const s = getSession();
                    if (!s) return;
                    const human = s.humans.find(h => h.id === conn.sessionId);
                    if (!human) return;
                    const text = String(msg.text || '').slice(0, 500).trim();
                    if (!text) return;
                    s.pushTranscript({
                        kind: 'chat',
                        from: human.name,
                        country: human.country,
                        content: text
                    });
                    broadcastState(s);
                    return;
                }

                case 'ping':
                    send({ type: 'pong' });
                    return;

                default:
                    err(`Unknown message type: ${msg.type}`);
            }
        });

        ws.on('close', () => {
            const s = getSession();
            if (!s) return;
            if (s.sockets.get(conn.sessionId) !== ws) return;
            s.sockets.delete(conn.sessionId);

            setTimeout(() => {
                const r = manager.get(conn.sessionCode);
                if (!r || r.sockets.has(conn.sessionId)) return;
                const human = r.humans.find(h => h.id === conn.sessionId);
                if (!human) return;
                r.removeHuman(conn.sessionId);
                r.pushTranscript({ kind: 'system', content: `${human.name} disconnected` });
                broadcastState(r);
            }, DISCONNECT_GRACE_MS);
        });
    });

    return { manager };
}

/* ------------------------------------------------------------------ */
/* Schedule the next AI speaker                                        */
/* ------------------------------------------------------------------ */

function scheduleNextAI(session, manager) {
    if (!session || session.phase !== 'session') return;
    if (session.currentSpeaker) return;

    const ai = [...session.aiDelegates]
        .sort((a, b) => (a.lastSpokeAt || 0) - (b.lastSpokeAt || 0))[0];
    if (!ai) return;
    if (Date.now() - (ai.lastSpokeAt || 0) < 30_000) return;

    // Only AI speaks if GSL loop is the current sub-phase.
    if (!['GSL', 'MOD_CAUCUS'].includes(session.subPhase)) return;

    ai.lastSpokeAt = Date.now();
    session.currentSpeaker = {
        id: ai.id,
        country: ai.country,
        isHuman: false
    };
    session.currentSpeakerStartedAt = Date.now();
    session.currentSpeakerDuration = 45;

    session.pushTranscript({
        kind: 'chair',
        speaker: 'Chair',
        content: `The Chair recognizes the delegate of ${ai.country}.`
    });
    broadcastState(session);

    // Simulate an AI speech after a delay.
    setTimeout(() => {
        if (!manager.get(session.code)) return;
        if (!session.currentSpeaker || session.currentSpeaker.id !== ai.id) return;

        const templates = [
            `The delegation of ${ai.country} thanks the Chair. We remain committed to constructive multilateral engagement on "${session.topic}".`,
            `The delegation of ${ai.country} takes note of the discussion and would welcome further clarity on implementation and funding.`,
            `The delegation of ${ai.country} supports concrete, actionable measures that respect the interests of all Member States.`,
            `The delegation of ${ai.country} urges this committee to ensure that no state is left behind in the response to ${session.topic}.`
        ];
        const text = templates[Math.floor(Math.random() * templates.length)];

        session.pushTranscript({
            kind: 'delegate',
            speaker: ai.country,
            country: ai.country,
            content: text,
            isAI: true
        });
        session.score.speeches += 1;
        session.currentSpeaker = null;
        broadcastState(session);

        // Schedule the next one.
        setTimeout(() => scheduleNextAI(session, manager), 2000);
    }, 4000 + Math.random() * 3000);
}