import { Delegate } from '../delegates/Delegate.js';
import { COUNTRY_PROFILES } from '../delegates/countryProfiles.js';
import { PHASES, PHASE_LABEL, MOTIONS, motionsAvailable, validateMotion } from './procedures.js';

const sleep = ms => new Promise(r => setTimeout(r, ms));

export class SimulationEngine {
    constructor({ ai, config, isDemo = false, onEvent = () => { } }) {
        this.ai = ai;
        this.isDemo = isDemo;
        this.onEvent = onEvent;
        this._abort = false;
        this.logSeq = 0;

        const allCountries = Object.keys(COUNTRY_PROFILES);
        const userCountry = config.country || 'Chad';
        const aiCountries = allCountries.filter(c => c !== userCountry);

        // Crisis support (optional)
        this.crisisDirector = config.crisisDirector || null;
        this._resumePhaseAfterCrisis = null;

        this.delegates = [
            new Delegate({
                country: userCountry, committee: config.committee, topic: config.topic,
                isUser: true, ai
            }),
            ...aiCountries.map(c => new Delegate({
                country: c, committee: config.committee, topic: config.topic, ai
            }))
        ];

        this.state = {
            phase: PHASES.ROLL_CALL,
            committee: config.committee,
            topic: config.topic,
            difficulty: config.difficulty || 'medium',
            crisisMode: !!config.crisisMode,
            scenarioKey: config.scenarioKey || null,
            userCountry,
            transcript: [],
            speakersList: [],
            currentSpeaker: null,
            currentSpeakerTime: 0,
            activeCaucus: null,
            workingPaper: '',
            draftResolution: '',
            motionInProgress: null,
            voteResults: null,
            pendingUserInput: null,
            crisisLog: [],
            crisisUnlocks: [],
            activeCrisis: null,
            score: {
                speeches: 0,
                motionsPassed: 0,
                poisAnswered: 0,
                votesCast: 0,
                wordsSpoken: 0,
                crisisXP: 0
            },
            startedAt: Date.now()
        };
    }

    /* ---------------- event + log ---------------- */
    emit() { this.onEvent(this.state); }

    log(entry) {
        const e = { id: ++this.logSeq, ts: Date.now(), ...entry };
        this.state.transcript.push(e);
        this.emit();
        return e;
    }

    chair(text, extra = {}) {
        return this.log({ kind: 'chair', speaker: 'Chair', content: text, ...extra });
    }

    sys(text) { return this.log({ kind: 'system', speaker: 'System', content: text }); }

    delegateLog(delegate, text, extra = {}) {
        return this.log({
            kind: 'delegate', speaker: delegate.country,
            content: text, personality: delegate.personality.name, ...extra
        });
    }

    userLog(text, extra = {}) {
        return this.log({ kind: 'user', speaker: 'You', content: text, ...extra });
    }

    user() { return this.delegates.find(d => d.isUser); }
    byCountry(c) { return this.delegates.find(d => d.country === c); }
    aiDelegates() { return this.delegates.filter(d => !d.isUser); }

    isDemoProvider() {
        return this.isDemo || this.ai.provider?.constructor?.name === 'MockProvider';
    }

    setPending(input) { this.state.pendingUserInput = input; this.emit(); }
    clearPending() { this.state.pendingUserInput = null; this.emit(); }

    /* ---------------- lifecycle ---------------- */

    async start() {
        this.sys(`Simulation started · ${this.state.committee} · ${this.state.topic}${this.state.crisisMode ? ' · CRISIS MODE' : ''}`);
        await sleep(400);
        await this.rollCall();
    }

    destroy() { this._abort = true; }

    async rollCall() {
        this.state.phase = PHASES.ROLL_CALL;
        this.emit();

        this.chair(`The committee will now come to order. We are convened as the ${this.state.committee} on the topic: "${this.state.topic}".`);
        await sleep(700);
        this.chair('The Chair will now conduct roll call. Delegates, please raise your placards and declare "present" or "present and voting".');

        for (const d of this.delegates) {
            if (this._abort) return;
            await sleep(220);
            d.present = true;
            this.log({ kind: 'rollcall', speaker: d.country, content: 'present' });
        }

        await sleep(500);
        this.chair(`All ${this.delegates.length} delegations are present. The floor is now open for a motion to open debate on the agenda topic.`);
        this.setPending({ type: 'motion-floor', allowed: ['OPEN_DEBATE'] });
    }

