/**
 * Author API — lesson and scenario content management.
 *
 * Access model:
 *   Every request carries the same Supabase bearer token as the educator
 *   routes. After verifying the token, we check the caller's email against
 *   AUTHOR_EMAILS (comma-separated allowlist). Non-authors get 403.
 *
 * Content cache:
 *   Custom lessons and scenarios are cached in memory. Author writes
 *   invalidate the cache immediately. Public reads (/api/content/*) are
 *   served from the cache; the client uses those to hydrate the app.
 */

import express from 'express';
import fetch from 'node-fetch';

function cfg() {
    return {
        url: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
        anon: (process.env.SUPABASE_ANON_KEY || '').trim(),
        service: (process.env.SUPABASE_SERVICE_KEY || '').trim()
    };
}

function authors() {
    return String(process.env.AUTHOR_EMAILS || '')
        .split(',')
        .map(s => s.trim().toLowerCase())
        .filter(Boolean);
}

function isEnabled() {
    const c = cfg();
    return !!(c.url && c.anon && c.service && authors().length);
}

function isAuthor(email) {
    if (!email) return false;
    return authors().includes(String(email).toLowerCase());
}

/* ------------------------------------------------------------------ */
/* Supabase helpers                                                    */
/* ------------------------------------------------------------------ */

