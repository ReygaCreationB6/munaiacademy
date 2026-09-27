const KEY = 'munai.state.v1';
const SCHEMA_VERSION = 2;

const defaults = {
    version: SCHEMA_VERSION,
    profile: { name: 'Delegate', experience: 'beginner' },
    conference: {
        committee: 'UNHRC',
        country: 'Chad',
        topic: 'Protecting Human Rights in the Face of Climate Change'
    },
    progress: {},
    xp: 0,
    conversations: {},
    speeches: [],
    positionPapers: [],
    resolutions: [],
    researchSessions: [],
    debateSessions: [],
    poiSessions: [],
    practiceScores: {},
    analyticsEvents: [],
    achievements: {                // ← add these two lines
        unlockedIds: [],
        unlockedAt: {}
    },
    aiConfig: {
        provider: 'proxy',
        baseUrl: '',
        apiKey: '',
        model: '',
        temperature: 0.7,
        maxTokens: 2048
    }
};

let state = load();
const subs = new Set();

/* ------------------------------------------------------------------ */
/* Loading                                                            */
/* ------------------------------------------------------------------ */

function load() {
    try {
        const raw = localStorage.getItem(KEY);
        if (!raw) return structuredClone(defaults);
        const parsed = JSON.parse(raw);
        const merged = deepMerge(structuredClone(defaults), parsed);
        return migrate(merged);
    } catch (err) {
        console.warn('[store] failed to load saved state, starting fresh:', err.message);
        return structuredClone(defaults);
    }
}

/** Deep merge b over a. Objects merge; arrays and primitives replace. */
function deepMerge(a, b) {
    if (!b || typeof b !== 'object') return a;
    for (const k of Object.keys(b)) {
        if (b[k] && typeof b[k] === 'object' && !Array.isArray(b[k])) {
            a[k] = deepMerge(a[k] || {}, b[k]);
        } else {
            a[k] = b[k];
        }
    }
    return a;
}

/** One-time migrations between schema versions. */
function migrate(s) {
    if (s.version === SCHEMA_VERSION) return s;
    // Example future migration hook:
    // if (s.version < 2) { s.someNewField = defaultValue; }
    s.version = SCHEMA_VERSION;
    persist(s);
    return s;
}

/* ------------------------------------------------------------------ */
/* Persistence                                                        */
/* ------------------------------------------------------------------ */

function persist(override) {
    try {
        localStorage.setItem(KEY, JSON.stringify(override || state));
    } catch (err) {
        // Quota exceeded or unavailable storage — log once.
        if (!persist._warned) {
            persist._warned = true;
            console.warn('[store] could not persist state:', err.message);
        }
    }
}

/* One-time sanitize on load: clear server-side credentials from client
   state when using the built-in proxy provider. */
(function sanitize() {
    const c = state.aiConfig;
    if (!c) return;
    if (c.provider === 'proxy' && (c.baseUrl || c.apiKey || c.model)) {
        c.baseUrl = '';
        c.apiKey = '';
        c.model = '';
        persist();
    }
})();

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export const store = {
    get: () => state,

    /** Snapshot — deep clone, safe to hand to third parties. */
    raw: () => JSON.parse(JSON.stringify(state)),

    /**
     * Shallow merge into top-level state. Nested objects are replaced,
     * not merged. This is intentional — it's how we support deletions.
     * If you need deep-merge for a nested object, spread it yourself:
     *   store.set({ conference: { ...store.get().conference, country } })
     */
    set(patch) {
        if (!patch || typeof patch !== 'object') return;
        state = { ...state, ...patch };
        persist();
        notify();
    },

    /** Replace the entire state. Deep-merges with defaults so future
     *  schema additions still land. Used by cloud restore. */
    replace(newState) {
        state = migrate(deepMerge(structuredClone(defaults), newState || {}));
        persist();
        notify();
    },

    /**
     * Mutate state via a callback. The callback receives the live state
     * object; changes persist on return. Use sparingly — `set` is
     * preferred for anything that can be expressed as a patch.
     */
    update(fn) {
        if (typeof fn !== 'function') return;
        fn(state);
        persist();
        notify();
    },

    subscribe(fn) {
        subs.add(fn);
        return () => subs.delete(fn);
    },

    reset() {
        state = structuredClone(defaults);
        persist();
        notify();
    }
};

function notify() {
    subs.forEach(fn => {
        try { fn(state); } catch (err) { console.error('[store subscriber]', err); }
    });
}