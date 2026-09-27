/**
 * Client wrapper for the shared simulation WebSocket.
 * Separate connection from the multiplayer rooms client.
 */

const RECONNECT_BASE_MS = 800;
const RECONNECT_MAX_MS = 20_000;
const RECONNECT_ATTEMPTS = 8;

class SharedSimClient {
    constructor() {
        this.ws = null;
        this.connected = false;
        this.sessionId = null;
        this.listeners = new Map();
        this.queue = [];
        this.reconnectAttempts = 0;
        this.manualClose = false;
        this.currentCode = null;
    }

    connect() {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) return Promise.resolve();
        if (this.ws && this.ws.readyState === WebSocket.CONNECTING) {
            return new Promise((resolve, reject) => {
                this.ws.addEventListener('open', () => resolve(), { once: true });
                this.ws.addEventListener('error', () => reject(new Error('connect failed')), { once: true });
            });
        }

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${proto}//${location.host}/ws/shared`;
        this.manualClose = false;

        if (!this.sessionId) {
            let sid = localStorage.getItem('munai.shared.sid');
            if (!sid) {
                sid = 'ss_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                try { localStorage.setItem('munai.shared.sid', sid); } catch { }
            }
            this.sessionId = sid;
        }

        return new Promise((resolve, reject) => {
            let ws;
            try { ws = new WebSocket(url); } catch (err) { return reject(err); }
            this.ws = ws;
            console.log('[sharedSim] connecting to', url);
            ws.addEventListener('open', () => console.log('[sharedSim] open'));
            ws.addEventListener('error', (e) => console.log('[sharedSim] error', e));
            ws.addEventListener('close', (e) => console.log('[sharedSim] close', e.code, e.reason));

            ws.addEventListener('open', () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                this._send({ type: 'hello', sessionId: this.sessionId });
                if (this.currentCode) {
                    this._send({ type: 'join-session', code: this.currentCode });
                }
                while (this.queue.length) this._send(this.queue.shift());
                this._emit('connected', {});
                resolve();
            }, { once: true });

            ws.addEventListener('error', () => reject(new Error('Connection failed')), { once: true });

            ws.addEventListener('message', (e) => {
                let msg;
                try { msg = JSON.parse(e.data); } catch { return; }
                this._emit(msg.type, msg);
            });

            ws.addEventListener('close', () => {
                this.connected = false;
                this._emit('disconnected', {});
                if (this.manualClose) return;
                if (this.reconnectAttempts >= RECONNECT_ATTEMPTS) return;
                const delay = Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts));
                this.reconnectAttempts++;
                setTimeout(() => this.connect().catch(() => { }), delay);
            });
        });
    }

    _send(msg) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        try {
            this.ws.send(JSON.stringify(msg));
            return true;
        } catch { return false; }
    }

    send(msg) {
        if (!this._send(msg)) {
            this.queue.push(msg);
            this.connect().catch(() => { });
        }
    }

    on(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        const list = this.listeners.get(type);
        if (list.includes(fn)) return () => { };
        list.push(fn);
        return () => this._off(type, fn);
    }

    _off(type, fn) {
        const list = this.listeners.get(type);
        if (!list) return;
        const i = list.indexOf(fn);
        if (i >= 0) list.splice(i, 1);
    }

    clearAll() {
        this.listeners.clear();
        this.queue = [];
    }

    _emit(type, msg) {
        const list = this.listeners.get(type);
        if (!list) return;
        list.slice().forEach(fn => {
            try { fn(msg); } catch (err) { console.error('[sharedSim listener]', err); }
        });
    }

    setCode(code) { this.currentCode = code; }
    clearCode() { this.currentCode = null; }

    disconnect() {
        this.manualClose = true;
        try { this.ws?.close(); } catch { }
        this.ws = null;
        this.connected = false;
    }
}

export const sharedSim = new SharedSimClient();