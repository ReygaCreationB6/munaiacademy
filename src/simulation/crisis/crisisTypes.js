export const CRISIS_TYPE = {
    INFO: 'info',
    URGENT: 'urgent',
    ADVERSARIAL: 'adversarial',
    OPPORTUNITY: 'opportunity'
};

export const CRISIS_SEVERITY = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    CRITICAL: 'critical'
};

export const EFFECT = {
    SHIFT_RELATION: 'shift-relation',
    SHIFT_STANCE: 'shift-stance',
    AWARD_XP: 'award-xp',
    PENALTY_XP: 'penalty-xp',
    UNLOCK_MOTION: 'unlock-motion',
    NARRATIVE: 'narrative'
};

export const CUSTOM_RESPONSE_SIGNALS = {
    positive: [
        'fund', 'assist', 'aid', 'protect', 'cooperate', 'coordinate',
        'joint', 'together', 'multilateral', 'humanitarian', 'support',
        'partner', 'commit', 'pledge', 'allocate', 'reaffirm', 'welcome'
    ],
    negative: [
        'refuse', 'deny', 'reject', 'unilateral', 'withdraw', 'expel',
        'abandon', 'ignore', 'dismiss', 'condemn'
    ]
};

export function scoreCustomResponse(text) {
    // Coerce to string so callers can pass undefined / null safely.
    const s = String(text == null ? '' : text);
    const lower = s.toLowerCase();

    let positive = 0, negative = 0;
    for (const k of CUSTOM_RESPONSE_SIGNALS.positive) if (lower.includes(k)) positive++;
    for (const k of CUSTOM_RESPONSE_SIGNALS.negative) if (lower.includes(k)) negative++;

    const trimmed = s.trim();
    const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0;
    const engaged = words >= 20;

    let score = positive - negative;
    if (!engaged) score -= 1;

    return Math.max(-3, Math.min(3, score));
}