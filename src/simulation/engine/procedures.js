export const PHASES = {
    ROLL_CALL: 'ROLL_CALL',
    GSL: 'GSL',
    MOD_CAUCUS: 'MOD_CAUCUS',
    UNMOD_CAUCUS: 'UNMOD_CAUCUS',
    RESOLUTION_DEBATE: 'RESOLUTION_DEBATE',
    CRISIS: 'CRISIS',
    VOTING: 'VOTING',
    RESULT: 'RESULT'
};

export const PHASE_LABEL = {
    ROLL_CALL: 'Roll Call',
    GSL: 'General Speakers List',
    MOD_CAUCUS: 'Moderated Caucus',
    UNMOD_CAUCUS: 'Unmoderated Caucus',
    RESOLUTION_DEBATE: 'Debate on Draft Resolution',
    CRISIS: 'Crisis Update',
    VOTING: 'Voting Procedure',
    RESULT: 'Result'
};

export const MOTIONS = {
    OPEN_DEBATE: {
        key: 'OPEN_DEBATE',
        name: 'Motion to Open Debate',
        validIn: ['ROLL_CALL'],
        requiresSecond: true,
        requiresVote: true,
        twoThirds: false,
        description: 'Opens the substantive debate on the agenda topic.'
    },
    OPEN_MOD_CAUCUS: {
        key: 'OPEN_MOD_CAUCUS',
        name: 'Motion to Open a Moderated Caucus',
        validIn: ['GSL', 'RESOLUTION_DEBATE'],
        requiresSecond: true,
        requiresVote: true,
        twoThirds: false,
        params: ['topic', 'speakerTime', 'totalTime'],
        defaults: { topic: 'climate finance', speakerTime: 30, totalTime: 120 },
        description: 'Structured debate with fixed speaking time on a sub-topic.'
    },
    OPEN_UNMOD_CAUCUS: {
        key: 'OPEN_UNMOD_CAUCUS',
        name: 'Motion to Open an Unmoderated Caucus',
        validIn: ['GSL', 'RESOLUTION_DEBATE'],
        requiresSecond: true,
        requiresVote: true,
        twoThirds: false,
        params: ['topic', 'totalTime'],
        defaults: { topic: 'draft resolution negotiation', totalTime: 300 },
        description: 'Informal negotiation time — no speaking list.'
    },
    INTRODUCE_RESOLUTION: {
        key: 'INTRODUCE_RESOLUTION',
        name: 'Motion to Introduce a Draft Resolution',
        validIn: ['GSL', 'UNMOD_CAUCUS'],
        requiresSecond: true,
        requiresVote: true,
        twoThirds: false,
        description: 'Formally introduces a draft resolution to the committee.'
    },
    CLOSE_DEBATE: {
        key: 'CLOSE_DEBATE',
        name: 'Motion to Close Debate',
        validIn: ['GSL', 'RESOLUTION_DEBATE'],
        requiresSecond: true,
        requiresVote: true,
        twoThirds: true,
        description: 'Ends debate and moves the committee directly into voting procedure. Requires 2/3 majority.'
    }
};

export function motionsAvailable(phase) {
    return Object.values(MOTIONS).filter(m => m.validIn.includes(phase));
}

export function validateMotion(key, phase) {
    const m = MOTIONS[key];
    if (!m) return { ok: false, error: 'Unknown motion.' };
    if (!m.validIn.includes(phase)) return { ok: false, error: `${m.name} is not in order during ${phase}.` };
    return { ok: true, motion: m };
}