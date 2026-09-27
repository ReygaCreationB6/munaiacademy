/**
 * Lazy-loaded Supabase client.
 *
 * The Supabase JS SDK is fetched from jsDelivr the first time it's needed,
 * so the app remains lightweight for users who never sign in.
 *
 * Config (URL + anon key) is read from /api/config on the server, which
 * pulls it from .env. Nothing is hardcoded in the browser bundle.
 */

let client = null;
let config = null;
let loadPromise = null;

const CONFIG_TIMEOUT_MS = 10_000;
const SUPABASE_CDN = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

/** fetch with an AbortController timeout — prevents a hung /api/config. */
async function fetchWithTimeout(url, opts = {}, timeoutMs = CONFIG_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        return await fetch(url, { ...opts, signal: ctrl.signal });
    } catch (err) {
        if (err?.name === 'AbortError') throw new Error('Timed out fetching server config.');
        throw err;
    } finally {
        clearTimeout(timer);
    }
}

export async function loadSupabase() {
    if (client) return client;
    if (loadPromise) return loadPromise;

    loadPromise = (async () => {
        const r = await fetchWithTimeout('/api/config', { cache: 'no-store' });
        if (!r.ok) throw new Error('Could not load server config.');
        const cfg = await r.json();

        if (cfg.supabaseProblem === 'missing-url') {
            throw new Error('Supabase URL is missing from the server .env file.');
        }
        if (cfg.supabaseProblem === 'malformed-url') {
            throw new Error(
                `Supabase URL is malformed: "${cfg.supabaseUrl}". ` +
                `Expected format: https://your-project-ref.supabase.co (no quotes, no trailing slash).`
            );
        }
        if (cfg.supabaseProblem === 'missing-key') {
            throw new Error('Supabase anon key is missing from the server .env file.');
        }
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
            throw new Error('Supabase is not configured on the server.');
        }

        const url = String(cfg.supabaseUrl).trim().replace(/\/+$/, '');
        const key = String(cfg.supabaseAnonKey).trim();

        config = { supabaseUrl: url, supabaseAnonKey: key };

        const mod = await import(/* @vite-ignore */ SUPABASE_CDN);
        client = mod.createClient(url, key, {
            auth: {
                persistSession: true,
                autoRefreshToken: true,
                detectSessionInUrl: true
            }
        });
        return client;
    })();

    try {
        return await loadPromise;
    } catch (err) {
        // Allow the next caller to retry — don't cache a rejected promise.
        loadPromise = null;
        throw err;
    }
}

export function isSupabaseAvailable() {
    return !!(config?.supabaseUrl && config?.supabaseAnonKey);
}

export function getSupabaseConfig() {
    return config;
}