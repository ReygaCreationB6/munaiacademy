import { WebSocketServer } from 'ws';
import crypto from 'node:crypto';
import { persistence } from './persistence.js';
import { aiAvailable } from './aiDelegate.js';
import { aiDirector } from './aiDirector.js';
import { attachSharedRoutes } from './shared.js';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const ROOM_TTL_MS = 1000 * 60 * 60 * 3;
const MAX_DELEGATES = 20;
const DISCONNECT_GRACE_MS = 30_000;

const MAX_CONN_PER_IP = Number(process.env.WS_MAX_CONNECTIONS_PER_IP || 10);
const MAX_MESSAGES_PER_MIN = Number(process.env.WS_MAX_MESSAGES_PER_MIN || 120);
const HEARTBEAT_MS = 30_000;

const SNAPSHOT_DEBOUNCE_MS = Number(process.env.ROOM_SNAPSHOT_DEBOUNCE_MS || 2000);
const AI_FILL_DELAY_MS = Number(process.env.ROOM_AI_FILL_DELAY_MS || 15000);
const AI_TARGET_SIZE = Number(process.env.ROOM_AI_TARGET_SIZE || 6);
const AI_TICK_INTERVAL_MS = Number(process.env.ROOM_AI_TICK_INTERVAL_MS || 10000);
const TYPING_TTL_MS = Number(process.env.ROOM_TYPING_TTL_MS || 3500);

const AI_COUNTRIES = [
    'Germany', 'United States', 'China', 'India',
    'Brazil', 'Kenya', 'Maldives', 'Japan', 'Nigeria', 'Indonesia'
];
const CHAIR_COUNTRY = 'Norway';

const PERSONALITY_KEYS = [
    'HARDLINER', 'NEGOTIATOR', 'RESEARCHER', 'COALITION_BUILDER',
    'QUIET', 'AGGRESSIVE', 'HUMANITARIAN'
];

const COUNTRY_PROFILES = {
    'Chad': {
        region: 'Africa', blocs: ['African Group', 'LDC', 'G77'], economicLevel: 'LDC',
        interests: ['climate finance', 'adaptation funding', 'LDC support', 'food security'],
        redLines: ['mandatory emissions cuts for LDCs'], allies: ['Kenya', 'Maldives'],
        commitments: ['Paris Agreement', 'AU Agenda 2063']
    },
    'Germany': {
        region: 'Europe', blocs: ['European Union', 'WEOG'], economicLevel: 'Developed',
        interests: ['multilateralism', 'climate finance', 'human rights protection'],
        redLines: ['retreat from Paris Agreement'], allies: ['France', 'Brazil'],
        commitments: ['Paris Agreement', 'EU Green Deal']
    },
    'United States': {
        region: 'North America', blocs: ['WEOG', 'P5'], economicLevel: 'Developed',
        interests: ['national sovereignty', 'voluntary commitments', 'market-based solutions'],
        redLines: ['binding emissions targets', 'mandatory reparations'], allies: ['Japan', 'Australia'],
        commitments: ['Paris Agreement', 'UDHR']
    },
    'China': {
        region: 'Asia-Pacific', blocs: ['G77', 'BRICS', 'P5'], economicLevel: 'Developing (upper)',
        interests: ['common but differentiated responsibilities', 'South-South cooperation'],
        redLines: ['mandatory emission cuts'], allies: ['Brazil', 'India'],
        commitments: ['Paris Agreement', 'CBDR principles']
    },
    'India': {
        region: 'Asia-Pacific', blocs: ['G77', 'BRICS', 'G20'], economicLevel: 'Developing (upper)',
        interests: ['development space', 'technology access', 'climate finance'],
        redLines: ['mandatory emission caps'], allies: ['Brazil', 'China'],
        commitments: ['Paris Agreement', 'International Solar Alliance']
    },
    'Brazil': {
        region: 'Latin America', blocs: ['GRULAC', 'BRICS', 'G20'], economicLevel: 'Developing (upper)',
        interests: ['rainforest protection', 'sustainable development'],
        redLines: ['external control of Amazon'], allies: ['India', 'China'],
        commitments: ['Paris Agreement', 'Amazon Fund']
    },
    'Kenya': {
        region: 'Africa', blocs: ['African Group', 'Commonwealth'], economicLevel: 'Developing',
        interests: ['adaptation', 'African representation', 'technology transfer'],
        redLines: ['unfunded mandates'], allies: ['Chad', 'Nigeria'],
        commitments: ['Paris Agreement', 'AU Agenda 2063']
    },
    'Maldives': {
        region: 'Asia-Pacific (SIDS)', blocs: ['AOSIS', 'Commonwealth'], economicLevel: 'SIDS',
        interests: ['sea-level rise', 'SIDS representation', 'loss and damage'],
        redLines: ['temperature overshoot beyond 1.5°C'], allies: ['Chad', 'Kenya'],
        commitments: ['Paris Agreement', 'SAMOA Pathway']
    },
    'Japan': {
        region: 'Asia-Pacific', blocs: ['WEOG'], economicLevel: 'Developed',
        interests: ['technology transfer', 'multilateralism'], redLines: [], allies: ['United States'],
        commitments: ['Paris Agreement']
    },
    'Nigeria': {
        region: 'Africa', blocs: ['African Group', 'OPEC'], economicLevel: 'Developing',
        interests: ['climate finance', 'energy transition'], redLines: [], allies: ['Kenya'],
        commitments: ['Paris Agreement']
    },
    'Indonesia': {
        region: 'Asia-Pacific', blocs: ['ASEAN', 'G20'], economicLevel: 'Developing',
        interests: ['sustainable development', 'technology transfer'], redLines: [], allies: ['India'],
        commitments: ['Paris Agreement']
    }
};

