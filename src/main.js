import { store } from './core/store.js';
import { Router } from './core/router.js';
import { AIManager } from './ai/AIManager.js';
import * as shortcuts from './core/shortcuts.js';
import * as fx from './core/fx.js';
import * as cardGlow from './core/cardGlow.js';
import * as sentry from './core/sentry.js';
import * as errorBoundary from './core/errorBoundary.js';
import * as ageGate from './core/ageGate.js';
import * as cookieNotice from './core/cookieNotice.js';
import * as signInNudge from './core/signInNudge.js';
import { auth } from './core/auth.js';
import { cloudSync } from './core/cloudSync.js';
import { ws } from './core/ws.js';
import { quota } from './core/quota.js';
import { openModal, toast } from './core/ui.js';

import { landing } from './pages/landing.js';
import { dashboard } from './pages/dashboard.js';
import { learn } from './pages/learn.js';
import { knowledge } from './pages/knowledge.js';
import { coach } from './pages/coach.js';
import { speechTrainer } from './pages/speechTrainer.js';
import { settings } from './pages/settings.js';
import { positionPaper } from './pages/positionPaper.js';
import { resolutionBuilder } from './pages/resolutionBuilder.js';
import { simulation } from './pages/simulation.js';
import { analytics } from './pages/analytics.js';
import { login } from './pages/login.js';
import { countryResearch } from './pages/countryResearch.js';
import { debateTrainer } from './pages/debateTrainer.js';
import { poiTrainer } from './pages/poiTrainer.js';
import { practiceArena } from './pages/practiceArena.js';
import { rooms } from './pages/rooms.js';
import { room } from './pages/room.js';
import { legal } from './pages/legal.js';
import { about } from './pages/about.js';
import { notFound } from './pages/notFound.js';
import { educatorPage } from './pages/educator.js';
import { authorPage } from './pages/author.js';
import { loadContentFromServer } from './core/content.js';
import { guidePage } from './pages/guide.js';
import { achievementsPage } from './pages/achievements.js';
import * as achievements from './analytics/achievements.js';
import { simRoom } from './pages/simRoom.js';
import { sharedSim } from './core/sharedSim.js';

export const ai = new AIManager(store);

try {
    const r = await fetch('/api/config', { cache: 'no-store' });
    if (r.ok) window.__munaiConfig = await r.json();
} catch { }

const router = new Router([
    landing,
    dashboard,
    guidePage,
    learn,
    knowledge,
    coach,
    speechTrainer,
    settings,
    positionPaper,
    resolutionBuilder,
    simulation,
    simRoom,
    analytics,
    analytics,
    achievementsPage,
    login,
    login,
    countryResearch,
    debateTrainer,
    poiTrainer,
    practiceArena,
    rooms,
    room,
    legal,
    about,
    educatorPage,       // ← this may be here
    authorPage,         // ← but this is probably missing
    notFound,
    { path: '*', render: (ctx) => notFound.render(ctx) }
]);

import { layout, bindLayout } from './pages/_layout.js';

function announceRoute(title) {
    const live = document.getElementById('routeAriaLive');
    if (live) live.textContent = `${title} page loaded`;
}

