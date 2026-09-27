import { store } from '../core/store.js';

const uid = () => Math.random().toString(36).slice(2, 10);
const MAX_EVENTS = 3000;

/* ------------------------------------------------------------------ */
/* Date helpers                                                       */
/* ------------------------------------------------------------------ */
/* All heatmap and streak math uses LOCAL calendar days, not UTC days,
   so the user sees their activity in the timezone they actually live in.
   A US-East user's 8 PM session counts as today, not tomorrow. */

function localDateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
}

function parseLocalDateKey(key) {
    const parts = String(key).split('-').map(Number);
    const y = parts[0] || 1970;
    const m = (parts[1] || 1) - 1;
    const d = parts[2] || 1;
    return new Date(y, m, d);
}

/** Whole-day difference between two dates, robust to DST shifts. */
function daysBetween(a, b) {
    const aMs = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
    const bMs = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
    return Math.round((bMs - aMs) / 86400000);
}

/* ------------------------------------------------------------------ */
/* Write                                                              */
/* ------------------------------------------------------------------ */

export function track(kind, meta = {}) {
    try {
        const s = store.get();
        const entry = { id: uid(), kind: String(kind || 'unknown'), ts: Date.now(), meta: meta || {} };
        const list = [...(s.analyticsEvents || []), entry];
        store.set({ analyticsEvents: list.slice(-MAX_EVENTS) });
    } catch (err) {
        // Analytics must never break the app — swallow and log.
        console.warn('[metrics] track failed:', err?.message || err);
    }
}

export function events() {
    return store.get().analyticsEvents || [];
}

/** Filter to structurally valid events, used by every consumer below. */
function validEvents() {
    return events().filter(e => e && typeof e.ts === 'number' && Number.isFinite(e.ts));
}

/* ------------------------------------------------------------------ */
/* Skills                                                             */
/* ------------------------------------------------------------------ */

export const SKILL_KEYS = ['Speech', 'Debate', 'Research', 'Diplomacy', 'Resolution Writing', 'Delivery'];

export function computeSkills() {
    const s = store.get();
    const evs = validEvents();

    // ---- Speech + Diplomacy: average of saved speech scores ----
    const scoredSpeeches = (s.speeches || []).filter(sp =>
        sp && sp.scores && (sp.scores.content || sp.scores.diplomacy)
    );
    const speech = scoredSpeeches.length
        ? Math.round(avg(scoredSpeeches.map(sp =>
            ((sp.scores.content || 0) + (sp.scores.diplomacy || 0)) / 2
        )))
        : 0;
    const diplomacy = scoredSpeeches.length
        ? Math.round(avg(scoredSpeeches.map(sp => sp.scores.diplomacy || 0)))
        : 0;
    const deliveryScores = (s.speeches || [])
        .filter(sp => sp && sp.scores && typeof sp.scores.delivery === 'number' && sp.scores.delivery > 0)
        .map(sp => sp.scores.delivery);
    const delivery = deliveryScores.length
        ? Math.round(avg(deliveryScores))
        : 0;

    // ---- Research: papers + events + depth ----
    const papers = (s.positionPapers || []).length;
    const researchEvents = evs.filter(e => e.kind === 'research').length;
    const research = Math.min(100, papers * 18 + researchEvents * 8);

    // ---- Debate: motion + POI + speech activity across sims ----
    const simEvents = evs.filter(e => e.kind === 'simulation');
    const crisisChoices = evs.filter(e => e.kind === 'crisis-choice').length;
    let debate = 0;
    if (simEvents.length) {
        const perSim = simEvents.map(e => {
            const m = e.meta || {};
            return (m.motionsPassed || 0) * 8 + (m.poisAnswered || 0) * 10 + (m.speeches || 0) * 3;
        });
        debate = Math.min(100, Math.round(avg(perSim)) + Math.min(20, crisisChoices * 2));
    }

    // ---- Resolution Writing: clause richness ----
    const resolutions = s.resolutions || [];
    const resolutionWriting = resolutions.length
        ? Math.min(100, Math.round(avg(resolutions.map(r => {
            const op = ((r && r.operative) || []).length;
            const pre = ((r && r.preamble) || []).length;
            return Math.min(100, op * 15 + pre * 6);
        }))))
        : 0;

    return {
        Speech: clamp(speech),
        Debate: clamp(debate),
        Research: clamp(research),
        Diplomacy: clamp(diplomacy),
        'Resolution Writing': clamp(resolutionWriting),
        Delivery: clamp(delivery)
    };
}

function avg(arr) { return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0; }
function clamp(v) { return Math.max(0, Math.min(100, Math.round(Number(v) || 0))); }

