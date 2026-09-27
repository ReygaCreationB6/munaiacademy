import { computeSkills, computeDeltas, computeStreak, events } from './metrics.js';

/* ------------------------------------------------------------------ */
/* Public API                                                         */
/* ------------------------------------------------------------------ */

export function getRecommendations() {
    let skills, totals, streak;
    try {
        skills = computeSkills();
        totals = getTotalsSafe();
        streak = computeStreak();
    } catch (err) {
        console.warn('[recommender] computation failed:', err?.message || err);
        return [{
            id: 'fallback',
            title: 'Open the Coach',
            description: 'We could not compute personalized recommendations right now. Ask the Coach what to practice next.',
            cta: { label: 'Open Coach', href: '#/coach' },
            priority: 'low'
        }];
    }

    const recs = [];

    // Skill gaps — lowest 3 skills below 60.
    const gaps = Object.entries(skills)
        .filter(([, v]) => typeof v === 'number' && v < 60)
        .sort((a, b) => a[1] - b[1]);
    for (const [skill, value] of gaps.slice(0, 3)) {
        recs.push(skillRec(skill, value));
    }

    // Nudge if the user hasn't practiced this week.
    if (totals.inWeek === 0 && totals.total > 0) {
        recs.push({
            id: 'inactive',
            title: "You haven't practiced this week",
            description: 'Consistency beats intensity. Even a 5-minute speech keeps the streak alive.',
            cta: { label: 'Open Practice Arena', href: '#/practice' },
            priority: 'high'
        });
    }

    // Nudge for a first simulation.
    const simCount = totals.byKind.simulation || 0;
    if (simCount === 0 && totals.total >= 3) {
        recs.push({
            id: 'first-sim',
            title: 'Run your first simulation',
            description: 'The best way to convert lessons into skill is a full simulated conference.',
            cta: { label: 'Start Simulation', href: '#/simulate' },
            priority: 'high'
        });
    }

    // Celebrate a good streak.
    if (streak.current >= 3) {
        recs.push({
            id: 'streak',
            title: `${streak.current}-day streak — keep it up`,
            description: 'Try a Crisis simulation for a harder, more reactive challenge.',
            cta: { label: 'Crisis Mode', href: '#/simulate' },
            priority: 'low'
        });
    }

    // Resolution writing strong, research thin.
    if ((skills['Resolution Writing'] || 0) >= 60 && (skills['Research'] || 0) < 50) {
        recs.push({
            id: 'research-gap',
            title: 'Back up your clauses with research',
            description: 'Your resolutions score well but research coverage is thin. Papers strengthen clause specificity.',
            cta: { label: 'Position Paper', href: '#/paper' },
            priority: 'medium'
        });
    }

    // Speech strong, diplomacy thin.
    if ((skills.Speech || 0) >= 65 && (skills.Diplomacy || 0) < 60) {
        recs.push({
            id: 'diplomacy-gap',
            title: 'Polish your diplomatic tone',
            description: 'Your arguments land, but diplomatic register could be sharper. The Coach has a Diplomatic Language mode.',
            cta: { label: 'Ask the Coach', href: '#/coach' },
            priority: 'medium'
        });
    }

    // Fallback when nothing else triggered.
    if (!recs.length) {
        recs.push({
            id: 'stretch',
            title: 'Stretch into advanced territory',
            description: 'All skills look solid. Try a hard-difficulty crisis simulation to pressure-test your instincts.',
            cta: { label: 'Start Crisis Sim', href: '#/simulate' },
            priority: 'low'
        });
    }

    return dedupe(recs).sort(byPriority).slice(0, 6);
}

/* ------------------------------------------------------------------ */
/* Per-skill recommendation                                           */
/* ------------------------------------------------------------------ */

function skillRec(skill, value) {
    const map = {
        'Speech': {
            title: value < 30 ? 'Your speeches need more reps' : 'Sharpen your speaking',
            description: 'Write a 45-second opening speech and run it through the Speech Trainer for structured feedback.',
            cta: { label: 'Speech Trainer', href: '#/speech' }
        },
        'Debate': {
            title: 'Your debate instincts need practice',
            description: 'POI handling and motion strategy are lagging. Try the POI Trainer, then a live simulation.',
            cta: { label: 'POI Trainer', href: '#/poi' }
        },
        'Research': {
            title: 'Deepen your country research',
            description: "Build a position paper — it forces you to structure evidence around a country's interests.",
            cta: { label: 'Position Paper', href: '#/paper' }
        },
        'Diplomacy': {
            title: 'Soften and strengthen your tone',
            description: 'Diplomatic language carries real weight. Rewrite aggressive statements into diplomatic form.',
            cta: { label: 'Ask the Coach', href: '#/coach' }
        },
        'Resolution Writing': {
            title: 'Draft a full resolution',
            description: 'Every operative clause should have an actor, action, mechanism, funding, timeline, and monitoring.',
            cta: { label: 'Resolution Builder', href: '#/resolution' }
        }
    };
    const base = map[skill] || {
        title: String(skill),
        description: '',
        cta: { label: 'Learn', href: '#/learn' }
    };
    return {
        id: `skill-${String(skill).toLowerCase().replace(/\s+/g, '-')}`,
        title: base.title,
        description: base.description,
        cta: base.cta,
        priority: value < 30 ? 'high' : value < 50 ? 'medium' : 'low',
        skill
    };
}

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */

function getTotalsSafe() {
    // Small subset of computeTotals — avoids circular import and skips
    // the inMonth calculation we don't need here.
    const evs = events().filter(e => e && typeof e.ts === 'number');
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);

    const inWeek = evs.filter(e => e.ts >= weekAgo.getTime()).length;
    const byKind = evs.reduce((a, e) => {
        const k = e.kind || 'unknown';
        a[k] = (a[k] || 0) + 1;
        return a;
    }, {});

    return { total: evs.length, inWeek, byKind };
}

function byPriority(a, b) {
    const order = { high: 0, medium: 1, low: 2 };
    return (order[a.priority] ?? 3) - (order[b.priority] ?? 3);
}

function dedupe(list) {
    const seen = new Set();
    return list.filter(r => {
        if (!r || !r.id || seen.has(r.id)) return false;
        seen.add(r.id);
        return true;
    });
}