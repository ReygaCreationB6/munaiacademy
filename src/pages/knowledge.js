import { layout, bindLayout } from './_layout.js';

const SEED = [
  { q: "What's a moderated caucus?", a: "A structured debate format where the Chair sets a topic and total time. Delegates raise placards to speak for a fixed duration." },
  { q: "How does a POI work?", a: "A Point of Information is a question directed at a speaker after their speech. The speaker may accept or decline. It should be brief and relevant." },
  { q: "What is an operative clause?", a: "An operative clause is an actionable section of a resolution. It starts with a verb (e.g., 'Requests', 'Calls upon') and specifies action, actor, mechanism, funding, and timeline." },
  { q: "How do I make a motion?", a: "Raise your placard and state: 'Motion to…' followed by the motion type (e.g., 'Motion to open a moderated caucus'). The Chair will ask for seconds, then a vote." }
];

const $ = (id) => document.getElementById(id);

export const knowledge = {
  path: '/knowledge',
  ariaTitle: 'MUN Knowledge Base',
  render() { return layout('MUN Knowledge Base', this.body()); },

  init() {
    try { bindLayout(); } catch (err) { console.error('[knowledge] bindLayout:', err); }

    const input = $('kbSearch');
    if (!input) return;

    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.ask(input.value);
      }
    };

    const askBtn = $('kbAsk');
    if (askBtn) askBtn.onclick = () => this.ask(input.value);

    document.querySelectorAll('.suggestion').forEach(s => {
      s.onclick = () => {
        input.value = s.dataset.q || '';
        this.ask(s.dataset.q || '');
      };
    });

    input.focus();
  },

  body() {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Search the encyclopedia</div></div>
        <div class="flex gap-2">
          <input id="kbSearch" placeholder="e.g. What's a moderated caucus?" style="flex:1;padding:10px 12px;border:1px solid var(--line);border-radius:6px;font-family:inherit;font-size:14px;" />
          <button class="btn btn-primary" id="kbAsk">Ask</button>
        </div>
      </div>
      <div class="card mt-2">
        <div class="card-title">Common questions</div>
        <div class="suggestions mt-2">
          ${SEED.map(s => `<button class="suggestion" data-q="${escape(s.q)}">${escape(s.q)}</button>`).join('')}
        </div>
      </div>
      <div class="card mt-2">
        <div class="card-title">Glossary quick reference</div>
        <ul style="line-height:1.9;font-size:14px;">
          ${SEED.map(s => `<li><b>${escape(s.q.replace("What's ", '').replace('?', ''))}</b> — ${escape(s.a)}</li>`).join('')}
        </ul>
      </div>`;
  },

  ask(q) {
    if (!q?.trim()) return;
    const prompt = `Explain this MUN concept at three levels — Beginner, Intermediate, Advanced — with one example each:\n\n"${q.trim()}"`;
    sessionStorage.setItem('munai.pendingPrompt', prompt);
    location.hash = '/coach';
  }
};

function escape(s = '') {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}