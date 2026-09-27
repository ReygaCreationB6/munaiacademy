import { layout, bindLayout } from './_layout.js';

const CHANGELOG = [
    { date: '2025-01-01', version: '1.0.0', notes: 'Public launch. Rate limiting, legal pages, age gate, error tracking, WebSocket hardening.' },
    { date: '2024-12-15', version: '0.13.0', notes: 'Multiplayer rooms with live speaker queue, motions, and voting.' },
    { date: '2024-12-01', version: '0.12.0', notes: 'Country Research, Debate Trainer, POI Trainer, and Practice Arena.' },
    { date: '2024-11-20', version: '0.11.0', notes: 'Supabase accounts, cloud sync, and reconciliation flow.' },
    { date: '2024-11-10', version: '0.10.0', notes: 'PWA, offline support, keyboard shortcuts, and delegate dossier.' },
    { date: '2024-11-01', version: '0.9.0', notes: 'Analytics with heatmap, streaks, and recommendations.' },
    { date: '2024-10-20', version: '0.8.0', notes: 'Crisis mode with three scenarios and effects system.' },
    { date: '2024-10-05', version: '0.7.0', notes: 'Full conference simulation with AI delegates.' },
    { date: '2024-09-25', version: '0.6.0', notes: 'Position Paper and Resolution builders with export.' },
    { date: '2024-09-10', version: '0.1.0', notes: 'Foundation, AI abstraction, Coach, Learn, Speech Trainer.' }
];

export const about = {
    path: '/about',
    ariaTitle: 'About',
    render() { return layout('About', this.body(), { narrow: true }); },
    init() { bindLayout(); },

    body() {
        const cfg = window.__munaiConfig || {};
        const siteName = cfg.siteName || 'MUN AI Academy';
        const contact = cfg.contactEmail || 'the maintainer';

        return `
      <article class="legal-doc">
        <header class="legal-head">
          <div class="label-small">About</div>
          <h1>${siteName}</h1>
          <p class="legal-meta">Learn MUN. Practice with AI. Run real simulations.</p>
        </header>

        <section>
          <h2>What this is</h2>
          <p>${siteName} is a training platform for Model United Nations delegates. It combines structured lessons, AI-powered practice tools, a full stateful conference simulation, and multiplayer rooms where real delegates can run a live committee together.</p>
          <p>The goal is simple: give any student, anywhere, the tools and repetitions they'd get from a well-coached MUN team.</p>
        </section>

        <section>
          <h2>What it is not</h2>
          <p>AI is a practice partner, not an authority. Every AI output is a starting point — verify facts, dates, resolution numbers, and quotes against primary sources before using them in a real conference. If something matters, check it twice.</p>
        </section>

        <section>
          <h2>Open source</h2>
          <p>This is a small, self-hosted project. If you want to run your own instance, the code and deployment instructions are on GitHub.</p>
        </section>

        <section>
          <h2>Credits</h2>
          <ul>
            <li>Built with vanilla ES modules, Express, WebSocket, and Supabase.</li>
            <li>AI powered by your choice of provider — OpenAI, Groq, OpenRouter, Mistral, Ollama, or a local model.</li>
            <li>Typo fonts: Inter and Source Serif 4.</li>
          </ul>
        </section>

        <section>
          <h2>Contact</h2>
          <p>Bug reports, feature requests, or general feedback: <a href="mailto:${contact}">${contact}</a></p>
        </section>

        <section>
          <h2>Changelog</h2>
          <div class="changelog">
            ${CHANGELOG.map(v => `
              <div class="changelog-entry">
                <div class="changelog-head">
                  <span class="changelog-version">v${v.version}</span>
                  <span class="changelog-date">${v.date}</span>
                </div>
                <div class="changelog-notes">${v.notes}</div>
              </div>`).join('')}
          </div>
        </section>
      </article>`;
    }
};