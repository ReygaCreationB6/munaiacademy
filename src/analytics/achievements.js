/**
 * Achievements.
 *
 * Each achievement has:
 *   - id         unique slug
 *   - category   grouping for the page
 *   - name       human title
 *   - description what unlocks it
 *   - tier       bronze | silver | gold | platinum (visual)
 *   - hidden     if true, only shown after unlock
 *   - check      function that receives a snapshot and returns true/false
 *
 * The engine runs after every store change, evaluates every achievement
 * against the current state, and unlocks any that newly qualify.
 */

import { store } from '../core/store.js';
import { computeStreak, computeSkills, SKILL_KEYS } from './metrics.js';

/* ------------------------------------------------------------------ */
/* Tiers                                                              */
/* ------------------------------------------------------------------ */

export const TIERS = {
    BRONZE: 'bronze',
    SILVER: 'silver',
    GOLD: 'gold',
    PLATINUM: 'platinum'
};

/* ------------------------------------------------------------------ */
/* Helpers used by check() functions                                  */
/* ------------------------------------------------------------------ */

function lessonCount(s) {
    return Object.values(s.progress || {}).filter(Boolean).length;
}

function speechCount(s) { return (s.speeches || []).length; }
function paperCount(s) { return (s.positionPapers || []).length; }
function resCount(s) { return (s.resolutions || []).length; }

function simCount(s) {
    return (s.speeches || []).filter(sp => typeof sp?.title === 'string' && sp.title.startsWith('Simulation')).length;
}

function crisisCount(s) {
    return (s.analyticsEvents || []).filter(e => e.kind === 'crisis-choice').length;
}

function debateCount(s) {
    return (s.debateSessions || []).length;
}

function poiCount(s) {
    return (s.poiSessions || []).length;
}

function researchCount(s) {
    return (s.researchSessions || []).length;
}

function voiceCount(s) {
    return (s.speeches || []).filter(sp => sp?.delivery && typeof sp.delivery.overall === 'number').length;
}

function bestVoiceScore(s) {
    return (s.speeches || []).reduce((max, sp) => {
        const v = sp?.delivery?.overall;
        return typeof v === 'number' && v > max ? v : max;
    }, 0);
}

function bestSpeechContent(s) {
    return (s.speeches || []).reduce((max, sp) => {
        const v = sp?.scores?.content;
        return typeof v === 'number' && v > max ? v : max;
    }, 0);
}

function hasAnyScoreAbove(s, field, threshold) {
    return (s.speeches || []).some(sp => (sp?.scores?.[field] || 0) >= threshold);
}

function hasAnyDebateOverall(s, threshold) {
    return (s.debateSessions || []).some(d => (d?.scorecard?.overall || 0) >= threshold);
}

function hasAnyPoiAvg(s, threshold) {
    return (s.poiSessions || []).some(p => (p?.avgScore || 0) >= threshold);
}

function hasVoiceWithWpm(s, min, max) {
    return (s.speeches || []).some(sp => {
        const d = sp?.delivery;
        if (!d) return false;
        return typeof d.wpm === 'number' && d.wpm >= min && d.wpm <= max;
    });
}

function hasVoiceWithNoFillers(s) {
    return (s.speeches || []).some(sp => {
        const d = sp?.delivery;
        return d && typeof d.fillerCount === 'number' && d.fillerCount === 0 && d.wordCount >= 40;
    });
}

/* ------------------------------------------------------------------ */
/* Achievements                                                       */
/* ------------------------------------------------------------------ */

