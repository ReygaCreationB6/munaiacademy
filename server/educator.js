/**
 * Educator API — classes, assignments, submissions.
 *
 * Auth model:
 *   Every request must carry an `Authorization: Bearer <access_token>`
 *   header — the same token Supabase issues after sign-in. We verify it
 *   by calling /auth/v1/user, then use the resulting user.id as the
 *   caller's identity.
 *
 *   All database operations use the service_role key, which bypasses RLS.
 *   Nothing here trusts client-supplied IDs.
 */

import express from 'express';
import fetch from 'node-fetch';
import crypto from 'node:crypto';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

const newId = () => crypto.randomUUID();
const makeCode = () => {
    let out = '';
    for (let i = 0; i < 6; i++) out += CODE_ALPHABET[crypto.randomInt(0, CODE_ALPHABET.length)];
    return out;
};

function cfg() {
    return {
        url: (process.env.SUPABASE_URL || '').trim().replace(/\/+$/, ''),
        anon: (process.env.SUPABASE_ANON_KEY || '').trim(),
        service: (process.env.SUPABASE_SERVICE_KEY || '').trim()
    };
}

function isEnabled() {
    const c = cfg();
    return !!(c.url && c.anon && c.service);
}

/* ------------------------------------------------------------------ */
/* Supabase helpers                                                    */
/* ------------------------------------------------------------------ */