const PERSONALITIES = {
    NEGOTIATOR: {
        name: 'The Negotiator', description: 'Seeks compromise and bridges differences between blocs.',
        traits: { aggressiveness: 0.3, cooperativeness: 0.9, verbosity: 0.6, evidence: 0.7 },
        prompt: 'You favor compromise. Look for middle ground.'
    },
    HARDLINER: {
        name: 'The Hardliner', description: 'Rarely compromises; defends red lines firmly.',
        traits: { aggressiveness: 0.8, cooperativeness: 0.15, verbosity: 0.7, evidence: 0.6 },
        prompt: 'You hold your country\'s red lines firmly. Do not concede easily.'
    },
    RESEARCHER: {
        name: 'The Researcher', description: 'Uses evidence, cites treaties and reports.',
        traits: { aggressiveness: 0.4, cooperativeness: 0.6, verbosity: 0.9, evidence: 1.0 },
        prompt: 'You support every argument with a specific treaty, resolution, or report.'
    },
    COALITION_BUILDER: {
        name: 'The Coalition Builder', description: 'Focuses on alliance formation.',
        traits: { aggressiveness: 0.35, cooperativeness: 0.85, verbosity: 0.7, evidence: 0.6 },
        prompt: 'You actively build coalitions. Name specific countries you want to work with.'
    },
    QUIET: {
        name: 'The Quiet Delegate', description: 'Speaks rarely, but always strategically.',
        traits: { aggressiveness: 0.2, cooperativeness: 0.5, verbosity: 0.3, evidence: 0.8 },
        prompt: 'You speak briefly and strategically. Short, sharp, high-impact.'
    },
    AGGRESSIVE: {
        name: 'The Aggressive Debater', description: 'Challenges others frequently.',
        traits: { aggressiveness: 0.9, cooperativeness: 0.25, verbosity: 0.8, evidence: 0.7 },
        prompt: 'You challenge other delegates\' assumptions directly but stay diplomatic.'
    },
    HUMANITARIAN: {
        name: 'The Humanitarian Delegate', description: 'Prioritizes human impact.',
        traits: { aggressiveness: 0.4, cooperativeness: 0.75, verbosity: 0.6, evidence: 0.7 },
        prompt: 'You ground every argument in human impact.'
    }
};

const newId = () => crypto.randomBytes(8).toString('hex');
const makeCode = () => {
    let out = '';
    for (let i = 0; i < 6; i++) out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    return out;
};

function buildAIProfile(country, personalityKey) {
    return {
        country,
        name: `Delegate of ${country}`,
        isAI: true,
        profile: COUNTRY_PROFILES[country] || {
            region: 'Unknown', blocs: [], economicLevel: 'Developing',
            interests: ['multilateral cooperation'], redLines: [], allies: [],
            commitments: ['UN Charter']
        },
        personalityKey,
        personality: PERSONALITIES[personalityKey] || PERSONALITIES.NEGOTIATOR,
        relations: {},
        joinedAt: Date.now(),
        lastSpokeAt: 0
    };
}

/* ------------------------------------------------------------------ */
/* Room                                                                */
/* ------------------------------------------------------------------ */