export const ACHIEVEMENTS = [
    /* ----- Learning ----- */
    {
        id: 'first-lesson',
        category: 'Learning',
        tier: TIERS.BRONZE,
        name: 'First Steps',
        description: 'Complete your first lesson.',
        check: s => lessonCount(s) >= 1
    },
    {
        id: 'five-lessons',
        category: 'Learning',
        tier: TIERS.BRONZE,
        name: 'Getting Oriented',
        description: 'Complete 5 lessons.',
        check: s => lessonCount(s) >= 5
    },
    {
        id: 'ten-lessons',
        category: 'Learning',
        tier: TIERS.SILVER,
        name: 'Half Way There',
        description: 'Complete 10 lessons.',
        check: s => lessonCount(s) >= 10
    },
    {
        id: 'all-lessons',
        category: 'Learning',
        tier: TIERS.GOLD,
        name: 'Curious Mind',
        description: 'Complete 18 or more lessons.',
        check: s => lessonCount(s) >= 18
    },

    /* ----- Speaking ----- */
    {
        id: 'first-speech',
        category: 'Speaking',
        tier: TIERS.BRONZE,
        name: 'First Words',
        description: 'Save your first speech.',
        check: s => speechCount(s) >= 1
    },
    {
        id: 'ten-speeches',
        category: 'Speaking',
        tier: TIERS.SILVER,
        name: 'Repeat Offender',
        description: 'Save 10 speeches.',
        check: s => speechCount(s) >= 10
    },
    {
        id: 'strong-speech',
        category: 'Speaking',
        tier: TIERS.SILVER,
        name: 'Clear Voice',
        description: 'Score 85 or higher on speech content.',
        check: s => bestSpeechContent(s) >= 85
    },
    {
        id: 'diplomatic-tongue',
        category: 'Speaking',
        tier: TIERS.GOLD,
        name: 'Diplomatic Tongue',
        description: 'Score 90 or higher on diplomatic language in any speech.',
        check: s => hasAnyScoreAbove(s, 'diplomacy', 90)
    },

    /* ----- Delivery ----- */
    {
        id: 'first-recording',
        category: 'Delivery',
        tier: TIERS.BRONZE,
        name: 'On Air',
        description: 'Record and evaluate your first speech with voice.',
        check: s => voiceCount(s) >= 1
    },
    {
        id: 'five-recordings',
        category: 'Delivery',
        tier: TIERS.SILVER,
        name: 'Practice Room',
        description: 'Evaluate 5 voice recordings.',
        check: s => voiceCount(s) >= 5
    },
    {
        id: 'ideal-pace',
        category: 'Delivery',
        tier: TIERS.SILVER,
        name: 'Steady Pace',
        description: 'Deliver a speech at 120–160 words per minute.',
        check: s => hasVoiceWithWpm(s, 120, 160)
    },
    {
        id: 'clean-delivery',
        category: 'Delivery',
        tier: TIERS.GOLD,
        name: 'No Fillers',
        description: 'Deliver 40+ words with zero filler words.',
        check: s => hasVoiceWithNoFillers(s)
    },
    {
        id: 'delivery-90',
        category: 'Delivery',
        tier: TIERS.PLATINUM,
        name: 'Master Orator',
        description: 'Score 90 or higher on voice delivery.',
        check: s => bestVoiceScore(s) >= 90
    },

    /* ----- Debating ----- */
    {
        id: 'first-debate',
        category: 'Debating',
        tier: TIERS.BRONZE,
        name: 'First Round',
        description: 'Complete your first debate against an AI opponent.',
        check: s => debateCount(s) >= 1
    },
    {
        id: 'five-debates',
        category: 'Debating',
        tier: TIERS.SILVER,
        name: 'Sparring Partner',
        description: 'Complete 5 debates.',
        check: s => debateCount(s) >= 5
    },
    {
        id: 'strong-debate',
        category: 'Debating',
        tier: TIERS.GOLD,
        name: 'Sharp Tongue',
        description: 'Score 8 or higher on a debate scorecard.',
        check: s => hasAnyDebateOverall(s, 8)
    },
    {
        id: 'first-poi',
        category: 'Debating',
        tier: TIERS.BRONZE,
        name: 'On the Spot',
        description: 'Complete your first POI session.',
        check: s => poiCount(s) >= 1
    },
    {
        id: 'poi-avg-8',
        category: 'Debating',
        tier: TIERS.GOLD,
        name: 'Quick Thinker',
        description: 'Finish a POI session with an average of 8 or higher.',
        check: s => hasAnyPoiAvg(s, 8)
    },

    /* ----- Research & Writing ----- */
    {
        id: 'first-research',
        category: 'Research & Writing',
        tier: TIERS.BRONZE,
        name: 'On the Record',
        description: 'Generate your first research dossier.',
        check: s => researchCount(s) >= 1
    },
    {
        id: 'three-research',
        category: 'Research & Writing',
        tier: TIERS.SILVER,
        name: 'Deep Diver',
        description: 'Generate 3 research dossiers.',
        check: s => researchCount(s) >= 3
    },
    {
        id: 'first-paper',
        category: 'Research & Writing',
        tier: TIERS.BRONZE,
        name: 'Signed Off',
        description: 'Save your first position paper.',
        check: s => paperCount(s) >= 1
    },
    {
        id: 'first-resolution',
        category: 'Research & Writing',
        tier: TIERS.BRONZE,
        name: 'Sponsor',
        description: 'Save your first draft resolution.',
        check: s => resCount(s) >= 1
    },
    {
        id: 'five-resolutions',
        category: 'Research & Writing',
        tier: TIERS.GOLD,
        name: 'Resolution Architect',
        description: 'Save 5 draft resolutions.',
        check: s => resCount(s) >= 5
    },

    /* ----- Simulation ----- */
    {
        id: 'first-sim',
        category: 'Simulation',
        tier: TIERS.SILVER,
        name: 'Welcome to Committee',
        description: 'Complete a full conference simulation.',
        check: s => simCount(s) >= 1
    },
    {
        id: 'five-sims',
        category: 'Simulation',
        tier: TIERS.GOLD,
        name: 'Seasoned Delegate',
        description: 'Complete 5 conference simulations.',
        check: s => simCount(s) >= 5
    },
    {
        id: 'first-crisis',
        category: 'Simulation',
        tier: TIERS.SILVER,
        name: 'Holding Steady',
        description: 'Respond to a crisis event.',
        check: s => crisisCount(s) >= 1
    },
    {
        id: 'ten-crises',
        category: 'Simulation',
        tier: TIERS.GOLD,
        name: 'Crisis Manager',
        description: 'Respond to 10 crisis events.',
        check: s => crisisCount(s) >= 10
    },

    /* ----- Consistency ----- */
    {
        id: 'streak-3',
        category: 'Consistency',
        tier: TIERS.BRONZE,
        name: 'Three Days In',
        description: 'Practice three days in a row.',
        check: () => computeStreak().current >= 3
    },
    {
        id: 'streak-7',
        category: 'Consistency',
        tier: TIERS.SILVER,
        name: 'One Week Strong',
        description: 'Practice seven days in a row.',
        check: () => computeStreak().current >= 7
    },
    {
        id: 'streak-30',
        category: 'Consistency',
        tier: TIERS.PLATINUM,
        name: 'Habit',
        description: 'Practice thirty days in a row.',
        check: () => computeStreak().current >= 30
    },
    {
        id: 'all-skills-50',
        category: 'Consistency',
        tier: TIERS.GOLD,
        name: 'All-Rounder',
        description: 'Reach 50 in every skill.',
        hidden: true,
        check: () => {
            const skills = computeSkills();
            return SKILL_KEYS.every(k => (skills[k] || 0) >= 50);
        }
    }
];

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

