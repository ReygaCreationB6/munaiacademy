import { profileFor } from './countryProfiles.js';
import { pickPersonality } from './personalities.js';

const ARR = (x) => Array.isArray(x) ? x : [];

export class Delegate {
    constructor({ country, committee, topic, personalityKey, isUser = false, ai }) {
        this.country = country;
        this.committee = committee;
        this.topic = topic;
        this.isUser = isUser;
        this.ai = ai;

        this.profile = profileFor(country) || {};
        // Sanitize profile fields so every consumer can assume arrays exist.
        this.profile.blocs = ARR(this.profile.blocs);
        this.profile.interests = ARR(this.profile.interests);
        this.profile.redLines = ARR(this.profile.redLines);
        this.profile.allies = ARR(this.profile.allies);
        this.profile.commitments = ARR(this.profile.commitments);
        this.profile.region = this.profile.region || 'Unknown';
        this.profile.economicLevel = this.profile.economicLevel || 'Developing';

        this.personality = pickPersonality(personalityKey || this.profile.defaultPersonality);

        this.present = true;
        this.stance = 'undecided';
        this.relations = {};
        this.previousStatements = [];
        this.redLinesHit = [];
        this.supportedProposals = [];
        this.rejectedProposals = [];
        this.hasSpoken = 0;
        this.hasAskedPOI = 0;
    }

    systemPrompt() {
        const p = this.profile;
        return `You are the delegate of ${this.country} to the ${this.committee}.
Topic under debate: ${this.topic}

COUNTRY PROFILE
Region: ${p.region}
Blocs: ${p.blocs.join(', ') || 'none specified'}
Economic level: ${p.economicLevel}
Key interests: ${p.interests.join(', ') || 'multilateral cooperation'}
Red lines (never cross these): ${p.redLines.join(', ') || 'none specified'}
Natural allies: ${p.allies.join(', ') || 'none specified'}
Prior international commitments: ${p.commitments.join(', ') || 'UN Charter'}

YOUR DELEGATION'S STYLE
${this.personality.name} — ${this.personality.description}
${this.personality.prompt}

RULES
- Speak ONLY as ${this.country}. Never break character.
- Use formal diplomatic language ("The delegation of ${this.country}…", "My delegation believes…").
- Reference your country's interests and commitments when relevant.
- Never invent specific facts, statistics, or resolution numbers you are not sure about. If unsure, phrase it generally.
- Keep responses tight — 3–5 sentences for caucus, up to 8 for a formal speech.
- Never say you are an AI, a model, or a language model.

Recent floor context:
${this.memoryDigest()}`;
    }

    memoryDigest(max = 6) {
        const recent = this.previousStatements.slice(-max);
        if (!recent.length) return '(This is your first time speaking.)';
        return recent.map(s => `[${s.phase}] ${String(s.text || '').slice(0, 180)}`).join('\n');
    }

    async speak({ instruction, phase, history = [], isDemo = false }) {
        const userMsg = `You have the floor. ${instruction}\n\nRespond in character as the delegate of ${this.country}.`;
        let text;
        try {
            if (isDemo) throw new Error('demo');
            text = await this.ai.chat({
                mode: 'delegate',
                userText: userMsg,
                history,
                context: {},
                systemOverride: this.systemPrompt(),
                opts: { temperature: 0.8, maxTokens: 400 },
                fallback: () => this.fallbackSpeech(instruction, phase)
            });
        } catch {
            text = this.fallbackSpeech(instruction, phase);
        }
        text = String(text || '').trim() || this.fallbackSpeech(instruction, phase);
        this.previousStatements.push({ phase, text, ts: Date.now() });
        this.hasSpoken++;
        return text;
    }

    async reactTo({ proposal, phase, isDemo = false }) {
        const userMsg = `Another delegate has proposed: "${proposal}".\n\nRespond in character — accept, reject, or request modification. 2–3 sentences.`;
        const fallbackText = () => {
            const t = this.personality.traits;
            if (t.cooperativeness > 0.6) return `The delegation of ${this.country} views this as a useful starting point and would welcome further discussion on implementation details.`;
            if (t.aggressiveness > 0.7) return `The delegation of ${this.country} has serious reservations. We would need substantial changes before we could consider supporting this.`;
            return `The delegation of ${this.country} takes note of the proposal and will consult with partners before indicating a position.`;
        };
        try {
            if (isDemo) throw new Error('demo');
            const out = await this.ai.chat({
                mode: 'delegate',
                userText: userMsg,
                history: [],
                context: {},
                systemOverride: this.systemPrompt(),
                opts: { temperature: 0.85, maxTokens: 220 },
                fallback: fallbackText
            });
            const text = String(out || '').trim() || fallbackText();
            this.previousStatements.push({ phase, text, ts: Date.now() });
            return text;
        } catch {
            const text = fallbackText();
            this.previousStatements.push({ phase, text, ts: Date.now() });
            return text;
        }
    }

    decideVote(resolutionText) {
        const text = String(resolutionText || '').toLowerCase();
        const interests = ARR(this.profile.interests);
        const redLines = ARR(this.profile.redLines);

        let score = 0;
        for (const i of interests) if (text.includes(String(i).toLowerCase())) score += 2;
        for (const r of redLines) if (text.includes(String(r).toLowerCase())) score -= 6;

        score *= 0.5 + this.personality.traits.cooperativeness * 0.5;
        const userRel = this.relations['__user__'] || 0;
        score += userRel * 2;

        if (score >= 1.5) return { vote: 'yes', reason: 'aligned with our interests' };
        if (score <= -1) return { vote: 'no', reason: 'conflicts with our position' };
        return { vote: 'abstain', reason: 'requires further consideration' };
    }

    fallbackSpeech(instruction, phase) {
        const p = this.profile;
        const ints = (p.interests.slice(0, 2).join(' and ')) || 'the priorities of our region';
        const templates = [
            `The delegation of ${this.country} thanks the Chair. Our position remains grounded in ${ints}. We call on this committee to ensure that no state is left behind in the response to ${this.topic}.`,
            `The delegation of ${this.country} recognizes the complexity of this issue. We believe any solution must address ${ints}, and we invite fellow delegates to engage with us on concrete language.`,
            `The delegation of ${this.country} is deeply concerned by the current situation. We urge this committee to move beyond rhetoric and adopt measures that reflect the priorities of ${p.region}.`,
            `The delegation of ${this.country} would like to remind this committee of our existing commitments under ${p.commitments[0] || 'the UN Charter'}. Any outcome must be consistent with those frameworks.`
        ];
        return templates[Math.floor(Math.random() * templates.length)];
    }

    brief() {
        return {
            country: this.country,
            personality: this.personality.name,
            stance: this.stance,
            present: this.present
        };
    }
}