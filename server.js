// IMPORTANT: this must be the first import. `dotenv/config` calls
// dotenv.config() as a side effect of its own module evaluation, so
// process.env is populated before any other module in the graph runs.
import 'dotenv/config';

import express from 'express';
import fetch from 'node-fetch';
import path from 'path';
import http from 'http';
import helmet from 'helmet';
import rateLimit, { MemoryStore } from 'express-rate-limit';
import { fileURLToPath } from 'url';
import { attachWebSocket } from './server/ws.js';
import { attachEducatorRoutes } from './server/educator.js';
import { attachAuthorRoutes } from './server/author.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const SERVER_KEY = process.env.AI_API_KEY || '';
const SERVER_BASE = process.env.AI_BASE_URL || 'https://api.openai.com/v1';
const SERVER_MODEL = process.env.AI_MODEL || 'gpt-4o-mini';
const ALLOW_CLIENT_KEYS = (process.env.ALLOW_CLIENT_KEYS || 'true') === 'true';

const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 90000);
const AI_RETRIES = Number(process.env.AI_RETRY_ATTEMPTS || 2);

const BURST_BUILTIN = Number(process.env.AI_QUOTA_BURST_PER_MIN || 8);
const DAILY_BUILTIN = Number(process.env.AI_QUOTA_DAILY || 50);
const BURST_BYO = Number(process.env.AI_QUOTA_BURST_PER_MIN_BYO || 20);
const DAILY_BYO = Number(process.env.AI_QUOTA_DAILY_BYO || 500);

const IS_PROD = (process.env.NODE_ENV || 'development') === 'production';

/* ============================================================
   Reasoning-model handling
   ============================================================ */
const REASONING_MODEL_RE = /gpt-oss|^o[13](-|$)|deepseek-?r1|qwq|reasoning/i;
const REASONING_MIN_TOKENS = 16000;

function isReasoningModel(model) {
    return REASONING_MODEL_RE.test(String(model || ''));
}

function normalizeBody(body, resolvedModel, isServerKey) {
    const out = {};
    if (Array.isArray(body.messages)) out.messages = body.messages;
    out.model = String(body.model || resolvedModel || SERVER_MODEL).slice(0, 128);
    if (typeof body.temperature === 'number') out.temperature = body.temperature;
    if (typeof body.top_p === 'number') out.top_p = body.top_p;
    if (typeof body.stream === 'boolean') out.stream = body.stream;
    if (typeof body.n === 'number') out.n = body.n;
    if (body.stop) out.stop = body.stop;
    if (body.response_format) out.response_format = body.response_format;

    const maxTokensIn = body.maxTokens ?? body.max_tokens ?? body.max_completion_tokens;
    if (typeof maxTokensIn === 'number' && maxTokensIn > 0) {
        out.max_tokens = maxTokensIn;
    }

    if (!isServerKey) return out;
    if (!isReasoningModel(resolvedModel)) return out;

    const requested = Number(out.max_tokens || 0);
    out.max_tokens = Math.max(requested, REASONING_MIN_TOKENS);
    if (!out.reasoning_effort) out.reasoning_effort = 'low';
    return out;
}

/* ============================================================
   Sentry
   ============================================================ */
let Sentry = null;
if (process.env.SENTRY_DSN) {
    try {
        Sentry = await import('@sentry/node');
        Sentry.init({
            dsn: process.env.SENTRY_DSN,
            environment: process.env.NODE_ENV || 'development',
            tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0.1),
            beforeSend(event) {
                if (event.request?.url) event.request.url = event.request.url.split('?')[0];
                return event;
            }
        });
        console.log('✓ Sentry (server) enabled');
    } catch (err) {
        console.warn('Sentry server init failed:', err.message);
        Sentry = null;
    }
}

/* ============================================================
   Express
   ============================================================ */
const app = express();
if ((process.env.TRUST_PROXY || '') === '1') app.set('trust proxy', 1);

// FIX: Restored CSP but kept cross-origin resource policy relaxed.
// If you need to allow external scripts, add their domains to scriptSrc.
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net', 'https://browser.sentry-cdn.com'],
            styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
            fontSrc: ["'self'", 'https://fonts.gstatic.com', 'data:'],
            imgSrc: ["'self'", 'data:', 'blob:'],
            connectSrc: [
                "'self'", 'https://*.supabase.co', 'wss:',
                'https://api.groq.com', 'https://api.openai.com',
                'https://openrouter.ai', 'https://*.ingest.sentry.io'
            ],
            frameAncestors: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));

app.use(express.json({ limit: '2mb' }));