class Room {
    constructor(snapshot) {
        if (snapshot) {
            Object.assign(this, {
                code: snapshot.code,
                name: snapshot.name,
                committee: snapshot.committee,
                topic: snapshot.topic,
                phase: snapshot.phase || 'lobby',
                hostId: snapshot.hostId,
                roleMode: snapshot.roleMode || 'chair',
                createdAt: snapshot.createdAt || Date.now(),
                updatedAt: snapshot.updatedAt || Date.now(),
                delegates: Array.isArray(snapshot.delegates) ? snapshot.delegates : [],
                aiDelegates: Array.isArray(snapshot.aiDelegates) ? snapshot.aiDelegates : [],
                aiChair: snapshot.aiChair || null,
                queue: Array.isArray(snapshot.queue) ? snapshot.queue : [],
                currentSpeaker: snapshot.currentSpeaker || null,
                motions: Array.isArray(snapshot.motions) ? snapshot.motions : [],
                vote: snapshot.vote || null,
                transcript: Array.isArray(snapshot.transcript) ? snapshot.transcript : [],
                aiSettings: snapshot.aiSettings || { enabled: false, targetSize: AI_TARGET_SIZE },
                maxDelegates: snapshot.maxDelegates || MAX_DELEGATES,
                lastAIMotionAt: snapshot.lastAIMotionAt || 0,
                lastChairIdleAt: snapshot.lastChairIdleAt || 0,
                lastAISpeechAt: snapshot.lastAISpeechAt || 0,
                typingUsers: snapshot.typingUsers || {}
            });
        } else {
            Object.assign(this, {
                code: makeCode(),
                name: 'Untitled room',
                committee: 'UNHRC',
                topic: 'Open agenda',
                phase: 'lobby',
                hostId: null,
                roleMode: 'chair',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                delegates: [],
                aiDelegates: [],
                aiChair: null,
                queue: [],
                currentSpeaker: null,
                motions: [],
                vote: null,
                transcript: [],
                aiSettings: { enabled: false, targetSize: AI_TARGET_SIZE },
                maxDelegates: MAX_DELEGATES,
                lastAIMotionAt: 0,
                lastChairIdleAt: 0,
                lastAISpeechAt: 0,
                typingUsers: {}
            });
        }

        this.sockets = new Map();
        this.sessionStartedAt = null;
        this.thinking = null;
        this._snapshotTimer = null;
    }

    addDelegate({ id, name, country, isHost = false }) {
        if (this.delegates.find(d => d.id === id)) return;
        this.delegates.push({
            id, name: name || 'Delegate', country: country || '—',
            isHost, present: false, joinedAt: Date.now()
        });
        this.updatedAt = Date.now();
    }

    removeDelegate(id) {
        const was = this.delegates.find(d => d.id === id);
        this.delegates = this.delegates.filter(d => d.id !== id);
        this.queue = this.queue.filter(q => q.id !== id);
        if (this.currentSpeaker?.id === id) this.currentSpeaker = null;
        if (this.typingUsers && this.typingUsers[id]) delete this.typingUsers[id];
        this.sockets.delete(id);
        this.updatedAt = Date.now();
        return was;
    }

    spawnAIDelegates(n) {
        if (!aiAvailable()) return 0;
        const taken = new Set([
            ...this.delegates.map(d => d.country),
            ...this.aiDelegates.map(d => d.country),
            this.aiChair ? this.aiChair.country : null
        ].filter(Boolean));

        const available = AI_COUNTRIES.filter(c => !taken.has(c));
        let added = 0;
        for (let i = 0; i < n && i < available.length; i++) {
            const country = available[i];
            const personalityKey = PERSONALITY_KEYS[(this.aiDelegates.length + i) % PERSONALITY_KEYS.length];
            this.aiDelegates.push({
                id: 'ai_' + newId(),
                ...buildAIProfile(country, personalityKey)
            });
            added++;
        }
        if (added) this.updatedAt = Date.now();
        return added;
    }

    spawnAIChair() {
        if (!aiAvailable()) return null;
        if (this.aiChair) return this.aiChair;

        const taken = new Set([
            ...this.delegates.map(d => d.country),
            ...this.aiDelegates.map(d => d.country)
        ]);
        let country = CHAIR_COUNTRY;
        if (taken.has(country)) country = AI_COUNTRIES.find(c => !taken.has(c)) || 'Chair';

        this.aiChair = {
            id: 'chair_' + newId(),
            country,
            name: `Chair (${country})`,
            isAI: true,
            isChair: true,
            joinedAt: Date.now()
        };
        this.updatedAt = Date.now();
        this.pushTranscript({ kind: 'system', content: `An AI chair has been assigned.` });
        return this.aiChair;
    }