const _origResolve = router.resolve.bind(router);
router.resolve = function patchedResolve() {
    shortcuts.clearScopes();
    ws.clearAll();
    sharedSim.clearAll();   // ← add this line
    try { _origResolve(); }
    catch (err) {
        if (window.Sentry?.captureException) window.Sentry.captureException(err);
        console.error('[router]', err);
        errorBoundary.renderFatal(document.getElementById('app'), 'Failed to load this page.');
    }
    const path = location.hash.replace(/^#/, '').split('?')[0] || '/';
    const route = this.routes.find(r => r.path === path);
    if (route?.ariaTitle) announceRoute(route.ariaTitle);
};

let suppressSync = false;
store.subscribe(() => {
    if (suppressSync) return;
    cloudSync.push(store.get());
});

// Refresh the quota widget immediately when the user's provider or key changes.
store.subscribe(() => {
    try { quota.refresh(); } catch { }
});

async function reconcileOnSignIn() {
    const remote = await cloudSync.pull();
    const hasRemote = remote?.data && Object.keys(remote.data).length > 0;
    const localHasContent = Object.values(store.get().progress || {}).some(Boolean)
        || (store.get().speeches || []).length > 0
        || (store.get().positionPapers || []).length > 0
        || (store.get().resolutions || []).length > 0;

    if (!hasRemote && localHasContent) {
        openModal({
            title: 'Upload this device\'s data?',
            body: `<p>Your account has no saved data yet. Upload the progress, papers, and drafts from this device?</p>`,
            footer: `<button class="btn btn-ghost" id="rcSkip">Keep local only</button>
               <button class="btn btn-primary" id="rcUpload">Upload to cloud</button>`
        });
        document.getElementById('rcUpload').onclick = async () => {
            document.querySelector('.modal-backdrop')?.remove();
            await cloudSync.pushNow(store.get());
            toast('Uploaded to cloud');
        };
        document.getElementById('rcSkip').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        return;
    }
    if (hasRemote && localHasContent) {
        openModal({
            title: 'Sync conflict',
            body: `<p>This device has local data, and your account has cloud data. Which would you like to keep?</p>`,
            footer: `<button class="btn btn-ghost" id="rcLocal">Keep local (overwrite cloud)</button>
               <button class="btn btn-primary" id="rcCloud">Restore from cloud</button>`
        });
        document.getElementById('rcCloud').onclick = () => {
            suppressSync = true;
            store.replace(remote.data);
            suppressSync = false;
            document.querySelector('.modal-backdrop')?.remove();
            toast('Restored from cloud');
            location.reload();
        };
        document.getElementById('rcLocal').onclick = async () => {
            document.querySelector('.modal-backdrop')?.remove();
            await cloudSync.pushNow(store.get());
            toast('Cloud updated from this device');
        };
        return;
    }
    if (hasRemote && !localHasContent) {
        suppressSync = true;
        store.replace(remote.data);
        suppressSync = false;
        toast('Restored from cloud');
    }
}

(async () => {
    errorBoundary.install();
    ageGate.install();
    if (localStorage.getItem('munai.age.answer.v1') === 'no') return;

    await loadContentFromServer();
    achievements.install();

    // Achievement unlock toast
    achievements.onUnlock(rec => showAchievementToast(rec));

    cookieNotice.install();
    fx.install();

    cardGlow.install();
    await sentry.install();

    await auth.init();
    if (auth.isSignedIn()) setTimeout(reconcileOnSignIn, 500);
    window.addEventListener('munai:signed-in', () => setTimeout(reconcileOnSignIn, 400));

    shortcuts.install();
    router.start();
    window.addEventListener('hashchange', () => setTimeout(bindLayout, 0));

    signInNudge.install(store);

    // Start polling quota every 20s.
    quota.start();
})();

/* ------------------------------------------------------------------ */
/* Achievement unlock toast                                            */
/* ------------------------------------------------------------------ */

let achToastTimer = null;

function showAchievementToast(rec) {
    // Queue: if a toast is already showing, wait for it.
    const existing = document.querySelector('.ach-toast');
    if (existing) {
        // Chain: when the current one disappears, show the next.
        setTimeout(() => showAchievementToast(rec), 3200);
        return;
    }

    const el = document.createElement('div');
    el.className = 'ach-toast';
    el.innerHTML = `
    <div class="ach-toast-icon">★</div>
    <div class="ach-toast-body">
      <div class="ach-toast-label">Achievement unlocked</div>
      <div class="ach-toast-name">${rec.name}</div>
      <div class="ach-toast-desc">${rec.description}</div>
    </div>`;
    document.body.appendChild(el);

    clearTimeout(achToastTimer);
    achToastTimer = setTimeout(() => {
        el.classList.add('leaving');
        setTimeout(() => el.remove(), 280);
    }, 3000);
}