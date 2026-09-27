import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast } from '../core/ui.js';
import { track } from '../analytics/metrics.js';

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

const DIFFICULTIES = [
    { key: 'easy', label: 'Easy', hint: 'Friendly, straightforward' },
    { key: 'medium', label: 'Medium', hint: 'Realistic conference' },
    { key: 'hard', label: 'Hard', hint: 'Aggressive, technical' },
    { key: 'expert', label: 'Expert', hint: 'Geopolitical depth' }
];

const OPPONENTS = ['Germany', 'United States', 'China', 'India', 'Brazil', 'Kenya', 'Maldives'];

let session = null;

export const debateTrainer = {
    path: '/debate',
    ariaTitle: 'Debate Trainer',
    render() { return layout('Debate Trainer', this.body(), { full: true }); },

    init() {
        bindLayout();
        const s = store.get().conference;
        document.getElementById('dbCountry').value = s.country || 'Chad';
        document.getElementById('dbCommittee').value = s.committee || 'UNHRC';
        document.getElementById('dbTopic').value = s.topic || '';
        document.getElementById('dbOpponent').value = 'Germany';
        document.getElementById('dbRounds').value = '5';

        document.querySelectorAll('.mx-diff-opt').forEach(opt => {
            opt.onclick = () => {
                document.querySelectorAll('.mx-diff-opt').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
            };
        });
        document.querySelector('.mx-diff-opt[data-key="medium"]')?.classList.add('active');

        document.getElementById('dbStart').onclick = () => this.start();
        // document.getElementById('dbForfeit').onclick = () => this.forfeit();
    },

    body() {
        return `
      <div class="mx-page">
        <div class="mx-setup">
          <div class="mx-setup-title">Debate an AI delegate</div>
          <div class="mx-setup-sub">
            The AI plays an opposing delegate. It challenges your position, questions your evidence, and pushes back
            on every argument. You respond round by round. At the end you get a scorecard.
          </div>

          <div class="field-row">
            <div class="field"><label>Your country</label><input id="dbCountry" /></div>
            <div class="field"><label>Committee</label><input id="dbCommittee" /></div>
          </div>
          <div class="field"><label>Topic</label><input id="dbTopic" /></div>
          <div class="field-row">
            <div class="field"><label>Opponent</label>
              <select id="dbOpponent">${OPPONENTS.map(o => `<option>${o}</option>`).join('')}</select>
            </div>
            <div class="field"><label>Rounds</label>
              <select id="dbRounds">
                <option value="3">3 rounds — quick</option>
                <option value="5" selected>5 rounds — standard</option>
                <option value="8">8 rounds — long</option>
              </select>
            </div>
          </div>

          <div class="field">
            <label>Difficulty</label>
            <div class="mx-diff">
              ${DIFFICULTIES.map(d => `
                <button class="mx-diff-opt" data-key="${d.key}">
                  <span class="mx-diff-label">${d.label}</span>
                  <span class="mx-diff-hint">${d.hint}</span>
                </button>`).join('')}
            </div>
          </div>

          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary" id="dbStart">Begin debate</button>
          </div>
        </div>

        <div id="dbStage" class="mt-2"></div>
      </div>`;
    },

    async start() {
        const country = document.getElementById('dbCountry').value.trim();
        const committee = document.getElementById('dbCommittee').value.trim();
        const topic = document.getElementById('dbTopic').value.trim();
        const opponent = document.getElementById('dbOpponent').value;
        const rounds = +document.getElementById('dbRounds').value;
        const difficulty = document.querySelector('.mx-diff-opt.active')?.dataset.key || 'medium';

        if (!country || !committee || !topic) return toast('Fill in country, committee, and topic.');

        session = {
            id: uid(),
            country, committee, topic, opponent, rounds, difficulty,
            exchanges: [],
            startedAt: Date.now()
        };

        this.renderSession();
        await this.aiOpen();
    },

    renderSession() {
        const el = document.getElementById('dbStage');
        el.innerHTML = `
      <div class="mx-session">
        <div>
          <div class="card">
            <div class="card-header">
              <div>
                <div class="card-title">${escapeHtml(session.opponent)} vs ${escapeHtml(session.country)}</div>
                <div class="card-sub">${escapeHtml(session.committee)} · ${escapeHtml(session.topic)}</div>
              </div>
              <span class="badge badge-gold">${session.difficulty}</span>
            </div>
            <div id="dbExchanges"></div>
          </div>
          <div class="card mt-2" id="dbComposer"></div>
        </div>
        <aside class="mx-session-side">
          <h3>Session</h3>
          <div class="mx-side-row"><span class="k">Rounds</span><span class="v" id="dbRound">0 / ${session.rounds}</span></div>
          <div class="mx-side-row"><span class="k">Difficulty</span><span class="v">${escapeHtml(session.difficulty)}</span></div>
          <div class="mx-side-row"><span class="k">Opponent</span><span class="v">${escapeHtml(session.opponent)}</span></div>
          <div class="mt-2"><button class="btn btn-ghost btn-sm" id="dbForfeit" style="width:100%;">End & score</button></div>
        </aside>
      </div>`;
        this.renderExchanges();
        this.renderComposer();
        document.getElementById('dbForfeit').onclick = () => this.forfeit();
    },

    renderExchanges() {
        const el = document.getElementById('dbExchanges');
        if (!el) return;
        el.innerHTML = session.exchanges.map(ex => {
            const roleClass = ex.role === 'user' ? 'user' : 'ai';
            const tag = ex.role === 'user' ? 'You' : session.opponent;
            const chip = ex.role === 'user' ? session.country : 'Opponent';
            return `
        <div class="mx-exchange ${roleClass}">
          <div class="mx-exchange-role">
            <span class="tag">${escapeHtml(chip)}</span>
            <span class="who">${escapeHtml(tag)}</span>
          </div>
          <div class="mx-exchange-body">${markdownLite(ex.content)}</div>
          ${ex.feedback ? `<div class="mx-exchange-feedback">${escapeHtml(ex.feedback)}</div>` : ''}
        </div>`;
        }).join('');
        el.scrollIntoView({ behavior: 'smooth', block: 'end' });
    },

    renderComposer() {
        const el = document.getElementById('dbComposer');
        if (!el) return;
        const done = session.exchanges.filter(e => e.role === 'user').length >= session.rounds;
        if (done) {
            el.innerHTML = `
        <div class="card-title">Debate complete</div>
        <p class="muted" style="font-size:13.5px;">You've completed all ${session.rounds} rounds.</p>
        <button class="btn btn-primary btn-sm" id="dbScore">Get scorecard</button>`;
            document.getElementById('dbScore').onclick = () => this.score();
            return;
        }
        el.innerHTML = `
      <div class="card-title">Your response</div>
      <div class="card-sub mb-2">Round ${session.exchanges.filter(e => e.role === 'user').length + 1} of ${session.rounds}</div>
      <textarea id="dbInput" rows="4" placeholder="Defend your position…"></textarea>
      <div class="flex between items-center mt-2">
        <span class="muted" id="dbWords">0 words</span>
        <button class="btn btn-primary btn-sm" id="dbSend">Send response</button>
      </div>`;
        const ta = document.getElementById('dbInput');
        ta.focus();
        ta.oninput = () => {
            document.getElementById('dbWords').textContent =
                `${ta.value.trim().split(/\s+/).filter(Boolean).length} words`;
        };
        document.getElementById('dbSend').onclick = () => this.userRespond();
    },

    async aiOpen() {
        const el = document.getElementById('dbExchanges');
        el.innerHTML = `<div class="flex items-center gap-2"><div class="spinner"></div><span class="muted">${escapeHtml(session.opponent)} is opening…</span></div>`;

        const diffPrompts = {
            easy: 'Be approachable and constructive. Pose friendly but pointed questions.',
            medium: 'Be realistic — like a typical strong delegate at a competitive conference.',
            hard: 'Be aggressive and technically demanding. Cite real frameworks. Push hard.',
            expert: 'Be surgically technical. Reference specific UN resolutions, treaties, funding mechanisms, and geopolitical fault lines.'
        };

        const prompt = `You are the delegate of ${session.opponent} in the ${session.committee} debating the topic: "${session.topic}".

The delegate of ${session.country} will defend their position. You are the challenger.

Difficulty: ${diffPrompts[session.difficulty]}

Open the debate:
1. A short framing statement (2–3 sentences) that contests ${session.country}'s likely position.
2. A single sharp question directed at the delegate of ${session.country}.

Max 100 words. No emojis. No filler. Do not use headings.`;

        try {
            const text = await ai.chat({
                mode: 'opponent',
                userText: prompt,
                history: [],
                context: { country: session.country, committee: session.committee, topic: session.topic },
                opts: { maxTokens: 300 },
                fallback: () => `The delegation of ${session.opponent} takes the floor.`
                    + ` We note the position of ${session.country}, but we must ask: on what basis does the delegation`
                    + ` propose to fund the measures it has outlined, and how does it reconcile that with existing commitments?`
            });
            session.exchanges.push({ role: 'ai', content: text, ts: Date.now() });
            this.renderExchanges();
            this.renderComposer();
        } catch (err) {
            el.innerHTML = `<div class="badge badge-red">AI error</div><p class="mt-1">${escapeHtml(err.message)}</p>`;
        }
    },

    async userRespond() {
        const ta = document.getElementById('dbInput');
        const text = ta.value.trim();
        if (!text) return toast('Write your response.');
        ta.value = '';

        session.exchanges.push({ role: 'user', content: text, ts: Date.now() });
        this.renderExchanges();
        this.renderComposer();

        // AI replies
        const el = document.getElementById('dbExchanges');
        const loader = document.createElement('div');
        loader.className = 'mx-exchange';
        loader.innerHTML = `<div class="flex items-center gap-2"><div class="spinner"></div><span class="muted">${escapeHtml(session.opponent)} is responding…</span></div>`;
        el.appendChild(loader);

        const history = session.exchanges.map(ex => ({
            role: ex.role === 'user' ? 'user' : 'assistant',
            content: ex.role === 'user' ? `${session.country}: ${ex.content}` : `${session.opponent}: ${ex.content}`
        }));

        const prompt = `Reply as the delegate of ${session.opponent}.

Respond in exactly this format:
Assessment: one short sentence on the strength of the user's last argument.
Counter: one or two sentences that expose a weakness or offer a rebuttal.
Question: one direct question for the user to answer next.

Max 110 words total. Do not use headings or bullets.`;

        try {
            const reply = await ai.chat({
                mode: 'opponent',
                userText: prompt,
                history,
                context: { country: session.country, committee: session.committee, topic: session.topic },
                opts: { maxTokens: 320 },
                fallback: () => `Assessment: Your argument raises valid points but lacks specificity.\n`
                    + `Counter: The delegation of ${session.opponent} remains unconvinced that your proposal can be implemented as described.\n`
                    + `Question: Can you name the specific mechanism and funding source you would rely on?`
            });
            loader.remove();
            session.exchanges.push({ role: 'ai', content: reply, ts: Date.now() });
            this.renderExchanges();
            this.renderComposer();
        } catch (err) {
            loader.remove();
            toast('AI error — try again.');
        }
    },

    async score() {
        const el = document.getElementById('dbStage');
        el.innerHTML = `<div class="flex items-center gap-2"><div class="spinner"></div><span class="muted">Scoring your debate…</span></div>`;

        const transcript = session.exchanges.map(ex =>
            `[${ex.role === 'user' ? session.country : session.opponent}] ${ex.content}`
        ).join('\n\n');

        const prompt = `You evaluated a debate between the delegate of ${session.country} and the delegate of ${session.opponent} in the ${session.committee} on "${session.topic}".

Transcript:
${transcript}

Return a scorecard as plain text with this exact format:

Argument Strength: X/10
Evidence Quality: X/10
Diplomatic Tone: X/10
Rebuttal Skill: X/10
Overall: X/10

Strengths:
- one specific strength
- one specific strength

To Improve:
- one specific, actionable improvement
- one specific, actionable improvement

Verdict: one sentence assessing the user's overall performance.

No emojis. No headings with hashes.`;

        try {
            const reply = await ai.chat({
                mode: 'opponent',
                userText: prompt,
                history: [],
                context: {},
                opts: { maxTokens: 500 }
            });

            const card = parseScorecard(reply);
            el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Debate scorecard</div>
              <div class="card-sub">${escapeHtml(session.committee)} · ${escapeHtml(session.topic)}</div>
            </div>
            <span class="mx-score ${scoreClass(card.overall)}">${card.overall || '—'}/10</span>
          </div>
          <div class="mx-scorecard">
            ${card.rows.map(r => `
              <div class="mx-scorecard-row">
                <span class="label">${escapeHtml(r.label)}</span>
                <span class="mx-score ${scoreClass(r.value)}">${r.value}/10</span>
                <div class="bar"><div style="width:${(r.value || 0) * 10}%"></div></div>
              </div>`).join('')}
          </div>
          ${card.strengths.length ? `<div class="mt-2"><div class="label-small mb-1">Strengths</div><ul>${card.strengths.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>` : ''}
          ${card.improvements.length ? `<div class="mt-2"><div class="label-small mb-1">To improve</div><ul>${card.improvements.map(s => `<li>${escapeHtml(s)}</li>`).join('')}</ul></div>` : ''}
          ${card.verdict ? `<div class="mx-poi-tip mt-2"><strong>Verdict</strong>${escapeHtml(card.verdict)}</div>` : ''}
          <div class="flex gap-2 mt-2">
            <button class="btn btn-primary" id="dbNew">New debate</button>
            <button class="btn btn-ghost" id="dbSave">Save to progress</button>
          </div>
        </div>`;

            document.getElementById('dbNew').onclick = () => { session = null; this.rerender(); };
            document.getElementById('dbSave').onclick = () => this.save(card);
        } catch (err) {
            el.innerHTML = `<div class="badge badge-red">AI error</div><p class="mt-1">${escapeHtml(err.message)}</p>`;
        }
    },

    forfeit() {
        if (!session) return;
        if (session.exchanges.filter(e => e.role === 'user').length === 0) {
            session = null;
            return this.rerender();
        }
        this.score();
    },

    save(card) {
        const sessions = [{
            ...session,
            scorecard: card,
            completedAt: Date.now()
        }, ...(store.get().debateSessions || [])].slice(0, 30);
        store.set({
            debateSessions: sessions,
            xp: store.get().xp + Math.round((card.overall || 0) * 2)
        });
        track('debate', {
            committee: session.committee,
            country: session.country,
            rounds: session.exchanges.filter(e => e.role === 'user').length,
            overall: card.overall || 0
        });
        toast(`Saved · +${Math.round((card.overall || 0) * 2)} XP`);
    },

    rerender() {
        document.getElementById('app').innerHTML = this.render();
        this.init();
    }
};

function parseScorecard(text) {
    const rows = [];
    const criteria = ['Argument Strength', 'Evidence Quality', 'Diplomatic Tone', 'Rebuttal Skill'];
    for (const label of criteria) {
        const re = new RegExp(`${label}\\s*:\\s*(\\d+)`, 'i');
        const m = text.match(re);
        rows.push({ label, value: m ? +m[1] : 0 });
    }
    const overallM = text.match(/Overall\s*:\s*(\d+)/i);
    const overall = overallM ? +overallM[1] : 0;

    const strengths = section(text, 'Strengths');
    const improvements = section(text, 'To Improve');
    const verdictM = text.match(/Verdict\s*:\s*([^\n]+)/i);

    return {
        rows,
        overall,
        strengths,
        improvements,
        verdict: verdictM ? verdictM[1].trim() : ''
    };
}

function section(text, header) {
    const re = new RegExp(`${header}\\s*:\\s*\\n([\\s\\S]*?)(?=\\n[A-Z][^:\\n]*\\s*:|$)`, 'i');
    const m = text.match(re);
    if (!m) return [];
    return m[1].split('\n').map(l => l.trim())
        .filter(l => l.startsWith('-') || l.startsWith('•'))
        .map(l => l.replace(/^[-•]\s*/, '').trim())
        .filter(Boolean);
}

function scoreClass(v) {
    if (v >= 8) return 'good';
    if (v >= 6) return 'mid';
    return 'poor';
}