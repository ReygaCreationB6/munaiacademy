export class BaseProvider {
    constructor(config = {}) { this.config = config; }
    async chat(_messages, _opts) { throw new Error('chat() not implemented'); }
    async stream(messages, opts, onChunk) {
        // Fallback: no streaming — send full response as one chunk.
        const text = await this.chat(messages, opts);
        onChunk(text);
        return text;
    }
    async test() { return { ok: false, error: 'Not implemented' }; }
}