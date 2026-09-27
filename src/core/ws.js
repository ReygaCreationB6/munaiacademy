/**
 * Client WebSocket wrapper with auto-reconnect and room re-join.
 * One shared instance for the whole app.
 *
 * Design notes:
 *   • Connection is idempotent — multiple concurrent connect() calls
 *     resolve to the same socket.
 *   • Auto-reconnect uses exponential backoff with a cap.
 *   • After MAX consecutive failures the client enters "dormant" mode:
 *     further connect() calls still try, but the auto-retry stops.
 *     This prevents an idle tab from spamming a dead server.
 *   • Listeners are deduplicated — registering the same function twice
 *     is a no-op the second time.
 */

const RECONNECT_BASE_MS = 500;
const RECONNECT_MAX_MS = 30_000;
const RECONNECT_ATTEMPTS = 12;
const QUEUE_MAX = 100;

class WSClient {
    constructor() {
        this.ws = null;
        this.url = null;
        this.sessionId = null;
        this.connected = false;
        this.listeners = new Map();
        this.queue = [];
        this.reconnectAttempts = 0;
        this.manualClose = false;
        this.currentRoom = null;   // { code, name, country }
        this._connecting = null;   // Promise<null> while a connect is in flight
    }

    /* ---------------- connection ---------------- */

    connect() {
        // Already open
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            return Promise.resolve();
        }
        // Already connecting — reuse the in-flight promise
        if (this._connecting) return this._connecting;
        // A CLOSING socket: wait for close, then retry
        if (this.ws && this.ws.readyState === WebSocket.CLOSING) {
            return new Promise((resolve) => {
                const onClose = () => {
                    this.ws?.removeEventListener?.('close', onClose);
                    resolve(this.connect());
                };
                this.ws.addEventListener('close', onClose, { once: true });
            });
        }

        const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
        this.url = `${proto}//${location.host}/ws`;
        this.manualClose = false;

        if (!this.sessionId) {
            let sid = localStorage.getItem('munai.ws.sid');
            if (!sid) {
                sid = 's_' + Math.random().toString(36).slice(2) + Date.now().toString(36);
                try { localStorage.setItem('munai.ws.sid', sid); } catch { }
            }
            this.sessionId = sid;
        }

        const p = new Promise((resolve, reject) => {
            let settled = false;
            const settle = (fn, arg) => {
                if (settled) return;
                settled = true;
                this._connecting = null;
                fn(arg);
            };

            let ws;
            try {
                ws = new WebSocket(this.url);
            } catch (err) {
                settle(reject, err);
                return;
            }
            this.ws = ws;

            ws.addEventListener('open', () => {
                this.connected = true;
                this.reconnectAttempts = 0;
                try {
                    this._send({ type: 'hello', sessionId: this.sessionId });
                    if (this.currentRoom) this._send({ type: 'join-room', ...this.currentRoom });
                    while (this.queue.length) this._send(this.queue.shift());
                } catch (err) {
                    console.error('[ws] hello failed:', err);
                }
                this._emit('connected', {});
                settle(resolve);
            }, { once: true });

            ws.addEventListener('error', () => {
                settle(reject, new Error('Connection failed'));
            }, { once: true });

            ws.addEventListener('close', () => {
                // If close fires before open, treat as a connection failure.
                if (!this.connected) {
                    settle(reject, new Error('Connection closed before opening'));
                }
                this._handleClose();
            });

            ws.addEventListener('message', (e) => this._handleMessage(e));
        });

        this._connecting = p;
        // Swallow the rejection on the shared promise so a subsequent
        // connect() call doesn't get an "unhandled rejection" warning.
        p.catch(() => { });
        return p;
    }

    _handleMessage(e) {
        let msg;
        try { msg = JSON.parse(e.data); }
        catch { return; }
        this._emit(msg.type, msg);
        this._emit('*', msg);
    }

    _handleClose() {
        const wasConnected = this.connected;
        this.connected = false;
        this._connecting = null;

        if (wasConnected) this._emit('disconnected', {});
        if (this.manualClose) return;

        if (this.reconnectAttempts >= RECONNECT_ATTEMPTS) {
            // Enter dormant mode. Any manual connect() will reset the
            // counter, so user interaction still recovers.
            this._emit('reconnect-exhausted', {});
            return;
        }

        const delay = Math.min(
            RECONNECT_MAX_MS,
            RECONNECT_BASE_MS * Math.pow(2, this.reconnectAttempts)
        );
        this.reconnectAttempts++;
        setTimeout(() => {
            if (this.manualClose) return;
            this.connect().catch(() => { });
        }, delay);
    }

    /* ---------------- send ---------------- */

    _send(msg) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
        try {
            this.ws.send(JSON.stringify(msg));
            return true;
        } catch (err) {
            console.error('[ws] send failed:', err);
            return false;
        }
    }

    send(msg) {
        if (this._send(msg)) return;
        // Cap the queue so a broken connection can't grow it unbounded.
        if (this.queue.length >= QUEUE_MAX) this.queue.shift();
        this.queue.push(msg);
        this.connect().catch(() => { });
    }

    /* ---------------- listeners ---------------- */

    on(type, fn) {
        if (!this.listeners.has(type)) this.listeners.set(type, []);
        const list = this.listeners.get(type);
        if (list.includes(fn)) {
            // Already registered — return a no-op unsubscriber.
            return () => { };
        }
        list.push(fn);
        return () => this.off(type, fn);
    }

    off(type, fn) {
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
            try { fn(msg); } catch (err) { console.error('[ws listener]', err); }
        });
    }

    /* ---------------- room tracking ---------------- */

    setRoom(info) { this.currentRoom = info; }
    clearRoom() { this.currentRoom = null; }

    disconnect() {
        this.manualClose = true;
        try { this.ws?.close(); } catch { }
        this.ws = null;
        this.url = null;
        this._connecting = null;
        this.connected = false;
    }

    /** Manual reset — allows the app to recover from dormant mode. */
    reset() {
        this.reconnectAttempts = 0;
        this.manualClose = false;
    }
}

export const ws = new WSClient();