    /* ---------------- motions ---------------- */

    async userProposeMotion(motionKey, params = {}) {
        this.clearPending();
        const { ok, error, motion } = validateMotion(motionKey, this.state.phase);
        if (!ok) { this.chair(`The Chair rules: ${error}`); return; }

        this.userLog(`Motion: ${motion.name}${params.topic ? ` on "${params.topic}"` : ''}`);

        await sleep(400);
        const seconder = this.pickSeconder(motionKey);
        if (!seconder) {
            this.chair(`There is no second. The motion fails.`);
            this.setPending({ type: 'motion-floor', allowed: motionsAvailable(this.state.phase).map(m => m.key) });
            return;
        }
        this.delegateLog(seconder, `${seconder.country} seconds the motion.`);
        await sleep(300);

        return this.voteOnMotion(motion, seconder);
    }

    async aiProposeMotion(motionKey) {
        const motion = MOTIONS[motionKey];
        if (!motion) return false;
        const proposer = this.aiDelegates()[Math.floor(Math.random() * this.aiDelegates().length)];
        this.delegateLog(proposer, `${proposer.country} moves: ${motion.name}.`);
        await sleep(400);

        const seconder = this.pickSeconder(motionKey, proposer);
        if (!seconder) { this.chair('There is no second. The motion fails.'); return false; }
        this.delegateLog(seconder, `${seconder.country} seconds the motion.`);
        await sleep(300);

        return new Promise(resolve => {
            this.state.motionInProgress = motion;
            this.setPending({
                type: 'motion-vote',
                motion,
                proposer: proposer.country,
                seconder: seconder.country,
                resolve
            });
        });
    }

    pickSeconder(motionKey, exclude) {
        const candidates = this.aiDelegates().filter(d => d !== exclude);
        const weights = candidates.map(d => 0.3 + d.personality.traits.cooperativeness * 0.7);
        return weightedPick(candidates, weights);
    }

    voteOnMotion(motion, seconder) {
        return new Promise(resolve => {
            this.state.motionInProgress = motion;
            this.setPending({
                type: 'motion-vote',
                motion,
                proposer: this.user().country,
                seconder: seconder?.country,
                resolve
            });
        });
    }

    async resolveMotionVote(userVote, motion) {
        const user = this.user();
        this.userLog(`Vote on the motion: ${userVote}`);
        await sleep(300);

        const votes = { yes: [], no: [], abstain: [] };
        if (userVote === 'yes') votes.yes.push(user.country);
        else if (userVote === 'no') votes.no.push(user.country);
        else votes.abstain.push(user.country);

        for (const d of this.aiDelegates()) {
            const t = d.personality.traits;
            const r = Math.random();
            let v;
            if (r < 0.65 * t.cooperativeness + 0.2) v = 'yes';
            else if (r < 0.9) v = 'no';
            else v = 'abstain';
            votes[v].push(d.country);
        }

        const total = votes.yes.length + votes.no.length + votes.abstain.length;
        const needed = motion.twoThirds
            ? Math.ceil((total * 2) / 3)
            : Math.floor(total / 2) + 1;
        const passed = votes.yes.length >= needed;

        this.chair(
            `Voting on the ${motion.name}: ` +
            `${votes.yes.length} in favour, ${votes.no.length} against, ${votes.abstain.length} abstaining. ` +
            `The motion ${passed ? 'PASSES' : 'FAILS'}.`
        );

        this.state.motionInProgress = null;

        if (passed) {
            this.state.score.motionsPassed += 5;
            await this.executeMotion(motion);
        } else {
            this.setPending({ type: 'motion-floor', allowed: motionsAvailable(this.state.phase).map(m => m.key) });
        }
        // The caller (UI) receives `passed` via the returned promise.
        // Do NOT call pendingUserInput.resolve here — the UI has already
        // cleared it and holds the reference directly.
        return passed;
    }

