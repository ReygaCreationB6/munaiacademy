import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { escapeHtml } from '../core/ui.js';

const LAST_UPDATED = '2025-01-01';

export const legal = {
    path: '/legal/:page',
    ariaTitle: 'Legal',
    render(ctx) {
        const page = ctx?.params?.page || 'terms';
        const titles = { terms: 'Terms of Service', privacy: 'Privacy Policy', cookies: 'Cookie & Storage Notice' };
        return layout(titles[page] || 'Legal', this.body(page), { narrow: true });
    },
    init() { bindLayout(); },

    body(page) {
        if (page === 'privacy') return this.privacy();
        if (page === 'cookies') return this.cookies();
        return this.terms();
    },

    terms() {
        const cfg = window.__munaiConfig || {};
        const siteName = cfg.siteName || 'MUN AI Academy';
        const contact = cfg.contactEmail || 'the site owner';

        return `
      <article class="legal-doc">
        <header class="legal-head">
          <div class="label-small">Legal</div>
          <h1>Terms of Service</h1>
          <p class="legal-meta">Last updated ${LAST_UPDATED}</p>
        </header>

        <section>
          <h2>1. Agreement</h2>
          <p>By accessing or using ${siteName} (the "Service"), you agree to these Terms. If you do not agree, do not use the Service.</p>
        </section>

        <section>
          <h2>2. Eligibility</h2>
          <p>The Service is intended for users aged 13 and older. By using the Service you confirm that you meet this requirement. If you are under 13, you may not use the Service.</p>
        </section>

        <section>
          <h2>3. Your account</h2>
          <p>You may use the Service without an account. If you create one, you are responsible for keeping your credentials safe and for everything that happens under your account. You can delete your account data at any time from Settings.</p>
        </section>

        <section>
          <h2>4. Acceptable use</h2>
          <p>You agree not to:</p>
          <ul>
            <li>Use the Service to break any law or harm others.</li>
            <li>Attempt to bypass rate limits, quotas, or security controls.</li>
            <li>Upload malicious code or attempt to compromise the Service.</li>
            <li>Use the Service to generate content that is illegal, harassing, or deceptive.</li>
            <li>Resell or redistribute access to the Service without permission.</li>
          </ul>
        </section>

        <section>
          <h2>5. AI outputs</h2>
          <p>The Service is powered by third-party large language models. AI outputs may be inaccurate, incomplete, or out of date. <strong>You must not rely on AI outputs as legal, diplomatic, or factual advice.</strong> Always verify information against authoritative sources before using it in a real Model United Nations conference or any other setting.</p>
        </section>

        <section>
          <h2>6. Your content</h2>
          <p>You retain ownership of the content you create (speeches, position papers, resolutions, chat messages). You grant us a limited license to store and process that content solely to operate the Service — for example, to sync it to your account or send it to the AI provider you have selected.</p>
        </section>

        <section>
          <h2>7. Third-party services</h2>
          <p>The Service relies on third-party providers including:</p>
          <ul>
            <li>Supabase (account authentication and optional cloud storage)</li>
            <li>An AI provider (which may be the site's built-in key or your own)</li>
            <li>Optionally, Sentry (error tracking)</li>
          </ul>
          <p>Your use of those providers is also subject to their respective terms.</p>
        </section>

        <section>
          <h2>8. Service availability</h2>
          <p>The Service is provided "as is" and "as available." We do not guarantee uptime, availability, or freedom from errors. We may modify, suspend, or discontinue any part of the Service at any time.</p>
        </section>

        <section>
          <h2>9. Limitation of liability</h2>
          <p>To the maximum extent permitted by law, we are not liable for any indirect, incidental, or consequential damages arising from your use of the Service.</p>
        </section>

        <section>
          <h2>10. Termination</h2>
          <p>We may suspend or terminate access to the Service at any time, with or without cause.</p>
        </section>

        <section>
          <h2>11. Changes</h2>
          <p>We may update these Terms from time to time. Continued use of the Service after an update constitutes acceptance of the new Terms.</p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>Questions about these Terms: <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a></p>
        </section>
      </article>`;
    },

    privacy() {
        const cfg = window.__munaiConfig || {};
        const siteName = cfg.siteName || 'MUN AI Academy';
        const contact = cfg.contactEmail || 'the site owner';

        return `
      <article class="legal-doc">
        <header class="legal-head">
          <div class="label-small">Legal</div>
          <h1>Privacy Policy</h1>
          <p class="legal-meta">Last updated ${LAST_UPDATED}</p>
        </header>

        <section>
          <h2>What we collect</h2>
          <ul>
            <li><b>Account information</b> — if you sign in, we store your email address and a hashed password (Supabase handles this).</li>
            <li><b>Usage data</b> — the content you create (speeches, papers, resolutions, messages), stored locally in your browser and, if signed in, on our cloud storage.</li>
            <li><b>Diagnostic data</b> — if error tracking is enabled, we receive anonymized error reports with a truncated stack trace and browser info.</li>
            <li><b>Anonymous quota counter</b> — your IP address is used transiently to enforce rate limits. It is not stored long-term or linked to your account.</li>
          </ul>
        </section>

        <section>
          <h2>What we do NOT collect</h2>
          <ul>
            <li>No advertising identifiers.</li>
            <li>No cross-site tracking.</li>
            <li>No analytics beyond aggregate error reporting.</li>
            <li>No selling of data to third parties.</li>
          </ul>
        </section>

        <section>
          <h2>How we use it</h2>
          <ul>
            <li>To run the Service — respond to your requests, save your work, sync across devices.</li>
            <li>To enforce fair use of the built-in AI (rate limits).</li>
            <li>To fix bugs (error reports).</li>
          </ul>
        </section>

        <section>
          <h2>Who we share it with</h2>
          <ul>
            <li><b>Supabase</b> — for authentication and, if you opt in, cloud storage of your work.</li>
            <li><b>Your chosen AI provider</b> — the messages you send are forwarded to whichever provider you selected (built-in, OpenAI, Groq, etc.) in order to generate a response.</li>
            <li><b>Sentry (optional)</b> — if enabled, error reports are sent to Sentry's servers.</li>
          </ul>
        </section>

        <section>
          <h2>How long we keep it</h2>
          <ul>
            <li>Account data: until you delete your account.</li>
            <li>Content: until you delete it, or your account.</li>
            <li>Error reports: 90 days (Sentry's default retention).</li>
            <li>Rate-limit counters: 24 hours.</li>
          </ul>
        </section>

        <section>
          <h2>Your rights</h2>
          <p>If you are in the EU, UK, or a jurisdiction with similar protections, you have the right to access, correct, export, or delete your personal data. Most of these are available directly from the Settings page. For anything else, contact <a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a>.</p>
        </section>

        <section>
          <h2>Children</h2>
          <p>We do not knowingly collect personal information from users under 13. If we learn that we have, we will delete it. If you believe a child under 13 has provided us information, contact us.</p>
        </section>

        <section>
          <h2>Changes</h2>
          <p>We may update this policy. Material changes will be announced on the site.</p>
        </section>

        <section>
          <h2>Contact</h2>
          <p><a href="mailto:${escapeHtml(contact)}">${escapeHtml(contact)}</a></p>
        </section>
      </article>`;
    },

    cookies() {
        return `
      <article class="legal-doc">
        <header class="legal-head">
          <div class="label-small">Legal</div>
          <h1>Cookie & Storage Notice</h1>
          <p class="legal-meta">Last updated ${LAST_UPDATED}</p>
        </header>

        <section>
          <h2>What we use</h2>
          <p>We use the minimum storage necessary to run the app:</p>
          <ul>
            <li><b>Authentication cookies</b> — set by Supabase when you sign in. Essential.</li>
            <li><b>Local storage</b> — stores your drafts, progress, preferences, and the age-gate answer. Never leaves your device unless you sign in.</li>
            <li><b>Service worker cache</b> — lets the app work offline.</li>
          </ul>
        </section>

        <section>
          <h2>What we do NOT use</h2>
          <ul>
            <li>No advertising cookies.</li>
            <li>No analytics or tracking cookies.</li>
            <li>No third-party marketing pixels.</li>
          </ul>
        </section>

        <section>
          <h2>Your control</h2>
          <p>You can clear all local storage from Settings → Reset. Clearing your browser's cookies will sign you out but keeps your local drafts.</p>
        </section>
      </article>`;
    }
};