async function sbFetch(path, opts = {}) {
    const { url, service } = cfg();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    try {
        return await fetch(`${url}/rest/v1${path}`, {
            ...opts,
            headers: {
                'Content-Type': 'application/json',
                'apikey': service,
                'Authorization': `Bearer ${service}`,
                ...(opts.headers || {})
            },
            signal: ctrl.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function sbJson(path, opts = {}) {
    const res = await sbFetch(path, {
        ...opts,
        headers: { 'Prefer': '', ...(opts.headers || {}) }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

async function sbWrite(path, opts = {}) {
    const res = await sbFetch(path, {
        ...opts,
        headers: { 'Prefer': 'return=representation', ...(opts.headers || {}) }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Supabase ${res.status}: ${text.slice(0, 200)}`);
    }
    return res.json();
}

/* ------------------------------------------------------------------ */
/* Auth middleware                                                     */
/* ------------------------------------------------------------------ */

async function verifyUser(req) {
    const header = req.headers['authorization'] || '';
    const token = header.replace(/^Bearer\s+/i, '').trim();
    if (!token) return null;

    const { url, anon } = cfg();
    try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try {
            const res = await fetch(`${url}/auth/v1/user`, {
                headers: {
                    'apikey': anon,
                    'Authorization': `Bearer ${token}`
                },
                signal: ctrl.signal
            });
            if (!res.ok) return null;
            const user = await res.json();
            if (!user || !user.id) return null;
            return { id: user.id, email: user.email || '' };
        } finally {
            clearTimeout(timer);
        }
    } catch {
        return null;
    }
}

/* ------------------------------------------------------------------ */
/* Router                                                             */
/* ------------------------------------------------------------------ */

export function attachEducatorRoutes(app) {
    const router = express.Router();

    router.use(async (req, res, next) => {
        if (!isEnabled()) {
            return res.status(503).json({ error: 'Educator features require Supabase.' });
        }
        const user = await verifyUser(req);
        if (!user) return res.status(401).json({ error: 'Not signed in.' });
        req.user = user;
        next();
    });

    /* ----- GET /me ----- */
    router.get('/me', async (req, res) => {
        try {
            const { id: uid, email } = req.user;

            const teaching = await sbJson(
                `/classes?teacher_id=eq.${uid}&select=id,name,description,code,created_at&order=created_at.desc`
            );

            const memberships = await sbJson(
                `/class_members?student_id=eq.${uid}&select=class_id,joined_at`
            );
            const classIds = memberships.map(m => m.class_id);

            let enrolled = [];
            if (classIds.length) {
                const inList = classIds.map(encodeURIComponent).join(',');
                const classes = await sbJson(
                    `/classes?id=in.(${inList})&select=id,name,description,code,teacher_email,created_at`
                );
                enrolled = classes.map(c => {
                    const m = memberships.find(x => x.class_id === c.id);
                    return { ...c, joined_at: m?.joined_at };
                });
            }

            // Attach counts
            const allIds = [...teaching, ...enrolled].map(c => c.id);
            const countsByClass = {};
            if (allIds.length) {
                const inList = allIds.map(encodeURIComponent).join(',');
                const [assignments, submissions, members] = await Promise.all([
                    sbJson(`/assignments?class_id=in.(${inList})&select=id,class_id`),
                    sbJson(`/submissions?select=id,assignment_id,student_id`),
                    sbJson(`/class_members?class_id=in.(${inList})&select=class_id`)
                ]);

                const assignmentByClass = {};
                const assignmentIds = new Set();
                for (const a of assignments) {
                    assignmentByClass[a.class_id] = assignmentByClass[a.class_id] || [];
                    assignmentByClass[a.class_id].push(a.id);
                    assignmentIds.add(a.id);
                }

                const subsByClass = {};
                for (const s of submissions) {
                    if (!assignmentIds.has(s.assignment_id)) continue;
                    for (const [cid, aids] of Object.entries(assignmentByClass)) {
                        if (aids.includes(s.assignment_id)) {
                            subsByClass[cid] = subsByClass[cid] || { total: 0, byStudent: {} };
                            subsByClass[cid].total++;
                            if (s.student_id === uid) subsByClass[cid].byStudent[uid] = true;
                            break;
                        }
                    }
                }

                const membersByClass = {};
                for (const m of members) {
                    membersByClass[m.class_id] = (membersByClass[m.class_id] || 0) + 1;
                }

                for (const c of [...teaching, ...enrolled]) {
                    countsByClass[c.id] = {
                        studentCount: membersByClass[c.id] || 0,
                        assignmentCount: (assignmentByClass[c.id] || []).length,
                        submissionCount: (subsByClass[c.id]?.total) || 0
                    };
                }
            }

            const decorate = (c, role) => ({
                ...c,
                role,
                ...(countsByClass[c.id] || { studentCount: 0, assignmentCount: 0, submissionCount: 0 })
            });

            res.json({
                user: { id: uid, email },
                teaching: teaching.map(c => decorate(c, 'teacher')),
                enrolled: enrolled.map(c => decorate(c, 'student'))
            });
        } catch (err) {
            console.error('[educator] /me error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- POST /classes ----- */
    router.post('/classes', async (req, res) => {
        try {
            const name = String(req.body?.name || '').trim().slice(0, 120);
            const description = String(req.body?.description || '').trim().slice(0, 400);
            if (!name) return res.status(400).json({ error: 'Class name is required.' });

            // Generate a unique code — retry on collision.
            let code = makeCode();
            for (let i = 0; i < 5; i++) {
                const existing = await sbJson(`/classes?code=eq.${encodeURIComponent(code)}&select=id`);
                if (!existing.length) break;
                code = makeCode();
            }

            const rows = await sbWrite('/classes', {
                method: 'POST',
                body: JSON.stringify([{
                    teacher_id: req.user.id,
                    teacher_email: req.user.email,
                    name, description, code
                }])
            });

            res.json({ class: rows[0] });
        } catch (err) {
            console.error('[educator] create class error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- POST /classes/join ----- */
    router.post('/classes/join', async (req, res) => {
        try {
            const code = String(req.body?.code || '').trim().toUpperCase();
            if (!code) return res.status(400).json({ error: 'Enter a class code.' });

            const rows = await sbJson(
                `/classes?code=eq.${encodeURIComponent(code)}&select=id,name,code,teacher_email`
            );
            if (!rows.length) return res.status(404).json({ error: 'No class found with that code.' });
            const cls = rows[0];

            // Already a member?
            const existing = await sbJson(
                `/class_members?class_id=eq.${cls.id}&student_id=eq.${req.user.id}&select=class_id`
            );
            if (!existing.length) {
                await sbWrite('/class_members', {
                    method: 'POST',
                    body: JSON.stringify([{
                        class_id: cls.id,
                        student_id: req.user.id,
                        student_email: req.user.email
                    }])
                });
            }

            res.json({ class: cls });
        } catch (err) {
            console.error('[educator] join class error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- GET /classes/:id ----- */
    router.get('/classes/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const rows = await sbJson(`/classes?id=eq.${id}&select=*`);
            if (!rows.length) return res.status(404).json({ error: 'Class not found.' });
            const cls = rows[0];

            const isTeacher = cls.teacher_id === req.user.id;

            // Membership check for students.
            let isMember = false;
            if (!isTeacher) {
                const m = await sbJson(
                    `/class_members?class_id=eq.${id}&student_id=eq.${req.user.id}&select=class_id`
                );
                isMember = m.length > 0;
            }
            if (!isTeacher && !isMember) {
                return res.status(403).json({ error: 'You are not enrolled in this class.' });
            }

            const [members, assignments] = await Promise.all([
                sbJson(`/class_members?class_id=eq.${id}&select=student_id,student_email,joined_at&order=joined_at.asc`),
                sbJson(`/assignments?class_id=eq.${id}&select=*&order=created_at.desc`)
            ]);

            const assignmentIds = assignments.map(a => a.id);
            let submissions = [];
            if (assignmentIds.length) {
                const inList = assignmentIds.map(encodeURIComponent).join(',');
                // Teacher sees all submissions. Student sees only their own.
                const filter = isTeacher
                    ? `/submissions?assignment_id=in.(${inList})&select=*`
                    : `/submissions?assignment_id=in.(${inList})&student_id=eq.${req.user.id}&select=*`;
                submissions = await sbJson(filter);
            }

            res.json({
                class: cls,
                role: isTeacher ? 'teacher' : 'student',
                me: { id: req.user.id, email: req.user.email },
                members,
                assignments,
                submissions
            });
        } catch (err) {
            console.error('[educator] class detail error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- POST /classes/:id/assignments ----- */
    router.post('/classes/:id/assignments', async (req, res) => {
        try {
            const { id } = req.params;
            const cls = await sbJson(`/classes?id=eq.${id}&select=teacher_id`);
            if (!cls.length || cls[0].teacher_id !== req.user.id) {
                return res.status(403).json({ error: 'Only the teacher can create assignments.' });
            }

            const title = String(req.body?.title || '').trim().slice(0, 200);
            const description = String(req.body?.description || '').trim().slice(0, 2000);
            const tool = ['paper', 'speech', 'resolution', 'simulation'].includes(req.body?.tool)
                ? req.body.tool : null;
            const dueAt = req.body?.dueAt ? new Date(req.body.dueAt).toISOString() : null;

            if (!title) return res.status(400).json({ error: 'Title is required.' });

            const rows = await sbWrite('/assignments', {
                method: 'POST',
                body: JSON.stringify([{ class_id: id, title, description, tool, due_at: dueAt }])
            });

            res.json({ assignment: rows[0] });
        } catch (err) {
            console.error('[educator] create assignment error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- DELETE /assignments/:id ----- */
    router.delete('/assignments/:id', async (req, res) => {
        try {
            const { id } = req.params;
            const rows = await sbJson(`/assignments?id=eq.${id}&select=class_id`);
            if (!rows.length) return res.status(404).json({ error: 'Not found.' });
            const cls = await sbJson(`/classes?id=eq.${rows[0].class_id}&select=teacher_id`);
            if (!cls.length || cls[0].teacher_id !== req.user.id) {
                return res.status(403).json({ error: 'Only the teacher can delete assignments.' });
            }
            await sbFetch(`/assignments?id=eq.${id}`, { method: 'DELETE' });
            res.json({ ok: true });
        } catch (err) {
            console.error('[educator] delete assignment error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- POST /assignments/:id/submit ----- */
    router.post('/assignments/:id/submit', async (req, res) => {
        try {
            const { id } = req.params;
            const content = String(req.body?.content || '').slice(0, 20000);
            const metadata = req.body?.metadata || {};

            const a = await sbJson(`/assignments?id=eq.${id}&select=class_id`);
            if (!a.length) return res.status(404).json({ error: 'Assignment not found.' });
            const cid = a[0].class_id;

            const m = await sbJson(
                `/class_members?class_id=eq.${cid}&student_id=eq.${req.user.id}&select=class_id`
            );
            if (!m.length) return res.status(403).json({ error: 'Not enrolled in this class.' });

            const existing = await sbJson(
                `/submissions?assignment_id=eq.${id}&student_id=eq.${req.user.id}&select=id`
            );

            let row;
            if (existing.length) {
                const rows = await sbWrite(
                    `/submissions?id=eq.${existing[0].id}`,
                    {
                        method: 'PATCH',
                        body: JSON.stringify({
                            content,
                            metadata,
                            status: 'submitted',
                            submitted_at: new Date().toISOString(),
                            teacher_comment: null,
                            teacher_grade: null,
                            reviewed_at: null
                        })
                    }
                );
                row = rows[0];
            } else {
                const rows = await sbWrite('/submissions', {
                    method: 'POST',
                    body: JSON.stringify([{
                        assignment_id: id,
                        student_id: req.user.id,
                        student_email: req.user.email,
                        content,
                        metadata
                    }])
                });
                row = rows[0];
            }

            res.json({ submission: row });
        } catch (err) {
            console.error('[educator] submit error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- POST /submissions/:id/review ----- */
    router.post('/submissions/:id/review', async (req, res) => {
        try {
            const { id } = req.params;
            const comment = String(req.body?.comment || '').slice(0, 4000);
            const grade = String(req.body?.grade || '').slice(0, 40);

            const rows = await sbJson(
                `/submissions?id=eq.${id}&select=id,assignment_id,student_id`
            );
            if (!rows.length) return res.status(404).json({ error: 'Submission not found.' });

            const a = await sbJson(`/assignments?id=eq.${rows[0].assignment_id}&select=class_id`);
            const c = await sbJson(`/classes?id=eq.${a[0].class_id}&select=teacher_id`);
            if (!c.length || c[0].teacher_id !== req.user.id) {
                return res.status(403).json({ error: 'Only the teacher can review.' });
            }

            const updated = await sbWrite(`/submissions?id=eq.${id}`, {
                method: 'PATCH',
                body: JSON.stringify({
                    status: 'reviewed',
                    teacher_comment: comment,
                    teacher_grade: grade,
                    reviewed_at: new Date().toISOString()
                })
            });

            res.json({ submission: updated[0] });
        } catch (err) {
            console.error('[educator] review error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    /* ----- GET /classes/:id/export.csv ----- */
    router.get('/classes/:id/export.csv', async (req, res) => {
        try {
            const { id } = req.params;
            const cls = await sbJson(`/classes?id=eq.${id}&select=*`);
            if (!cls.length || cls[0].teacher_id !== req.user.id) {
                return res.status(403).json({ error: 'Only the teacher can export.' });
            }

            const [members, assignments] = await Promise.all([
                sbJson(`/class_members?class_id=eq.${id}&select=student_id,student_email`),
                sbJson(`/assignments?class_id=eq.${id}&select=id,title&order=created_at.asc`)
            ]);

            const assignmentIds = assignments.map(a => a.id);
            let subs = [];
            if (assignmentIds.length) {
                const inList = assignmentIds.map(encodeURIComponent).join(',');
                subs = await sbJson(`/submissions?assignment_id=in.(${inList})&select=*`);
            }

            const esc = (v) => {
                const s = String(v == null ? '' : v);
                return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
            };

            const header = ['Student Email', ...assignments.map(a => a.title + ' (status)'), ...assignments.map(a => a.title + ' (grade)')];
            const rows = [header];

            for (const m of members) {
                const line = [m.student_email || m.student_id];
                for (const a of assignments) {
                    const s = subs.find(x => x.assignment_id === a.id && x.student_id === m.student_id);
                    line.push(s ? s.status : 'not submitted');
                }
                for (const a of assignments) {
                    const s = subs.find(x => x.assignment_id === a.id && x.student_id === m.student_id);
                    line.push(s ? (s.teacher_grade || '') : '');
                }
                rows.push(line);
            }

            const csv = rows.map(r => r.map(esc).join(',')).join('\n');
            const safeName = String(cls[0].name).replace(/[^a-z0-9-_ ]/gi, '_');
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${safeName}-export.csv"`);
            res.send(csv);
        } catch (err) {
            console.error('[educator] export error:', err.message);
            res.status(500).json({ error: err.message });
        }
    });

    app.use('/api/educator', router);
    return router;
}