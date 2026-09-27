import { store } from './store.js';
import { toast } from './ui.js';

const MAX_BACKUP_BYTES = 10 * 1024 * 1024;   // 10 MB
const REVOKE_DELAY_MS = 2000;

/* ------------------------------------------------------------------ */
/* Export                                                             */
/* ------------------------------------------------------------------ */

export function exportBackup() {
    try {
        const data = store.raw ? store.raw() : store.get();
        const payload = {
            __munai: true,
            version: 2,
            exportedAt: new Date().toISOString(),
            data
        };

        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const stamp = new Date().toISOString().slice(0, 10);

        const a = document.createElement('a');
        a.href = url;
        a.download = `munai-backup-${stamp}.json`;
        a.rel = 'noopener';
        document.body.appendChild(a);
        a.click();
        a.remove();

        setTimeout(() => { try { URL.revokeObjectURL(url); } catch { } }, REVOKE_DELAY_MS);
        toast('Backup downloaded');
    } catch (err) {
        console.error('[backup] export failed:', err);
        toast('Could not export backup: ' + (err && err.message ? err.message : 'unknown error'));
    }
}

/* ------------------------------------------------------------------ */
/* Import                                                             */
/* ------------------------------------------------------------------ */

export function importBackup(file) {
    return new Promise((resolve, reject) => {
        if (!file) return reject(new Error('No file selected.'));

        // Size guard — before we even read the file into memory.
        if (typeof file.size === 'number' && file.size > MAX_BACKUP_BYTES) {
            const mb = Math.round(MAX_BACKUP_BYTES / 1024 / 1024);
            return reject(new Error(`Backup file is too large (max ${mb} MB).`));
        }

        const reader = new FileReader();

        reader.onload = () => {
            let data;
            try {
                const parsed = JSON.parse(reader.result);
                // Accept both the wrapped format { __munai, data } and a raw state object.
                data = parsed && parsed.__munai ? parsed.data : parsed;
                if (!data || typeof data !== 'object' || Array.isArray(data)) {
                    throw new Error('Invalid backup format.');
                }
            } catch (err) {
                // Reject but do NOT toast — the caller (Settings) handles messaging.
                return reject(err instanceof Error ? err : new Error('Invalid backup file.'));
            }

            try {
                // Use `replace` for full restore semantics — deep-merge with defaults,
                // discarding current state. `set` is a shallow merge and would keep
                // any keys not present in the backup.
                if (typeof store.replace === 'function') {
                    store.replace(data);
                } else {
                    store.set(data);
                }
            } catch (err) {
                return reject(new Error('Could not apply backup: ' + (err && err.message ? err.message : 'unknown error')));
            }

            toast('Backup restored — reloading…');
            // Small delay so the toast is visible before the reload wipes it.
            setTimeout(() => {
                try { location.reload(); } catch { }
            }, 700);
            resolve();
        };

        reader.onerror = () => reject(new Error('Could not read the file.'));
        reader.onabort = () => reject(new Error('Read was cancelled.'));

        try {
            reader.readAsText(file);
        } catch (err) {
            reject(new Error('Could not start reading the file.'));
        }
    });
}