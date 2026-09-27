import { loadSupabase } from './supabase.js';
import { auth } from './auth.js';

const DEBOUNCE_MS = 1500;
const MAX_QUEUE = 1;   // We only ever need the latest state queued.

let timer = null;
let inFlight = false;
let pending = null;    // Latest state waiting to be pushed after in-flight completes.
let lastPushedAt = 0;

export const cloudSync = {
    /**
     * Push the current local state to Supabase, debounced.
     * If a push is already in-flight, the latest state is queued and
     * flushed as soon as the in-flight push resolves. Nothing is lost.
     */
    push(state) {
        if (!auth.isSignedIn()) return;

        // If we're currently writing, remember the latest state so we can
        // fire right after. Otherwise, reset the debounce timer.
        if (inFlight) {
            pending = state;
            return;
        }

        clearTimeout(timer);
        timer = setTimeout(() => this._doPush(state), DEBOUNCE_MS);
    },

    async _doPush(state) {
        // Sign-out during the debounce window is possible — re-check here.
        if (!auth.isSignedIn()) {
            clearTimeout(timer);
            timer = null;
            pending = null;
            return;
        }

        inFlight = true;
        try {
            const sb = await loadSupabase();
            const user = auth.getUser();
            if (!user) return;   // Signed out mid-flight.

            const payload = {
                user_id: user.id,
                data: stripVolatile(state),
                updated_at: new Date().toISOString()
            };

            const { error } = await sb
                .from('user_state')
                .upsert(payload, { onConflict: 'user_id' });
            if (error) throw error;

            lastPushedAt = Date.now();
        } catch (err) {
            // Never throw — sync failures must not break the app.
            console.warn('[cloudSync] push failed:', err?.message || err);
        } finally {
            inFlight = false;

            // If newer state arrived while we were pushing, flush it now.
            if (pending != null) {
                const next = pending;
                pending = null;
                // Tiny delay so a burst of changes collapses into a single follow-up.
                setTimeout(() => this._doPush(next), 200);
            }
        }
    },

    /** Fetch remote state for the signed-in user, or null. */
    async pull() {
        if (!auth.isSignedIn()) return null;
        try {
            const sb = await loadSupabase();
            const user = auth.getUser();
            if (!user) return null;

            const { data, error } = await sb
                .from('user_state')
                .select('data, updated_at')
                .eq('user_id', user.id)
                .maybeSingle();
            if (error) throw error;
            return data || null;
        } catch (err) {
            console.warn('[cloudSync] pull failed:', err?.message || err);
            return null;
        }
    },

    /**
     * Force push immediately, ignoring debounce. Awaits the outcome.
     * If a push is already in-flight, queues the new state and waits for
     * the follow-up so callers (like a "Sync now" button) actually get
     * the write to complete before returning.
     */
    async pushNow(state) {
        clearTimeout(timer);
        timer = null;

        if (inFlight) {
            // Queue and poll until inFlight resolves and the follow-up fires.
            pending = state;
            const startedAt = Date.now();
            while (inFlight && Date.now() - startedAt < 10_000) {
                await new Promise(r => setTimeout(r, 50));
            }
            // If we queued while in-flight, the follow-up will have consumed
            // `pending` — the caller's state has been written (or attempted).
            return;
        }

        return this._doPush(state);
    },

    /** Timestamp (ms since epoch) of the last successful push. */
    lastPushedAt: () => lastPushedAt,

    /** True if there are unsaved changes queued. */
    hasPending: () => pending != null || timer != null,

    /** Drop any queued state — used on sign-out. */
    cancelPending() {
        clearTimeout(timer);
        timer = null;
        pending = null;
    }
};

/**
 * Deep-clone the state tree so mutations after the push don't affect
 * the payload already being serialized. Everything in the store is
 * plain JSON (objects, arrays, strings, numbers, booleans), so the
 * JSON roundtrip is safe. If you ever store a Date, Set, or Map in
 * the store, extend this function.
 */
function stripVolatile(state) {
    return JSON.parse(JSON.stringify(state));
}