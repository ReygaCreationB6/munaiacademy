/**
 * AI Director — procedural orchestration for multiplayer rooms.
 *
 * Responsibilities:
 *   1. Pacing — throttles how often AI delegates speak.
 *   2. Thinking beat — broadcasts a visible "drafting" state before the speech.
 *   3. Targeting — picks who each AI is responding to, using:
 *        • the most recent speaker (30%)
 *        • a low-relation country (25%)
 *        • a high-relation country (15%)
 *        • random (30%)
 *   4. Relations — updates each AI's opinion of others based on the
 *      intent (support / challenge) of every speech they hear.
 *   5. Chair beats — the AI chair makes occasional procedural notes.
 *   6. Motions — occasionally proposes motions during open debate.
 *
 * All decisions are server-side; the language model only writes prose.
 */

import crypto from 'node:crypto';

const newId = () => crypto.randomBytes(6).toString('hex');

/* ------------------------------------------------------------------ */
/* Config                                                               */
/* ------------------------------------------------------------------ */

function config() {
    return {
        tickIntervalMs: Number(process.env.ROOM_AI_TICK_INTERVAL_MS || 10000),
        speakCooldownMs: Number(process.env.ROOM_AI_SPEAK_COOLDOWN_MS || 50000),
        thinkMinMs: Number(process.env.ROOM_AI_THINK_MIN_MS || 3500),
        thinkMaxMs: Number(process.env.ROOM_AI_THINK_MAX_MS || 8000),
        passChance: Number(process.env.ROOM_AI_PASS_CHANCE || 0.08),
        motionCooldownMs: Number(process.env.ROOM_AI_MOTION_COOLDOWN_MS || 90000),
        chairIdleMs: Number(process.env.ROOM_AI_CHAIR_IDLE_MS || 45000),
        chairBeatMs: Number(process.env.ROOM_AI_CHAIR_BEAT_MS || 60000)
    };
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

/* ------------------------------------------------------------------ */
/* Voting heuristic                                                     */
/* ------------------------------------------------------------------ */

function decideVote(delegate, voteText) {
    const text = String(voteText || '').toLowerCase();
    const p = delegate.profile || {};
    const interests = Array.isArray(p.interests) ? p.interests : [];
    const redLines = Array.isArray(p.redLines) ? p.redLines : [];

    let score = 0;
    for (const i of interests) if (text.includes(String(i).toLowerCase())) score += 2;
    for (const r of redLines) if (text.includes(String(r).toLowerCase())) score -= 6;

    const coop = (delegate.personality?.traits?.cooperativeness) ?? 0.6;
    score *= 0.5 + coop * 0.7;
    score += (Math.random() - 0.5) * 1.2;

    if (score >= 1.2) return { vote: 'yes', reason: 'aligned with our interests' };
    if (score <= -1.2) return { vote: 'no', reason: 'conflicts with our position' };
    if (Math.random() < 0.6) return { vote: 'yes', reason: 'supported in the interest of progress' };
    return { vote: 'abstain', reason: 'requires further consideration' };
}

/* ------------------------------------------------------------------ */
/* Motion heuristics                                                    */
/* ------------------------------------------------------------------ */

function ruleOnMotion(motion) {
    const kind = motion.kind || 'generic';
    if (['open-mod', 'open-unmod', 'introduce-res', 'close-debate'].includes(kind)) return 'passed';
    return 'tabled';
}

/* ------------------------------------------------------------------ */
/* Relations                                                            */
/* ------------------------------------------------------------------ */

function ensureRelations(delegate, otherCountries) {
    delegate.relations = delegate.relations || {};
    for (const c of otherCountries) {
        if (c === delegate.country) continue;
        if (typeof delegate.relations[c] !== 'number') {
            delegate.relations[c] = 0;
        }
    }
}

function updateRelations(speaker, entry, room) {
    // Every OTHER AI updates its opinion of the speaker based on intent + target.
    const target = entry.target;
    const intent = entry.intent;
    if (!target || intent === 'neutral') return;

    for (const d of room.aiDelegates || []) {
        if (d === speaker) continue;
        ensureRelations(d, (room.aiDelegates || []).map(x => x.country).concat(
            (room.delegates || []).map(x => x.country)
        ));

        if (intent === 'support') {
            d.relations[speaker.country] = clamp((d.relations[speaker.country] || 0) + 0.2, -1, 1);
        } else if (intent === 'challenge') {
            d.relations[speaker.country] = clamp((d.relations[speaker.country] || 0) - 0.25, -1, 1);
        }

        // If the speaker challenged a country, that country also dislikes the speaker.
        if (intent === 'challenge' && d.country === target) {
            d.relations[speaker.country] = clamp((d.relations[speaker.country] || 0) - 0.35, -1, 1);
        }
        // If the speaker supported a country, that country likes the speaker more.
        if (intent === 'support' && d.country === target) {
            d.relations[speaker.country] = clamp((d.relations[speaker.country] || 0) + 0.3, -1, 1);
        }
    }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ------------------------------------------------------------------ */
/* Targeting                                                            */
/* ------------------------------------------------------------------ */

function pickTarget(speaker, room) {
    const countries = new Set();
    for (const d of room.delegates || []) countries.add(d.country);
    for (const d of room.aiDelegates || []) countries.add(d.country);
    countries.delete(speaker.country);

    // Recent speaker?
    const recentSpeaker = (room.transcript || [])
        .slice(-8)
        .reverse()
        .find(e => (e.kind === 'delegate' || e.kind === 'chat') && e.country && e.country !== speaker.country);

    // Lowest relation (most disagree with).
    ensureRelations(speaker, [...countries]);
    const sorted = [...countries].sort((a, b) =>
        (speaker.relations[a] || 0) - (speaker.relations[b] || 0)
    );
    const lowest = sorted[0];
    const highest = sorted[sorted.length - 1];

    const roll = Math.random();
    let target = 'All';
    if (roll < 0.30 && recentSpeaker) target = recentSpeaker.country;
    else if (roll < 0.55 && lowest) target = lowest;
    else if (roll < 0.70 && highest) target = highest;

    // Find the transcript entry we're responding to.
    let replyToId = null;
    if (target && target !== 'All') {
        const parent = (room.transcript || [])
            .slice()
            .reverse()
            .find(e => (e.kind === 'delegate' || e.kind === 'chat') && e.country === target);
        if (parent) replyToId = parent.id;
    }

    return { target, replyToId };
}

/* ------------------------------------------------------------------ */
/* Personality weighting for who speaks next                            */
/* ------------------------------------------------------------------ */

function personalityWeight(delegate) {
    // Lower weight = speaks sooner.
    const traits = delegate.personality?.traits || {};
    const verbosity = typeof traits.verbosity === 'number' ? traits.verbosity : 0.6;
    // Verbose delegates speak more; quiet delegates speak less.
    return 1.2 - verbosity;
}

/* ------------------------------------------------------------------ */
/* Director                                                             */
/* ------------------------------------------------------------------ */

export const aiDirector = {
    async tick(room, broadcast, broadcastState) {
        if (!room || room.phase !== 'session') return false;
        if (room.sockets.size === 0) return false;

        // 1. Vote dispatch — highest priority.
        if (room.vote && room.vote.phase === 'open') {
            return this._tickVote(room, broadcastState);
        }

        // 2. AI chair procedural.
        if (room.roleMode === 'delegate' && room.aiChair) {
            if (this._tickChair(room, broadcastState)) return true;
        }

        // 3. Delegate speech (paced).
        if (room.aiSettings?.enabled) {
            const spoke = await this._tickSpeak(room, broadcast, broadcastState);
            if (spoke) return true;
        }

        // 4. Motions (paced).
        return this._tickMotions(room, broadcastState);
    },

    /* ----------------------- vote dispatch ----------------------- */

    _tickVote(room, broadcastState) {
        const pending = room.vote.pendingAIVotes || [];
        if (!pending.length) return false;
        const now = Date.now();
        const due = pending.filter(p => p.at <= now);
        if (!due.length) return false;

        for (const p of due) {
            const d = room.aiDelegates.find(x => x.id === p.id);
            if (!d) continue;
            const decision = decideVote(d, room.vote.text);
            for (const k of ['yes', 'no', 'abstain']) {
                room.vote.votes[k] = room.vote.votes[k].filter(x => x.id !== d.id);
            }
            room.vote.votes[decision.vote].push({
                id: d.id, name: d.name, country: d.country, isAI: true
            });
        }
        room.vote.pendingAIVotes = pending.filter(p => p.at > now);
        broadcastState(room);
        return true;
    },

    /* ----------------------- delegate speech ----------------------- */

    async _tickSpeak(room, broadcast, broadcastState) {
        const cfg = config();
        const now = Date.now();

        // Cooldown gate.
        if (now - (room.lastAISpeechAt || 0) < cfg.speakCooldownMs) return false;

        // Don't interrupt a human speaker.
        if (room.currentSpeaker && !room.currentSpeaker.id?.startsWith('ai_')) return false;

        // Don't speak while a vote is open.
        if (room.vote && room.vote.phase === 'open') return false;

        // Need at least one AI delegate available.
        const pool = (room.aiDelegates || []).filter(d => !d.isChair);
        if (!pool.length) return false;

        // Don't speak until the session has been running for a moment.
        const sessionAge = now - (room.sessionStartedAt || now);
        if (sessionAge < 15000) return false;

        // Score: prefer those who spoke longest ago, weighted by personality verbosity.
        const ranked = pool
            .map(d => ({
                delegate: d,
                score: (now - (d.lastSpokeAt || 0)) / personalityWeight(d)
            }))
            .sort((a, b) => b.score - a.score);

        const speaker = ranked[0].delegate;

        // Occasionally pass.
        if (Math.random() < cfg.passChance) {
            room.lastAISpeechAt = now;
            speaker.lastSpokeAt = now;
            room.pushTranscript({
                kind: 'system',
                content: `The delegate of ${speaker.country} declines to speak at this time.`
            });
            broadcastState(room);
            return true;
        }

        // Pick a target.
        const { target, replyToId } = pickTarget(speaker, room);

        // Thinking beat — visible pacing.
        const thinkDuration = cfg.thinkMinMs + Math.random() * (cfg.thinkMaxMs - cfg.thinkMinMs);
        const thinkUntil = now + thinkDuration;

        room.thinking = {
            country: speaker.country,
            delegateId: speaker.id,
            startedAt: now,
            until: thinkUntil
        };
        room.lastAISpeechAt = now;
        speaker.lastSpokeAt = now;
        broadcastState(room);

        // Start the AI call immediately.
        const aiPromise = (async () => {
            try {
                return await import('./aiDelegate.js').then(m =>
                    m.generateDelegateSpeech(speaker, room, {
                        target,
                        intent: null,
                        makeMistake: Math.random() < 0.12
                    })
                );
            } catch (err) {
                console.warn('[aiDirector] speech generation failed:', err.message);
                return null;
            }
        })();

        // Wait for BOTH the AI call AND the thinking beat to finish.
        const [{ speech, intent }, _] = await Promise.all([
            aiPromise,
            sleep(thinkDuration)
        ]);

        // Clear the thinking state.
        room.thinking = null;

        if (!speech) {
            broadcastState(room);
            return true;
        }

        // Push the speech as a rich entry.
        const entry = {
            kind: 'delegate',
            from: speaker.country,
            country: speaker.country,
            content: speech,
            isAI: true,
            intent: intent || 'neutral',
            target: target || null,
            replyToId: replyToId || null,
            personality: speaker.personality?.name || null
        };
        const pushed = room.pushTranscript(entry);

        // Update relations for everyone who hears this.
        updateRelations(speaker, pushed, room);

        broadcastState(room);
        return true;
    },

    /* ----------------------- motions ----------------------- */

    _tickMotions(room, broadcastState) {
        const cfg = config();
        if (room.motions.some(m => m.status === 'pending')) return false;
        if (room.vote && room.vote.phase === 'open') return false;
        if (room.currentSpeaker) return false;
        if ((room.queue || []).length) return false;

        const now = Date.now();
        if (now - (room.lastAIMotionAt || 0) < cfg.motionCooldownMs) return false;

        const proposer = (room.aiDelegates || []).find(d => !d.isChair);
        if (!proposer) return false;

        // Only propose if the committee has heard some speeches.
        const speeches = (room.transcript || []).filter(e => e.kind === 'delegate' || e.kind === 'chat').length;
        if (speeches < 3) return false;

        room.lastAIMotionAt = now;

        const variants = [
            { kind: 'open-mod', text: `Motion to open a moderated caucus on climate finance, 30 seconds speaking time, 10 minutes total.` },
            { kind: 'open-mod', text: `Motion to open a moderated caucus on technology transfer and capacity-building, 30 seconds, 8 minutes.` },
            { kind: 'open-unmod', text: `Motion to open an unmoderated caucus for 5 minutes to negotiate draft language.` },
            { kind: 'open-unmod', text: `Motion to open an unmoderated caucus for 8 minutes to build coalition support.` },
            { kind: 'introduce-res', text: `Motion to introduce a draft resolution.` }
        ];
        const pick = variants[Math.floor(Math.random() * variants.length)];

        const motion = {
            id: newId(),
            kind: pick.kind,
            by: { id: proposer.id, name: proposer.name, country: proposer.country, isAI: true },
            text: pick.text,
            status: 'pending',
            ts: now
        };
        room.motions.push(motion);
        room.pushTranscript({
            kind: 'motion',
            from: proposer.country,
            content: `${proposer.country} moves: ${pick.text}`,
            isAI: true
        });

        // If the AI is chair, rule after a beat.
        if (room.roleMode === 'delegate' && room.aiChair) {
            setTimeout(() => {
                try {
                    const m = room.motions.find(x => x.id === motion.id);
                    if (!m || m.status !== 'pending') return;
                    const decision = ruleOnMotion(m);
                    m.status = decision;
                    room.pushTranscript({
                        kind: 'chair',
                        speaker: 'Chair',
                        content: `The Chair rules the motion ${decision === 'passed' ? 'in order' : 'out of order'}.`
                    });
                    broadcastState(room);
                } catch (err) {
                    console.warn('[aiDirector] motion rule failed:', err.message);
                }
            }, 1500);
        }

        broadcastState(room);
        return true;
    },

    /* ----------------------- chair ----------------------- */

    _tickChair(room, broadcastState) {
        const cfg = config();
        const now = Date.now();

        // A. Pending motion — rule on it.
        const pending = (room.motions || []).find(m => m.status === 'pending');
        if (pending) {
            const decision = ruleOnMotion(pending);
            pending.status = decision;
            room.pushTranscript({
                kind: 'chair',
                speaker: 'Chair',
                content: `The Chair rules the motion ${decision === 'passed' ? 'in order' : 'out of order'}.`
            });
            broadcastState(room);
            return true;
        }

        // B. Something to recognize.
        if (!room.currentSpeaker && (room.queue || []).length) {
            const next = room.queue.shift();
            room.currentSpeaker = { ...next, startedAt: Date.now(), duration: 60 };
            room.pushTranscript({
                kind: 'chair',
                speaker: 'Chair',
                content: `The Chair recognizes the delegate of ${next.country || next.name}.`
            });
            broadcastState(room);
            return true;
        }

        // C. Speaker overtime.
        if (room.currentSpeaker) {
            const elapsed = (Date.now() - room.currentSpeaker.startedAt) / 1000;
            const limit = (room.currentSpeaker.duration || 60) + 20;
            if (elapsed > limit) {
                room.pushTranscript({
                    kind: 'chair',
                    speaker: 'Chair',
                    content: `The Chair thanks the delegate. Time has expired.`
                });
                room.currentSpeaker = null;
                broadcastState(room);
                return true;
            }
        }

        // D. Idle prompt.
        if (!room.currentSpeaker && !(room.queue || []).length && !(room.vote && room.vote.phase === 'open')) {
            if (now - (room.lastChairIdleAt || 0) > cfg.chairIdleMs) {
                room.lastChairIdleAt = now;
                const prompts = [
                    `The floor is open for any points or motions.`,
                    `The Chair invites delegations to raise their placards.`,
                    `The Chair reminds delegates that the floor remains open.`,
                    `The Chair will entertain any motions on the floor.`
                ];
                room.pushTranscript({
                    kind: 'chair',
                    speaker: 'Chair',
                    content: prompts[Math.floor(Math.random() * prompts.length)]
                });
                broadcastState(room);
                return true;
            }
        }

        return false;
    },

    /**
     * Called by ws.js when a new vote opens. Schedules AI votes with
     * staggered delays so the tally fills in visibly.
     */
    scheduleAIVotes(room) {
        if (!room.vote) return;
        const now = Date.now();
        room.vote.pendingAIVotes = (room.aiDelegates || [])
            .filter(d => !d.isChair)
            .map((d, i) => ({
                id: d.id,
                at: now + 2000 + i * 900 + Math.random() * 1200
            }));
    }
};