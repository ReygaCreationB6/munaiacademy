import { loadSupabase } from './supabase.js';

let currentUser = null;
let initialized = false;
let available = false;
const subs = new Set();

/* Isolate subscribers — a throw in one must not stop the rest. */
function notify() {
    // Iterate a snapshot so subscribers can subscribe/unsubscribe during notify.
    const list = [...subs];
    for (const fn of list) {
        try { fn(currentUser); } catch (err) { console.error('[auth subscriber]', err); }
    }
}

export const auth = {
    /** True if Supabase is configured on the server. */
    isAvailable: () => available,

    /** Current user object, or null. */
    getUser: () => currentUser,

    /** Shorthand. */
    isSignedIn: () => !!currentUser,

    /** Subscribe to auth changes. Returns an unsubscribe function. */
    subscribe(fn) {
        subs.add(fn);
        // Fire immediately with current state. Wrap so a throwing subscriber
        // doesn't break subscribe() itself.
        try { fn(currentUser); } catch (err) { console.error('[auth subscriber]', err); }
        return () => { subs.delete(fn); };
    },

    /**
     * Boot the auth subsystem. Safe to call before Supabase is configured —
     * it will resolve to "no user, not available".
     */
    async init() {
        if (initialized) return currentUser;
        initialized = true;

        try {
            const sb = await loadSupabase();
            available = true;

            const { data } = await sb.auth.getSession();
            currentUser = data?.session?.user || null;
            notify();

            sb.auth.onAuthStateChange((_event, session) => {
                currentUser = session?.user || null;
                notify();
            });
        } catch (err) {
            // Not being able to reach Supabase is not an error — the app runs
            // in local-only mode.
            console.info('[auth] Supabase unavailable:', err?.message || err);
            available = false;
            currentUser = null;
            notify();
        }
        return currentUser;
    },

    async signUp(email, password) {
        const sb = await loadSupabase();
        const { data, error } = await sb.auth.signUp({ email, password });
        if (error) throw error;

        // If the project requires email confirmation, Supabase returns a user
        // with a null session. Any other combination implies an immediate sign-in.
        const needsConfirmation = !!(data?.user && !data?.session);
        if (!needsConfirmation) {
            currentUser = data?.user || null;
            notify();
        }
        return { needsConfirmation, user: data?.user || null };
    },

    async signIn(email, password) {
        const sb = await loadSupabase();
        const { data, error } = await sb.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (!data?.user) throw new Error('Sign-in succeeded but no user was returned.');
        currentUser = data.user;
        notify();
        return data;
    },

    async signInWithMagicLink(email) {
        const sb = await loadSupabase();
        const { error } = await sb.auth.signInWithOtp({
            email,
            options: { emailRedirectTo: window.location.origin }
        });
        if (error) throw error;
        return true;
    },

    async signOut() {
        const sb = await loadSupabase();
        try {
            await sb.auth.signOut();
        } catch (err) {
            // Even if Supabase rejects the sign-out (network), clear local state
            // so the user isn't stuck signed in.
            console.warn('[auth] sign out error:', err?.message || err);
        }
        currentUser = null;
        notify();
    }
};