// Serve static files from 'public'
app.use(express.static(path.join(__dirname, 'public'), {
    maxAge: IS_PROD ? '1h' : 0,
    setHeaders(res, filePath) {
        if (filePath.endsWith('.webmanifest')) res.setHeader('Content-Type', 'application/manifest+json');
        if (filePath.endsWith('sw.js')) res.setHeader('Cache-Control', 'no-cache');
    }
}));

// FIX: Serve the 'src' directory explicitly so CrisisDirector.js can be found
// if your HTML references it as `/src/CrisisDirector.js`
app.use('/src', express.static(path.join(__dirname, 'src'), { maxAge: IS_PROD ? '1h' : 0 }));

// Serve files from the root directory (for index.html, favicon, etc.)
app.use(express.static(__dirname, { maxAge: IS_PROD ? '1h' : 0 }));

/* ============================================================
   Rate limiting (with named stores so /api/quota can read them)
   ============================================================ */
const isBYO = (req) => !!(req.headers['x-client-key'] && ALLOW_CLIENT_KEYS);
const keyFor = (req, byo) => (byo ? 'byo:' : 'ip:') + req.ip;

const burstStore = new MemoryStore();
const dailyStore = new MemoryStore();

function fmtDuration(sec) {
    if (!Number.isFinite(sec) || sec <= 0) return 'a moment';
    if (sec < 60) return `${Math.ceil(sec)} second${sec >= 2 ? 's' : ''}`;
    const m = Math.ceil(sec / 60);
    if (m < 60) return `${m} minute${m === 1 ? '' : 's'}`;
    const h = Math.floor(m / 60);
    const rm = m % 60;
    if (h < 24) return rm ? `${h} hour${h === 1 ? '' : 's'} ${rm} min` : `${h} hour${h === 1 ? '' : 's'}`;
    return `${Math.floor(h / 24)} days`;
}

const burstLimiter = rateLimit({
    store: burstStore,
    windowMs: 60 * 1000,
    max: (req) => isBYO(req) ? BURST_BYO : BURST_BUILTIN,
    keyGenerator: (req) => keyFor(req, isBYO(req)),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const resetAt = req.rateLimit?.resetTime;
        const resetIn = resetAt ? Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : 60;
        res.status(429).json({
            error: 'burst_quota_exceeded',
            message: `You're sending requests too quickly. Try again in ${fmtDuration(resetIn)}.`,
            resetIn
        });
    }
});

const dailyLimiter = rateLimit({
    store: dailyStore,
    windowMs: 24 * 60 * 60 * 1000,
    max: (req) => isBYO(req) ? DAILY_BYO : DAILY_BUILTIN,
    keyGenerator: (req) => keyFor(req, isBYO(req)),
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
        const resetAt = req.rateLimit?.resetTime;
        const resetIn = resetAt ? Math.max(0, Math.ceil((resetAt.getTime() - Date.now()) / 1000)) : 86400;
        res.status(429).json({
            error: 'daily_quota_exceeded',
            message: `Daily AI quota reached. Resets in ${fmtDuration(resetIn)}.`,
            hint: 'Bring your own API key in AI Settings for unlimited use.',
            resetIn
        });
    }
});

const readLimiter = rateLimit({
    windowMs: 60 * 1000, max: 120,
    standardHeaders: true, legacyHeaders: false,
    message: { error: 'rate_limited' }
});

/* ============================================================
   Error sanitization
   ============================================================ */
const SAFE_ERROR_PATTERNS = [
    /rate.?limit/i, /quota/i, /too many requests/i,
    /invalid api key/i, /authentication/i, /unauthorized/i,
    /model.*(not found|does not exist)/i,
    /context length/i, /token/i, /timeout/i, /unavailable/i
];
function sanitizeUpstreamError(text, status) {
    const s = String(text || '').trim();
    for (const re of SAFE_ERROR_PATTERNS) if (re.test(s) && s.length < 300) return s;
    if (status === 401 || status === 403) return 'Upstream rejected the request — check your API key.';
    if (status === 404) return 'The selected model is unavailable.';
    if (status === 429) return 'Rate limit reached. Please wait and try again.';
    if (status >= 500) return 'The AI service is temporarily unavailable.';
    return 'AI request failed. Please try again.';
}

/* ============================================================
   Fetch helpers
   ============================================================ */
async function fetchWithTimeout(url, opts = {}, timeoutMs = AI_TIMEOUT_MS) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try { return await fetch(url, { ...opts, signal: ctrl.signal }); }
    finally { clearTimeout(timer); }
}