    async executeMotion(motion) {
        switch (motion.key) {
            case 'OPEN_DEBATE': return this.startGSL();
            case 'OPEN_MOD_CAUCUS': return this.enterModCaucus(motion.defaults);
            case 'OPEN_UNMOD_CAUCUS': return this.enterUnmodCaucus(motion.defaults);
            case 'INTRODUCE_RESOLUTION': return this.enterResolutionDebate();
            case 'CLOSE_DEBATE': return this.enterVoting();
            default: return this.startGSL();
        }
    }

    /* ---------------- GSL ---------------- */

    async startGSL() {
        this.state.phase = PHASES.GSL;
        this.state.speakersList = this.delegates.map(d => ({ country: d.country, spoke: false }));
        this.chair(`The motion passes. Debate is now open. The Chair will read the General Speakers List.`);
        await sleep(500);
        this.chair(`On the General Speakers List: ${this.state.speakersList.map(s => s.country).join(', ')}.`);
        await sleep(500);
        await this.runGSLCycle();
    }

    async runGSLCycle() {
        while (!this._abort) {
            if (await this.tickCrisis()) return;

            const next = this.state.speakersList.find(s => !s.spoke);
            if (!next) {
                this.chair('The General Speakers List is exhausted. The floor is open for motions.');
                this.setPending({ type: 'motion-floor', allowed: motionsAvailable(this.state.phase).map(m => m.key) });
                return;
            }
            next.spoke = true;
            const d = this.byCountry(next.country);

            this.state.currentSpeaker = d.country;
            this.state.currentSpeakerTime = 45;
            this.emit();

            if (d.isUser) {
                this.chair(`The Chair recognizes the delegate of ${d.country}. You have 45 seconds.`);
                this.setPending({ type: 'speak', phase: 'GSL', time: 45 });
                return;
            }

            this.chair(`The Chair recognizes the delegate of ${d.country}.`);
            await sleep(600);
            const text = await d.speak({
                phase: 'GSL',
                instruction: `Address the topic "${this.state.topic}" on the General Speakers List. State your country's core position in 4–6 sentences.`,
                history: this.recentHistory(),
                isDemo: this.isDemoProvider()
            });
            this.delegateLog(d, text);
            this.state.score.wordsSpoken += text.split(/\s+/).length;
            await sleep(900);

            const spoken = this.state.speakersList.filter(s => s.spoke).length;
            if (spoken > 0 && spoken % 3 === 0 && this.state.speakersList.some(s => !s.spoke)) {
                if (Math.random() < 0.55) {
                    const key = Math.random() < 0.5 ? 'OPEN_MOD_CAUCUS' : 'OPEN_UNMOD_CAUCUS';
                    const ok = await this.aiProposeMotion(key);
                    if (ok) return;
                }
            }
        }
    }

    async userSpeak(text) {
        if (!text.trim()) return;
        const d = this.user();
        this.userLog(text);
        this.state.score.wordsSpoken += text.split(/\s+/).length;
        this.state.score.speeches += 1;
        this.clearPending();
        await sleep(500);

        if (Math.random() < 0.45) {
            const asker = this.aiDelegates()[Math.floor(Math.random() * this.aiDelegates().length)];
            this.chair(`The Chair recognizes a Point of Information from the delegate of ${asker.country}.`);
            await sleep(400);
            const poi = `Does the delegate of ${d.country} not agree that any proposal must also address the concerns of ${asker.profile.region}? The delegate's speech did not clearly address this.`;
            this.delegateLog(asker, `POI: ${poi}`);
            this.setPending({ type: 'poi-answer', poi, asker: asker.country });
            return;
        }

        await this.resumeSpeakerLoop();
    }

    async answerPOI(answer) {
        const d = this.user();
        this.clearPending();
        this.userLog(`Response to POI: ${answer}`);
        this.state.score.poisAnswered += 1;
        await sleep(400);
        this.chair(`The Chair thanks the delegate of ${d.country}.`);
        await this.resumeSpeakerLoop();
    }

    declinePOI() {
        const d = this.user();
        this.clearPending();
        this.userLog(`The delegation of ${d.country} declines the POI.`);
        this.chair(`The delegate has declined. The Chair returns to the speakers list.`);
        setTimeout(() => this.resumeSpeakerLoop(), 500);
    }