/* ------------------------------------------------------------------ */
/* Heatmap                                                            */
/* ------------------------------------------------------------------ */

export function computeHeatmap(weeks = 12) {
    const days = Math.max(7, weeks * 7);

    // Count events per LOCAL calendar day.
    const counts = {};
    for (const e of validEvents()) {
        const key = localDateKey(new Date(e.ts));
        counts[key] = (counts[key] || 0) + 1;
    }

    // Anchor: this week's Saturday at the right edge, `days` cells back.
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const end = new Date(today);
    end.setDate(end.getDate() - today.getDay() + 6);
    const start = new Date(end);
    start.setDate(start.getDate() - (days - 1));

    const out = [];
    let maxCount = 0;
    for (let i = 0; i < days; i++) {
        const d = new Date(start);
        d.setDate(d.getDate() + i);
        const key = localDateKey(d);
        const count = counts[key] || 0;
        if (count > maxCount) maxCount = count;
        out.push({ date: key, count, level: 0 });
    }

    const max = maxCount || 1;
    for (const cell of out) {
        cell.level = cell.count === 0 ? 0
            : cell.count <= Math.max(1, Math.ceil(max / 4)) ? 1
                : cell.count <= Math.ceil(max / 2) ? 2
                    : cell.count <= Math.ceil((max * 3) / 4) ? 3
                        : 4;
    }

    return {
        days: out,
        startDate: start,
        endDate: end,
        maxCount,
        total: out.reduce((n, c) => n + c.count, 0)
    };
}

/* ------------------------------------------------------------------ */
/* Streak                                                             */
/* ------------------------------------------------------------------ */

export function computeStreak() {
    const evs = validEvents();
    if (!evs.length) return { current: 0, longest: 0 };

    const daySet = new Set();
    for (const e of evs) daySet.add(localDateKey(new Date(e.ts)));
    if (!daySet.size) return { current: 0, longest: 0 };

    // ---- Current streak: walk backward from today ----
    // If today has no activity yet, start counting from yesterday, so the
    // displayed streak doesn't drop to 0 mid-day just because the user
    // hasn't practiced yet.
    let current = 0;
    const cursor = new Date();
    cursor.setHours(0, 0, 0, 0);
    if (!daySet.has(localDateKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
    }
    for (let i = 0; i < 365; i++) {
        if (daySet.has(localDateKey(cursor))) {
            current++;
            cursor.setDate(cursor.getDate() - 1);
        } else {
            break;
        }
    }

    // ---- Longest streak: chronological walk ----
    const sorted = [...daySet].sort();
    let longest = 0;
    let run = 0;
    let prev = null;
    for (const key of sorted) {
        const cur = parseLocalDateKey(key);
        if (!prev) {
            run = 1;
        } else {
            const diff = daysBetween(prev, cur);
            run = diff === 1 ? run + 1 : 1;
        }
        if (run > longest) longest = run;
        prev = cur;
    }

    return { current, longest };
}

/* ------------------------------------------------------------------ */
/* Deltas (improvement over time)                                     */
/* ------------------------------------------------------------------ */

export function computeDeltas() {
    const s = store.get();
    const scored = (s.speeches || []).filter(sp =>
        sp && sp.scores && typeof sp.scores.content === 'number' && sp.scores.content > 0
    );
    if (scored.length < 4) return {};

    // Compare the older half to the newer half.
    const half = Math.floor(scored.length / 2);
    const first = scored.slice(0, half);
    const second = scored.slice(scored.length - half);

    const avgKey = (arr, key) =>
        arr.reduce((n, sp) => n + ((sp.scores && sp.scores[key]) || 0), 0) / arr.length;

    const deltas = {};
    for (const key of ['content', 'diplomacy']) {
        const delta = Math.round(avgKey(second, key) - avgKey(first, key));
        if (delta !== 0) deltas[key] = delta;
    }
    return deltas;
}

/* ------------------------------------------------------------------ */
/* Totals                                                             */
/* ------------------------------------------------------------------ */

export function computeTotals() {
    const evs = validEvents();
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const weekAgo = new Date(now); weekAgo.setDate(weekAgo.getDate() - 7);
    const monthAgo = new Date(now); monthAgo.setDate(monthAgo.getDate() - 30);

    const inWeek = evs.filter(e => e.ts >= weekAgo.getTime()).length;
    const inMonth = evs.filter(e => e.ts >= monthAgo.getTime()).length;

    const byKind = evs.reduce((a, e) => {
        const k = e.kind || 'unknown';
        a[k] = (a[k] || 0) + 1;
        return a;
    }, {});

    return { total: evs.length, inWeek, inMonth, byKind };
}