    removeAllAIDelegates() {
        const removed = this.aiDelegates.length;
        this.aiDelegates = [];
        this.queue = this.queue.filter(q => !q.id.startsWith('ai_'));
        if (this.currentSpeaker?.id?.startsWith('ai_')) this.currentSpeaker = null;
        this.updatedAt = Date.now();
        return removed;
    }

    pushTranscript(entry) {
        const e = { id: newId(), ts: Date.now(), ...entry };
        this.transcript.push(e);
        if (this.transcript.length > 500) this.transcript = this.transcript.slice(-500);
        this.updatedAt = Date.now();
        return e;
    }

    snapshot() {
        return {
            code: this.code,
            name: this.name,
            committee: this.committee,
            topic: this.topic,
            phase: this.phase,
            hostId: this.hostId,
            roleMode: this.roleMode,
            createdAt: this.createdAt,
            updatedAt: this.updatedAt,
            delegates: this.delegates,
            aiDelegates: this.aiDelegates,
            aiChair: this.aiChair,
            queue: this.queue,
            currentSpeaker: this.currentSpeaker,
            motions: this.motions,
            vote: this.vote,
            transcript: this.transcript,
            aiSettings: this.aiSettings,
            maxDelegates: this.maxDelegates,
            thinking: this.thinking,
            typingUsers: this.typingUsers,
            lastAIMotionAt: this.lastAIMotionAt,
            lastChairIdleAt: this.lastChairIdleAt,
            lastAISpeechAt: this.lastAISpeechAt
        };
    }

    scheduleSnapshot() {
        if (!persistence.isEnabled()) return;
        if (this._snapshotTimer) return;
        this._snapshotTimer = setTimeout(() => {
            this._snapshotTimer = null;
            persistence.saveRoom(this.snapshot()).catch(() => { });
        }, SNAPSHOT_DEBOUNCE_MS);
    }

    async snapshotNow() {
        if (!persistence.isEnabled()) return;
        if (this._snapshotTimer) {
            clearTimeout(this._snapshotTimer);
            this._snapshotTimer = null;
        }
        return persistence.saveRoom(this.snapshot());
    }

    destroy() {
        if (this._snapshotTimer) clearTimeout(this._snapshotTimer);
        this._snapshotTimer = null;
    }
}

/* ------------------------------------------------------------------ */
/* RoomManager                                                        */
/* ------------------------------------------------------------------ */

class RoomManager {
    constructor() {
        this.rooms = new Map();
        this.connections = new Map();
        this.ipConnections = new Map();
        setInterval(() => this._cleanup(), 60_000).unref?.();
        setInterval(() => this._snapshotAll(), 60_000).unref?.();
        setInterval(() => this._aiTickAll(), AI_TICK_INTERVAL_MS).unref?.();
    }

    createRoom(opts) {
        const room = new Room();
        room.name = opts.name || 'Untitled room';
        room.committee = opts.committee || 'UNHRC';
        room.topic = opts.topic || 'Open agenda';
        room.hostId = opts.hostId;
        room.roleMode = opts.roleMode === 'delegate' ? 'delegate' : 'chair';
        room.addDelegate({
            id: opts.hostId,
            name: opts.hostName || 'Host',
            country: opts.hostCountry || '—',
            isHost: true
        });
        room.pushTranscript({
            kind: 'system',
            content: `${opts.hostName || 'Host'} created the room as ${room.roleMode === 'chair' ? 'chair' : 'a delegate'}`
        });
        this.rooms.set(room.code, room);
        room.scheduleSnapshot();
        return room;
    }

    async getOrLoadRoom(code) {
        const inMemory = this.rooms.get(String(code || '').toUpperCase());
        if (inMemory) return inMemory;
        const restored = await persistence.loadRoom(String(code || '').toUpperCase());
        if (!restored) return null;
        const room = new Room(restored);
        this.rooms.set(room.code, room);
        return room;
    }

    getRoom(code) { return this.rooms.get(String(code || '').toUpperCase()); }

    listRooms() {
        return Array.from(this.rooms.values())
            .filter(r => r.phase !== 'ended')
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map(r => ({
                code: r.code, name: r.name, committee: r.committee, topic: r.topic,
                phase: r.phase, roleMode: r.roleMode,
                delegateCount: r.delegates.length + r.aiDelegates.length + (r.aiChair ? 1 : 0),
                humanCount: r.delegates.length,
                aiCount: r.aiDelegates.length + (r.aiChair ? 1 : 0),
                maxDelegates: r.maxDelegates || MAX_DELEGATES,
                updatedAt: r.updatedAt
            }));
    }

