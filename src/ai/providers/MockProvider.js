import { BaseProvider } from './BaseProvider.js';

const CANNED = [
    "Let me break this down for you.\n\n**Definition** — A moderated caucus is a structured debate format where the Chair sets a topic and speaking time, and delegates raise their placards to be recognized.\n\n**Why it matters** — It lets the committee focus deeply on a sub-issue without the formality of the General Speakers List.\n\n**Example** — \"Motion to open a moderated caucus on climate finance, 60 seconds speaking time, total 10 minutes.\"\n\n**Quick check** — Who decides how long the caucus lasts?",
    "Great question. Here's how I'd approach it:\n\n1. Start with your country's **national interest** — what does Chad gain or lose?\n2. Cite a real commitment (e.g., the Paris Agreement, NDCs).\n3. Offer a **specific, fundable** solution — not just \"increase aid.\"\n\nWant me to help you draft a 30-second version?",
    "**SCORES**\nContent: 82%\nDiplomatic Language: 88%\nStructure: 76%\nSpecificity: 79%\n\n**WHAT YOU DID WELL**\n• Clear opening hook\n• Respectful tone throughout\n• Strong country alignment\n\n**WHAT NEEDS IMPROVEMENT**\n• Add a concrete funding mechanism\n• Name specific actors (UNFCCC, Green Climate Fund)\n• Tighten the conclusion\n\n**NEXT PRACTICE**\nDefend your proposal against a delegate who argues donor states shouldn't be obligated to fund it.",
    "Here's a possible POI for you to practice:\n\n*\"The delegate claims climate finance should be increased. Does the delegate not agree that developing states also bear responsibility for emissions, and if so, how does the proposal reflect that?\"*\n\nHow would you respond? I'll evaluate after.",
    "Understood. Before we continue — should I explain this at a **Beginner**, **Intermediate**, or **Advanced** level?"
];

let idx = 0;

export class MockProvider extends BaseProvider {
    async chat(messages) {
        const last = messages[messages.length - 1]?.content?.toLowerCase() || '';
        await new Promise(r => setTimeout(r, 500 + Math.random() * 500));
        if (last.includes('poi')) return CANNED[3];
        if (last.includes('speech') || last.includes('evaluate')) return CANNED[2];
        if (last.includes('chad') || last.includes('climate')) return CANNED[1];
        const out = CANNED[idx % CANNED.length];
        idx++;
        return out;
    }

    async stream(messages, opts, onChunk) {
        const full = await this.chat(messages, opts);
        const words = full.split(/(\s+)/);
        for (const w of words) {
            onChunk(w);
            await new Promise(r => setTimeout(r, 12));
        }
        return full;
    }

    async test() {
        await new Promise(r => setTimeout(r, 400));
        return { ok: true, model: 'mock-model', ms: 412, note: 'Demo mode — responses are simulated.' };
    }
}