async function fetchWithRetry(url, opts = {}, { attempts = AI_RETRIES, timeoutMs = AI_TIMEOUT_MS } = {}) {
    let lastErr;
    for (let i = 0; i <= attempts; i++) {
        try {
            const res = await fetchWithTimeout(url, opts, timeoutMs);
            if ((res.status === 429 || res.status >= 500) && i < attempts) {
                await new Promise(r => setTimeout(r, Math.min(8000, 400 * Math.pow(2, i))));
                continue;
            }
            return res;
        } catch (err) {
            lastErr = err;
            if (err.name === 'AbortError') lastErr = new Error('Request timed out.');
            if (i < attempts) {
                await new Promise(r => setTimeout(r, 400 * Math.pow(2, i)));
                continue;
            }
        }
    }
    throw lastErr || new Error('Upstream request failed.');
}

/* ============================================================
   Config + health + quota
   ============================================================ */

app.get('/api/config', readLimiter, (req, res) => {
    const clean = s => String(s || '').trim().replace(/^["']|["']$/g, '').replace(/\s+/g, '');
    const supabaseUrl = clean(process.env.SUPABASE_URL).replace(/\/+$/, '');
    const supabaseAnonKey = clean(process.env.SUPABASE_ANON_KEY);
    const looksValid = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(supabaseUrl);
    res.json({
        supabaseUrl, supabaseAnonKey,
        supabaseConfigured: looksValid && supabaseAnonKey.length > 20,
        supabaseProblem: !supabaseUrl ? 'missing-url'
            : !looksValid ? 'malformed-url'
                : !supabaseAnonKey ? 'missing-key'
                    : null,
        siteName: process.env.SITE_NAME || 'MUN AI Academy',
        contactEmail: process.env.CONTACT_EMAIL || '',
        sentryBrowserDsn: process.env.SENTRY_BROWSER_DSN || '',
        defaultModel: SERVER_MODEL,
        isReasoningModel: isReasoningModel(SERVER_MODEL),
        quotas: { burst: BURST_BUILTIN, daily: DAILY_BUILTIN }
    });
});

app.get('/api/health', readLimiter, (req, res) => {
    res.json({
        ok: true,
        env: process.env.NODE_ENV || 'development',
        hasServerKey: !!SERVER_KEY,
        allowClientKeys: ALLOW_CLIENT_KEYS,
        defaultModel: SERVER_MODEL,
        isReasoningModel: isReasoningModel(SERVER_MODEL),
        serverBase: SERVER_BASE,
        hasSupabase: !!(process.env.SUPABASE_URL && process.env.SUPABASE_ANON_KEY),
        hasSentry: !!process.env.SENTRY_DSN
    });
});

app.get('/api/quota', readLimiter, async (req, res) => {
    const byo = req.query.byo === '1' && ALLOW_CLIENT_KEYS;
    const key = keyFor(req, byo);
    const now = Date.now();

    const burstLimit = byo ? BURST_BYO : BURST_BUILTIN;
    const dailyLimit = byo ? DAILY_BYO : DAILY_BUILTIN;
    const burstWindow = 60 * 1000;
    const dailyWindow = 24 * 60 * 60 * 1000;

    let burstInfo = null, dailyInfo = null;
    try {
        [burstInfo, dailyInfo] = await Promise.all([burstStore.get(key), dailyStore.get(key)]);
    } catch { }

    const resetMs = (info, fallbackWindow) => {
        if (!info?.resetTime) return now + fallbackWindow;
        const rt = info.resetTime instanceof Date ? info.resetTime.getTime() : Number(info.resetTime);
        return Number.isFinite(rt) ? rt : now + fallbackWindow;
    };

    const burstUsed = burstInfo?.totalHits || 0;
    const dailyUsed = dailyInfo?.totalHits || 0;
    const burstResetAt = resetMs(burstInfo, burstWindow);
    const dailyResetAt = resetMs(dailyInfo, dailyWindow);

    res.json({
        isBYO: byo,
        burst: {
            limit: burstLimit,
            used: burstUsed,
            remaining: Math.max(0, burstLimit - burstUsed),
            resetIn: Math.max(0, Math.ceil((burstResetAt - now) / 1000))
        },
        daily: {
            limit: dailyLimit,
            used: dailyUsed,
            remaining: Math.max(0, dailyLimit - dailyUsed),
            resetIn: Math.max(0, Math.ceil((dailyResetAt - now) / 1000))
        }
    });
});

/* ============================================================
   Models + chat
   ============================================================ */

app.get('/api/models', readLimiter, async (req, res) => {
    const clientKey = req.headers['x-client-key'];
    const apiKey = ALLOW_CLIENT_KEYS && clientKey ? clientKey : SERVER_KEY;
    const baseUrl = (req.headers['x-client-base'] || SERVER_BASE).replace(/\/$/, '');
    if (!apiKey) return res.status(400).json({ error: 'No API key configured.' });
    try {
        const upstream = await fetchWithRetry(`${baseUrl}/models`, {
            headers: { Authorization: `Bearer ${apiKey}` }
        }, { attempts: 1 });
        if (!upstream.ok) {
            const text = await upstream.text();
            return res.status(upstream.status).json({ error: sanitizeUpstreamError(text, upstream.status) });
        }
        const json = await upstream.json();
        const models = (json.data || []).map(m => ({
            id: m.id, owned_by: m.owned_by || '', isReasoning: isReasoningModel(m.id)
        }));
        res.json({ models, defaultModel: SERVER_MODEL });
    } catch (err) {
        if (Sentry) Sentry.captureException(err);
        res.status(502).json({ error: sanitizeUpstreamError(err.message, 502) });
    }
});

app.post('/api/chat', burstLimiter, dailyLimiter, async (req, res) => {
    const isServerKey = !(ALLOW_CLIENT_KEYS && req.headers['x-client-key']);
    const clientKey = req.headers['x-client-key'];
    const apiKey = ALLOW_CLIENT_KEYS && clientKey ? clientKey : SERVER_KEY;
    const baseUrl = (req.headers['x-client-base'] || SERVER_BASE).replace(/\/$/, '');
    const resolvedModel = req.body?.model || SERVER_MODEL;

    if (!apiKey) return res.status(400).json({ error: 'No API key configured.' });
    if (!Array.isArray(req.body?.messages) || req.body.messages.length === 0) {
        return res.status(400).json({ error: 'messages must be a non-empty array.' });
    }
    if (JSON.stringify(req.body.messages).length > 400_000) {
        return res.status(413).json({ error: 'Conversation too large.' });
    }

    const body = normalizeBody(req.body, resolvedModel, isServerKey);
    const wantsStream = !!body.stream;

    try {
        const upstream = await fetchWithRetry(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify(body)
        }, { attempts: wantsStream ? 0 : AI_RETRIES });

        if (!upstream.ok) {
            const text = await upstream.text();
            console.error('[chat] upstream error', upstream.status, text.slice(0, 500));
            if (Sentry) Sentry.captureMessage(`Upstream ${upstream.status}: ${text.slice(0, 300)}`, 'warning');
            return res.status(upstream.status).json({ error: sanitizeUpstreamError(text, upstream.status) });
        }

        if (wantsStream) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.setHeader('X-Accel-Buffering', 'no');
            upstream.body.on('data', chunk => res.write(chunk));
            upstream.body.on('end', () => res.end());
            upstream.body.on('error', () => {
                res.write(`data: ${JSON.stringify({ error: 'stream interrupted' })}\n\n`);
                res.end();
            });
        } else {
            res.json(await upstream.json());
        }
    } catch (err) {
        if (Sentry) Sentry.captureException(err);
        console.error('[chat]', err.message);
        res.status(err.name === 'AbortError' ? 504 : 500).json({
            error: sanitizeUpstreamError(err.message, 500)
        });
    }
});