    _cleanup() {
        const now = Date.now();
        for (const [code, room] of this.rooms.entries()) {
            if (room.delegates.length === 0 && now - room.updatedAt > ROOM_TTL_MS) {
                room.destroy();
                this.rooms.delete(code);
            }
        }
    }

    async _snapshotAll() {
        if (!persistence.isEnabled()) return;
        for (const room of this.rooms.values()) {
            try { await room.snapshotNow(); } catch { }
        }
    }

    async _aiTickAll() {
        for (const room of this.rooms.values()) {
            if (room.sockets.size === 0) continue;
            if (room.phase !== 'session') continue;

            const broadcast = (r, msg) => broadcastToRoom(r, msg);
            const broadcastState = (r) => {
                broadcastToRoom(r, { type: 'state', state: r.snapshot() });
                r.scheduleSnapshot();
            };

            if (room.typingUsers) {
                const now = Date.now();
                let changed = false;
                for (const id of Object.keys(room.typingUsers)) {
                    const t = room.typingUsers[id];
                    if (!t || t.until <= now) {
                        delete room.typingUsers[id];
                        changed = true;
                    }
                }
                if (changed) broadcastState(room);
            }

            if (room.aiSettings.enabled) {
                const target = room.aiSettings.targetSize || AI_TARGET_SIZE;
                const needed = Math.max(0, target - room.delegates.length - room.aiDelegates.length);
                if (needed > 0) {
                    const sessionAge = Date.now() - (room.sessionStartedAt || 0);
                    if (sessionAge >= AI_FILL_DELAY_MS) {
                        const added = room.spawnAIDelegates(needed);
                        if (added) {
                            room.pushTranscript({
                                kind: 'system',
                                content: `AI delegates have joined to fill empty seats.`
                            });
                            broadcastState(room);
                        }
                    }
                }
            }

            try {
                await aiDirector.tick(room, broadcast, broadcastState);
            } catch (err) {
                console.warn('[ws] ai tick failed:', err.message);
            }
        }
    }
}

/* ------------------------------------------------------------------ */
/* Broadcast helpers                                                  */
/* ------------------------------------------------------------------ */

function broadcastToRoom(room, msg) {
    const payload = JSON.stringify(msg);
    for (const socket of room.sockets.values()) {
        if (socket.readyState === socket.OPEN) socket.send(payload);
    }
}

function broadcastState(room) {
    broadcastToRoom(room, { type: 'state', state: room.snapshot() });
    room.scheduleSnapshot();
}

function transferHost(room) {
    if (!room) return false;

    const humans = (room.delegates || [])
        .filter(d => d && !d.isAI)
        .sort((a, b) => (a.joinedAt || 0) - (b.joinedAt || 0));

    if (!humans.length) {
        if (room.phase !== 'ended') {
            room.phase = 'ended';
            room.pushTranscript({
                kind: 'system',
                content: 'All human delegates have left. The session has ended.'
            });
            return true;
        }
        return false;
    }

    const currentHostStillPresent = humans.find(d => d.id === room.hostId);

    if (currentHostStillPresent) {
        let changed = false;
        for (const d of humans) {
            const shouldBeHost = (d.id === room.hostId);
            if (d.isHost !== shouldBeHost) {
                d.isHost = shouldBeHost;
                changed = true;
            }
        }
        return changed;
    }

    const next = humans[0];
    room.hostId = next.id;
    for (const d of humans) {
        d.isHost = (d.id === next.id);
    }

    const label = next.country && next.country !== '—' ? next.country : next.name;
    room.pushTranscript({
        kind: 'system',
        content: `${label} is now host.`
    });
    return true;
}

/* ------------------------------------------------------------------ */
/* Attach                                                             */
/* ------------------------------------------------------------------ */

