import { layout, bindLayout } from './_layout.js';
import { store } from '../core/store.js';
import { ai } from '../main.js';
import { escapeHtml, markdownLite, toast } from '../core/ui.js';
import { track } from '../analytics/metrics.js';
import { isVoiceAvailable, VoiceRecorder } from '../core/voice.js';

let lastSpeech = null;
let recorder = null;
let lastDelivery = null;

const $ = (id) => document.getElementById(id);

export const speechTrainer = {
  path: '/speech',
  ariaTitle: 'Speech Trainer',
  render() { return layout('Speech Trainer', this.body()); },

  init() {
    try { bindLayout(); } catch (err) { console.error('[speechTrainer] bindLayout:', err); }

    const s = store.get();
    const conf = s.conference || {};
    if ($('spCountry')) $('spCountry').value = conf.country || 'Chad';
    if ($('spCommittee')) $('spCommittee').value = conf.committee || 'UNHRC';
    if ($('spTopic')) $('spTopic').value = conf.topic || '';

    if ($('spAnalyze')) $('spAnalyze').onclick = () => this.analyze();
    if ($('spSave')) $('spSave').onclick = () => this.save();

    const ta = $('spText');
    if (ta && $('spCount')) {
      ta.oninput = () => {
        const wc = ta.value.trim().split(/\s+/).filter(Boolean).length;
        $('spCount').textContent = `${wc} words`;
      };
    }

    // Voice UI
    if (!isVoiceAvailable()) {
      const panel = $('spVoicePanel');
      if (panel) {
        panel.innerHTML = `
          <div class="sp-voice-unsupported">
            <div class="badge">Voice not supported</div>
            <p class="muted" style="font-size:13px;margin-top:8px;">
              Your browser doesn't support the Web Speech API. Chrome, Edge, and Safari do.
              Firefox users can still type their speech and get content feedback below.
            </p>
          </div>`;
      }
      return;
    }

    if ($('spRecord')) $('spRecord').onclick = () => this.startRecording();
    if ($('spStop')) $('spStop').onclick = () => this.stopRecording();
    if ($('spClearVoice')) $('spClearVoice').onclick = () => this.clearRecording();
  },

  body() {
    return `
      <div class="card">
        <div class="card-header"><div class="card-title">Speech Setup</div></div>
        <div class="field-row">
          <div class="field"><label>Country</label><input id="spCountry" /></div>
          <div class="field"><label>Committee</label><input id="spCommittee" /></div>
        </div>
        <div class="field"><label>Topic</label><input id="spTopic" /></div>
        <div class="field-row">
          <div class="field"><label>Speech Type</label>
            <select id="spType">
              <option>Opening Speech</option>
              <option>General Speakers List</option>
              <option>Moderated Caucus</option>
              <option>Closing Speech</option>
              <option>Emergency Speech</option>
            </select>
          </div>
          <div class="field"><label>Time limit (seconds)</label><input id="spTime" type="number" value="60" /></div>
        </div>
      </div>

      <div class="card mt-2" id="spVoicePanel">
        <div class="card-header">
          <div>
            <div class="card-title">Record your delivery</div>
            <div class="card-sub">Your audio never leaves this device — only the transcript is used for feedback.</div>
          </div>
          <span class="sp-voice-status" id="spVoiceStatus">Ready</span>
        </div>

        <div class="sp-voice-controls">
          <button class="btn btn-primary" id="spRecord">
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="4"/></svg>
            Start recording
          </button>
          <button class="btn btn-danger" id="spStop" hidden>
            <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="4" y="4" width="8" height="8"/></svg>
            Stop
          </button>
          <button class="btn btn-ghost" id="spClearVoice">Clear</button>
          <span class="sp-voice-timer" id="spVoiceTimer">0:00</span>
        </div>

        <div class="sp-voice-live" id="spVoiceLive" hidden>
          <div class="sp-voice-live-head">
            <span class="label-small">Live transcript</span>
            <span class="muted" id="spVoiceWords">0 words</span>
          </div>
          <div class="sp-voice-transcript" id="spVoiceTranscript"></div>
        </div>

        <div id="spDeliveryResult" class="mt-2"></div>
      </div>

      <div class="card mt-2">
        <div class="card-header"><div class="card-title">Your Speech</div>
          <button class="btn btn-ghost btn-sm" id="spSave">Save draft</button></div>
        <div class="field">
          <textarea id="spText" rows="10" placeholder="Write your speech here, or hit Record above and let the transcript fill in."></textarea>
        </div>
        <div class="flex between items-center">
          <span class="muted" id="spCount">0 words</span>
          <button class="btn btn-primary" id="spAnalyze">Get AI Feedback</button>
        </div>
      </div>

      <div id="spResult" class="mt-2"></div>`;
  },

  /* ---------------- voice recording ---------------- */

  startRecording() {
    if (recorder && recorder.active) return;

    recorder = new VoiceRecorder();
    lastDelivery = null;
    $('spDeliveryResult').innerHTML = '';

    recorder.onUpdate = (info) => this.onVoiceUpdate(info);
    recorder.onError = (err) => {
      toast(err.message);
      this.resetVoiceControls();
    };
    recorder.onEnd = (summary) => this.onVoiceEnd(summary);

    try {
      recorder.start();
    } catch (err) {
      toast(err.message);
      return;
    }

    $('spRecord').hidden = true;
    $('spStop').hidden = false;
    $('spVoiceLive').hidden = false;
    $('spVoiceStatus').textContent = 'Recording';
    $('spVoiceStatus').classList.add('recording');
  },

  stopRecording() {
    if (!recorder) return;
    recorder.stop();
  },

  clearRecording() {
    if (recorder && recorder.active) recorder.cancel();
    recorder = null;
    lastDelivery = null;
    $('spDeliveryResult').innerHTML = '';
    $('spVoiceTranscript').innerHTML = '';
    $('spVoiceWords').textContent = '0 words';
    $('spVoiceTimer').textContent = '0:00';
    $('spVoiceLive').hidden = true;
    this.resetVoiceControls();
  },

  resetVoiceControls() {
    if ($('spRecord')) $('spRecord').hidden = false;
    if ($('spStop')) $('spStop').hidden = true;
    const status = $('spVoiceStatus');
    if (status) {
      status.textContent = 'Ready';
      status.classList.remove('recording');
    }
  },

  onVoiceUpdate(info) {
    const timer = $('spVoiceTimer');
    if (timer) timer.textContent = fmtMMSS(Math.floor(info.elapsedMs / 1000));

    const words = $('spVoiceWords');
    if (words) words.textContent = `${info.wordCount} word${info.wordCount === 1 ? '' : 's'}`;

    const transcript = $('spVoiceTranscript');
    if (transcript) {
      const final = escapeHtml(info.finalText);
      const interim = info.interimText
        ? `<span class="sp-interim">${escapeHtml(info.interimText)}</span>`
        : '';
      transcript.innerHTML = `${final} ${interim}`.trim() || '<span class="muted">Listening…</span>';
      transcript.scrollTop = transcript.scrollHeight;
    }
  },

  onVoiceEnd(summary) {
    lastDelivery = summary;
    this.resetVoiceControls();

    // Populate the speech textarea with the transcript.
    const ta = $('spText');
    if (ta) {
      ta.value = summary.transcript || ta.value;
      const wc = ta.value.trim().split(/\s+/).filter(Boolean).length;
      if ($('spCount')) $('spCount').textContent = `${wc} words`;
    }

    this.renderDelivery(summary);
  },

  renderDelivery(d) {
    const el = $('spDeliveryResult');
    if (!el) return;

    if (!d.wordCount || d.wordCount < 5) {
      el.innerHTML = `<div class="sp-delivery-empty">Recording stopped — no speech was detected.</div>`;
      return;
    }

    const scoreClass = (v) => v >= 80 ? 'good' : v >= 60 ? 'mid' : 'poor';

    el.innerHTML = `
      <div class="sp-delivery">
        <div class="sp-delivery-head">
          <div>
            <div class="label-small">Delivery score</div>
            <div class="sp-delivery-overall ${scoreClass(d.overall)}">${d.overall}<span class="sp-delivery-denom">/100</span></div>
          </div>
          <div class="sp-delivery-note">${escapeHtml(d.note || '')}</div>
        </div>

        <div class="sp-delivery-grid">
          ${deliveryMetric('Pace', `${d.wpm} WPM`, d.pace)}
          ${deliveryMetric('Fluency', `${d.fillerPerMin} fillers/min`, d.fluency)}
          ${deliveryMetric('Confidence',
      d.confidence != null ? `${d.avgConfidence}%` : '—',
      d.confidence != null ? d.confidence : null)}
        </div>

        <div class="sp-delivery-stats">
          <div><span class="k">Duration</span><span class="v">${d.durationSec}s</span></div>
          <div><span class="k">Words</span><span class="v">${d.wordCount}</span></div>
          <div><span class="k">Fillers</span><span class="v">${d.fillerCount}${d.fillerWords.length ? ' · ' + d.fillerWords.slice(0, 3).map(escapeHtml).join(', ') : ''}</span></div>
          <div><span class="k">Pauses</span><span class="v">${d.pauseCount} (avg ${d.avgPauseSec}s)</span></div>
        </div>
      </div>`;
  },

  /* ---------------- content evaluation ---------------- */

  async analyze() {
    const text = $('spText')?.value.trim() || '';
    if (text.length < 40) return toast('Write or record a bit more first.');

    const country = $('spCountry')?.value || '';
    const committee = $('spCommittee')?.value || '';
    const topic = $('spTopic')?.value || '';
    const type = $('spType')?.value || 'Opening Speech';
    const time = $('spTime')?.value || '60';

    const out = $('spResult');
    if (!out) return;
    out.innerHTML = `<div class="card"><div class="flex gap-2 items-center"><div class="spinner" style="border-color:rgba(15,37,71,.2);border-top-color:var(--navy-800)"></div> Analyzing…</div></div>`;

    const prompt = `Evaluate this MUN speech.

Country: ${country}
Committee: ${committee}
Topic: ${topic}
Speech type: ${type}
Time limit: ${time}s

Speech:
"""
${text}
"""`;

    try {
      const reply = await ai.chat({
        mode: 'speechEvaluator',
        userText: prompt,
        history: [],
        context: {},
        fallback: () => `Scores:
- Content: 60%
- Diplomatic Language: 65%
- Structure: 60%
- Specificity: 55%

What you did well
- You addressed the topic.
- Your country's position is identifiable.

What needs improvement
- Add a concrete funding mechanism.
- Name specific actors (UN agencies, treaties).
- Tighten the conclusion.

Next practice
Deliver a 30-second rebuttal defending your proposal against a country that opposes it.`
      });

      const content = /Content:\s*(\d+)/i.exec(reply)?.[1];
      const diplo = /Diplomatic Language:\s*(\d+)/i.exec(reply)?.[1];
      lastSpeech = { content, diplo, reply };

      out.innerHTML = `<div class="card"><div class="card-title">AI Feedback</div>
        <div class="mt-2" style="font-size:14.5px;line-height:1.65;">${markdownLite(reply)}</div></div>`;
    } catch (err) {
      out.innerHTML = `<div class="card"><span class="badge badge-red">Error</span> ${escapeHtml(err.message)}</div>`;
    }
  },

  save() {
    const text = $('spText')?.value.trim() || '';
    if (!text) return toast('Nothing to save.');
    const s = store.get();
    const type = $('spType')?.value || 'Speech';
    const last = lastSpeech || {};
    const delivery = lastDelivery;

    const speeches = [...(s.speeches || [])];
    speeches.push({
      id: Date.now().toString(),
      title: type,
      text,
      scores: {
        content: +last.content || 0,
        diplomacy: +last.diplo || 0,
        delivery: delivery ? delivery.overall : 0
      },
      delivery: delivery || null,
      feedback: last.reply || '',
      createdAt: Date.now()
    });

    store.set({ speeches, xp: (s.xp || 0) + 15 });

    try {
      track('speech', {
        type,
        wordCount: text.split(/\s+/).filter(Boolean).length,
        contentScore: +last.content || 0,
        diplomacyScore: +last.diplo || 0,
        deliveryScore: delivery ? delivery.overall : 0
      });
      if (delivery) {
        track('voice-delivery', {
          wpm: delivery.wpm,
          fillers: delivery.fillerCount,
          pauses: delivery.pauseCount,
          score: delivery.overall
        });
      }
    } catch { }

    toast('Speech saved · +15 XP');
  }
};

/* ---------------- helpers ---------------- */

function deliveryMetric(label, value, score) {
  const cls = score == null ? '' : score >= 80 ? 'good' : score >= 60 ? 'mid' : 'poor';
  return `
    <div class="sp-delivery-metric">
      <div class="label-small">${escapeHtml(label)}</div>
      <div class="sp-metric-value">${escapeHtml(value)}</div>
      ${score != null ? `<div class="sp-metric-bar"><div class="sp-metric-fill ${cls}" style="width:${Math.max(2, Math.min(100, score))}%"></div></div>` : ''}
    </div>`;
}

function fmtMMSS(sec) {
  const m = Math.floor(sec / 60);
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}