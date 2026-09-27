/**
 * Global UI effects.
 *  - Injects and animates the layered background
 *  - Cursor-following glow
 *  - Parallax response to pointer position
 *  - Stat counter animation on entry
 *
 * All motion is transform/opacity only, rAF-throttled, and
 * disabled when prefers-reduced-motion is on.
 */

const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
const TOUCH = window.matchMedia('(pointer: coarse)').matches;

let installed = false;

export function install() {
    if (installed) return;
    installed = true;

    injectBackground();

    if (REDUCED) return;

    if (!TOUCH) {
        installCursorGlow();
        installBackgroundParallax();
    }
    installCounterAnimation();
}

/* ------------------------------------------------------------------ */
/* Background layers — injected once at boot                          */
/* ------------------------------------------------------------------ */
function injectBackground() {
    if (document.getElementById('bg-layers')) return;
    const wrap = document.createElement('div');
    wrap.id = 'bg-layers';
    wrap.className = 'bg-layers';
    wrap.setAttribute('aria-hidden', 'true');
    wrap.innerHTML = `
    <div class="bg-layer bg-grid"       data-depth="0.06"></div>
    <div class="bg-layer bg-aurora bg-aurora-1" data-depth="-0.16">
      <div class="bg-aurora-orb"></div>
    </div>
    <div class="bg-layer bg-aurora bg-aurora-2" data-depth="0.24">
      <div class="bg-aurora-orb"></div>
    </div>
    <div class="bg-layer bg-vignette"></div>
  `;
    document.body.prepend(wrap);
}

/* ------------------------------------------------------------------ */
/* Cursor glow                                                        */
/* ------------------------------------------------------------------ */
function installCursorGlow() {
    if (document.querySelector('.cursor-glow')) return;   // already injected

    const glow = document.createElement('div');
    glow.className = 'cursor-glow';
    glow.setAttribute('aria-hidden', 'true');
    document.body.appendChild(glow);

    let tx = window.innerWidth / 2;
    let ty = window.innerHeight / 2;
    let cx = tx, cy = ty;
    let raf = null;

    function frame() {
        cx += (tx - cx) * 0.12;
        cy += (ty - cy) * 0.12;
        glow.style.transform = `translate3d(${cx - 260}px, ${cy - 260}px, 0)`;
        if (Math.abs(tx - cx) < 0.4 && Math.abs(ty - cy) < 0.4) { raf = null; return; }
        raf = requestAnimationFrame(frame);
    }

    document.addEventListener('mousemove', e => {
        tx = e.clientX;
        ty = e.clientY;
        glow.classList.add('is-visible');
        if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });

    document.addEventListener('mouseleave', () => {
        glow.classList.remove('is-visible');
    });
}

/* ------------------------------------------------------------------ */
/* Background parallax — each layer moves at its own rate             */
/* ------------------------------------------------------------------ */
function installBackgroundParallax() {
    const wrap = document.getElementById('bg-layers');
    if (!wrap) return;
    const layers = Array.from(wrap.querySelectorAll('.bg-layer[data-depth]'));
    if (!layers.length) return;

    // Skip if parallax is already running on this wrapper.
    if (wrap.dataset.parallaxAttached === '1') return;
    wrap.dataset.parallaxAttached = '1';

    let tx = 0, ty = 0, cx = 0, cy = 0, raf = null;

    function frame() {
        cx += (tx - cx) * 0.05;
        cy += (ty - cy) * 0.05;
        for (const el of layers) {
            const d = parseFloat(el.dataset.depth) || 0;
            el.style.transform = `translate3d(${cx * d}px, ${cy * d}px, 0)`;
        }
        if (Math.abs(tx - cx) > 0.15 || Math.abs(ty - cy) > 0.15) {
            raf = requestAnimationFrame(frame);
        } else {
            raf = null;
        }
    }

    document.addEventListener('mousemove', e => {
        tx = (e.clientX - window.innerWidth / 2);
        ty = (e.clientY - window.innerHeight / 2);
        if (!raf) raf = requestAnimationFrame(frame);
    }, { passive: true });
}

/* ------------------------------------------------------------------ */
/* Counter animation — .stat-value rolls up on entry                  */
/* ------------------------------------------------------------------ */
function installCounterAnimation() {
    if (!('IntersectionObserver' in window)) return;
    const seen = new WeakSet();

    function animate(el) {
        if (seen.has(el)) return;
        seen.add(el);

        const raw = String(el.textContent == null ? '' : el.textContent).trim();
        const m = raw.match(/^(-?\d+(?:\.\d+)?)(.*)$/);
        if (!m) return;

        const target = parseFloat(m[1]);
        const suffix = m[2] || '';
        const isInt = Number.isInteger(target);
        const start = performance.now();
        const duration = 750;

        function tick(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            const v = target * eased;
            el.textContent = `${isInt ? Math.round(v) : v.toFixed(1)}${suffix}`;
            if (t < 1) requestAnimationFrame(tick);
            else el.textContent = `${target}${suffix}`;
        }
        requestAnimationFrame(tick);
    }

    const io = new IntersectionObserver(entries => {
        for (const e of entries) {
            if (e.isIntersecting) {
                animate(e.target);
                io.unobserve(e.target);
            }
        }
    }, { threshold: 0.2 });

    /* ------------------------------------------------------------------ */
    /* Single batched scan                                                */
    /* ------------------------------------------------------------------ */
    /* Every DOM change in the app triggers the MutationObserver. Rather  */
    /* than run querySelectorAll per added node (which is what the old   */
    /* code did), we coalesce mutations within a microtask and run a     */
    /* single document-wide query. On chat streaming this reduces DOM    */
    /* walks from ~10/frame to ~1/frame.                                  */

    let scanScheduled = false;
    function scheduleScan() {
        if (scanScheduled) return;
        scanScheduled = true;
        queueMicrotask(() => {
            scanScheduled = false;
            document.querySelectorAll('.stat-value').forEach(el => io.observe(el));
        });
    }

    // Initial scan for whatever is on the page at boot.
    scheduleScan();

    new MutationObserver(scheduleScan).observe(document.body, {
        childList: true,
        subtree: true
    });
}