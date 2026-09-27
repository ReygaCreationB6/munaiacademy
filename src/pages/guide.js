import { layout, bindLayout } from './_layout.js';
import { GUIDE_CATEGORIES, GUIDE_SECTIONS } from '../data/guide.js';
import { escapeHtml, markdownLite } from '../core/ui.js';

let filter = '';

export const guidePage = {
    path: '/guide',
    ariaTitle: 'Guide',

    render() {
        return layout('Guide', this.body(), { narrow: false });
    },

    init() {
        try { bindLayout(); } catch (err) { console.error('[guide] bindLayout:', err); }
        this.bindToc();
        this.bindSearch();
        this.bindScrollSpy();
    },

    body() {
        return `
      <div class="guide-layout">
        <aside class="guide-toc">
          <div class="guide-toc-inner">
            <div class="guide-toc-head">
              <div class="label-small">Guide</div>
              <div class="guide-toc-title">How MUN AI Academy works</div>
            </div>

            <div class="guide-search">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round">
                <circle cx="7" cy="7" r="4.5"/>
                <path d="M10.5 10.5l3 3"/>
              </svg>
              <input id="guideSearch" placeholder="Filter sections…" value="${escapeHtml(filter)}" />
            </div>

            <nav class="guide-toc-nav" id="guideNav">
              ${this.renderToc()}
            </nav>
          </div>
        </aside>

        <div class="guide-body" id="guideBody">
          ${this.renderSections()}
        </div>
      </div>`;
    },

    renderToc() {
        const grouped = {};
        for (const s of GUIDE_SECTIONS) {
            if (filter && !this.matches(s)) continue;
            (grouped[s.category] ||= []).push(s);
        }

        const any = Object.keys(grouped).length;
        if (!any) {
            return `<div class="guide-empty">No sections match "${escapeHtml(filter)}".</div>`;
        }

        return GUIDE_CATEGORIES
            .filter(cat => grouped[cat]?.length)
            .map(cat => `
        <div class="guide-toc-group">
          <div class="guide-toc-cat">${escapeHtml(cat)}</div>
          ${grouped[cat].map(s => `
            <a class="guide-toc-link" href="#${s.id}" data-target="${s.id}">
              ${escapeHtml(s.title)}
            </a>`).join('')}
        </div>`).join('');
    },

    renderSections() {
        const visible = GUIDE_SECTIONS.filter(s => !filter || this.matches(s));

        if (!visible.length) {
            return `<div class="card"><p class="muted">No sections match "${escapeHtml(filter)}".</p></div>`;
        }

        return visible.map(s => `
      <section class="guide-section" id="${s.id}">
        <div class="guide-section-head">
          <div class="guide-section-cat">${escapeHtml(s.category)}</div>
          <h2 class="guide-section-title">${escapeHtml(s.title)}</h2>
        </div>
        <div class="guide-section-content">${markdownLite(s.body)}</div>
        ${s.cta ? `
          <div class="guide-section-cta">
            <a class="btn btn-primary" href="${s.cta.href}">${escapeHtml(s.cta.label)}</a>
          </div>` : ''}
      </section>`).join('');
    },

    matches(s) {
        if (!filter) return true;
        const q = filter.toLowerCase();
        return (
            s.title.toLowerCase().includes(q) ||
            s.category.toLowerCase().includes(q) ||
            s.body.toLowerCase().includes(q)
        );
    },

    bindToc() {
        document.querySelectorAll('.guide-toc-link').forEach(a => {
            a.onclick = (e) => {
                e.preventDefault();
                const id = a.dataset.target;
                const el = document.getElementById(id);
                if (!el) return;
                const y = el.getBoundingClientRect().top + window.pageYOffset - 80;
                window.scrollTo({ top: y, behavior: 'smooth' });
                document.querySelectorAll('.guide-toc-link').forEach(x => x.classList.remove('active'));
                a.classList.add('active');
            };
        });
    },

    bindSearch() {
        const input = document.getElementById('guideSearch');
        if (!input) return;
        let last = filter;
        input.oninput = () => {
            filter = input.value.trim();
            if (filter === last) return;
            last = filter;
            this.rerender();
            const newInput = document.getElementById('guideSearch');
            if (newInput) {
                newInput.focus();
                newInput.setSelectionRange(newInput.value.length, newInput.value.length);
            }
        };
    },

    bindScrollSpy() {
        if (!('IntersectionObserver' in window)) return;
        const links = document.querySelectorAll('.guide-toc-link');
        if (!links.length) return;

        const io = new IntersectionObserver(entries => {
            for (const e of entries) {
                if (!e.isIntersecting) continue;
                const id = e.target.id;
                document.querySelectorAll('.guide-toc-link').forEach(a => {
                    a.classList.toggle('active', a.dataset.target === id);
                });
            }
        }, { rootMargin: '-80px 0px -70% 0px' });

        document.querySelectorAll('.guide-section').forEach(s => io.observe(s));
    },

    rerender() {
        const app = document.getElementById('app');
        if (app) app.innerHTML = this.render();
        this.init();
    }
};