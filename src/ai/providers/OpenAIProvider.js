import { BaseProvider } from './BaseProvider.js';

export class OpenAIProvider extends BaseProvider {
    endpoint() {
        const base = (this.config.baseUrl || 'https://api.openai.com/v1').replace(/\/$/, '');
        return `${base}/chat/completions`;
    }
    headers() {
        return {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.config.apiKey || ''}`
        };
    }
    body(messages, opts = {}, stream = false) {
        return JSON.stringify({
            model: opts.model || this.config.model || 'gpt-4o-mini',
            messages,
            temperature: opts.temperature ?? this.config.temperature ?? 0.7,
            max_tokens: opts.maxTokens ?? this.config.maxTokens ?? 2048,
            stream
        });
    }

    async chat(messages, opts) {
        if (!this.config.apiKey && !this.config.baseUrl?.includes('localhost')) {
            throw new Error('Missing API key.');
        }
        const res = await fetch(this.endpoint(), {
            method: 'POST', headers: this.headers(), body: this.body(messages, opts, false)
        });
        if (!res.ok) throw new Error(await safeErr(res));
        const json = await res.json();
        return json.choices?.[0]?.message?.content || '';
    }

    async stream(messages, opts, onChunk) {
        const res = await fetch(this.endpoint(), {
            method: 'POST', headers: this.headers(), body: this.body(messages, opts, true)
        });
        if (!res.ok || !res.body) throw new Error(await safeErr(res));
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = '', full = '';
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();
            for (const line of lines) {
                const t = line.trim();
                if (!t.startsWith('data:')) continue;
                const data = t.slice(5).trim();
                if (data === '[DONE]') continue;
                try {
                    const json = JSON.parse(data);
                    const delta = json.choices?.[0]?.delta?.content || '';
                    if (delta) { full += delta; onChunk(delta); }
                } catch { }
            }
        }
        return full;
    }

    async test() {
        const t0 = performance.now();
        const out = await this.chat([{ role: 'user', content: 'Reply with: OK' }], { maxTokens: 5 });
        return { ok: true, model: this.config.model, ms: Math.round(performance.now() - t0), sample: out };
    }
}

async function safeErr(res) {
    try { const j = await res.json(); return j.error?.message || JSON.stringify(j); }
    catch { return `HTTP ${res.status}`; }
}