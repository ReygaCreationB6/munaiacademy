import { BaseProvider } from './BaseProvider.js';

/**
 * ProxyProvider — routes AI requests through the local server at /api/chat.
 *
 * The server is the sole owner of: base URL, API key, and model name.
 * The browser never sends any of those — it only sends the conversation
 * and sampling parameters. This keeps the built-in AI consistent across
 * every client and prevents stale client-side values from overriding
 * the server's .env configuration.
 */
export class ProxyProvider extends BaseProvider {
    async chat(messages, opts) {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                temperature: opts?.temperature ?? this.config.temperature,
                maxTokens: opts?.maxTokens ?? this.config.maxTokens,
                stream: false
            })
        });
        if (!res.ok) {
            const text = await res.text();
            let msg = text;
            try { msg = JSON.parse(text).error?.message || text; } catch { }
            throw new Error(msg || `HTTP ${res.status}`);
        }
        const json = await res.json();
        return json.choices?.[0]?.message?.content || '';
    }

    async stream(messages, opts, onChunk) {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                messages,
                temperature: opts?.temperature ?? this.config.temperature,
                maxTokens: opts?.maxTokens ?? this.config.maxTokens,
                stream: true
            })
        });
        if (!res.ok || !res.body) {
            const text = await res.text();
            let msg = text;
            try { msg = JSON.parse(text).error?.message || text; } catch { }
            throw new Error(msg || `HTTP ${res.status}`);
        }

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
        const out = await this.chat([{ role: 'user', content: 'Reply OK' }], { maxTokens: 5 });
        return { ok: true, ms: Math.round(performance.now() - t0), sample: out };
    }
}