    async resumeSpeakerLoop() {
        if (this.state.phase === PHASES.GSL) return this.runGSLCycle();
        if (this.state.phase === PHASES.MOD_CAUCUS) return this.runModCaucus();
        if (this.state.phase === PHASES.RESOLUTION_DEBATE) return this.runResolutionDebate();
    }

    /* ---------------- Moderated Caucus ---------------- */

    async enterModCaucus(params = {}) {
        const topic = params.topic || 'climate finance';
        const speakerTime = params.speakerTime || 30;
        const totalTime = params.totalTime || 120;

        this.state.phase = PHASES.MOD_CAUCUS;
        this.state.activeCaucus = {
            topic, speakerTime, totalTime,
            remainingTime: totalTime,
            speakers: this.delegates.map(d => ({ country: d.country })),
            speakerIndex: -1
        };
        this.chair(`The motion passes. The committee is now in a moderated caucus on "${topic}", ${speakerTime} seconds speaking time, ${totalTime} seconds total.`);
        await sleep(700);
        await this.runModCaucus();
    }

    async runModCaucus() {
        const c = this.state.activeCaucus;
        if (!c) return this.startGSL();

        while (!this._abort && c.remainingTime > 0) {
            if (await this.tickCrisis()) return;

            c.speakerIndex++;
            if (c.speakerIndex >= c.speakers.length) {
                this.chair('The moderated caucus has expired. The committee returns to the General Speakers List.');
                this.state.activeCaucus = null;
                this.state.phase = PHASES.GSL;
                return this.runGSLCycle();
            }

            c.remainingTime -= c.speakerTime;
            const next = c.speakers[c.speakerIndex];
            const d = this.byCountry(next.country);
            this.state.currentSpeaker = d.country;
            this.state.currentSpeakerTime = c.speakerTime;
            this.emit();

            if (d.isUser) {
                this.chair(`The Chair recognizes the delegate of ${d.country}. ${c.speakerTime} seconds.`);
                this.setPending({ type: 'speak', phase: 'MOD_CAUCUS', time: c.speakerTime });
                return;
            }

            this.chair(`The Chair recognizes the delegate of ${d.country}.`);
            await sleep(500);
            const text = await d.speak({
                phase: 'MOD_CAUCUS',
                instruction: `Moderated caucus on "${c.topic}". ${c.speakerTime} seconds — be concise and stay focused. Add new substance or respond to earlier speakers.`,
                history: this.recentHistory(),
                isDemo: this.isDemoProvider()
            });
            this.delegateLog(d, text);
            this.state.score.wordsSpoken += text.split(/\s+/).length;
            await sleep(800);
        }

        this.chair('The moderated caucus has expired. The committee returns to the General Speakers List.');
        this.state.activeCaucus = null;
        this.state.phase = PHASES.GSL;
        return this.runGSLCycle();
    }

    /* ---------------- Unmoderated Caucus ---------------- */

    async enterUnmodCaucus(params = {}) {
        const topic = params.topic || 'negotiation';
        const totalTime = params.totalTime || 300;
        this.state.phase = PHASES.UNMOD_CAUCUS;
        this.state.activeCaucus = { topic, totalTime, remainingTime: totalTime, isUnmod: true };
        this.chair(`The motion passes. The committee is now in an unmoderated caucus for ${totalTime} seconds on "${topic}". Delegates are free to negotiate.`);
        this.setPending({ type: 'chat', topic });
    }

    async userChatMessage(text) {
        this.userLog(text);
        this.state.score.wordsSpoken += text.split(/\s+/).length;
        await sleep(500);

        const responders = this.aiDelegates().slice().sort(() => Math.random() - 0.5).slice(0, 2);
        for (const r of responders) {
            if (this._abort) return;
            const reply = await r.reactTo({
                proposal: `${this.user().country}: "${text}"`,
                phase: 'UNMOD_CAUCUS',
                isDemo: this.isDemoProvider()
            });
            this.delegateLog(r, reply);
            await sleep(600);
        }
    }

    endUnmodCaucus() {
        this.chair('The Chair returns the committee to the General Speakers List.');
        this.state.activeCaucus = null;
        this.state.phase = PHASES.GSL;
        this.clearPending();
        this.runGSLCycle();
    }

    /* ---------------- Resolution ---------------- */