export function attachWebSocket(httpServer) {
    // ONE WebSocketServer for the entire app. Route by req.url inside the
    // connection handler. Running multiple WebSocketServer instances on the
    // same HTTP server corrupts the handshake for both.
    const wss = new WebSocketServer({ server: httpServer, maxPayload: 64 * 1024 });

    // Mount the shared-simulation routing onto the same server.
    attachSharedRoutes(wss);

    const manager = new RoomManager();

    wss.on('connection', (ws, req) => {
        // Shared sims are handled by their own handler. Skip them here.
        if (req.url && req.url.startsWith('/ws/shared')) return;

        const ip = (req.headers['x-forwarded-for']?.split(',')[0]
            || req.socket.remoteAddress
            || 'unknown').trim();

        // Per-IP connection cap enforced at the WebSocket layer, not at the
        // HTTP upgrade layer. Writing raw HTTP from an upgrade listener races
        // with the ws library's handshake and produces "Invalid frame header".
        const count = manager.ipConnections.get(ip) || 0;
        if (count >= MAX_CONN_PER_IP) {
            try { ws.close(1013, 'Too many connections from this IP'); } catch { }
            return;
        }
        manager.ipConnections.set(ip, count + 1);

        manager.connections.set(ws, { sessionId: null, roomCode: null, ip, msgWindow: [] });

        const conn = () => manager.connections.get(ws);
        const send = (msg) => { if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg)); };
        const err = (msg) => send({ type: 'error', message: msg });
        const getRoom = () => { const c = conn(); return c?.roomCode ? manager.getRoom(c.roomCode) : null; };
        const isHost = (room) => conn().sessionId === room.hostId;

        function allowMessage() {
            const c = conn();
            const now = Date.now();
            c.msgWindow = c.msgWindow.filter(t => now - t < 60_000);
            if (c.msgWindow.length >= MAX_MESSAGES_PER_MIN) return false;
            c.msgWindow.push(now);
            return true;
        }

        ws.isAlive = true;
        ws.on('pong', () => { ws.isAlive = true; });

        ws.on('message', async (raw) => {
            if (!allowMessage()) return err('Slow down — too many messages.');

            let msg;
            try { msg = JSON.parse(raw.toString()); }
            catch { return err('Invalid JSON'); }

            switch (msg.type) {
                case 'hello': {
                    conn().sessionId = String(msg.sessionId || newId()).slice(0, 64);
                    send({ type: 'hello', sessionId: conn().sessionId });
                    return;
                }

                case 'list-rooms': {
                    const memory = manager.listRooms();
                    const seen = new Set(memory.map(r => r.code));
                    const dbRooms = await persistence.listRooms();
                    send({ type: 'rooms', rooms: [...memory, ...dbRooms.filter(r => !seen.has(r.code))] });
                    return;
                }

                case 'create-room': {
                    if (!conn().sessionId) return err('Not connected');
                    const room = manager.createRoom({
                        name: msg.name, committee: msg.committee, topic: msg.topic,
                        roleMode: msg.roleMode || 'chair',
                        hostId: conn().sessionId,
                        hostName: msg.hostName || 'Host',
                        hostCountry: msg.hostCountry || '—'
                    });
                    room.sockets.set(conn().sessionId, ws);
                    conn().roomCode = room.code;
                    send({ type: 'room-created', code: room.code });
                    broadcastState(room);
                    return;
                }

                case 'join-room': {
                    if (!conn().sessionId) return err('Not connected');
                    const room = await manager.getOrLoadRoom(msg.code);
                    if (!room) return err('Room not found');
                    if (room.delegates.length >= MAX_DELEGATES &&
                        !room.delegates.find(d => d.id === conn().sessionId)) {
                        return err('Room is full');
                    }
                    const existing = room.delegates.find(d => d.id === conn().sessionId);
                    if (!existing) {
                        room.addDelegate({
                            id: conn().sessionId,
                            name: msg.name || 'Delegate',
                            country: msg.country || '—'
                        });
                        room.pushTranscript({
                            kind: 'system',
                            content: `${msg.name || 'Delegate'} (${msg.country || '—'}) joined`
                        });
                    }
                    room.sockets.set(conn().sessionId, ws);
                    conn().roomCode = room.code;
                    broadcastState(room);
                    return;
                }

                case 'leave-room': {
                    const room = getRoom();
                    if (!room) { conn().roomCode = null; return; }
                    const was = room.removeDelegate(conn().sessionId);
                    if (was) room.pushTranscript({ kind: 'system', content: `${was.name} left` });
                    transferHost(room);
                    broadcastState(room);
                    conn().roomCode = null;
                    return;
                }

                case 'typing': {
                    const room = getRoom();
                    if (!room) return;
                    const d = room.delegates.find(x => x.id === conn().sessionId);
                    if (!d) return;
                    room.typingUsers = room.typingUsers || {};
                    room.typingUsers[d.id] = {
                        name: d.name,
                        country: d.country,
                        until: Date.now() + TYPING_TTL_MS
                    };
                    broadcastState(room);
                    return;
                }

                case 'start-session': {
                    const room = getRoom();
                    if (!room || !isHost(room)) return;
                    room.phase = 'session';
                    room.sessionStartedAt = Date.now();

                    if (room.roleMode === 'delegate' && !room.aiChair) room.spawnAIChair();

                    room.pushTranscript({ kind: 'system', content: 'Session started' });

                    if (room.aiChair) {
                        room.pushTranscript({
                            kind: 'chair',
                            speaker: 'Chair',
                            content: `The ${room.committee} is now in session. The agenda topic is "${room.topic}". The Chair will now open the General Speakers List.`
                        });
                    }

                    broadcastState(room);
                    room.snapshotNow();
                    return;
                }

                case 'set-role': {
                    const room = getRoom();
                    if (!room || !isHost(room)) return;
                    const next = msg.roleMode === 'delegate' ? 'delegate' : 'chair';
                    room.roleMode = next;

                    if (next === 'delegate') {
                        if (room.phase === 'session' && !room.aiChair) room.spawnAIChair();
                    } else {
                        room.aiChair = null;
                    }

                    room.pushTranscript({
                        kind: 'system',
                        content: `Host is now ${next === 'chair' ? 'chairing' : 'participating as a delegate (AI chair presiding)'}.`
                    });
                    broadcastState(room);
                    return;
                }

                case 'toggle-present': {
                    const room = getRoom();
                    if (!room) return;
                    const d = room.delegates.find(x => x.id === conn().sessionId);
                    if (!d) return;
                    d.present = !d.present;
                    broadcastState(room);
                    return;
                }

                case 'ai-fill-toggle': {
                    const room = getRoom();
                    if (!room || !isHost(room)) return;
                    room.aiSettings.enabled = !room.aiSettings.enabled;
                    if (!room.aiSettings.enabled) {
                        const removed = room.removeAllAIDelegates();
                        if (removed) room.pushTranscript({ kind: 'system', content: 'AI delegates removed' });
                    }
                    broadcastState(room);
                    return;
                }

                case 'ai-target-size': {
                    const room = getRoom();
                    if (!room || !isHost(room)) return;
                    const target = Math.max(3, Math.min(MAX_DELEGATES, Number(msg.size) || 6));
                    room.aiSettings.targetSize = target;
                    broadcastState(room);
                    return;
                }

                case 'speak-request': {
                    const room = getRoom();
                    if (!room || room.phase !== 'session') return;
                    if (room.queue.find(q => q.id === conn().sessionId)) return;
                    const d = room.delegates.find(x => x.id === conn().sessionId);
                    if (!d) return;
                    room.queue.push({ id: d.id, name: d.name, country: d.country, ts: Date.now() });
                    room.pushTranscript({ kind: 'system', content: `${d.name} requests the floor` });
                    broadcastState(room);
                    return;
                }

                case 'cancel-speak': {
                    const room = getRoom();
                    if (!room) return;
                    room.queue = room.queue.filter(q => q.id !== conn().sessionId);
                    broadcastState(room);
                    return;
                }

                case 'next-speaker': {
                    const room = getRoom();
                    if (!room || !isHost(room)) return;
                    if (!room.queue.length) room.currentSpeaker = null;
                    else {
                        const next = room.queue.shift();
                        room.currentSpeaker = { ...next, startedAt: Date.now(), duration: 60 };
                        room.pushTranscript({ kind: 'system', content: `${next.name} now has the floor` });
                    }
                    broadcastState(room);
                    return;
                }

                case 'end-speaker': {
                    const room = getRoom();
                    if (!room) return;
                    const isSelf = room.currentSpeaker?.id === conn().sessionId;
                    if (!isHost(room) && !isSelf) return;
                    room.currentSpeaker = null;
                    broadcastState(room);
                    return;
                }

                case 'propose-motion': {
                    const room = getRoom();
                    if (!room || room.phase !== 'session') return;
                    const d = room.delegates.find(x => x.id === conn().sessionId);
                    if (!d) return;
                    const text = String(msg.text || '').slice(0, 300).trim();
                    if (!text) return;
                    const motion = {
                        id: newId(), kind: msg.kind || 'generic',
                        by: { id: d.id, name: d.name, country: d.country },
                        text, status: 'pending', ts: Date.now()
                    };
                    room.motions.push(motion);
                    room.pushTranscript({ kind: 'motion', from: d.name, content: `${d.name} moved: ${text}` });
                    broadcastState(room);
                    return;
                }

                case 'rule-motion': {
                    const room = getRoom();
                    if (!room) return;
                    const humanIsChair = room.roleMode === 'chair' && isHost(room);
                    if (!humanIsChair) return;
                    const m = room.motions.find(x => x.id === msg.motionId);
                    if (!m || !['passed', 'failed', 'tabled'].includes(msg.decision)) return;
                    m.status = msg.decision;
                    room.pushTranscript({ kind: 'system', content: `Motion ${m.status}: ${m.text}` });
                    broadcastState(room);
                    return;
                }

                case 'start-vote': {
                    const room = getRoom();
                    if (!room) return;
                    const humanIsChair = room.roleMode === 'chair' && isHost(room);
                    if (!humanIsChair) return;
                    const text = String(msg.text || '').slice(0, 300).trim();
                    if (!text) return err('Vote needs a question');
                    room.vote = {
                        id: newId(), text, phase: 'open',
                        votes: { yes: [], no: [], abstain: [] },
                        pendingAIVotes: [], ts: Date.now(), result: null
                    };
                    room.pushTranscript({ kind: 'system', content: `Vote opened: ${text}` });
                    aiDirector.scheduleAIVotes(room);
                    broadcastState(room);
                    return;
                }

                case 'cast-vote': {
                    const room = getRoom();
                    if (!room || !room.vote || room.vote.phase !== 'open') return;
                    const d = room.delegates.find(x => x.id === conn().sessionId);
                    if (!d || !['yes', 'no', 'abstain'].includes(msg.vote)) return;
                    for (const k of ['yes', 'no', 'abstain']) {
                        room.vote.votes[k] = room.vote.votes[k].filter(x => x.id !== d.id);
                    }
                    room.vote.votes[msg.vote].push({ id: d.id, name: d.name, country: d.country });
                    broadcastState(room);
                    return;
                }

                case 'close-vote': {
                    const room = getRoom();
                    if (!room || !room.vote) return;
                    const humanIsChair = room.roleMode === 'chair' && isHost(room);
                    if (!humanIsChair) return;
                    room.vote.phase = 'closed';
                    const y = room.vote.votes.yes.length;
                    const n = room.vote.votes.no.length;
                    const a = room.vote.votes.abstain.length;
                    const passed = y + n > 0 ? y > n : false;
                    room.vote.result = { yes: y, no: n, abstain: a, passed };
                    room.pushTranscript({
                        kind: 'system',
                        content: `Vote closed — ${y} in favour, ${n} against, ${a} abstaining. ${passed ? 'PASSED' : 'FAILED'}`
                    });
                    broadcastState(room);
                    room.snapshotNow();
                    return;
                }

                case 'chat': {
                    const room = getRoom();
                    if (!room) return;
                    const d = room.delegates.find(x => x.id === conn().sessionId);
                    if (!d) return;
                    if (room.typingUsers && room.typingUsers[d.id]) {
                        delete room.typingUsers[d.id];
                    }
                    const text = String(msg.text || '').slice(0, 500).trim();
                    if (!text) return;
                    room.pushTranscript({ kind: 'chat', from: d.name, country: d.country, content: text });
                    broadcastState(room);
                    return;
                }

                case 'end-session': {
                    const room = getRoom();
                    if (!room || !isHost(room)) return;
                    room.phase = 'ended';
                    room.pushTranscript({ kind: 'system', content: 'Session ended by host' });
                    broadcastState(room);
                    room.snapshotNow();
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
            const c = manager.connections.get(ws);
            manager.ipConnections.set(ip, Math.max(0, (manager.ipConnections.get(ip) || 1) - 1));
            if (!c?.roomCode) { manager.connections.delete(ws); return; }
            const room = manager.getRoom(c.roomCode);
            manager.connections.delete(ws);
            if (!room) return;
            if (room.sockets.get(c.sessionId) !== ws) return;
            room.sockets.delete(c.sessionId);

            setTimeout(() => {
                const r = manager.getRoom(c.roomCode);
                if (!r || r.sockets.has(c.sessionId)) return;
                const d = r.delegates.find(x => x.id === c.sessionId);
                if (!d) return;
                r.removeDelegate(c.sessionId);
                r.pushTranscript({ kind: 'system', content: `${d.name} disconnected` });
                transferHost(r);
                broadcastState(r);
            }, DISCONNECT_GRACE_MS);
        });
    });

    const heartbeat = setInterval(() => {
        wss.clients.forEach(ws => {
            if (ws.isAlive === false) return ws.terminate();
            ws.isAlive = false;
            try { ws.ping(); } catch { }
        });
    }, HEARTBEAT_MS);
    wss.on('close', () => clearInterval(heartbeat));

    return { wss, manager };
}