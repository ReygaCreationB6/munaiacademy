import { MockProvider } from './providers/MockProvider.js';
import { OpenAIProvider } from './providers/OpenAIProvider.js';
import { ProxyProvider } from './providers/ProxyProvider.js';
import { getPrompt } from './prompts.js';

export class AIManager {
    constructor(store) {
        this.store = store;
        this.provider = null;
        this.build();
        store.subscribe(() => this.build());
    }

    build() {
        const cfg = this.store.get().aiConfig || {};
        let p;
        switch (cfg.provider) {
            case 'openai': p = new OpenAIProvider(cfg); break;
            case 'proxy': p = new ProxyProvider(cfg); break;
            default: p = new MockProvider(cfg); break;
        }
        this.provider = p;
    }

    /**
     * Resolve the model to use for a given module.
     * Config can specify `moduleModels: { poi: 'llama-3.1-8b-instant', ... }` to route
     * specific modules to cheaper/faster models. Falls back to the global model.
     */
    modelFor(mode) {
        const cfg = this.store.get().aiConfig || {};
        const overrides = cfg.moduleModels || {};
        return overrides[mode] || cfg.model || undefined;
    }

    buildMessages({ mode = 'coach', userText, history = [], context = {}, systemOverride = null }) {
        const sys = systemOverride || (getPrompt(mode) + '\n\n' + contextBlock(context));
        return [
            { role: 'system', content: sys },
            ...history.map(m => ({ role: m.role, content: m.content })),
            { role: 'user', content: userText }
        ];
    }

    /**
     * Normalize the raw response into a string. If empty, apply the fallback.
     * The fallback can be a string (returned as-is) or a function (invoked).
     */
    applyFallback(text, fallback) {
        const trimmed = String(text ?? '').trim();
        if (trimmed.length >= 3) return trimmed;
        if (typeof fallback === 'function') return String(fallback() ?? '').trim();
        if (typeof fallback === 'string') return fallback.trim();
        return trimmed;
    }

    async chat({ mode, userText, history, context, opts = {}, systemOverride, fallback }) {
        const msgs = this.buildMessages({ mode, userText, history, context, systemOverride });
        const model = this.modelFor(mode);
        const mergedOpts = { ...opts };
        if (model && !mergedOpts.model) mergedOpts.model = model;

        try {
            const raw = await this.provider.chat(msgs, mergedOpts);
            const text = this.applyFallback(raw, fallback);
            if (!text) {
                // No fallback provided and the model returned nothing.
                throw new Error('AI returned an empty response. Try again, or switch model in Settings.');
            }
            return text;
        } catch (err) {
            // On network/upstream failure, try the fallback before surfacing the error.
            if (fallback) {
                const text = this.applyFallback('', fallback);
                if (text) return text;
            }
            throw err;
        }
    }

    async stream({ mode, userText, history, context, opts = {}, systemOverride, fallback }, onChunk) {
        const msgs = this.buildMessages({ mode, userText, history, context, systemOverride });
        const model = this.modelFor(mode);
        const mergedOpts = { ...opts };
        if (model && !mergedOpts.model) mergedOpts.model = model;

        let full = '';
        try {
            const result = await this.provider.stream(msgs, mergedOpts, (chunk) => {
                full += chunk;
                try { onChunk(chunk); } catch { }
            });
            full = result || full;
        } catch (err) {
            // If streaming failed and we have a fallback, emit it as if it streamed.
            if (fallback) {
                const text = this.applyFallback('', fallback);
                if (text) { onChunk(text); return text; }
            }
            throw err;
        }

        const finalText = this.applyFallback(full, fallback);
        if (finalText !== full && finalText) {
            // Emit the fallback as a final chunk so the UI shows something.
            onChunk('\n\n' + finalText);
        }
        return finalText;
    }

    async test() { return this.provider.test(); }
}

function contextBlock(ctx = {}) {
    const lines = [];
    if (ctx.committee) lines.push(`Committee: ${ctx.committee}`);
    if (ctx.country) lines.push(`Country: ${ctx.country}`);
    if (ctx.topic) lines.push(`Topic: ${ctx.topic}`);
    if (ctx.experience) lines.push(`Experience level: ${ctx.experience}`);
    return lines.length ? `\n\n--- CONTEXT ---\n${lines.join('\n')}` : '';
}