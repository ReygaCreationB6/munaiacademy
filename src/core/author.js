import { loadSupabase } from './supabase.js';
import { auth } from './auth.js';

async function getToken() {
    try {
        const sb = await loadSupabase();
        const { data } = await sb.auth.getSession();
        return data?.session?.access_token || null;
    } catch { return null; }
}

async function api(path, opts = {}) {
    const token = await getToken();
    if (!token) throw new Error('Not signed in.');
    const res = await fetch(`/api/author${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(opts.headers || {})
        }
    });
    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try { const j = await res.json(); message = j.error || message; } catch { }
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

export const author = {
    isConfigured: () => auth.isAvailable(),

    me: () => api('/me'),
    status: () => api('/status'),

    listLessons: () => api('/lessons'),
    createLesson: (payload) => api('/lessons', { method: 'POST', body: JSON.stringify(payload) }),
    updateLesson: (id, payload) => api(`/lessons/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteLesson: (id) => api(`/lessons/${id}`, { method: 'DELETE' }),

    listScenarios: () => api('/scenarios'),
    createScenario: (payload) => api('/scenarios', { method: 'POST', body: JSON.stringify(payload) }),
    updateScenario: (id, payload) => api(`/scenarios/${id}`, { method: 'PUT', body: JSON.stringify(payload) }),
    deleteScenario: (id) => api(`/scenarios/${id}`, { method: 'DELETE' }),

    importPayload: (payload) => api('/import', { method: 'POST', body: JSON.stringify(payload) }),

    async exportAll() {
        const token = await getToken();
        if (!token) throw new Error('Not signed in.');
        const res = await fetch('/api/author/export', {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `munai-content-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
};