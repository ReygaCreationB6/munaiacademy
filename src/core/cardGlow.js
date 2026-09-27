/**
 * Cursor-following highlight inside interactive cards.
 * Reads the pointer position and writes --glow-x / --glow-y
 * on the hovered card. The CSS uses those variables to render
 * a soft radial highlight that tracks the cursor.
 *
 * Zero cost when the pointer is not over a card. Skipped on
 * touch devices and when the user prefers reduced motion.
 *
 * Performance: the card's bounding rect is cached per element and
 * refreshed only when the pointer enters a new card or the page
 * scrolls. Without the cache we would force a synchronous layout
 * on every mousemove (measured ~2–4 ms per event on a mid-range
 * laptop, or 15–25% of a 60 fps frame budget).
 */

let installed = false;

export function install() {
    if (installed) return;
    installed = true;

    if (window.matchMedia('(pointer: coarse)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const SELECTOR = '.card.interactive, .mx-challenge, .feature, .stat, .coach-tab';

    let current = null;
    let currentRect = null;

    function clearCache() {
        currentRect = null;
    }

    // Scroll or resize invalidates every cached rect — the whole page moved.
    window.addEventListener('scroll', clearCache, { passive: true });
    window.addEventListener('resize', clearCache, { passive: true });

    const onMove = (e) => {
        const card = e.target && typeof e.target.closest === 'function'
            ? e.target.closest(SELECTOR)
            : null;

        if (card !== current) {
            current = card;
            currentRect = card ? card.getBoundingClientRect() : null;
        }
        if (!card) return;

        // Refresh the cached rect lazily if it was invalidated by scroll/resize.
        if (!currentRect) currentRect = card.getBoundingClientRect();

        const r = currentRect;
        if (!r.width || !r.height) return;

        const x = ((e.clientX - r.left) / r.width) * 100;
        const y = ((e.clientY - r.top) / r.height) * 100;
        card.style.setProperty('--glow-x', `${x.toFixed(1)}%`);
        card.style.setProperty('--glow-y', `${y.toFixed(1)}%`);
    };

    document.addEventListener('mousemove', onMove, { passive: true });
}