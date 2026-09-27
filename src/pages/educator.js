import { layout, bindLayout } from './_layout.js';
import { auth } from '../core/auth.js';
import { educator } from '../core/educator.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast, openModal } from '../core/ui.js';

const $ = (id) => document.getElementById(id);

let state = {
    view: 'hub',        // 'hub' | 'class'
    tab: 'teaching',    // 'teaching' | 'enrolled'
    hub: null,          // { user, teaching[], enrolled[] }
    detail: null,       // { class, role, me, members, assignments, submissions }
    loading: false,
    error: null
};

export const educatorPage = {
    path: '/educator',
    ariaTitle: 'Educator Hub',

    render() {
        if (!educator.isAvailable()) return this.notAvailableHtml();
        if (!auth.isSignedIn()) return this.signInPromptHtml();
        return layout('Educator Hub', this.body(), { narrow: false });
    },

    init() {
        bindLayout();
        if (!educator.isAvailable() || !auth.isSignedIn()) return;

        if (state.view === 'hub' && !state.hub && !state.loading) this.loadHub();
        if (state.view === 'class') this.bindClassDetail();
    },

    /* ---------- Not available / not signed in ---------- */

    notAvailableHtml() {
        return layout('Educator Hub', `
      <div class="card">
        <div class="card-title">Educator features need Supabase</div>
        <p class="muted">
          The Educator Hub requires a Supabase project so classes, assignments, and submissions
          can be shared between teachers and students.
        </p>
        <p class="muted">
          Add <span class="mono">SUPABASE_URL</span>, <span class="mono">SUPABASE_ANON_KEY</span>,
          and <span class="mono">SUPABASE_SERVICE_KEY</span> to your <span class="mono">.env</span>,
          run <span class="mono">supabase/educator-schema.sql</span>, then restart the server.
        </p>
        <a class="btn btn-primary" href="#/dashboard">Back to dashboard</a>
      </div>`);
    },

    signInPromptHtml() {
        return layout('Educator Hub', `
      <div class="card">
        <div class="card-title">Sign in to use the Educator Hub</div>
        <p class="muted">
          Classes, assignments, and submissions are shared between people, so this feature
          needs accounts.
        </p>
        <div class="flex gap-2 mt-2">
          <a class="btn btn-primary" href="#/login">Sign in</a>
          <a class="btn btn-ghost" href="#/dashboard">Back</a>
        </div>
      </div>`);
    },

    /* ---------- Body ---------- */

    body() {
        if (state.view === 'class') return this.classDetailHtml();
        return this.hubHtml();
    },

    /* ---------- Hub view ---------- */

    hubHtml() {
        if (state.loading) {
            return `<div class="card"><div class="flex gap-2 items-center"><div class="spinner"></div> Loading…</div></div>`;
        }
        if (state.error) {
            return `<div class="card"><span class="badge badge-red">Error</span>
        <p class="mt-2">${escapeHtml(state.error)}</p>
        <button class="btn btn-ghost btn-sm" id="edRetry">Try again</button>
      </div>`;
        }

        const user = state.hub?.user || {};
        const teaching = state.hub?.teaching || [];
        const enrolled = state.hub?.enrolled || [];

        return `
      <div class="card">
        <div class="card-header">
          <div>
            <div class="card-title">Educator Hub</div>
            <div class="card-sub">Signed in as <b>${escapeHtml(user.email || '')}</b></div>
          </div>
          <div class="flex gap-2">
            <button class="btn btn-ghost btn-sm" id="edJoin">Join a class</button>
            <button class="btn btn-primary btn-sm" id="edNewClass">New class</button>
          </div>
        </div>
      </div>

      <div class="ed-tabs" role="tablist">
        <button class="ed-tab${state.tab === 'teaching' ? ' active' : ''}" data-tab="teaching" role="tab">
          Teaching ${teaching.length ? `<span class="ed-tab-count">${teaching.length}</span>` : ''}
        </button>
        <button class="ed-tab${state.tab === 'enrolled' ? ' active' : ''}" data-tab="enrolled" role="tab">
          Enrolled ${enrolled.length ? `<span class="ed-tab-count">${enrolled.length}</span>` : ''}
        </button>
      </div>

      ${state.tab === 'teaching'
                ? this.classGrid(teaching, 'teacher')
                : this.classGrid(enrolled, 'student')}`;
    },

    classGrid(list, role) {
        if (!list.length) {
            return `<div class="card mt-2">
        <div class="empty">
          ${role === 'teacher'
                    ? 'No classes yet. Create one to get a join code.'
                    : 'You\'re not enrolled in any classes. Use a code from your teacher.'}
        </div>
      </div>`;
        }
        return `<div class="ed-class-grid mt-2">
      ${list.map(c => `
        <button class="ed-class-card" data-class-id="${c.id}">
          <div class="ed-class-head">
            <span class="ed-class-name">${escapeHtml(c.name)}</span>
            <span class="ed-class-code mono">${escapeHtml(c.code)}</span>
          </div>
          ${c.description ? `<div class="ed-class-desc">${escapeHtml(c.description)}</div>` : ''}
          <div class="ed-class-meta">
            ${role === 'teacher'
                ? `${c.studentCount} student${c.studentCount === 1 ? '' : 's'} · ${c.assignmentCount} assignment${c.assignmentCount === 1 ? '' : 's'}`
                : `${c.assignmentCount} assignment${c.assignmentCount === 1 ? '' : 's'} · ${c.submissionCount || 0} submitted`}
          </div>
        </button>`).join('')}
    </div>`;
    },

    bindHub() {
        document.querySelectorAll('.ed-tab').forEach(t => {
            t.onclick = () => { state.tab = t.dataset.tab; this.rerender(); };
        });
        document.querySelectorAll('.ed-class-card').forEach(c => {
            c.onclick = () => this.openClass(c.dataset.classId);
        });

        const retry = $('edRetry');
        if (retry) retry.onclick = () => { state.error = null; this.loadHub(true); };

        const newBtn = $('edNewClass');
        if (newBtn) newBtn.onclick = () => this.openNewClass();

        const joinBtn = $('edJoin');
        if (joinBtn) joinBtn.onclick = () => this.openJoin();
    },

    async loadHub(force = false) {
        if (state.loading) return;
        if (state.hub && !force) { this.rerender(); return; }
        state.loading = true;
        state.error = null;
        this.rerender();
        try {
            state.hub = await educator.me();
        } catch (err) {
            state.error = err.message;
        } finally {
            state.loading = false;
            this.rerender();
        }
    },

    openNewClass() {
        openModal({
            title: 'New class',
            body: `
        <div class="field"><label>Class name</label><input id="ncName" placeholder="e.g. MUN Club — Fall 2026" /></div>
        <div class="field"><label>Description (optional)</label><textarea id="ncDesc" rows="3" placeholder="What is this class for?"></textarea></div>`,
            footer: `<button class="btn btn-ghost" id="ncCancel">Cancel</button>
               <button class="btn btn-primary" id="ncCreate">Create</button>`
        });
        $('ncCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('ncCreate').onclick = async () => {
            const name = $('ncName').value.trim();
            const description = $('ncDesc').value.trim();
            if (!name) return toast('Enter a name.');
            try {
                const res = await educator.createClass(name, description);
                document.querySelector('.modal-backdrop')?.remove();
                toast(`Class created · code ${res.class.code}`);
                state.hub = null;
                this.loadHub(true);
            } catch (err) {
                toast('Could not create class: ' + err.message);
            }
        };
    },

    openJoin() {
        openModal({
            title: 'Join a class',
            body: `<div class="field"><label>Class code</label>
        <input id="jcCode" placeholder="ABC123" maxlength="6" style="text-transform:uppercase;font-family:var(--font-mono);letter-spacing:0.15em;" /></div>`,
            footer: `<button class="btn btn-ghost" id="jcCancel">Cancel</button>
               <button class="btn btn-primary" id="jcGo">Join</button>`
        });
        $('jcCode').focus();
        $('jcCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('jcGo').onclick = async () => {
            const code = $('jcCode').value.trim().toUpperCase();
            if (!code) return toast('Enter a code.');
            try {
                await educator.joinClass(code);
                document.querySelector('.modal-backdrop')?.remove();
                toast('Joined class');
                state.hub = null;
                this.loadHub(true);
            } catch (err) {
                toast(err.message);
            }
        };
    },

    /* ---------- Class detail ---------- */

    async openClass(id) {
        state.view = 'class';
        state.loading = true;
        state.detail = null;
        this.rerender();
        try {
            state.detail = await educator.getClass(id);
        } catch (err) {
            state.error = err.message;
            state.view = 'hub';
        } finally {
            state.loading = false;
            this.rerender();
        }
    },

    classDetailHtml() {
        if (state.loading) {
            return `<div class="card"><div class="flex gap-2 items-center"><div class="spinner"></div> Loading class…</div></div>`;
        }
        const d = state.detail;
        if (!d) return `<div class="card"><p>Class not loaded.</p></div>`;

        const { class: cls, role, members, assignments, submissions } = d;

        return `
      <div class="card">
        <div class="card-header">
          <div>
            <button class="btn btn-ghost btn-sm" id="edBack">← All classes</button>
            <div class="card-title" style="margin-top:10px;">${escapeHtml(cls.name)}</div>
            <div class="card-sub">
              ${escapeHtml(cls.description || '')}
              <span class="mono" style="margin-left:10px;">Code: ${escapeHtml(cls.code)}</span>
            </div>
          </div>
          <div class="flex gap-2">
            ${role === 'teacher' ? `
              <button class="btn btn-ghost btn-sm" id="edExport">Export CSV</button>
              <button class="btn btn-primary btn-sm" id="edNewAssign">New assignment</button>
            ` : ''}
          </div>
        </div>

        ${role === 'teacher'
                ? this.teacherClassBody(cls, members, assignments, submissions)
                : this.studentClassBody(cls, assignments, submissions)}
      </div>`;
    },

    teacherClassBody(cls, members, assignments, submissions) {
        return `
      <div class="ed-split">
        <div>
          <h3 class="ed-section-title">Assignments</h3>
          ${!assignments.length ? `<p class="muted" style="font-size:13px;">No assignments yet.</p>` : ''}
          ${assignments.map(a => this.assignmentRow(a, submissions.filter(s => s.assignment_id === a.id), members, true)).join('')}
        </div>
        <aside class="ed-members">
          <h3 class="ed-section-title">Students (${members.length})</h3>
          ${!members.length ? `<p class="muted" style="font-size:13px;">Share the code <span class="mono">${escapeHtml(cls.code)}</span> with students.</p>` : ''}
          <ul class="ed-member-list">
            ${members.map(m => `<li>${escapeHtml(m.student_email || m.student_id)}</li>`).join('')}
          </ul>
        </aside>
      </div>`;
    },

    studentClassBody(cls, assignments, submissions) {
        if (!assignments.length) {
            return `<p class="muted">No assignments yet. Check back later.</p>`;
        }
        return `
      <h3 class="ed-section-title">Assignments</h3>
      ${assignments.map(a => this.assignmentRow(a, submissions.filter(s => s.assignment_id === a.id), [], false)).join('')}`;
    },

    assignmentRow(a, subs, members, isTeacher) {
        const mySub = subs[0]; // for students, only their own is returned
        const toolLabel = {
            paper: 'Position Paper',
            speech: 'Speech Trainer',
            resolution: 'Resolution Builder',
            simulation: 'Simulation'
        }[a.tool] || null;

        if (isTeacher) {
            const submitted = subs.length;
            const total = members.length;
            const reviewed = subs.filter(s => s.status === 'reviewed').length;
            return `
        <div class="ed-assignment" data-assignment-id="${a.id}">
          <div class="ed-assignment-head">
            <div>
              <div class="ed-assignment-title">${escapeHtml(a.title)}</div>
              ${a.description ? `<div class="ed-assignment-desc">${escapeHtml(a.description)}</div>` : ''}
              ${toolLabel ? `<span class="ed-tool-badge">${escapeHtml(toolLabel)}</span>` : ''}
            </div>
            <button class="btn btn-ghost btn-sm" data-view-subs="${a.id}">View submissions</button>
          </div>
          <div class="ed-assignment-stats">
            ${submitted} / ${total} submitted · ${reviewed} reviewed
          </div>
        </div>`;
        }

        // Student
        const status = mySub ? mySub.status : 'not submitted';
        const grade = mySub && mySub.teacher_grade ? ` · Grade: ${escapeHtml(mySub.teacher_grade)}` : '';
        const comment = mySub && mySub.teacher_comment ? mySub.teacher_comment : '';
        return `
      <div class="ed-assignment" data-assignment-id="${a.id}">
        <div class="ed-assignment-head">
          <div>
            <div class="ed-assignment-title">${escapeHtml(a.title)}</div>
            ${a.description ? `<div class="ed-assignment-desc">${escapeHtml(a.description)}</div>` : ''}
            ${toolLabel ? `<span class="ed-tool-badge">${escapeHtml(toolLabel)}</span>` : ''}
          </div>
          <span class="ed-status ed-status-${status.replace(/\s+/g, '-')}">${status}${grade}</span>
        </div>
        ${comment ? `<div class="ed-teacher-comment">
          <div class="ed-teacher-comment-label">Teacher feedback</div>
          <div>${escapeHtml(comment)}</div>
        </div>` : ''}
        <div class="flex gap-2 mt-2">
          <button class="btn btn-primary btn-sm" data-submit="${a.id}" data-tool="${a.tool || ''}">
            ${mySub ? 'Update submission' : 'Submit work'}
          </button>
          ${toolLabel ? `<a class="btn btn-ghost btn-sm" href="#/${a.tool === 'paper' ? 'paper' : a.tool === 'speech' ? 'speech' : a.tool === 'resolution' ? 'resolution' : 'simulate'}">Open ${escapeHtml(toolLabel)}</a>` : ''}
        </div>
      </div>`;
    },

    bindClassDetail() {
        const back = $('edBack');
        if (back) back.onclick = () => {
            state.view = 'hub';
            state.detail = null;
            this.rerender();
        };

        const exportBtn = $('edExport');
        if (exportBtn) exportBtn.onclick = async () => {
            try {
                await educator.exportCsv(state.detail.class.id, state.detail.class.name);
                toast('Export downloaded');
            } catch (err) {
                toast(err.message);
            }
        };

        const newAssign = $('edNewAssign');
        if (newAssign) newAssign.onclick = () => this.openNewAssignment();

        document.querySelectorAll('[data-view-subs]').forEach(b => {
            b.onclick = () => this.openSubmissions(b.dataset.viewSubs);
        });

        document.querySelectorAll('[data-submit]').forEach(b => {
            b.onclick = () => this.openSubmit(b.dataset.submit, b.dataset.tool);
        });
    },

    openNewAssignment() {
        const classId = state.detail.class.id;
        openModal({
            title: 'New assignment',
            body: `
        <div class="field"><label>Title</label><input id="naTitle" placeholder="e.g. Position paper on climate finance" /></div>
        <div class="field"><label>Description / prompt</label><textarea id="naDesc" rows="4" placeholder="What should students do?"></textarea></div>
        <div class="field">
          <label>Suggested tool (optional)</label>
          <select id="naTool">
            <option value="">None — free-form text</option>
            <option value="paper">Position Paper Builder</option>
            <option value="speech">Speech Trainer</option>
            <option value="resolution">Resolution Builder</option>
            <option value="simulation">Conference Simulation</option>
          </select>
        </div>`,
            footer: `<button class="btn btn-ghost" id="naCancel">Cancel</button>
               <button class="btn btn-primary" id="naCreate">Create</button>`
        });
        $('naCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('naCreate').onclick = async () => {
            const title = $('naTitle').value.trim();
            const description = $('naDesc').value.trim();
            const tool = $('naTool').value || null;
            if (!title) return toast('Enter a title.');
            try {
                await educator.createAssignment(classId, { title, description, tool });
                document.querySelector('.modal-backdrop')?.remove();
                toast('Assignment created');
                state.detail = await educator.getClass(classId);
                this.rerender();
            } catch (err) {
                toast(err.message);
            }
        };
    },

    openSubmissions(assignmentId) {
        const a = state.detail.assignments.find(x => x.id === assignmentId);
        const subs = state.detail.submissions.filter(s => s.assignment_id === assignmentId);
        const members = state.detail.members;

        const rows = members.map(m => {
            const s = subs.find(x => x.student_id === m.student_id);
            return { member: m, sub: s };
        });

        openModal({
            title: `Submissions — ${a.title}`,
            body: `
        <div class="ed-sub-list">
          ${rows.map(r => `
            <div class="ed-sub-row" data-student-id="${r.member.student_id}">
              <div class="ed-sub-row-head">
                <span class="ed-sub-email">${escapeHtml(r.member.student_email || r.member.student_id)}</span>
                <span class="ed-status ed-status-${(r.sub?.status || 'not-submitted').replace(/\s+/g, '-')}">
                  ${r.sub?.status || 'not submitted'}
                </span>
              </div>
              ${r.sub ? `
                <div class="ed-sub-content">${escapeHtml((r.sub.content || '').slice(0, 400))}${(r.sub.content || '').length > 400 ? '…' : ''}</div>
                <div class="flex gap-2 mt-2">
                  <button class="btn btn-primary btn-sm" data-review="${r.sub.id}">${r.sub.status === 'reviewed' ? 'Edit review' : 'Review with AI'}</button>
                </div>
              ` : `<div class="muted" style="font-size:12.5px;">Nothing submitted yet.</div>`}
            </div>`).join('')}
        </div>`,
            footer: `<button class="btn btn-ghost" id="subClose">Close</button>`
        });

        $('subClose').onclick = () => document.querySelector('.modal-backdrop')?.remove();

        document.querySelectorAll('[data-review]').forEach(b => {
            b.onclick = () => this.openReview(b.dataset.review, assignmentId);
        });
    },

    openReview(submissionId, assignmentId) {
        const sub = state.detail.submissions.find(s => s.id === submissionId);
        const a = state.detail.assignments.find(x => x.id === assignmentId);
        const cls = state.detail.class;

        openModal({
            title: 'Review submission',
            body: `
        <div class="ed-review-grid">
          <div>
            <div class="ed-review-label">Student submission</div>
            <div class="ed-review-content">${escapeHtml(sub.content || '(empty)')}</div>
          </div>
          <div>
            <div class="ed-review-label">AI feedback</div>
            <div class="ed-review-ai" id="edAiFeedback">
              <button class="btn btn-ghost btn-sm" id="edGetAi">Get AI feedback</button>
              <p class="muted" style="font-size:12px;margin-top:8px;">
                Uses the AI provider in your AI Settings. The result is a starting point —
                you decide what feedback matters.
              </p>
            </div>
          </div>
        </div>
        <div class="field mt-2"><label>Your feedback</label><textarea id="edComment" rows="5">${escapeHtml(sub.teacher_comment || '')}</textarea></div>
        <div class="field"><label>Grade (optional)</label><input id="edGrade" value="${escapeHtml(sub.teacher_grade || '')}" placeholder="e.g. Excellent / 9 / A-"></div>`,
            footer: `<button class="btn btn-ghost" id="edReviewCancel">Cancel</button>
               <button class="btn btn-primary" id="edReviewSave">Save review</button>`
        });

        $('edReviewCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('edReviewSave').onclick = async () => {
            const comment = $('edComment').value.trim();
            const grade = $('edGrade').value.trim();
            try {
                await educator.review(submissionId, comment, grade);
                document.querySelector('.modal-backdrop')?.remove();
                toast('Review saved');
                state.detail = await educator.getClass(cls.id);
                this.rerender();
            } catch (err) {
                toast(err.message);
            }
        };

        $('edGetAi').onclick = async () => {
            const box = $('edAiFeedback');
            box.innerHTML = `<div class="flex gap-2 items-center"><div class="spinner"></div> Generating…</div>`;
            const prompt = `Review this student submission for an MUN class.

Assignment: ${a.title}
${a.description ? `Prompt: ${a.description}` : ''}

Submission:
"""
${(sub.content || '').slice(0, 6000)}
"""

Provide structured feedback:
STRENGTHS (2–3 bullets)
WEAK AREAS (2–3 bullets)
SPECIFIC SUGGESTIONS (2–3 bullets)

Be constructive. Address the student directly. No emojis.`;

            try {
                const reply = await ai.chat({ mode: 'positionPaperReviewer', userText: prompt, history: [], context: {} });
                box.innerHTML = `<div class="ed-ai-text">${markdownLite(reply)}</div>
          <button class="btn btn-ghost btn-sm mt-2" id="edUseAi">Copy into feedback box</button>`;
                $('edUseAi').onclick = () => { $('edComment').value = reply; toast('Copied to feedback'); };
            } catch (err) {
                box.innerHTML = `<div class="badge badge-red">AI error</div><p class="muted mt-1" style="font-size:12px;">${escapeHtml(err.message)}</p>`;
            }
        };
    },

    openSubmit(assignmentId, tool) {
        const a = state.detail.assignments.find(x => x.id === assignmentId);
        const existing = state.detail.submissions.find(s => s.assignment_id === assignmentId);

        openModal({
            title: `Submit — ${a.title}`,
            body: `
        ${a.description ? `<p class="muted" style="font-size:13px;">${escapeHtml(a.description)}</p>` : ''}
        ${tool ? `<p class="muted" style="font-size:12.5px;">Suggested tool: <b>${escapeHtml(tool)}</b>. Use it, then paste your work below.</p>` : ''}
        <div class="field">
          <label>Your submission</label>
          <textarea id="edSubmission" rows="10" placeholder="Paste or write your work here…">${escapeHtml(existing?.content || '')}</textarea>
        </div>`,
            footer: `<button class="btn btn-ghost" id="edSubCancel">Cancel</button>
               <button class="btn btn-primary" id="edSubSave">${existing ? 'Update' : 'Submit'}</button>`
        });
        $('edSubCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        $('edSubSave').onclick = async () => {
            const content = $('edSubmission').value.trim();
            if (!content) return toast('Write something first.');
            try {
                await educator.submit(assignmentId, content, { tool: tool || null });
                document.querySelector('.modal-backdrop')?.remove();
                toast('Submitted');
                state.detail = await educator.getClass(state.detail.class.id);
                this.rerender();
            } catch (err) {
                toast(err.message);
            }
        };
    },

    rerender() {
        const app = $('app');
        if (app) app.innerHTML = this.render();
        this.init();
        // Hub-specific bindings
        if (state.view === 'hub' && !state.loading && !state.error && state.hub) this.bindHub();
    }
};