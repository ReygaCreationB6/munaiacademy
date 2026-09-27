/**
 * Minimal line icons. 16×16, stroke-width 1.5, currentColor.
 * No emojis, no icons-font dependencies.
 */

const wrap = content =>
    `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" ` +
    `stroke="currentColor" stroke-width="1.5" stroke-linecap="round" ` +
    `stroke-linejoin="round" aria-hidden="true">${content}</svg>`;

export const icons = {
    dashboard: wrap(
        `<rect x="2.5" y="2.5" width="4.5" height="4.5"/>` +
        `<rect x="9" y="2.5" width="4.5" height="4.5"/>` +
        `<rect x="2.5" y="9" width="4.5" height="4.5"/>` +
        `<rect x="9" y="9" width="4.5" height="4.5"/>`
    ),
    book: wrap(
        `<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1h-9a1 1 0 0 1-1-1z"/>` +
        `<path d="M5 2.5v11"/>`
    ),
    search: wrap(
        `<circle cx="7" cy="7" r="4.5"/>` +
        `<path d="M10.5 10.5l3 3"/>`
    ),
    globe: wrap(
        `<circle cx="8" cy="8" r="6"/>` +
        `<path d="M2 8h12"/>` +
        `<ellipse cx="8" cy="8" rx="3" ry="6"/>`
    ),
    mic: wrap(
        `<rect x="6" y="2" width="4" height="7" rx="2"/>` +
        `<path d="M3.5 7.5a4.5 4.5 0 0 0 9 0"/>` +
        `<path d="M8 12v2"/>`
    ),
    file: wrap(
        `<path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>` +
        `<path d="M9 2v4h4"/>` +
        `<path d="M5 9h6M5 11.5h4"/>`
    ),
    fileCheck: wrap(
        `<path d="M3 2h6l4 4v8a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/>` +
        `<path d="M9 2v4h4"/>` +
        `<path d="M5 10l2 2 4-4"/>`
    ),
    message: wrap(
        `<path d="M2.5 3.5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H6.5l-3.5 3v-3a1 1 0 0 1-1-1z"/>`
    ),
    help: wrap(
        `<circle cx="8" cy="8" r="6"/>` +
        `<path d="M6.5 6.5a1.75 1.75 0 1 1 2.5 1.5c-.5.25-.5.75-.5 1"/>` +
        `<circle cx="8" cy="11.5" r="0.5" fill="currentColor" stroke="none"/>`
    ),
    target: wrap(
        `<circle cx="8" cy="8" r="6"/>` +
        `<circle cx="8" cy="8" r="3"/>` +
        `<circle cx="8" cy="8" r="0.75" fill="currentColor" stroke="none"/>`
    ),
    play: wrap(
        `<path d="M4.5 3l8 5-8 5z"/>`
    ),
    sparkle: wrap(
        `<path d="M8 2 L9.5 6.5 L14 8 L9.5 9.5 L8 14 L6.5 9.5 L2 8 L6.5 6.5 Z"/>`
    ),
    sliders: wrap(
        `<path d="M3 4h10M3 8h10M3 12h10"/>` +
        `<circle cx="6" cy="4" r="1" fill="currentColor" stroke="none"/>` +
        `<circle cx="10" cy="8" r="1" fill="currentColor" stroke="none"/>` +
        `<circle cx="5" cy="12" r="1" fill="currentColor" stroke="none"/>`
    ),
    bar: wrap(
        `<path d="M3 13V8M8 13V3M13 13V6"/>`
    ),
    menu: wrap(
        `<path d="M2 4h12M2 8h12M2 12h12"/>`
    ),
    check: wrap(
        `<path d="M3 8l3.5 3.5L13 5"/>`
    ),
    bolt: wrap(
        `<path d="M8 1.5L3.5 8.5h3.5L7 14.5l4.5-7h-3.5z"/>`
    ),
    arrowRight: wrap(
        `<path d="M3 8h10M9 4l4 4-4 4"/>`
    ),
    close: wrap(
        `<path d="M4 4l8 8M12 4l-8 8"/>`
    )
};