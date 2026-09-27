/**
 * Client wrapper for the educator API.
 * Handles auth headers so callers don't have to.
 */

import { loadSupabase } from './supabase.js';
import { auth } from './auth.js';

async function getToken() {
    try {
        const sb = await loadSupabase();
        const { data } = await sb.auth.getSession();
        return data?.session?.access_token || null;
    } catch {
        return null;
    }
}

async function api(path, opts = {}) {
    const token = await getToken();
    if (!token) throw new Error('Not signed in.');

    const res = await fetch(`/api/educator${path}`, {
        ...opts,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`,
            ...(opts.headers || {})
        }
    });

    if (!res.ok) {
        let message = `HTTP ${res.status}`;
        try {
            const json = await res.json();
            message = json.error || message;
        } catch {
            try { message = (await res.text()).slice(0, 200); } catch { }
        }
        const err = new Error(message);
        err.status = res.status;
        throw err;
    }
    return res.json();
}

export const educator = {
    isAvailable: () => auth.isAvailable(),

    me: () => api('/me'),

    createClass: (name, description = '') =>
        api('/classes', {
            method: 'POST',
            body: JSON.stringify({ name, description })
        }),

    joinClass: (code) =>
        api('/classes/join', {
            method: 'POST',
            body: JSON.stringify({ code })
        }),

    getClass: (id) => api(`/classes/${id}`),

    createAssignment: (classId, payload) =>
        api(`/classes/${classId}/assignments`, {
            method: 'POST',
            body: JSON.stringify(payload)
        }),

    deleteAssignment: (assignmentId) =>
        api(`/assignments/${assignmentId}`, { method: 'DELETE' }),

    submit: (assignmentId, content, metadata = {}) =>
        api(`/assignments/${assignmentId}/submit`, {
            method: 'POST',
            body: JSON.stringify({ content, metadata })
        }),

    review: (submissionId, comment, grade) =>
        api(`/submissions/${submissionId}/review`, {
            method: 'POST',
            body: JSON.stringify({ comment, grade })
        }),

    async exportCsv(classId, className) {
        const token = await getToken();
        if (!token) throw new Error('Not signed in.');
        const res = await fetch(`/api/educator/classes/${classId}/export.csv`, {
            headers: { 'Authorization': `Bearer ${token}` }
        });
        if (!res.ok) throw new Error(`Export failed (${res.status})`);
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${(className || 'class').replace(/[^a-z0-9-_ ]/gi, '_')}-export.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }
};