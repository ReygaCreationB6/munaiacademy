/**
 * Server-side room persistence.
 *
 * Uses the Supabase REST API with the service_role key, which bypasses
 * RLS. Nothing here should ever be exposed to the browser — the service
 * key is far more powerful than the anon key.
 *
 * All operations are best-effort: if Supabase isn't configured, or a
 * write fails, the caller continues with an in-memory room. Persistence
 * is durable-on-success, not load-bearing.
 *
 * Env vars are read at call time via `cfg()` — never cached at module load.
 */

import fetch from 'node-fetch';

const REQUEST_TIMEOUT_MS = 8000;

function cfg() {
    return {
        url: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
        key: (process.env.SUPABASE_SERVICE_KEY || '').trim()
    };
}

function isEnabled() {
    const c = cfg();
    return !!(c.url && c.key);
}

function headers() {
    const { key } = cfg();
    return {
        'Content-Type': 'application/json',
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Prefer': 'return=minimal'
    };
}

async function request(path, opts = {}) {
    const { url, key } = cfg();
    if (!url || !key) throw new Error('Supabase service role not configured');

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), REQUEST_TIMEOUT_MS);
    try {
        const res = await fetch(`${url}/rest/v1${path}`, {
            ...opts,
            headers: { ...headers(), ...(opts.headers || {}) },
            signal: ctrl.signal
        });
        return res;
    } finally {
        clearTimeout(timer);
    }
}

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export const persistence = {
    isEnabled,

    /** Insert-or-update a room by code. Best effort. */
    async saveRoom(snapshot) {
        if (!isEnabled()) return;
        try {
            const body = [{
                code: snapshot.code,
                name: snapshot.name,
                committee: snapshot.committee,
                topic: snapshot.topic,
                phase: snapshot.phase,
                host_id: snapshot.hostId,
                state: snapshot
            }];
            const res = await request('/rooms', {
                method: 'POST',
                headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
                body: JSON.stringify(body)
            });
            if (!res.ok) {
                const text = await res.text();
                console.warn('[persistence] saveRoom failed:', res.status, text.slice(0, 200));
            }
        } catch (err) {
            console.warn('[persistence] saveRoom error:', err.message);
        }
    },

    /** Fetch a single room's state, or null. */
    async loadRoom(code) {
        if (!isEnabled()) return null;
        try {
            const res = await request(
                `/rooms?code=eq.${encodeURIComponent(code)}&select=state`,
                { method: 'GET', headers: { 'Prefer': '' } }
            );
            if (!res.ok) return null;
            const rows = await res.json();
            if (!Array.isArray(rows) || !rows.length) return null;
            return rows[0].state || null;
        } catch (err) {
            console.warn('[persistence] loadRoom error:', err.message);
            return null;
        }
    },

    /** List open rooms for the lobby. Falls back to an empty list. */
    async listRooms(limit = 50) {
        if (!isEnabled()) return [];
        try {
            const res = await request(
                `/rooms?select=code,name,committee,topic,phase,state,updated_at` +
                `&phase=neq.ended&order=updated_at.desc&limit=${limit}`,
                { method: 'GET', headers: { 'Prefer': '' } }
            );
            if (!res.ok) return [];
            const rows = await res.json();
            if (!Array.isArray(rows)) return [];
            return rows.map(r => {
                const st = r.state || {};
                const humans = (st.delegates || []).length;
                const ai = (st.aiDelegates || []).length;
                return {
                    code: r.code,
                    name: r.name,
                    committee: r.committee,
                    topic: r.topic,
                    phase: r.phase,
                    delegateCount: humans + ai,
                    humanCount: humans,
                    aiCount: ai,
                    maxDelegates: st.maxDelegates || 20,
                    updatedAt: new Date(r.updated_at).getTime()
                };
            });
        } catch (err) {
            console.warn('[persistence] listRooms error:', err.message);
            return [];
        }
    },

    /** Delete a room. Best effort. */
    async deleteRoom(code) {
        if (!isEnabled()) return;
        try {
            await request(`/rooms?code=eq.${encodeURIComponent(code)}`, {
                method: 'DELETE',
                headers: { 'Prefer': '' }
            });
        } catch (err) {
            console.warn('[persistence] deleteRoom error:', err.message);
        }
    }
};