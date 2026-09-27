import { layout, bindLayout } from './_layout.js';

export const notFound = {
    path: '/404',
    ariaTitle: 'Page not found',
    render() {
        return layout('Page not found', `
      <div class="nf-page">
        <div class="nf-num">404</div>
        <h1 class="nf-title">This page doesn't exist</h1>
        <p class="nf-sub">
          The link may be broken, or the page may have been moved. Try one of these:
        </p>
        <div class="nf-actions">
          <a class="btn btn-primary" href="#/dashboard">Dashboard</a>
          <a class="btn btn-ghost" href="#/learn">Learn MUN</a>
          <a class="btn btn-ghost" href="#/coach">AI Coach</a>
          <a class="btn btn-ghost" href="#/simulate">Simulation</a>
        </div>
      </div>`, { full: true });
    },
    init() { bindLayout(); }
};