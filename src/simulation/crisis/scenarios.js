import { CRISIS_TYPE, CRISIS_SEVERITY, EFFECT } from './crisisTypes.js';

export const SCENARIOS = {
    'climate-surge': {
        key: 'climate-surge',
        name: 'Climate Refugee Surge',
        description: 'A chain of escalating displacement events in the Lake Chad basin.',
        events: [
            {
                id: 'cl-1',
                title: 'UNHCR Displacement Report',
                description: 'UNHCR reports 40,000 climate-displaced persons crossing into Chad from the Lake Chad region over the past two weeks. Neighbouring states have not yet coordinated a response.',
                type: CRISIS_TYPE.INFO,
                severity: CRISIS_SEVERITY.LOW,
                minTurn: 3,
                triggersOn: ['GSL', 'MOD_CAUCUS'],
                aiReactions: false,
                options: [
                    {
                        key: 'acknowledge',
                        text: 'Publicly acknowledge and signal readiness to cooperate',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: '*', delta: 0.1 },
                            { kind: EFFECT.AWARD_XP, amount: 4 },
                            { kind: EFFECT.NARRATIVE, text: 'Delegations note your willingness to engage on displacement.' }
                        ]
                    },
                    {
                        key: 'note',
                        text: 'Take note privately, wait for committee discussion',
                        effects: [
                            { kind: EFFECT.NARRATIVE, text: 'The information enters the record without a formal response.' }
                        ]
                    }
                ]
            },
            {
                id: 'cl-2',
                title: 'Border Station Overwhelmed',
                description: "Chad's eastern border station is operating past capacity. Two neighbouring delegations demand the committee authorise an emergency corridor within the session.",
                type: CRISIS_TYPE.URGENT,
                severity: CRISIS_SEVERITY.HIGH,
                minTurn: 6,
                triggersOn: ['GSL', 'MOD_CAUCUS'],
                responseWindow: 90,
                aiReactions: true,
                options: [
                    {
                        key: 'mobilize',
                        text: 'Mobilise national emergency response immediately',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.25 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'Maldives', delta: 0.25 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'United States', delta: -0.15 },
                            { kind: EFFECT.AWARD_XP, amount: 8 },
                            { kind: EFFECT.NARRATIVE, text: 'Humanitarian delegations welcome decisive action. The United States is concerned about unilateral precedent.' }
                        ]
                    },
                    {
                        key: 'request',
                        text: 'Request international assistance through the UN',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.3 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'China', delta: 0.1 },
                            { kind: EFFECT.AWARD_XP, amount: 6 },
                            { kind: EFFECT.NARRATIVE, text: 'Multilateral framing is well-received, though slower.' }
                        ]
                    },
                    {
                        key: 'delay',
                        text: 'Defer to committee procedure',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.1 },
                            { kind: EFFECT.PENALTY_XP, amount: 3 },
                            { kind: EFFECT.NARRATIVE, text: 'The delay is noted by several delegations.' }
                        ]
                    }
                ]
            },
            {
                id: 'cl-3',
                title: 'Leaked Internal Cable',
                description: 'A regional newspaper publishes an internal cable suggesting your delegation was warned three weeks ago and took no pre-emptive action. Two delegations demand a formal statement.',
                type: CRISIS_TYPE.ADVERSARIAL,
                severity: CRISIS_SEVERITY.HIGH,
                minTurn: 11,
                triggersOn: ['GSL', 'MOD_CAUCUS'],
                responseWindow: 60,
                aiReactions: true,
                options: [
                    {
                        key: 'confirm',
                        text: 'Confirm the warning and explain the constraints faced',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.15 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'United States', delta: -0.2 },
                            { kind: EFFECT.NARRATIVE, text: 'Honesty earns quiet respect from some delegations; others press harder.' }
                        ]
                    },
                    {
                        key: 'deny',
                        text: 'Deny the authenticity of the cable',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.15 },
                            { kind: EFFECT.PENALTY_XP, amount: 4 },
                            { kind: EFFECT.NARRATIVE, text: 'The blanket denial strains trust across the floor.' }
                        ]
                    },
                    {
                        key: 'reframe',
                        text: 'Reframe toward forward-looking coordination',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.2 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'Brazil', delta: 0.2 },
                            { kind: EFFECT.AWARD_XP, amount: 6 },
                            { kind: EFFECT.NARRATIVE, text: 'The constructive pivot is noted as mature diplomacy.' }
                        ]
                    }
                ]
            },
            {
                id: 'cl-4',
                title: 'EU Funding Offer',
                description: "The European Union signals willingness to fund a joint humanitarian corridor if Chad leads the initiative. The offer expires at the end of the next speaking round.",
                type: CRISIS_TYPE.OPPORTUNITY,
                severity: CRISIS_SEVERITY.MEDIUM,
                minTurn: 15,
                triggersOn: ['GSL', 'MOD_CAUCUS', 'RESOLUTION_DEBATE'],
                responseWindow: 120,
                aiReactions: true,
                options: [
                    {
                        key: 'lead',
                        text: 'Accept and propose a formal corridor mechanism',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.35 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.2 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'Maldives', delta: 0.2 },
                            { kind: EFFECT.AWARD_XP, amount: 12 },
                            { kind: EFFECT.NARRATIVE, text: 'Chad emerges as a regional leader on displacement.' }
                        ]
                    },
                    {
                        key: 'cautious',
                        text: 'Express cautious interest pending details',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.1 },
                            { kind: EFFECT.NARRATIVE, text: 'The EU notes the hesitation.' }
                        ]
                    },
                    {
                        key: 'decline',
                        text: 'Decline — no external presence on sovereign soil',
                        effects: [
                            { kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: -0.3 },
                            { kind: EFFECT.SHIFT_RELATION, target: 'United States', delta: 0.15 },
                            { kind: EFFECT.PENALTY_XP, amount: 5 },
                            { kind: EFFECT.NARRATIVE, text: 'Sovereignty framing resonates with some; humanitarian delegations are disappointed.' }
                        ]
                    }
                ]
            }
        ]
    },

    'diplomatic-fallout': {
        key: 'diplomatic-fallout',
        name: 'Diplomatic Fallout',
        description: 'Your delegation is accused of misconduct. Damage control under pressure.',
        events: [
            {
                id: 'df-1',
                title: 'Press Allegations',
                description: 'A major international newspaper publishes a story alleging your delegation attempted to pressure a smaller state into withdrawing a proposal. The story cites two unnamed sources.',
                type: CRISIS_TYPE.INFO,
                severity: CRISIS_SEVERITY.MEDIUM,
                minTurn: 3,
                triggersOn: ['GSL', 'MOD_CAUCUS'],
                aiReactions: false,
                options: [
                    { key: 'note', text: 'Take note; no immediate reaction', effects: [{ kind: EFFECT.NARRATIVE, text: 'The story circulates in the margins of the floor.' }] },
                    { key: 'preempt', text: 'Issue a pre-emptive denial', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.05 }, { kind: EFFECT.NARRATIVE, text: 'Pre-emptive denial draws as much attention as the story.' }] }
                ]
            },
            {
                id: 'df-2',
                title: 'Formal Demand',
                description: 'Three delegations demand a formal statement. The Chair has recognised the question and is waiting for your response.',
                type: CRISIS_TYPE.URGENT,
                severity: CRISIS_SEVERITY.HIGH,
                minTurn: 6,
                triggersOn: ['GSL', 'MOD_CAUCUS'],
                responseWindow: 60,
                aiReactions: true,
                options: [
                    { key: 'defend', text: 'Defend the delegation firmly and categorically', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.1 }, { kind: EFFECT.AWARD_XP, amount: 3 }, { kind: EFFECT.NARRATIVE, text: 'A firm defence holds the line but leaves no room to manoeuvre later.' }] },
                    { key: 'inquiry', text: 'Call for an independent inquiry', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.25 }, { kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.2 }, { kind: EFFECT.AWARD_XP, amount: 7 }, { kind: EFFECT.NARRATIVE, text: 'The inquiry approach is seen as confident and transparent.' }] },
                    { key: 'silent', text: 'Decline to comment', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.2 }, { kind: EFFECT.PENALTY_XP, amount: 4 }, { kind: EFFECT.NARRATIVE, text: 'Silence is interpreted as guilt by several delegations.' }] }
                ]
            },
            {
                id: 'df-3',
                title: 'Credentials Challenge',
                description: "The accused smaller state publicly calls for a review of your delegation's credentials — an extraordinary procedural move.",
                type: CRISIS_TYPE.ADVERSARIAL,
                severity: CRISIS_SEVERITY.CRITICAL,
                minTurn: 11,
                triggersOn: ['GSL', 'MOD_CAUCUS', 'RESOLUTION_DEBATE'],
                responseWindow: 75,
                aiReactions: true,
                options: [
                    { key: 'procedural', text: 'Challenge the motion as out of order', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'United States', delta: 0.2 }, { kind: EFFECT.SHIFT_RELATION, target: 'Brazil', delta: 0.15 }, { kind: EFFECT.AWARD_XP, amount: 6 }, { kind: EFFECT.NARRATIVE, text: 'Procedural confidence is respected even by opponents.' }] },
                    { key: 'welcome', text: 'Welcome the review, express full confidence', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.3 }, { kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.25 }, { kind: EFFECT.AWARD_XP, amount: 9 }, { kind: EFFECT.NARRATIVE, text: 'Grace under fire is noted.' }] },
                    { key: 'counter', text: 'Counter-attack the accusing state', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.25 }, { kind: EFFECT.PENALTY_XP, amount: 6 }, { kind: EFFECT.NARRATIVE, text: 'The escalation costs you the room.' }] }
                ]
            },
            {
                id: 'df-4',
                title: 'Quiet Chair Suggestion',
                description: 'The Chair privately suggests a joint press release with the accusing state could defuse the situation before the next session.',
                type: CRISIS_TYPE.OPPORTUNITY,
                severity: CRISIS_SEVERITY.LOW,
                minTurn: 15,
                triggersOn: ['GSL', 'RESOLUTION_DEBATE'],
                responseWindow: 90,
                aiReactions: false,
                options: [
                    { key: 'accept', text: 'Accept the joint statement', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: 0.2 }, { kind: EFFECT.AWARD_XP, amount: 10 }, { kind: EFFECT.NARRATIVE, text: 'The tension subsides; the committee returns to substance.' }] },
                    { key: 'decline', text: 'Decline quietly', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: -0.1 }, { kind: EFFECT.NARRATIVE, text: 'The issue lingers into the final session.' }] }
                ]
            }
        ]
    },

    'humanitarian-emergency': {
        key: 'humanitarian-emergency',
        name: 'Humanitarian Emergency',
        description: 'A famine declaration forces the committee to act.',
        events: [
            {
                id: 'he-1',
                title: 'Famine Declaration',
                description: 'The IPC formally declares famine conditions in two provinces following a severe drought. Aid agencies report critical supply shortages.',
                type: CRISIS_TYPE.INFO,
                severity: CRISIS_SEVERITY.HIGH,
                minTurn: 3,
                triggersOn: ['GSL'],
                aiReactions: false,
                options: [
                    { key: 'note', text: 'Note the declaration on the floor', effects: [{ kind: EFFECT.NARRATIVE, text: 'The declaration enters the debate.' }] }
                ]
            },
            {
                id: 'he-2',
                title: 'Aid Corridor Request',
                description: 'Aid agencies request immediate authorisation to open a cross-border corridor. Two neighbouring states demand a decision within the session.',
                type: CRISIS_TYPE.URGENT,
                severity: CRISIS_SEVERITY.CRITICAL,
                minTurn: 6,
                triggersOn: ['GSL', 'MOD_CAUCUS'],
                responseWindow: 75,
                aiReactions: true,
                options: [
                    { key: 'authorize', text: 'Authorise the corridor with oversight conditions', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.3 }, { kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.3 }, { kind: EFFECT.SHIFT_RELATION, target: 'Maldives', delta: 0.25 }, { kind: EFFECT.AWARD_XP, amount: 10 }, { kind: EFFECT.NARRATIVE, text: 'Humanitarian leadership is celebrated.' }] },
                    { key: 'negotiate', text: 'Negotiate scope before authorising', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'China', delta: 0.2 }, { kind: EFFECT.SHIFT_RELATION, target: 'Brazil', delta: 0.15 }, { kind: EFFECT.NARRATIVE, text: 'Careful diplomacy preserves sovereignty and credibility.' }] },
                    { key: 'refuse', text: 'Refuse external access', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: -0.25 }, { kind: EFFECT.PENALTY_XP, amount: 8 }, { kind: EFFECT.NARRATIVE, text: 'Humanitarian delegations are openly critical.' }] }
                ]
            },
            {
                id: 'he-3',
                title: 'Rival Bypass Proposal',
                description: 'A rival bloc proposes bypassing your government to deliver aid directly, citing delays. The motion is being drafted.',
                type: CRISIS_TYPE.ADVERSARIAL,
                severity: CRISIS_SEVERITY.HIGH,
                minTurn: 11,
                triggersOn: ['GSL', 'MOD_CAUCUS', 'RESOLUTION_DEBATE'],
                responseWindow: 90,
                aiReactions: true,
                options: [
                    { key: 'coopt', text: 'Co-opt the proposal — offer joint governance of the corridor', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Brazil', delta: 0.25 }, { kind: EFFECT.SHIFT_RELATION, target: 'Kenya', delta: 0.25 }, { kind: EFFECT.AWARD_XP, amount: 12 }, { kind: EFFECT.NARRATIVE, text: 'Co-option neutralises the challenge and reasserts leadership.' }] },
                    { key: 'reject', text: 'Reject the motion firmly', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: -0.15 }, { kind: EFFECT.SHIFT_RELATION, target: 'United States', delta: 0.1 }, { kind: EFFECT.NARRATIVE, text: 'A hard line holds but isolates you with humanitarian delegates.' }] },
                    { key: 'amend', text: 'Offer an amendment adding your oversight', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Germany', delta: 0.15 }, { kind: EFFECT.AWARD_XP, amount: 7 }, { kind: EFFECT.NARRATIVE, text: 'Constructive amendment keeps the process moving.' }] }
                ]
            },
            {
                id: 'he-4',
                title: 'Neutral Co-Sponsor Offer',
                description: 'A neutral delegation offers to co-sponsor a joint resolution on the emergency — if you accept their language on monitoring.',
                type: CRISIS_TYPE.OPPORTUNITY,
                severity: CRISIS_SEVERITY.MEDIUM,
                minTurn: 15,
                triggersOn: ['GSL', 'RESOLUTION_DEBATE'],
                responseWindow: 120,
                aiReactions: false,
                options: [
                    { key: 'accept', text: 'Accept co-sponsorship', effects: [{ kind: EFFECT.SHIFT_RELATION, target: '*', delta: 0.15 }, { kind: EFFECT.AWARD_XP, amount: 10 }, { kind: EFFECT.NARRATIVE, text: 'A broader coalition emerges behind your resolution.' }] },
                    { key: 'counter', text: 'Counter with your own language', effects: [{ kind: EFFECT.SHIFT_RELATION, target: 'Brazil', delta: 0.1 }, { kind: EFFECT.NARRATIVE, text: 'Negotiation continues.' }] }
                ]
            }
        ]
    }
};

/* ------------------------------------------------------------------ */
/* Custom scenarios (populated at boot from /api/content/scenarios)    */
/* ------------------------------------------------------------------ */

let customScenarios = {};

export function registerCustomScenarios(list) {
    customScenarios = {};
    if (!Array.isArray(list)) return;
    for (const s of list) {
        if (!s || !s.key) continue;
        customScenarios[s.key] = {
            ...s,
            key: s.key,
            name: s.name || 'Untitled scenario',
            description: s.description || '',
            events: Array.isArray(s.events) ? s.events : [],
            custom: true
        };
    }
}

export function getScenario(key) {
    return customScenarios[key] || SCENARIOS[key] || SCENARIOS['climate-surge'];
}

export function listScenarios() {
    const builtin = Object.values(SCENARIOS).map(s => ({
        key: s.key, name: s.name, description: s.description, custom: false
    }));
    const custom = Object.values(customScenarios).map(s => ({
        key: s.key, name: s.name, description: s.description, custom: true
    }));
    return [...builtin, ...custom];
}