    async enterResolutionDebate() {
        this.state.phase = PHASES.RESOLUTION_DEBATE;
        this.chair('The motion passes. The Chair invites the sponsor to submit the draft resolution.');
        await sleep(600);
        this.setPending({ type: 'submit-resolution' });
    }

    async submitResolution(text) {
        if (!text.trim()) return;
        this.state.draftResolution = text.trim();
        this.clearPending();
        this.chair(`The draft resolution has been distributed. The committee will now debate the draft.`);
        await sleep(600);
        await this.runResolutionDebate();
    }

    async runResolutionDebate() {
        let c = this.state.activeCaucus;
        if (!c || !c.isResolutionDebate) {
            c = this.state.activeCaucus = {
                topic: 'debate on the draft resolution',
                speakerTime: 30,
                totalTime: 150,
                remainingTime: 150,
                speakers: this.delegates.map(d => ({ country: d.country })),
                speakerIndex: -1,
                isResolutionDebate: true
            };
        }
        this.state.phase = PHASES.RESOLUTION_DEBATE;

        while (!this._abort && c.remainingTime > 0) {
            if (await this.tickCrisis()) return;

            c.speakerIndex++;
            if (c.speakerIndex >= c.speakers.length) break;
            c.remainingTime -= c.speakerTime;
            const next = c.speakers[c.speakerIndex];
            const d = this.byCountry(next.country);
            this.state.currentSpeaker = d.country;
            this.state.currentSpeakerTime = c.speakerTime;
            this.emit();

            if (d.isUser) {
                this.chair(`The Chair recognizes the sponsor, the delegate of ${d.country}.`);
                this.setPending({ type: 'speak', phase: 'RESOLUTION_DEBATE', time: c.speakerTime });
                return;
            }

            this.chair(`The Chair recognizes the delegate of ${d.country}.`);
            await sleep(500);
            const text = await d.speak({
                phase: 'RESOLUTION_DEBATE',
                instruction: `Debate on the draft resolution. Briefly state whether ${d.country} supports or opposes it and why. Reference specific interests. 3–5 sentences.`,
                history: this.recentHistory(),
                isDemo: this.isDemoProvider()
            });
            this.delegateLog(d, text);
            await sleep(800);
        }

        this.state.activeCaucus = null;
        this.chair('The Chair now opens the floor to a motion to close debate and move to voting procedure.');
        this.setPending({ type: 'motion-floor', allowed: ['CLOSE_DEBATE', 'OPEN_MOD_CAUCUS', 'OPEN_UNMOD_CAUCUS'] });
    }

    /* ---------------- Voting ---------------- */

    async enterVoting() {
        this.state.phase = PHASES.VOTING;
        this.chair('The motion to close debate passes. The committee will now move into voting procedure. All delegates are reminded that the doors are closed and no interruptions are permitted.');
        await sleep(700);
        this.chair('The Chair will now call the roll for the vote on the draft resolution. Delegates may vote "yes", "no", or "abstain".');
        await sleep(400);
        this.setPending({ type: 'final-vote' });
    }

    async submitFinalVote(userVote) {
        this.clearPending();
        const user = this.user();
        this.userLog(`Final vote: ${userVote}`);
        this.state.score.votesCast += 1;
        await sleep(400);

        const votes = { yes: [], no: [], abstain: [] };
        const safeVote = ['yes', 'no', 'abstain'].includes(userVote) ? userVote : 'abstain';
        votes[safeVote].push(user.country);

        const decisions = this.aiDelegates().map(d => ({ d, decision: d.decideVote(this.state.draftResolution) }));
        for (const { d, decision } of decisions) {
            votes[decision.vote].push(d.country);
            await sleep(180);
            this.log({ kind: 'vote', speaker: d.country, content: `${d.country} votes ${decision.vote} — ${decision.reason}.` });
        }

        const totalYes = votes.yes.length;
        const totalNo = votes.no.length;
        const total = totalYes + totalNo + votes.abstain.length;
        const needed = Math.floor(total / 2) + 1;
        const passed = totalYes >= needed;

        this.state.voteResults = {
            yes: votes.yes, no: votes.no, abstain: votes.abstain,
            total, needed, passed,
            yesCount: totalYes, noCount: totalNo, abstainCount: votes.abstain.length
        };

        await sleep(600);
        this.chair(
            `Final vote: ${totalYes} in favour, ${totalNo} against, ${votes.abstain.length} abstaining. ` +
            `The draft resolution ${passed ? 'IS ADOPTED' : 'IS NOT ADOPTED'}.`
        );
        await sleep(500);
        this.chair(`The ${this.state.committee} is adjourned. The Chair thanks all delegates for their work.`);

        this.state.phase = PHASES.RESULT;
        this.emit();
    }

