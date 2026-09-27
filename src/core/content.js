/**
 * Content loader.
 *
 * Fetches custom lessons and scenarios from the server once at boot.
 * If nothing is configured or the fetch fails, the hardcoded fallback
 * data stays in place.
 */

import { registerCustomLessons } from '../data/lessons.js';
import { registerCustomScenarios } from '../simulation/crisis/scenarios.js';

let loaded = false;

export async function loadContentFromServer() {
    if (loaded) return;
    loaded = true;
    try {
        const [lessonsRes, scenariosRes] = await Promise.all([
            fetch('/api/content/lessons', { cache: 'no-store' }),
            fetch('/api/content/scenarios', { cache: 'no-store' })
        ]);

        if (lessonsRes.ok) {
            const { lessons } = await lessonsRes.json();
            if (Array.isArray(lessons) && lessons.length) {
                registerCustomLessons(lessons);
            }
        }

        if (scenariosRes.ok) {
            const { scenarios } = await scenariosRes.json();
            if (Array.isArray(scenarios) && scenarios.length) {
                registerCustomScenarios(scenarios);
            }
        }
    } catch {
        // No server, no cache — hardcoded content remains.
    }
}