export const landing = {
  path: '/',
  render() {
    return `
      <div class="landing">
        <div class="landing-nav">
          <div class="brand" style="padding:0;border:none;margin:0;">
            <a href="#/">
              <div class="brand-mark">M</div>
              <div>
                <div class="brand-name">MUN AI Academy</div>
                <div class="brand-sub">Learn · Practice · Simulate</div>
              </div>
            </a>
          </div>
          <div style="flex:1"></div>
          <a class="btn btn-ghost btn-sm" href="#/dashboard">Dashboard</a>
          <a class="btn btn-primary btn-sm" href="#/coach">Try AI Coach</a>
        </div>

        <section class="hero">
          <div>
            <div class="hero-eyebrow">Everything a delegate needs</div>
            <h1>Master MUN. Practice Like You're Already at Conference.</h1>
            <p class="hero-sub">Learn diplomacy, build arguments, train your speeches, negotiate with AI delegates, and simulate an entire MUN conference — in one place.</p>
            <div class="hero-cta">
              <a class="btn btn-primary" href="#/learn">Start Learning</a>
              <a class="btn btn-gold" href="#/coach">Try AI Coach</a>
              <a class="btn btn-ghost" href="#/dashboard">Simulate a Conference</a>
            </div>
          </div>
          <div class="hero-visual">
            <div class="hero-visual-head"><div class="hero-dot"></div><div class="hero-dot"></div><div class="hero-dot"></div></div>
            <div class="hero-line"><b>UNHRC</b> · Chad · Climate & Human Rights</div>
            <div class="hero-line"><span class="hero-ai">Chair:</span> "Any points or motions on the floor?"</div>
            <div class="hero-line"><span class="hero-ai">You:</span> "Motion to open a moderated caucus on climate finance, 45 seconds, 10 minutes total."</div>
            <div class="hero-line"><span class="hero-ai">Germany:</span> "Seconded."</div>
            <div class="hero-line"><span class="hero-ai">Chair:</span> "Is there any objection? … The motion passes."</div>
          </div>
        </section>

        <section class="features">
          <h2>Six pillars, one platform</h2>
          <div class="features-grid">
            ${feature('01', 'Learn', 'Master MUN fundamentals — beginner to advanced, with AI explanations at every level.')}
            ${feature('02', 'Practice', 'Train speeches, POIs, debates, and diplomatic language with structured AI feedback.')}
            ${feature('03', 'Research', 'Prepare your country and topic with an AI research assistant that labels what needs verification.')}
            ${feature('04', 'Build', 'Draft position papers and resolutions with clause-level checks and diplomatic-tone review.')}
            ${feature('05', 'Simulate', 'Experience a complete AI-powered conference with stateful delegates and procedure.')}
            ${feature('06', 'Improve', 'Track your skills, weak areas, and progress over time — nothing gambling-like, just practice.')}
          </div>
        </section>

        <div class="landing-footer">MUN AI Academy · Demo build · Works offline for lessons and drafts</div>
      </div>`;
  }
};

function feature(n, title, body) {
  return `<div class="feature"><div class="feature-num">${n}</div><h3>${title}</h3><p>${body}</p></div>`;
}