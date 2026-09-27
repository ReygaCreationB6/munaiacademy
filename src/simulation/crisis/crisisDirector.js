import { getScenario } from './scenarios.js';
import { EFFECT, scoreCustomResponse } from './crisisTypes.js';

export class CrisisDirector {
    constructor({ scenarioKey, difficulty = 'medium' } = {}) {
        this.scenario = getScenario(scenarioKey);
        this.difficulty = difficulty;
        this.firedIds = new Set();
        this.turnCounter = 0;
        this.log = [];
        this.activeEvent = null;
        this._expiresAt = null;
    }

    tick(engine) {
        if (this.activeEvent) return null;
        if (!engine || !engine.state) return null;
        this.turnCounter++;

        const pacing = { easy: 3, medium: 2, hard: 2 }[this.difficulty] || 2;
        if (this.turnCounter < pacing) return null;

        const next = this.scenario.events.find(e => !this.firedIds.has(e.id));
        if (!next) return null;
        if (this.turnCounter < (next.minTurn || 0)) return null;
        if (next.triggersOn && !next.triggersOn.includes(engine.state.phase)) return null;

        return next;
    }

    /** Fire an event. Clones the source object so the shared scenario data
     *  is never mutated. Concurrent directors can run independently. */
    fire(engine, event) {
        // Deep-ish clone: shallow copy the event, keep options array fresh.
        const liveEvent = {
            ...event,
            options: Array.isArray(event.options) ? event.options.map(o => ({ ...o })) : [],
            triggersOn: event.triggersOn ? [...event.triggersOn] : undefined
        };

        this.firedIds.add(liveEvent.id);
        this.activeEvent = liveEvent;

        if (liveEvent.responseWindow) {
            const scale = { easy: 1.4, medium: 1, hard: 0.75 }[this.difficulty] || 1;
            liveEvent._window = Math.max(20, Math.round(liveEvent.responseWindow * scale));
            liveEvent._expiresAt = Date.now() + liveEvent._window * 1000;
        } else {
            liveEvent._window = 0;
            liveEvent._expiresAt = null;
        }

        return liveEvent;
    }

    resolve(engine, { optionKey, customText = '', expired = false }) {
        const event = this.activeEvent;
        if (!event) return null;

        const options = Array.isArray(event.options) ? event.options : [];
        let option = options.find(o => o.key === optionKey);
        let customEffects = [];
        let userText = '';

        if (customText && String(customText).trim()) {
            userText = String(customText).trim();
            const score = scoreCustomResponse(userText);
            customEffects = [
                { kind: EFFECT.SHIFT_RELATION, target: '*', delta: score * 0.06 },
                score > 0
                    ? { kind: EFFECT.AWARD_XP, amount: 4 + score * 2 }
                    : { kind: EFFECT.NARRATIVE, text: score === 0 ? 'The response is recorded.' : 'The response is not well-received.' }
            ];
        } else if (option) {
            userText = option.text || '';
        } else if (expired && options.length) {
            // Fall back to the last option; guard against empty options.
            option = options[options.length - 1];
            userText = `[No response within window] — ${option.text || ''}`;
            customEffects = [{ kind: EFFECT.PENALTY_XP, amount: 3 }];
        } else if (expired) {
            userText = `[No response within window]`;
            customEffects = [{ kind: EFFECT.PENALTY_XP, amount: 3 }];
        }

        const allEffects = [...(option?.effects || []), ...customEffects];
        const applied = this.applyEffects(engine, allEffects);

        const record = {
            eventId: event.id,
            title: event.title,
            choice: option?.key || 'custom',
            userText: userText || '',
            expired,
            applied,
            aiReactions: event.aiReactions !== false,
            ts: Date.now()
        };
        this.log.push(record);
        this.activeEvent = null;
        this._expiresAt = null;

        const chairResponse = this.chairLine(record, applied);
        return { record, chairResponse };
    }

    applyEffects(engine, effects) {
        const applied = [];
        if (!engine || !Array.isArray(engine.delegates)) return applied;

        for (const e of effects) {
            if (!e || !e.kind) continue;
            switch (e.kind) {
                case EFFECT.SHIFT_RELATION: {
                    const delta = Number(e.delta) || 0;
                    const targets = e.target === '*'
                        ? engine.delegates.filter(d => !d.isUser)
                        : engine.delegates.filter(d => d.country === e.target);
                    for (const d of targets) {
                        d.relations = d.relations || {};
                        d.relations['__user__'] = clamp((d.relations['__user__'] || 0) + delta, -1, 1);
                    }
                    applied.push(`relations ${delta > 0 ? '+' : ''}${delta.toFixed(2)}`);
                    break;
                }
                case EFFECT.SHIFT_STANCE: {
                    const targets = e.target === '*'
                        ? engine.delegates.filter(d => !d.isUser)
                        : engine.delegates.filter(d => d.country === e.target);
                    for (const d of targets) d.stance = e.stance || 'undecided';
                    applied.push(`stance → ${e.stance || 'undecided'}`);
                    break;
                }
                case EFFECT.AWARD_XP: {
                    const amount = Number(e.amount) || 0;
                    engine.state.score.crisisXP = (engine.state.score.crisisXP || 0) + amount;
                    applied.push(`+${amount} XP`);
                    break;
                }
                case EFFECT.PENALTY_XP: {
                    const amount = Number(e.amount) || 0;
                    engine.state.score.crisisXP = (engine.state.score.crisisXP || 0) - amount;
                    applied.push(`−${amount} XP`);
                    break;
                }
                case EFFECT.UNLOCK_MOTION: {
                    if (!e.motionKey) break;
                    engine.state.crisisUnlocks = engine.state.crisisUnlocks || [];
                    if (!engine.state.crisisUnlocks.includes(e.motionKey)) {
                        engine.state.crisisUnlocks.push(e.motionKey);
                    }
                    applied.push(`unlocked ${e.motionKey}`);
                    break;
                }
                case EFFECT.NARRATIVE:
                    if (e.text) applied.push(e.text);
                    break;
            }
        }
        return applied;
    }

    chairLine(record, applied) {
        if (record.expired) {
            return `The Chair notes the absence of a timely response from the delegate. The matter is recorded.`;
        }
        const userText = String(record.userText || '');
        const head = userText.length > 40
            ? `The Chair thanks the delegate for their statement.`
            : `The Chair acknowledges the delegate's position.`;
        const narrative = (applied || []).find(
            a => typeof a === 'string' && a.length > 25 && !a.startsWith('relations')
        );
        return narrative ? `${head} ${narrative}` : head;
    }

    getLog() { return this.log; }
    get active() { return this.activeEvent; }
    get expiresAt() { return this._expiresAt; }

    cancel() {
        this.activeEvent = null;
        this._expiresAt = null;
    }
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }