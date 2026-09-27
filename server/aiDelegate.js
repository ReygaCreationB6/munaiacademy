/**
 * Server-side AI helper for delegate speeches.
 *
 * Asks the model for structured output:
 *
 *   TARGET: <country name, "Chair", or "All">
 *   INTENT: support | challenge | question | propose | defend | clarify | neutral
 *   SPEECH: <actual speech text>
 *
 * If the model doesn't comply, the whole output is treated as speech
 * with neutral intent and no target.
 */

import fetch from 'node-fetch';

function cfg() {
    return {
        key: process.env.AI_API_KEY || '',
        base: (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, ''),
        model: process.env.AI_MODEL || 'gpt-4o-mini'
    };
}

const REASONING_MODEL_RE = /gpt-oss|^o[13](-|$)|deepseek-?r1|qwq|reasoning/i;
const REASONING_MIN_TOKENS = 16000;

function isReasoningModel(model) {
    return REASONING_MODEL_RE.test(String(model || ''));
}

function timeoutMs() {
    return Number(process.env.AI_TIMEOUT_MS || 60000);
}

const VALID_INTENTS = ['support', 'challenge', 'question', 'propose', 'defend', 'clarify', 'neutral'];

/* ------------------------------------------------------------------ */
/* Prompt                                                                */
/* ------------------------------------------------------------------ */

function buildSystemPrompt(delegate, room, recentTranscript, options = {}) {
    const p = delegate.profile || {};
    const blocs = (p.blocs || []).join(', ') || 'none';
    const interests = (p.interests || []).join(', ') || 'multilateral cooperation';
    const redLines = (p.redLines || []).join(', ') || 'none specified';
    const allies = (p.allies || []).join(', ') || 'none specified';
    const commitments = (p.commitments || []).join(', ') || 'UN Charter';

    const history = recentTranscript
        .filter(e => ['delegate', 'chat', 'chair'].includes(e.kind))
        .slice(-6)
        .map(e => {
            const who = e.speaker || e.from || 'Delegate';
            const country = e.country || who;
            const tag = e.isAI ? '' : '';
            const content = String(e.content || '').slice(0, 240);
            const intent = e.intent ? ` (${e.intent})` : '';
            const target = e.target ? ` → ${e.target}` : '';
            return `[${country}${intent}${target}]${tag} ${content}`;
        })
        .join('\n') || '(No recent speakers.)';

    const targetHint = options.target && options.target !== 'All'
        ? `\nYOU ARE RESPONDING SPECIFICALLY TO: ${options.target}. Address them directly (but diplomatically).`
        : '';
    const intentHint = options.intent && options.intent !== 'neutral'
        ? `\nLEAN YOUR INTENT TOWARD: ${options.intent}.`
        : '';
    const mistakeHint = options.makeMistake
        ? `\nOCCASIONAL SLIP: if it fits naturally, include ONE minor factual slip — misremember a resolution year, slightly misname a treaty, or overstate a statistic. Keep it subtle. Do not draw attention to it.`
        : '';

    const styleName = delegate.personality ? delegate.personality.name : 'Negotiator';
    const styleDesc = delegate.personality ? delegate.personality.description : 'Focused on compromise.';
    const stylePrompt = delegate.personality ? delegate.personality.prompt : '';

    return `You are the delegate of ${delegate.country} to the ${room.committee}.
Topic: ${room.topic}

COUNTRY PROFILE
Region: ${p.region || 'Unknown'}
Blocs: ${blocs}
Economic level: ${p.economicLevel || 'Developing'}
Key interests: ${interests}
Red lines: ${redLines}
Natural allies: ${allies}
Commitments: ${commitments}

YOUR STYLE
${styleName} — ${styleDesc}
${stylePrompt}

RECENT FLOOR CONTEXT
${history}${targetHint}${intentHint}${mistakeHint}

RULES
- Speak ONLY as ${delegate.country}. Never break character.
- Use formal diplomatic language ("The delegation of ${delegate.country}…").
- Reference your country's interests and commitments.
- 3–5 sentences. No headings. No bullet lists. No emojis.
- Never say you are an AI or a model.${mistakeHint ? '' : ''}

RESPONSE FORMAT (must follow exactly):
TARGET: <one country name from the committee, or "Chair", or "All">
INTENT: <one of: support, challenge, question, propose, defend, clarify, neutral>
SPEECH: <your speech>

Do not include any other lines. Do not include multiple TARGET/INTENT/SPEECH lines.`;
}

/* ------------------------------------------------------------------ */
/* Output parsing                                                       */
/* ------------------------------------------------------------------ */

function parseStructuredOutput(text) {
    const raw = String(text || '').trim();
    const result = { target: null, intent: 'neutral', speech: '' };

    // Try structured parsing.
    const targetMatch = raw.match(/^\s*TARGET\s*:\s*(.+)$/im);
    const intentMatch = raw.match(/^\s*INTENT\s*:\s*(\w+)/im);
    const speechMatch = raw.match(/^\s*SPEECH\s*:\s*([\s\S]+)$/im);

    if (speechMatch) {
        result.speech = speechMatch[1].trim();
        if (targetMatch) {
            const t = targetMatch[1].trim().replace(/[.,;:]+$/, '');
            if (t && !/^all$/i.test(t)) result.target = t;
        }
        if (intentMatch) {
            const i = intentMatch[1].trim().toLowerCase();
            if (VALID_INTENTS.includes(i)) result.intent = i;
        }
        return result;
    }

    // Fallback — the whole output is the speech.
    result.speech = raw;
    return result;
}

/* ------------------------------------------------------------------ */
/* Generate                                                             */
/* ------------------------------------------------------------------ */

export async function generateDelegateSpeech(delegate, room, options = {}) {
    const { key, base, model } = cfg();
    if (!key) throw new Error('AI_API_KEY not configured');

    const system = buildSystemPrompt(delegate, room, room.transcript || [], options);
    const userMsg = options.target && options.target !== 'All'
        ? `You have the floor. Respond specifically to the delegate of ${options.target}.`
        : `You have the floor in the ${room.committee}. Deliver a brief statement on "${room.topic}" or respond to the most recent speaker.`;

    const body = {
        model,
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: userMsg }
        ],
        temperature: 0.9,
        max_tokens: isReasoningModel(model) ? REASONING_MIN_TOKENS : 500
    };
    if (isReasoningModel(model)) body.reasoning_effort = 'low';

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs());
    try {
        const res = await fetch(`${base}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${key}`
            },
            body: JSON.stringify(body),
            signal: ctrl.signal
        });
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Upstream ${res.status}: ${text.slice(0, 200)}`);
        }
        const json = await res.json();
        const raw = json?.choices?.[0]?.message?.content || '';
        const parsed = parseStructuredOutput(raw);
        if (!parsed.speech) throw new Error('Empty speech from model');
        return parsed;
    } finally {
        clearTimeout(timer);
    }
}

export function aiAvailable() {
    return !!process.env.AI_API_KEY;
}