/* ============================================================
   SPA fallback + boot
   ============================================================ */
// FIX: Restored the proper SPA fallback. This ensures API routes, 
// static assets (images, css, js), and source files are NOT swallowed by index.html.
app.get('*', (req, res, next) => {
    const p = req.path;
    if (p.startsWith('/api/')) return next();
    if (p.startsWith('/src/')) return next();
    if (p.startsWith('/public/')) return next();
    if (/\.[a-z0-9]+$/i.test(p)) return next(); // Prevents swallowing missing .js/.css files
    res.sendFile(path.join(__dirname, 'index.html'));
});

if (Sentry) Sentry.setupExpressErrorHandler(app);

attachEducatorRoutes(app);
attachAuthorRoutes(app);

const httpServer = http.createServer(app);
attachWebSocket(httpServer);

const PORT = process.env.PORT || 3000;
httpServer.listen(PORT, () => {
    console.log(`MUN AI Academy running at http://localhost:${PORT}`);
    console.log(`  env: ${process.env.NODE_ENV || 'development'}`);
    if (!SERVER_KEY) console.log('  ⚠  No AI_API_KEY — falling back to demo mode.');
    else console.log(`  ✓ Built-in AI — ${SERVER_MODEL}${isReasoningModel(SERVER_MODEL) ? ' (reasoning model — budget floor: 16000)' : ''}`);
    console.log(`  ✓ Rate limits — burst ${BURST_BUILTIN}/min · daily ${DAILY_BUILTIN}`);
    console.log(`  ✓ Supabase: ${process.env.SUPABASE_URL ? 'enabled' : 'local-only'}`);
    console.log(`  ✓ Sentry: ${process.env.SENTRY_DSN ? 'enabled' : 'disabled'}`);
    console.log('  ✓ Multiplayer rooms at /ws');
});