async function sbFetch(path, opts = {}) {
    const { url, service } = cfg();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        return await fetch(`${url}/rest/v1${path}`, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                'apikey': service,
                'Authorization': `Bearer ${service}`,
                ...(opts.headers || {})
            },
            signal: ctrl.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function sbJson(path, opts = {}) {
    const res = await sbFetch(path, { ...opts, headers: { 'Prefer': '', ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

async function sbWrite(path, opts = {}) {
    const res = await sbFetch(path, { ...opts, headers: { 'Prefer': 'return=representation', ...(opts.headers || {}) } });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text()).slice(0, 200)}`);
    return res.json();
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

async function verifyUser(req) {
    const header = req.headers['authorization'] || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;
    const { url, anon } = cfg();
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try {
            const res = await fetch(`${url}/auth/v1/user`, {
                headers: { 'apikey': anon, 'Authorization': `Bearer ${token}` },
                signal: ctrl.signal
            });
            if (!res.ok) return null;
            const u = await res.json();
            if (!u || !u.id) return null;
            return { id: u.id, email: u.email || '' };
        } finally {
            clearTimeout(timer);
        }
    } catch { return null; }
}

/* ------------------------------------------------------------------ */
/* Content cache                                                       */
/* ------------------------------------------------------------------ */

const cache = {
    lessons: [],
    scenarios: [],
    loadedAt: 0,
    loading: null
};

async function refreshCache() {
    if (!cfg().url || !cfg().service) return cache;
    if (cache.loading) return cache.loading;
    cache.loading = (async () => {
        try {
            const [lessons, scenarios] = await Promise.all([
                sbJson('/custom_lessons?select=slug,level,title,description,content&order=created_at.asc'),
                sbJson('/custom_scenarios?select=scenario_key,name,description,data&order=created_at.asc')
            ]);
            cache.lessons = lessons.map(r => ({
                id: r.slug,
                level: r.level,
                title: r.title,
                desc: r.description || '',
                content: r.content || '',
                custom: true
            }));
            cache.scenarios = scenarios.map(r => ({
                ...(r.data || {}),
                key: r.scenario_key,
                name: r.name || (r.data && r.data.name) || 'Untitled',
                description: r.description || (r.data && r.data.description) || '',
                custom: true
            }));
            cache.loadedAt = Date.now();
        } catch (err) {
            console.warn('[author] cache refresh failed:', err.message);
        } finally {
            cache.loading = null;
        }
        return cache;
    })();
    return cache.loading;
}

/* ------------------------------------------------------------------ */
/* Validation                                                          */
/* ------------------------------------------------------------------ */

function cleanSlug(s) {
    return String(s || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9-]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 80);
}

function validateLesson(body) {
    const level = ['Beginner', 'Intermediate', 'Advanced'].includes(body?.level)
        ? body.level : 'Beginner';
    const title = String(body?.title || '').trim().slice(0, 200);
    const desc = String(body?.description || '').trim().slice(0, 400);
    const content = String(body?.content || '').slice(0, 20000);
    const slug = cleanSlug(body?.slug || title);
    if (!title) return { error: 'Title is required.' };
    if (!slug) return { error: 'Could not generate a slug — use letters and numbers.' };
    return { value: { slug, level, title, description: desc, content } };
}

const VALID_CRISIS_TYPES = ['info', 'urgent', 'adversarial', 'opportunity'];
const VALID_SEVERITY = ['low', 'medium', 'high', 'critical'];

function validateScenario(body) {
    if (!body || typeof body !== 'object') return { error: 'Scenario must be an object.' };
    const key = cleanSlug(body.key || body.name);
    if (!key) return { error: 'Scenario needs a key (letters and numbers).' };
    const name = String(body.name || '').trim().slice(0, 120);
    if (!name) return { error: 'Scenario needs a name.' };
    const description = String(body.description || '').trim().slice(0, 400);
    const events = Array.isArray(body.events) ? body.events : [];
    if (!events.length) return { error: 'Scenario needs at least one event.' };
    if (events.length > 30) return { error: 'Cap is 30 events per scenario.' };

    for (let i = 0; i < events.length; i++) {
        const e = events[i];
        if (!e || typeof e !== 'object') return { error: `Event ${i + 1} must be an object.` };
        if (!e.id) return { error: `Event ${i + 1} needs an id.` };
        if (!e.title) return { error: `Event ${i + 1} needs a title.` };
        if (!VALID_CRISIS_TYPES.includes(e.type)) {
            return { error: `Event ${i + 1}: type must be one of ${VALID_CRISIS_TYPES.join(', ')}.` };
        }
        if (!VALID_SEVERITY.includes(e.severity)) {
            return { error: `Event ${i + 1}: severity must be one of ${VALID_SEVERITY.join(', ')}.` };
        }
        if (!Array.isArray(e.options) || !e.options.length) {
            return { error: `Event ${i + 1} needs at least one option.` };
        }
        for (let j = 0; j < e.options.length; j++) {
            const o = e.options[j];
            if (!o || !o.key || !o.text) {
                return { error: `Event ${i + 1}, option ${j + 1} needs a key and text.` };
            }
        }
    }

    const data = {
        key, name, description,
        events: events.map(e => ({
            id: String(e.id).slice(0, 60),
            title: String(e.title).slice(0, 200),
            description: String(e.description || '').slice(0, 800),
            type: e.type,
            severity: e.severity,
            minTurn: Math.max(0, Number(e.minTurn) || 0),
            triggersOn: Array.isArray(e.triggersOn) && e.triggersOn.length
                ? e.triggersOn.filter(t => ['ROLL_CALL', 'GSL', 'MOD_CAUCUS', 'UNMOD_CAUCUS', 'RESOLUTION_DEBATE'].includes(t))
                : ['GSL', 'MOD_CAUCUS'],
            responseWindow: Number(e.responseWindow) || 0,
            aiReactions: e.aiReactions !== false,
            options: e.options.map(o => ({
                key: String(o.key).slice(0, 40),
                text: String(o.text).slice(0, 200),
                effects: Array.isArray(o.effects) ? o.effects : []
            }))
        }))
    };

    return { value: { key, name, description, data } };
}

/* ------------------------------------------------------------------ */
/* Router                                                             */
/* ------------------------------------------------------------------ */

export function attachAuthorRoutes(app) {
    /* Public content endpoints — no auth. Served from cache. */
    app.get('/api/content/lessons', async (req, res) => {
        try {
            if (!cache.loadedAt) await refreshCache();
            res.json({ lessons: cache.lessons });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    app.get('/api/content/scenarios', async (req, res) => {
        try {
            if (!cache.loadedAt) await refreshCache();
            res.json({ scenarios: cache.scenarios });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    const router = express.Router();

    router.use(async (req, res, next) => {
        if (!isEnabled()) {
            return res.status(503).json({
                error: 'Content authoring is not configured on the server. Set AUTHOR_EMAILS in .env.'
            });
        }
        const user = await verifyUser(req);
        if (!user) return res.status(401).json({ error: 'Not signed in.' });
        if (!isAuthor(user.email)) return res.status(403).json({ error: 'You are not on the author allowlist.' });
        req.user = user;
        next();
    });

    /* ----- GET /me ----- */
    router.get('/me', (req, res) => {
        res.json({
            user: req.user,
            authorEmails: authors()
        });
    });

    /* ----- LESSONS ----- */

    router.get('/lessons', async (req, res) => {
        try {
            const rows = await sbJson('/custom_lessons?select=*&order=created_at.asc');
            res.json({ lessons: rows });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/lessons', async (req, res) => {
        try {
            const v = validateLesson(req.body);
            if (v.error) return res.status(400).json({ error: v.error });

            const existing = await sbJson(`/custom_lessons?slug=eq.${encodeURIComponent(v.value.slug)}&select=id`);
            if (existing.length) {
                return res.status(409).json({ error: 'A lesson with that slug already exists.' });
            }

            const rows = await sbWrite('/custom_lessons', {
                method: 'POST',
                body: JSON.stringify([{
                    ...v.value,
                    author_id: req.user.id,
                    author_email: req.user.email
                }])
            });
            await refreshCache();
            res.json({ lesson: rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/lessons/:id', async (req, res) => {
        try {
            const v = validateLesson(req.body);
            if (v.error) return res.status(400).json({ error: v.error });
            const rows = await sbWrite(`/custom_lessons?id=eq.${req.params.id}`, {
                method: 'PATCH',
                body: JSON.stringify(v.value)
            });
            await refreshCache();
            res.json({ lesson: rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/lessons/:id', async (req, res) => {
        try {
            await sbFetch(`/custom_lessons?id=eq.${req.params.id}`, { method: 'DELETE' });
            await refreshCache();
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ----- SCENARIOS ----- */

    router.get('/scenarios', async (req, res) => {
        try {
            const rows = await sbJson('/custom_scenarios?select=*&order=created_at.asc');
            res.json({ scenarios: rows });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.post('/scenarios', async (req, res) => {
        try {
            const v = validateScenario(req.body);
            if (v.error) return res.status(400).json({ error: v.error });

            const existing = await sbJson(`/custom_scenarios?scenario_key=eq.${encodeURIComponent(v.value.key)}&select=id`);
            if (existing.length) {
                return res.status(409).json({ error: 'A scenario with that key already exists.' });
            }

            const rows = await sbWrite('/custom_scenarios', {
                method: 'POST',
                body: JSON.stringify([{
                    scenario_key: v.value.key,
                    name: v.value.name,
                    description: v.value.description,
                    data: v.value.data,
                    author_id: req.user.id,
                    author_email: req.user.email
                }])
            });
            await refreshCache();
            res.json({ scenario: rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.put('/scenarios/:id', async (req, res) => {
        try {
            const v = validateScenario(req.body);
            if (v.error) return res.status(400).json({ error: v.error });
            const rows = await sbWrite(`/custom_scenarios?id=eq.${req.params.id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    scenario_key: v.value.key,
                    name: v.value.name,
                    description: v.value.description,
                    data: v.value.data
                })
            });
            await refreshCache();
            res.json({ scenario: rows[0] });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    router.delete('/scenarios/:id', async (req, res) => {
        try {
            await sbFetch(`/custom_scenarios?id=eq.${req.params.id}`, { method: 'DELETE' });
            await refreshCache();
            res.json({ ok: true });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ----- EXPORT ----- */

    router.get('/export', async (req, res) => {
        try {
            const [lessons, scenarios] = await Promise.all([
                sbJson('/custom_lessons?select=*'),
                sbJson('/custom_scenarios?select=*')
            ]);
            const payload = {
                __munai_content: true,
                version: 1,
                exportedAt: new Date().toISOString(),
                lessons,
                scenarios
            };
            res.setHeader('Content-Type', 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="munai-content-${new Date().toISOString().slice(0, 10)}.json"`);
            res.send(JSON.stringify(payload, null, 2));
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ----- IMPORT ----- */

    router.post('/import', async (req, res) => {
        try {
            const payload = req.body || {};
            const lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
            const scenarios = Array.isArray(payload.scenarios) ? payload.scenarios : [];
            let created = { lessons: 0, scenarios: 0, skipped: 0 };

            for (const l of lessons) {
                const v = validateLesson(l);
                if (v.error) { created.skipped++; continue; }
                const existing = await sbJson(`/custom_lessons?slug=eq.${encodeURIComponent(v.value.slug)}&select=id`);
                if (existing.length) { created.skipped++; continue; }
                await sbWrite('/custom_lessons', {
                    method: 'POST',
                    body: JSON.stringify([{
                        ...v.value,
                        author_id: req.user.id,
                        author_email: req.user.email
                    }])
                });
                created.lessons++;
            }

            for (const s of scenarios) {
                const v = validateScenario(s.data || s);
                if (v.error) { created.skipped++; continue; }
                const existing = await sbJson(`/custom_scenarios?scenario_key=eq.${encodeURIComponent(v.value.key)}&select=id`);
                if (existing.length) { created.skipped++; continue; }
                await sbWrite('/custom_scenarios', {
                    method: 'POST',
                    body: JSON.stringify([{
                        scenario_key: v.value.key,
                        name: v.value.name,
                        description: v.value.description,
                        data: v.value.data,
                        author_id: req.user.id,
                        author_email: req.user.email
                    }])
                });
                created.scenarios++;
            }

            await refreshCache();
            res.json({ created });
        } catch (err) { res.status(500).json({ error: err.message }); }
    });

    /* ----- STATUS ----- */
    router.get('/status', (req, res) => {
        res.json({
            cacheLoadedAt: cache.loadedAt,
            lessonCount: cache.lessons.length,
            scenarioCount: cache.scenarios.length
        });
    });

    app.use('/api/author', router);
    return router;
}