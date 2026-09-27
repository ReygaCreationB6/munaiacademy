/**
 * Guide content.
 *
 * Sections render in array order. `category` groups them in the TOC.
 * `body` is markdown-lite — supports headings, lists, bold, inline code,
 * code fences, and paragraphs separated by blank lines.
 * `cta` is optional — renders a button linking to the actual feature.
 */

export const GUIDE_CATEGORIES = [
    'Getting started',
    'Learn',
    'Prepare',
    'Practice',
    'Simulate',
    'AI',
    'Progress',
    'Team',
    'Reference'
];

export const GUIDE_SECTIONS = [

    /* ============================================================ */
    /* GETTING STARTED                                              */
    /* ============================================================ */

    {
        id: 'welcome',
        category: 'Getting started',
        title: 'What MUN AI Academy is',
        body: `
MUN AI Academy is a training platform for Model United Nations delegates. It combines structured lessons, AI-powered practice tools, a stateful conference simulation, and multiplayer rooms where real delegates and AI delegates run a live committee together.

Everything runs locally in your browser. If you connect a Supabase project, your progress syncs across devices and multiplayer rooms persist across server restarts. If you don't, the app still works — you just stay on one device.

**Nothing on this platform replaces a real conference.** Treat every AI output as a starting point. Verify facts, resolution numbers, and quotes against primary sources before you rely on them.
    `.trim()
    },

    {
        id: 'quickstart',
        category: 'Getting started',
        title: 'Your first 10 minutes',
        body: `
Here is the fastest path to see what the platform does.

1. **Sign in or stay signed out.** Accounts sync your work to the cloud; local-only mode stores everything in this browser.

2. **Set your conference.** From the Dashboard, edit your committee, country, and topic. Every tool reads from this.

3. **Skim one lesson.** Open **Learn MUN** and finish any Beginner lesson. This gives you a baseline for how the AI teaches.

4. **Talk to the Coach.** Open **AI Coach** and ask: *"Explain a moderated caucus like I'm completely new."* You'll get a structured answer with examples.

5. **Try a short practice.** Open **POI Trainer** and answer one Point of Information. You'll get a five-criteria evaluation and a coaching tip.

6. **Run a simulation.** Open **Conference Simulation**, pick Standard mode, and just watch for a couple of minutes. Every tool you've touched so far exists to feed this.

That's the shape of the whole platform.
    `.trim()
    },

    {
        id: 'ai-modes',
        category: 'Getting started',
        title: 'Built-in AI, Bring Your Own, and Demo',
        body: `
The platform can drive every AI feature through three different providers. You choose one in **AI Settings**.

**Built-in AI** — the recommended default. Requests go to this platform's server, which forwards them to an AI provider configured in the server's \`.env\`. Your API key stays on the server and never reaches the browser.

**Bring Your Own API Key** — connect your browser directly to OpenAI, Groq, OpenRouter, Mistral, Ollama, or any OpenAI-compatible endpoint. The key is stored locally in your browser. Useful if you want unlimited usage, a specific model, or a local model that never leaves your machine.

**Demo mode** — every AI response is simulated locally. No network calls, no key. Perfect for exploring the interface offline, or for situations where AI isn't available.

You can switch providers at any time. The topbar shows your current quota for whichever provider is active.
    `.trim(),
        cta: { label: 'Open AI Settings', href: '#/settings' }
    },

    /* ============================================================ */
    /* LEARN                                                        */
    /* ============================================================ */

    {
        id: 'learn',
        category: 'Learn',
        title: 'Learn MUN — the lesson library',
        body: `
**Learn MUN** is a structured curriculum organised into three levels: Beginner, Intermediate, and Advanced. The Beginner track covers the fundamentals (what MUN is, how committees work, what a resolution is, how caucuses and points of order function). The Intermediate track covers procedure and drafting. The Advanced track covers strategy, rhetoric, and crisis work.

Click any lesson to open it. You'll get three options:

- **Ask AI Coach** — hands the lesson title to the Coach with a prompt asking it to teach at your chosen depth.
- **Mark Complete** — records the lesson as done and awards XP.
- **Explain to me like I'm** — pick your depth first, then the Coach tailors its answer.

Lessons completed feed the Analytics page and unlock recommendations.
    `.trim(),
        cta: { label: 'Open Learn MUN', href: '#/learn' }
    },

    {
        id: 'knowledge',
        category: 'Learn',
        title: 'Knowledge Base',
        body: `
The **Knowledge Base** is a searchable encyclopedia of MUN concepts. Type a question like *"What's a moderated caucus?"*, *"How does a POI work?"*, or *"What is an operative clause?"* and hit Enter.

Rather than returning a canned answer, the platform hands your question to the AI Coach with instructions to explain it at three levels — Beginner, Intermediate, Advanced — each with its own example. That way you can slide between depths depending on where you are.

There's also a glossary section at the bottom for quick lookup without a network call.
    `.trim(),
        cta: { label: 'Open Knowledge Base', href: '#/knowledge' }
    },

    /* ============================================================ */
    /* PREPARE                                                      */
    /* ============================================================ */

    {
        id: 'research',
        category: 'Prepare',
        title: 'Country Research',
        body: `
**Country Research** generates a structured dossier on your country, committee, and topic. It outputs four sections:

- **Country Profile** — government, economy, geography, population, major challenges, international relations.
- **Policy Position** — existing policies, international commitments, UN positions, relevant treaties and resolutions, national interests.
- **Topic Research** — problems, causes, impacts, existing international responses, country-specific interests, potential solutions.
- **MUN Strategy** — what your country should support or avoid, potential allies, solutions that fit your interests.

Every claim is tagged so you know what to trust:

- **[VERIFIED]** — comes from a UN, World Bank, IMF, government, or treaty source.
- **[ANALYSIS]** — the AI's interpretation of multiple sources.
- **[STRATEGY]** — a suggested tactical approach.
- **[VERIFY]** — uncertain; double-check before using.

Saved dossiers are listed below the generator. You can reload or export any of them as markdown.
    `.trim(),
        cta: { label: 'Open Country Research', href: '#/research' }
    },

    {
        id: 'speech',
        category: 'Prepare',
        title: 'Speech Trainer with voice delivery',
        body: `
**Speech Trainer** evaluates a written or spoken speech on content, diplomatic language, structure, and specificity.

**To get content feedback:** write or paste your speech into the text area and click **Get AI Feedback**. The AI returns a structured review — scores, what you did well, what needs improvement, and one specific next exercise.

**To get delivery feedback:** click **Start recording** in the delivery panel above. Your browser asks for microphone permission once. As you speak, a live transcript appears. When you stop:

- The transcript fills the text area
- A **Delivery score** card appears with three metrics: **Pace** (words per minute), **Fluency** (filler words per minute), and **Confidence** (how clearly the recognizer understood you)
- Additional stats show duration, word count, filler words used, and pause frequency

Your audio **never leaves your device**. Only the transcript is used for feedback.

If you're on Firefox, the delivery panel shows "Voice not supported" — Firefox doesn't implement the Web Speech API. Chrome, Edge, and Safari do.

When you save a speech, both the content scores and the delivery score are stored. Delivery appears as a sixth skill on the Analytics page.
    `.trim(),
        cta: { label: 'Open Speech Trainer', href: '#/speech' }
    },

    {
        id: 'paper',
        category: 'Prepare',
        title: 'Position Paper Builder',
        body: `
**Position Paper Builder** organises a paper into the four standard sections: Background, Country Position, Previous International Action, and Proposed Solutions.

The editor auto-saves to your draft as you type. You can save multiple papers and load any of them from the dropdown.

**AI Review** analyses your paper and returns structured feedback on structure, country alignment, evidence and realism, diplomatic tone, the weakest section, and one specific next step. It does **not** rewrite the paper for you — the point is to teach you what needs work.

**Ask Coach** hands the draft to the AI Coach in a free-form conversation if you want to iterate.

**Export** produces a formatted PDF, DOCX, Markdown, or plain text file. Useful for submitting to a conference or printing.
    `.trim(),
        cta: { label: 'Open Position Paper', href: '#/paper' }
    },

    {
        id: 'resolution',
        category: 'Prepare',
        title: 'Resolution Builder',
        body: `
**Resolution Builder** is a clause-based editor for draft resolutions. It separates **preambulatory clauses** (context, citations, tone-setting) from **operative clauses** (action, actor, mechanism, funding, timeline, monitoring).

Add and remove clauses freely. Each operative clause is numbered automatically. Preambulatory clauses render in serif italic to match how they read in a real resolution.

**Quick Check** runs a deterministic rule engine — no AI needed, works offline. It flags:
- Missing operative verbs
- Missing funding mechanisms
- Missing timelines
- Missing monitoring provisions
- Clauses over 60 words
- Duplicate clauses
- Operative verbs sneaking into preambulatory clauses
- Preambulatory clauses that don't end with a comma

**AI Review** then does a deeper pass on feasibility, country-policy consistency, and weak clauses.

**Export** produces a properly formatted resolution in PDF, DOCX, Markdown, or plain text.
    `.trim(),
        cta: { label: 'Open Resolution Builder', href: '#/resolution' }
    },

    /* ============================================================ */
    /* PRACTICE                                                     */
    /* ============================================================ */

    {
        id: 'debate',
        category: 'Practice',
        title: 'Debate Trainer',
        body: `
**Debate Trainer** pits you against an AI delegate. Choose your country, opponent, difficulty (Easy, Medium, Hard, Expert), and number of rounds.

The AI opens with a framing statement and a sharp question. You respond. The AI counter-attacks with an assessment of your argument, a rebuttal, and a follow-up question. Repeat for the chosen number of rounds.

When you finish, click **Get scorecard**. You'll receive scores on Argument Strength, Evidence Quality, Diplomatic Tone, and Rebuttal Skill, plus strengths, areas to improve, and a one-sentence verdict.

Easy is friendly and constructive. Medium feels like a realistic competitive conference. Hard is aggressive and technical. Expert references specific resolutions and funding mechanisms — the sort of thing you'd face in a crisis committee at a competitive circuit.
    `.trim(),
        cta: { label: 'Open Debate Trainer', href: '#/debate' }
    },

    {
        id: 'poi',
        category: 'Practice',
        title: 'POI Trainer',
        body: `
**POI Trainer** fires realistic Points of Information at you. Each POI is generated from your country, committee, and topic.

Type your answer. You'll receive a five-criteria evaluation: **Relevance**, **Diplomacy**, **Conciseness**, **Evidence**, and **Persuasiveness**, each scored out of 10 with a one-sentence note. A coaching tip suggests one specific improvement.

The sidebar tracks POIs handled, average score, and best score across the session. When you end the session, it saves as a session record and awards XP based on your average.

If you want to practice asking POIs instead of answering them, use the Debate Trainer or the Coach with the Opponent mode.
    `.trim(),
        cta: { label: 'Open POI Trainer', href: '#/poi' }
    },

    {
        id: 'practice',
        category: 'Practice',
        title: 'Practice Arena',
        body: `
**Practice Arena** is a hub for short, focused challenges. Each one exercises a specific MUN skill and rewards practice with XP.

**Navigate to another tool** — Speech Challenge, POI Sprint, Debate Sprint, Research Sprint — each links to the corresponding trainer with the context already set up.

**Run in place** — two challenges run inline without leaving the page:

- **Diplomatic Rewrite** — paste an aggressive sentence. The AI rewrites it in diplomatic form and explains exactly what changed and why.
- **Rapid Rebuttal** — the AI fires a hostile statement. You have 30 seconds of writing time to respond. You're scored on impact, diplomacy, and specificity.

Personal bests are tracked per challenge and shown on the card. The top of the page shows total challenges completed, personal bests above 8/10, and XP earned.
    `.trim(),
        cta: { label: 'Open Practice Arena', href: '#/practice' }
    },

    /* ============================================================ */
    /* SIMULATE                                                     */
    /* ============================================================ */

    {
        id: 'simulate',
        category: 'Simulate',
        title: 'Conference Simulation',
        body: `
**Conference Simulation** runs a complete single-player MUN session against AI delegates who remember their positions.

Setup: choose your country, committee, topic, and difficulty. All other countries are represented by AI delegates, each with its own profile — interests, red lines, allies, and a personality archetype (Negotiator, Hardliner, Researcher, Coalition Builder, Quiet, Aggressive, Humanitarian).

The session runs through the full procedural sequence: roll call, motion to open debate, General Speakers List, moderated and unmoderated caucuses, draft resolution, debate, final vote.

When it's your turn, you speak. When a motion is on the floor, you vote. When a POI lands, you answer or decline. The AI delegates argue, second motions, challenge each other, and cast votes.

The final report summarises your score, strengths, areas to develop, and one specific recommendation for next time.
    `.trim(),
        cta: { label: 'Open Conference Simulation', href: '#/simulate' }
    },

    {
        id: 'crisis',
        category: 'Simulate',
        title: 'Crisis Mode',
        body: `
**Crisis Mode** is a Simulation variant where unexpected events interrupt the debate on a schedule.

Pick one of three scenarios: **Climate Refugee Surge**, **Diplomatic Fallout**, or **Humanitarian Emergency**. Each is a four-event chain where each event builds on the consequences of the previous one.

When a crisis fires, you get a response window — usually 60 to 120 seconds. You can either pick one of the pre-written options or write your own response. Every choice shifts delegate stances and relations:

- Options like funding or cooperation raise your standing with humanitarian delegations.
- Options like refusal or unilateral action cost you allies.
- Some options trigger extra delegate reactions.

The Chair reacts to every response. Effects apply immediately and feed into the final vote. The report at the end includes a crisis log with each event, your choice, and what it changed.
    `.trim(),
        cta: { label: 'Open Simulation', href: '#/simulate' }
    },

    {
        id: 'rooms',
        category: 'Simulate',
        title: 'Multiplayer Rooms',
        body: `
**Multiplayer Rooms** runs a live committee where real delegates and AI delegates participate together.

To start: go to Multiplayer Rooms, click **Create room**, choose your role (**Chair** or **Delegate**), fill in the committee and topic, and share the 6-letter room code or invite link.

The room has three zones:

- **Sidebar** — delegates, speaking queue, motions, and any active vote. Scrolls independently.
- **Main area** — the transcript, the speaker banner at the top, and the composer at the bottom.
- **Topbar** — room name, committee, topic, and the room code.

Every action is broadcast instantly. Chat messages show in real time. Speaking requests queue up. Motions get proposed, ruled on, and voted. Everything is stored in Supabase so rooms survive server restarts.

Delegates can type to each other. While someone is typing, a small indicator appears above the composer showing who's composing a message.
    `.trim(),
        cta: { label: 'Open Multiplayer Rooms', href: '#/rooms' }
    },

    {
        id: 'rooms-chair',
        category: 'Simulate',
        title: 'Playing as Chair',
        body: `
When you create a room in **Chair** mode, you run the committee directly.

**Your controls:**
- **Start session** — opens the committee after roll call.
- **Next speaker** — recognizes the next delegate from the queue.
- **Propose motion** — raises a motion from your own delegation.
- **Pass / Fail / Table** — rules on any pending motion from the sidebar.
- **Start vote** — opens a roll-call vote with a question. AI delegates vote automatically in staggered batches.
- **Close vote** — closes it and announces the result.
- **End session** — closes the room.

**What you see:**
- Every delegate in the room, with a Host badge on your own entry.
- The speaking queue at the moment.
- All pending and recent motions.
- The full transcript with each speech tagged by intent and target.

If the host leaves, the earliest-joining human delegate becomes chair automatically. If no humans remain, the session ends.
    `.trim(),
        cta: { label: 'Create a room', href: '#/rooms' }
    },

    {
        id: 'rooms-delegate',
        category: 'Simulate',
        title: 'Playing as Delegate with an AI Chair',
        body: `
When you create a room in **Delegate** mode — or when someone else is the host and you join as a delegate — you participate alongside the others, and an AI chair presides over the committee.

**What the AI chair does:**
- Opens the committee at the start of the session
- Recognizes delegates from the queue in order
- Rules on motions after a short beat
- Prompts the floor when nobody has spoken for a while
- Announces vote results

**Your controls:**
- **Raise hand** — request the floor.
- **Propose motion** — submit a motion (moderated caucus, unmoderated caucus, introduce a resolution, close debate).
- **Chat** — speak freely during unmoderated caucus.
- **Cast vote** — vote on any active motion.

The host can also click **Hand over chair** at any time to spawn an AI chair on the fly. Or **Take chair back** to resume running the room directly.
    `.trim(),
        cta: { label: 'Join a room', href: '#/rooms' }
    },

    {
        id: 'rooms-ai',
        category: 'Simulate',
        title: 'How AI delegates behave',
        body: `
If the host toggles **AI Delegate Fill** on, the server spawns AI delegates to fill empty seats after about 15 seconds of session time. Each one has a country profile (interests, red lines, allies, commitments) and a personality archetype.

**What makes them feel real:**

- **They respond to each other.** Roughly 70% of AI speeches are targeted — the AI is either responding to the previous speaker, challenging someone with a different position, or supporting an ally. Every speech has a visible intent chip: supports, challenges, asks, proposes, defends, clarifies.

- **They have opinions about each other.** Relations shift as the debate unfolds. If Germany challenges the US, the US remembers. If Brazil supports Kenya, Kenya notices. Later speeches reflect these accumulated relationships.

- **They take their time.** Before each AI speaks, a "drafting a response" card appears in the transcript for 3 to 8 seconds. The sidebar chip pulses. This is not a fake delay — the AI is actually generating the speech during that window.

- **They sometimes pass.** About 8% of the time, an AI delegate declines to speak — a small "The delegate of X declines to speak" system message appears, mirroring the natural gaps in a real debate.

- **They sometimes make mistakes.** About 12% of AI speeches contain a subtle factual slip — misremembering a resolution year, slightly misnaming a treaty, overstating a statistic. This mirrors real conference debate and creates openings for POIs.

- **They don't respond in lockstep.** Speeches are spaced out (50 seconds minimum between each). Motions appear at most once every 90 seconds. Nobody spams the floor.
    `.trim(),
        cta: { label: 'Try it in a room', href: '#/rooms' }
    },

    /* ============================================================ */
    /* AI                                                           */
    /* ============================================================ */

    {
        id: 'coach',
        category: 'AI',
        title: 'AI Coach',
        body: `
**AI Coach** is a persistent chat assistant that knows your committee, country, topic, and experience level. It appears across every module — you can hand off a draft or a question to it from any page.

**Modes:** the Coach can play nine roles, chosen from the dropdown in the chat header:

- **Coach** — general guidance, mixed style.
- **Teacher** — explains concepts step by step.
- **Chair** — procedural authority, enforces rules.
- **Delegate** — in-character country representative.
- **Opponent** — challenges your arguments.
- **Researcher** — evidence-focused, cites sources.
- **Speech Evaluator** — structured feedback on speeches.
- **Paper Reviewer** — reviews position papers.
- **Resolution Reviewer** — reviews resolutions.

**Tabs:** the left sidebar lists your conversations grouped by recency. Click **+ New chat** to start a new one with a chosen role. Right-click any conversation for rename, duplicate, pin, export, or delete.

**Per-conversation state:** each conversation stores its own message history and mode. You can have a Researcher chat and an Opponent chat side by side.

**Regenerate and edit:** hover any message to copy it. Hover any assistant reply to regenerate it. Hover any user message to edit it and resend from that point.

Responses stream in as they generate. Markdown is rendered cleanly — headings, lists, code blocks, task lists all work.
    `.trim(),
        cta: { label: 'Open AI Coach', href: '#/coach' }
    },

    {
        id: 'settings',
        category: 'AI',
        title: 'AI Settings',
        body: `
**AI Settings** is where you configure which AI provider powers every module.

**Provider** — pick one of three:

- **Built-in AI** — routes through this platform's server. The server key is managed in \`.env\`. Recommended for most users.
- **Bring Your Own API Key** — connect straight from your browser to any OpenAI-compatible endpoint. Fill in the base URL, key, and model name. Stored locally.
- **Demo mode** — simulated responses, no key required.

**Temperature** and **Max Tokens** control generation. Lower temperature is more predictable. Higher is more creative. Default is fine for most uses.

**Test Connection** sends a small probe request and reports what happened — model name and round-trip latency on success, error details on failure.

Below the AI card, the **Your Data** section exports or imports a full JSON backup of everything you've built, and generates a print-ready delegate dossier with your skills, position paper, resolution, and recent simulations.

**Reset** erases everything on this device. If you're signed in, it does not touch your cloud copy.
    `.trim(),
        cta: { label: 'Open AI Settings', href: '#/settings' }
    },

    /* ============================================================ */
    /* PROGRESS                                                     */
    /* ============================================================ */

    {
        id: 'analytics',
        category: 'Progress',
        title: 'Analytics',
        body: `
**Analytics** turns your saved work into a visual picture of how you're developing.

**Skill breakdown** — six skills tracked:

- **Speech** — average of your saved speech content scores
- **Debate** — from motions passed, POIs answered, and simulations run
- **Research** — from position papers and research dossiers
- **Diplomacy** — average of your diplomatic language scores
- **Resolution Writing** — from resolution clause richness
- **Delivery** — from voice recordings (pace, fluency, confidence)

Delta arrows compare the first half of your saved scores to the second half, so you see whether a skill is trending up or down.

**Activity heatmap** — twelve weeks of calendar days, coloured by the number of practice events per day. Good for spotting whether you're practising consistently or cramming.

**Recommendations** — the platform reads your skill profile and recent activity and suggests what to practice next. Lowest scores get prioritised. If you've been inactive, you get a nudge. If you've built a streak, you get a challenge.

**Activity breakdown** — a bar chart of what you've been doing: lessons completed, speeches saved, papers written, resolutions drafted, simulations run, crises responded to.
    `.trim(),
        cta: { label: 'Open Analytics', href: '#/analytics' }
    },

    /* ============================================================ */
    /* TEAM                                                         */
    /* ============================================================ */

    {
        id: 'educator',
        category: 'Team',
        title: 'Educator Hub — for teachers',
        body: `
**Educator Hub** lets you run a class, assign work, and review submissions. It requires a Supabase project connected to this deployment — otherwise the page shows a message explaining what to configure.

**Create a class.** Give it a name and description. You get a six-letter code that students use to join.

**Assign work.** Each assignment has a title, prompt, and an optional suggested tool (Position Paper Builder, Speech Trainer, Resolution Builder, or Conference Simulation). When a tool is suggested, students see a button that links to it.

**Review submissions.** The assignment shows how many students have submitted and how many you've reviewed. Click **View submissions** to see all answers side by side. For any submission, click **Review with AI** to get an AI-drafted evaluation in one column while the submission sits in the other. Copy the AI feedback into the feedback box, edit as needed, add a grade, and save.

Students see your feedback below the assignment once you've reviewed it.

**Export** produces a CSV with one row per student and one column per assignment, showing status and grade. Opens cleanly in any spreadsheet app.
    `.trim(),
        cta: { label: 'Open Educator Hub', href: '#/educator' }
    },

    {
        id: 'educator-student',
        category: 'Team',
        title: 'Educator Hub — for students',
        body: `
If a teacher gave you a class code, go to **Educator Hub** and click **Join a class**. Enter the six-letter code. You're now enrolled.

The class page lists every assignment your teacher has posted. For each one you'll see:

- The prompt
- A link to the suggested tool, if there is one
- A status pill (not submitted, submitted, reviewed)
- Your teacher's feedback, if they've reviewed your work

Click **Submit work** to write or paste your response. You can update it any time before your teacher reviews it — updating resets the status to "submitted" and clears the previous review.

Once your teacher reviews, you'll see their comment and grade directly on the class page.
    `.trim(),
        cta: { label: 'Open Educator Hub', href: '#/educator' }
    },

    {
        id: 'author',
        category: 'Team',
        title: 'Author Content',
        body: `
**Author Content** lets an allowlisted user create custom lessons and crisis scenarios that appear alongside the built-in ones. Access is controlled by the server's \`AUTHOR_EMAILS\` environment variable — a comma-separated list of email addresses.

**Lessons** — title, level, description, and an optional markdown body. You can write the body yourself or click **Draft body with AI** to generate a starting draft. Custom lessons appear on the Learn page in their level's section, visually identical to built-in lessons.

**Scenarios** — crisis scenarios edited as JSON. Each event needs an id, title, description, type, severity, and at least one option. Click **Insert template** for a working two-event example you can adapt. Custom scenarios appear in the Crisis Mode scenario dropdown.

**Import and export** move content between deployments. Export produces a JSON file with all custom lessons and scenarios. Import merges new entries — anything with a matching slug or key is skipped, so nothing is overwritten.

Edits take effect immediately for anyone using the platform, since the server caches content in memory and refreshes on every author write.
    `.trim(),
        cta: { label: 'Open Author Content', href: '#/author' }
    },

    /* ============================================================ */
    /* REFERENCE                                                    */
    /* ============================================================ */

    {
        id: 'shortcuts',
        category: 'Reference',
        title: 'Keyboard shortcuts',
        body: `
The platform responds to a small set of global shortcuts. They work everywhere except when you're typing in an input, textarea, or editable field.

**Globally:**
- \`Ctrl+K\` or \`Cmd+K\` — focus the primary text field on the current page. In the Coach, this focuses the search box.

**In the Coach:**
- \`Enter\` — send the message.
- \`Shift+Enter\` — new line.
- \`Ctrl+Shift+O\` — start a new chat.
- \`Esc\` — close the sidebar or clear the input.

**In the Simulation:**
- \`Ctrl+Enter\` — trigger the primary action in the current panel (deliver speech, submit vote, propose motion).

**In Rooms:**
- \`Enter\` — send a chat message.
- \`Shift+Enter\` — new line in the composer.
    `.trim()
    },

    {
        id: 'offline',
        category: 'Reference',
        title: 'Offline and local data',
        body: `
Most of the platform works offline once you've loaded it once. A service worker caches the app shell, so you can open the site without a network connection and use:

- Every lesson in **Learn MUN**
- Every glossary entry in the **Knowledge Base**
- Any saved draft — speeches, papers, resolutions, research dossiers
- Analytics based on data you've already generated
- The **Quick Check** rule engine in the Resolution Builder
- Any **Export** function

Features that need a network:

- AI Coach and every AI-powered evaluation
- Country Research generation
- Conference Simulation (AI delegate responses)
- Multiplayer Rooms
- Educator Hub
- Author Content

The service worker is disabled on \`localhost\` during development. It registers automatically once you deploy to a real hostname.

**Where your data lives:** everything is stored in your browser's localStorage and, if you're signed in, mirrored to your Supabase account. If you never sign in, clearing site data erases everything. If you do sign in, your work survives a browser wipe and follows you to other devices.
    `.trim()
    },

    {
        id: 'export',
        category: 'Reference',
        title: 'Export formats',
        body: `
Different tools produce different exports. Here's what to expect.

**Position Paper and Resolution Builder** — export as PDF (via your browser's print dialog), DOCX (opens in Word), Markdown, or plain text. Formatting is preserved.

**Research Dossiers** — export as Markdown. The source tags stay intact so you can see what came from where.

**Delegate Dossier** (from AI Settings) — opens a new window with a print-ready summary: your skills, position paper, resolution, and recent simulations. Use your browser's "Save as PDF" to keep a copy.

**Analytics** — no direct export, but every underlying data point is in your local store and travels with backups.

**Full backup** — the **Your Data** section of AI Settings produces a JSON file with every lesson completed, every draft, every chat, every session. Import it on any other device to continue where you left off.

**Educator Hub** — CSV export per class, one row per student, one column per assignment.

**Author Content** — JSON export of every custom lesson and scenario, so you can move content between deployments or share it with another teacher.
    `.trim(),
        cta: { label: 'Open AI Settings', href: '#/settings' }
    }
];