    /* ---------------- Crisis ---------------- */

    async tickCrisis() {
        if (!this.crisisDirector || this._abort) return false;
        const event = this.crisisDirector.tick(this);
        if (!event) return false;

        this._resumePhaseAfterCrisis = this.state.phase;
        this.crisisDirector.fire(this, event);
        await this.enterCrisis(event);
        return true;
    }

    async enterCrisis(event) {
        this.state.phase = PHASES.CRISIS;
        this.state.activeCrisis = event;
        this.emit();

        this.chair(`**CRISIS UPDATE** — The Chair has received urgent information.`);
        await sleep(500);

        this.log({
            kind: 'crisis',
            speaker: 'Crisis Director',
            content: event.title,
            description: event.description,
            crisisType: event.type,
            severity: event.severity,
            responseWindow: event._window
        });

        this.setPending({ type: 'crisis-response', event });
    }

    async resolveCrisis({ optionKey, customText = '', expired = false }) {
        if (!this.crisisDirector) return;
        this.clearPending();

        const result = this.crisisDirector.resolve(this, { optionKey, customText, expired });
        if (!result) {
            this.resumeAfterCrisis();
            return;
        }

        const { record, chairResponse } = result;

        if (record.userText) this.userLog(record.userText);
        await sleep(500);
        this.chair(chairResponse);

        this.state.crisisLog.push(record);
        this.state.activeCrisis = null;
        this.emit();

        if (record.aiReactions) {
            const reactors = this.pickReactors(2);
            for (const r of reactors) {
                if (this._abort) return;
                const reply = await r.reactTo({
                    proposal: `Crisis: ${record.title} — response: "${record.userText.slice(0, 140)}"`,
                    phase: 'CRISIS',
                    isDemo: this.isDemoProvider()
                }) || `The delegation of ${r.country} takes note of the situation and will consult with partners before committing further.`;
                this.delegateLog(r, reply);
                await sleep(600);
            }
        }

        this.resumeAfterCrisis();
    }

    pickReactors(n = 2) {
        return this.aiDelegates()
            .slice()
            .sort(() => Math.random() - 0.5)
            .slice(0, n);
    }

    resumeAfterCrisis() {
        const target = this._resumePhaseAfterCrisis || PHASES.GSL;
        this.state.phase = target;
        this.emit();

        if (target === PHASES.GSL) return this.runGSLCycle();
        if (target === PHASES.MOD_CAUCUS) return this.runModCaucus();
        if (target === PHASES.RESOLUTION_DEBATE) return this.runResolutionDebate();
        if (target === PHASES.UNMOD_CAUCUS) {
            this.setPending({ type: 'chat', topic: this.state.activeCaucus?.topic || 'negotiation' });
            return;
        }
        return this.runGSLCycle();
    }

    async forceCrisis() {
        if (!this.crisisDirector) return;
        const next = this.crisisDirector.scenario.events.find(e => !this.crisisDirector.firedIds.has(e.id));
        if (!next) {
            this.chair('No further crisis events are scheduled for this scenario.');
            return;
        }
        this._resumePhaseAfterCrisis = this.state.phase;
        this.crisisDirector.fire(this, next);
        await this.enterCrisis(next);
    }

    /* ---------------- Helpers ---------------- */

    recentHistory(max = 8) {
        return this.state.transcript
            .filter(e => e.kind === 'delegate' || e.kind === 'user')
            .slice(-max)
            .map(e => ({ role: e.kind === 'user' ? 'user' : 'assistant', content: `${e.speaker}: ${e.content}` }));
    }
}

function weightedPick(items, weights) {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
        r -= weights[i];
        if (r <= 0) return items[i];
    }
    return items[items.length - 1];
}