let engineInstalled = false;
let lastSnapshot = null;
let pendingToasts = [];

/**
 * Returns list of achievement IDs currently unlocked from state.
 */
export function evaluate(state) {
    const unlocked = [];
    for (const a of ACHIEVEMENTS) {
        try {
            if (a.check(state)) unlocked.push(a.id);
        } catch (err) {
            console.warn(`[achievements] check failed for ${a.id}:`, err.message);
        }
    }
    return unlocked;
}

/**
 * Runs the evaluation against the current store. Unlocks any new
 * achievements, records timestamps, and fires the onUnlock callback
 * for each newly unlocked one.
 */
export function run() {
    const s = store.get();
    const previouslyUnlocked = new Set(s.achievements?.unlockedIds || []);
    const qualified = evaluate(s);
    const newlyUnlocked = qualified.filter(id => !previouslyUnlocked.has(id));

    if (!newlyUnlocked.length) return [];

    const now = Date.now();
    const timestamps = { ...(s.achievements?.unlockedAt || {}) };
    for (const id of newlyUnlocked) timestamps[id] = now;

    const nextUnlockedIds = [...previouslyUnlocked, ...newlyUnlocked];

    store.set({
        achievements: {
            unlockedIds: nextUnlockedIds,
            unlockedAt: timestamps
        }
    });

    const records = newlyUnlocked
        .map(id => ACHIEVEMENTS.find(a => a.id === id))
        .filter(Boolean);

    for (const rec of records) {
        try { onUnlockCallbacks.forEach(fn => fn(rec)); }
        catch (err) { console.warn('[achievements] unlock callback failed:', err.message); }
    }

    return records;
}

const onUnlockCallbacks = new Set();

export function onUnlock(fn) {
    onUnlockCallbacks.add(fn);
    return () => onUnlockCallbacks.delete(fn);
}

/**
 * Installs the engine. Subscribes to the store and re-runs evaluation
 * after every change. Debounced so rapid successive writes (e.g. saving
 * a speech that touches multiple fields) only trigger one pass.
 */
export function install() {
    if (engineInstalled) return;
    engineInstalled = true;

    let timer = null;
    store.subscribe(() => {
        clearTimeout(timer);
        timer = setTimeout(() => {
            try { run(); }
            catch (err) { console.warn('[achievements] engine error:', err.message); }
        }, 250);
    });

    // Run once shortly after boot for any achievements that already qualify.
    setTimeout(() => {
        try { run(); } catch { }
    }, 1200);
}

/* ------------------------------------------------------------------ */
/* Query helpers (for the page)                                       */
/* ------------------------------------------------------------------ */

export function getUnlockedSet() {
    const s = store.get();
    return new Set(s.achievements?.unlockedIds || []);
}

export function getUnlockedAt(id) {
    const s = store.get();
    return s.achievements?.unlockedAt?.[id] || null;
}

export function countsByCategory() {
    const unlocked = getUnlockedSet();
    const totals = {};
    const unlockedCount = {};
    for (const a of ACHIEVEMENTS) {
        totals[a.category] = (totals[a.category] || 0) + 1;
        if (unlocked.has(a.id)) unlockedCount[a.category] = (unlockedCount[a.category] || 0) + 1;
    }
    return Object.entries(totals).map(([cat, total]) => ({
        category: cat,
        unlocked: unlockedCount[cat] || 0,
        total
    }));
}

export function overallProgress() {
    const unlocked = getUnlockedSet();
    return { unlocked: unlocked.size, total: ACHIEVEMENTS.length };
}