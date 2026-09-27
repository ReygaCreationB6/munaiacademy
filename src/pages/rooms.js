import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ws } from '../core/ws.js';
import { escapeHtml, toast, openModal } from '../core/ui.js';

let refreshTimer = null;
let roomList = [];

export const rooms = {
    path: '/rooms',
    ariaTitle: 'Multiplayer Rooms',
    render() { return layout('Multiplayer Rooms', this.body(), { full: true }); },

    init() {
        bindLayout();
        ws.clearAll();
        ws.clearRoom && ws.clearRoom();
        ws.on('rooms', m => this.setRooms(m.rooms));
        ws.on('error', m => toast(m.message));
        ws.on('room-created', m => {
            const s = store.get();
            ws.setRoom({ code: m.code, name: s.profile.name || 'Delegate', country: s.conference.country });
            clearInterval(refreshTimer);
            location.hash = `/room/${m.code}`;
        });

        document.getElementById('roomsCreate').onclick = () => this.openCreate();
        document.getElementById('roomsJoin').onclick = () => this.openJoin();
        document.getElementById('roomsRefresh').onclick = () => this.refresh();

        ws.connect().then(() => this.refresh()).catch(() => {
            const el = document.getElementById('roomsList');
            if (el) el.innerHTML = `<p class="muted">Could not connect to the server. Is it running?</p>`;
        });

        clearInterval(refreshTimer);
        refreshTimer = setInterval(() => this.refresh(), 5000);
    },

    body() {
        return `
      <div class="mx-page">
        <div class="card">
          <div class="card-header">
            <div>
              <div class="card-title">Multiplayer Rooms</div>
              <div class="card-sub">Run a live MUN committee with other delegates. Every action is broadcast instantly.</div>
            </div>
            <div class="flex gap-2">
              <button class="btn btn-ghost btn-sm" id="roomsRefresh">Refresh</button>
              <button class="btn btn-ghost btn-sm" id="roomsJoin">Join by code</button>
              <button class="btn btn-primary btn-sm" id="roomsCreate">Create room</button>
            </div>
          </div>
          <div id="roomsList" class="mt-2"><p class="muted" style="font-size:13px;">Loading rooms…</p></div>
        </div>
      </div>`;
    },

    setRooms(list) {
        roomList = Array.isArray(list) ? list : [];
        this.renderList();
    },

    renderList() {
        const el = document.getElementById('roomsList');
        if (!el) return;
        if (!roomList.length) {
            el.innerHTML = `<p class="muted" style="font-size:13px;">No open rooms right now. Create one to get started.</p>`;
            return;
        }
        el.innerHTML = roomList.map(r => `
      <div class="mx-session-card">
        <div class="info">
          <div class="t">
            ${escapeHtml(r.name)}
            <span class="mono">${escapeHtml(r.code)}</span>
            ${r.roleMode === 'delegate' ? `<span class="rm-role-badge">AI Chair</span>` : ''}
          </div>
          <div class="s">
            ${escapeHtml(r.committee)} · ${escapeHtml(r.topic)} ·
            ${r.humanCount} human${r.humanCount === 1 ? '' : 's'}${r.aiCount ? ` + ${r.aiCount} AI` : ''} ·
            ${escapeHtml(r.phase)}
          </div>
        </div>
        <button class="btn btn-primary btn-sm" data-join="${escapeHtml(r.code)}">Join</button>
      </div>`).join('');
        el.querySelectorAll('[data-join]').forEach(b => {
            b.onclick = () => this.openJoin(b.dataset.join);
        });
    },

    refresh() { ws.send({ type: 'list-rooms' }); },

    openCreate() {
        const s = store.get();
        const conf = s.conference || {};
        const prof = s.profile || {};

        openModal({
            title: 'Create a room',
            body: `
        <div class="field">
          <label>Your role</label>
          <div class="rm-role-picker">
            <button type="button" class="rm-role-option active" data-role="chair">
              <span class="rm-role-title">Chair</span>
              <span class="rm-role-desc">You run the committee directly. Recognize speakers, rule motions, open votes.</span>
            </button>
            <button type="button" class="rm-role-option" data-role="delegate">
              <span class="rm-role-title">Delegate</span>
              <span class="rm-role-desc">You participate as a delegate. An AI chair presides over the committee.</span>
            </button>
          </div>
        </div>
        <div class="field"><label>Room name</label><input id="crName" value="${escapeHtml((conf.committee || 'UNHRC') + ' — ' + (conf.country || 'session'))}" /></div>
        <div class="field-row">
          <div class="field"><label>Committee</label><input id="crCommittee" value="${escapeHtml(conf.committee || 'UNHRC')}" /></div>
          <div class="field"><label>Your country</label><input id="crCountry" value="${escapeHtml(conf.country || 'Chad')}" /></div>
        </div>
        <div class="field"><label>Topic</label><input id="crTopic" value="${escapeHtml(conf.topic || '')}" /></div>
        <div class="field"><label>Your display name</label><input id="crHost" value="${escapeHtml(prof.name || 'Host')}" /></div>`,
            footer: `
        <button class="btn btn-ghost" id="crCancel">Cancel</button>
        <button class="btn btn-primary" id="crCreate">Create</button>`
        });

        let selectedRole = 'chair';
        document.querySelectorAll('.rm-role-option').forEach(opt => {
            opt.onclick = () => {
                document.querySelectorAll('.rm-role-option').forEach(o => o.classList.remove('active'));
                opt.classList.add('active');
                selectedRole = opt.dataset.role;
            };
        });

        document.getElementById('crCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();
        document.getElementById('crCreate').onclick = () => {
            const name = document.getElementById('crName').value.trim() || 'Untitled room';
            const committee = document.getElementById('crCommittee').value.trim() || 'UNHRC';
            const country = document.getElementById('crCountry').value.trim() || 'Chad';
            const topic = document.getElementById('crTopic').value.trim() || 'Open agenda';
            const hostName = document.getElementById('crHost').value.trim() || 'Host';
            document.querySelector('.modal-backdrop')?.remove();
            store.set({ profile: { ...store.get().profile, name: hostName } });
            ws.connect().then(() => ws.send({
                type: 'create-room', name, committee, topic, roleMode: selectedRole, hostName, hostCountry: country
            }));
        };
    },

    openJoin(prefill) {
        const s = store.get();
        const conf = s.conference || {};
        const prof = s.profile || {};

        openModal({
            title: 'Join a room',
            body: `
        <div class="field"><label>Room code</label><input id="jnCode" placeholder="ABC123" maxlength="6" value="${escapeHtml(prefill || '')}" style="text-transform:uppercase;font-family:var(--font-mono);letter-spacing:0.15em;" /></div>
        <div class="field-row">
          <div class="field"><label>Your display name</label><input id="jnName" value="${escapeHtml(prof.name || 'Delegate')}" /></div>
          <div class="field"><label>Your country</label><input id="jnCountry" value="${escapeHtml(conf.country || 'Chad')}" /></div>
        </div>`,
            footer: `
        <button class="btn btn-ghost" id="jnCancel">Cancel</button>
        <button class="btn btn-primary" id="jnGo">Join</button>`
        });

        const codeInput = document.getElementById('jnCode');
        codeInput.focus();
        document.getElementById('jnCancel').onclick = () => document.querySelector('.modal-backdrop')?.remove();

        const go = () => {
            const code = codeInput.value.trim().toUpperCase();
            const name = document.getElementById('jnName').value.trim() || 'Delegate';
            const country = document.getElementById('jnCountry').value.trim() || 'Chad';
            if (code.length !== 6) return toast('Enter the 6-letter code.');
            document.querySelector('.modal-backdrop')?.remove();
            store.set({
                profile: { ...store.get().profile, name },
                conference: { ...store.get().conference, country }
            });
            ws.setRoom({ code, name, country });
            ws.connect().then(() => ws.send({ type: 'join-room', code, name, country }));
            location.hash = `/room/${code}`;
        };
        document.getElementById('jnGo').onclick = go;
        codeInput.onkeydown = e => { if (e.key === 'Enter') go(); };
    },

    destroy() {
        clearInterval(refreshTimer);
        refreshTimer = null;
    }
};