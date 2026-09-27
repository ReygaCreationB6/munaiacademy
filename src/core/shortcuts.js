/**
 * Global keyboard shortcut manager.
 *
 * Shortcuts are ignored while the user is typing in an input, textarea, or contenteditable.
 * Routes register handlers via register(scope, { key -> handler }).
 */

const activeScopes = new Set();
const handlers = new Map();   // scope -> { 'mod+k': fn, 'escape': fn, ... }

let installed = false;
let keydownHandler = null;

export function register(scope, map) {
    handlers.set(scope, map);
    activeScopes.add(scope);
    return () => {
        handlers.delete(scope);
        activeScopes.delete(scope);
    };
}

export function clearScopes() {
    handlers.clear();
    activeScopes.clear();
}

export function isTyping() {
    const el = document.activeElement;
    if (!el) return false;
    const tag = el.tagName;
    if (tag === 'INPUT') {
        // Range/checkbox/radio/color don't have caret semantics — treat as not typing.
        const t = el.getAttribute('type') || 'text';
        return ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(t);
    }
    return tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

function keyFromEvent(e) {
    const parts = [];
    if (e.ctrlKey || e.metaKey) parts.push('mod');
    if (e.shiftKey) parts.push('shift');
    if (e.altKey) parts.push('alt');
    let key = String(e.key || '').toLowerCase();
    if (key === ' ') key = 'space';
    // 'escape' and 'enter' are already lowercase from e.key.
    parts.push(key);
    return parts.join('+');
}

/* Focus a text field on Ctrl/Cmd+K. Prefers the Coach input if present. */
function focusPrimaryInput() {
    const preferred = document.getElementById('cxInput')
        || document.getElementById('chatInput')
        || document.getElementById('kbSearch');
    if (preferred && typeof preferred.focus === 'function') {
        preferred.focus();
        return true;
    }
    const anyInput = document.querySelector('textarea, input[type="text"], input[type="search"]');
    if (anyInput && typeof anyInput.focus === 'function') {
        anyInput.focus();
        return true;
    }
    return false;
}

export function install() {
    if (installed) return;
    installed = true;

    keydownHandler = (e) => {
        const combo = keyFromEvent(e);

        // ---- Escape always works, even while typing ----
        if (combo === 'escape') {
            for (const scope of activeScopes) {
                const map = handlers.get(scope);
                if (map && typeof map.escape === 'function') {
                    map.escape(e);
                    return;
                }
            }
            return;
        }

        // ---- Everything else ignores input contexts ----
        if (isTyping()) return;

        // ---- Scoped handlers take priority over the global fallback ----
        for (const scope of activeScopes) {
            const map = handlers.get(scope);
            if (!map) continue;
            const fn = map[combo];
            if (typeof fn === 'function') {
                e.preventDefault();
                try { fn(e); } catch (err) { console.error('[shortcuts]', err); }
                return;
            }
        }

        // ---- Global fallback: Ctrl/Cmd+K focuses a text field ----
        if (combo === 'mod+k') {
            if (focusPrimaryInput()) e.preventDefault();
        }
    };

    window.addEventListener('keydown', keydownHandler);
}

export function uninstall() {
    if (!installed) return;
    if (keydownHandler) window.removeEventListener('keydown', keydownHandler);
    keydownHandler = null;
    installed = false;
    clearScopes();
}