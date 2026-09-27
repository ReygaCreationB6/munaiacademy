/**
 * Web Speech API wrapper for recording and scoring speech delivery.
 *
 * Privacy: audio never leaves the device. Only the transcript is used.
 * Supported in Chrome, Edge, Safari (webkit-prefixed). Firefox: no.
 *
 * Chrome auto-stops after ~60s of silence even with continuous = true,
 * so this wrapper transparently restarts until the caller stops it.
 */

const SR = typeof window !== 'undefined'
    ? (window.SpeechRecognition || window.webkitSpeechRecognition)
    : null;

export function isVoiceAvailable() {
    return !!SR;
}

export class VoiceRecorder {
    constructor({ lang = 'en-US' } = {}) {
        this.lang = lang;
        this.recognition = null;
        this.active = false;
        this.finalText = '';
        this.interimText = '';
        this.startedAt = 0;
        this.endedAt = 0;
        this.confidences = [];
        this.wordChunks = [];         // { text, ts } for pause detection
        this.onUpdate = null;
        this.onEnd = null;
        this.onError = null;
        this._restartOnEnd = false;
        this._stoppedByUser = false;
    }

    start() {
        if (!SR) throw new Error('Speech recognition is not supported in this browser.');
        if (this.active) return;

        this.finalText = '';
        this.interimText = '';
        this.confidences = [];
        this.wordChunks = [];
        this.startedAt = Date.now();
        this.endedAt = 0;
        this._stoppedByUser = false;
        this._restartOnEnd = true;

        this._createAndStart();
    }

    _createAndStart() {
        let rec;
        try {
            rec = new SR();
        } catch (err) {
            this.active = false;
            this._restartOnEnd = false;
            this.onError?.(err);
            return;
        }

        this.recognition = rec;
        rec.lang = this.lang;
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;

        rec.onresult = (event) => {
            let interim = '';
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const result = event.results[i];
                const alt = result[0];
                if (result.isFinal) {
                    const chunk = String(alt.transcript || '').trim();
                    if (chunk) {
                        this.finalText += (this.finalText ? ' ' : '') + chunk;
                        this.wordChunks.push({ text: chunk, ts: Date.now() });
                    }
                    if (typeof alt.confidence === 'number' && alt.confidence > 0) {
                        this.confidences.push(alt.confidence);
                    }
                } else {
                    interim += ' ' + (alt.transcript || '');
                }
            }
            this.interimText = interim.trim();
            this._emitUpdate();
        };

        rec.onerror = (e) => {
            // Common and benign — Chrome fires this after brief silence.
            if (e.error === 'no-speech') return;

            if (e.error === 'not-allowed' || e.error === 'service-not-allowed') {
                this._stoppedByUser = true;
                this._restartOnEnd = false;
                this.active = false;
                this.onError?.(new Error('Microphone permission was denied. Allow it in your browser settings, then try again.'));
                return;
            }

            if (e.error === 'aborted') return;

            this.onError?.(new Error('Recognition error: ' + e.error));
        };

        rec.onend = () => {
            // Chrome kills recognition after ~60s of silence. Restart unless
            // the user asked us to stop.
            if (this._restartOnEnd && !this._stoppedByUser) {
                try {
                    this._createAndStart();
                    return;
                } catch { /* fall through */ }
            }
            this.active = false;
            this.endedAt = Date.now();
            this._emitUpdate();
            this.onEnd?.(this.summary());
        };

        try {
            rec.start();
            this.active = true;
            this._emitUpdate();
        } catch (err) {
            this.active = false;
            this._restartOnEnd = false;
            this.onError?.(err);
        }
    }

    stop() {
        this._stoppedByUser = true;
        this._restartOnEnd = false;
        if (this.recognition) {
            try { this.recognition.stop(); } catch { }
        }
        this.active = false;
        this.endedAt = Date.now();
        this._emitUpdate();
        this.onEnd?.(this.summary());
    }

    cancel() {
        this._stoppedByUser = true;
        this._restartOnEnd = false;
        if (this.recognition) {
            try { this.recognition.abort(); } catch { }
        }
        this.active = false;
    }

    _emitUpdate() {
        this.onUpdate?.({
            active: this.active,
            finalText: this.finalText,
            interimText: this.interimText,
            elapsedMs: this.active ? Date.now() - this.startedAt : Math.max(0, this.endedAt - this.startedAt),
            wordCount: this._wordCount()
        });
    }

    _wordCount() {
        return (this.finalText + ' ' + this.interimText)
            .trim().split(/\s+/).filter(Boolean).length;
    }

    summary() {
        const durationSec = Math.max(0, ((this.endedAt || Date.now()) - this.startedAt) / 1000);
        const text = this.finalText.trim();
        const words = text.split(/\s+/).filter(Boolean);
        const wordCount = words.length;

        const wpm = durationSec > 0 ? Math.round((wordCount / durationSec) * 60) : 0;

        // Common fillers in MUN speeches.
        const fillerRe = /\b(um+|uh+|er+|ah+|like|you know|sort of|kind of|basically|actually|right|okay|so+|well|i mean)\b/gi;
        const fillerMatches = (text.match(fillerRe) || []);
        const fillerCount = fillerMatches.length;

        // Detect pauses — gaps between finalized word chunks > 1.5s.
        // Cap at 10s to filter out idle silence (mic left running).
        const pauses = [];
        for (let i = 1; i < this.wordChunks.length; i++) {
            const gap = (this.wordChunks[i].ts - this.wordChunks[i - 1].ts) / 1000;
            if (gap >= 1.5 && gap <= 10) pauses.push(gap);
        }

        const totalPauseSec = pauses.reduce((a, b) => a + b, 0);
        const avgPauseSec = pauses.length ? totalPauseSec / pauses.length : 0;

        const avgConfidence = this.confidences.length
            ? Math.round((this.confidences.reduce((a, b) => a + b, 0) / this.confidences.length) * 100)
            : null;

        const scored = scoreDelivery({
            wpm, fillerCount, wordCount, durationSec,
            pauseCount: pauses.length, avgPauseSec, avgConfidence
        });

        return {
            transcript: text,
            durationSec: Math.round(durationSec * 10) / 10,
            wordCount,
            wpm,
            fillerCount,
            fillerWords: [...new Set(fillerMatches.map(w => w.toLowerCase().trim()))],
            pauseCount: pauses.length,
            avgPauseSec: Math.round(avgPauseSec * 10) / 10,
            totalPauseSec: Math.round(totalPauseSec * 10) / 10,
            avgConfidence,
            ...scored
        };
    }
}

/* ------------------------------------------------------------------ */
/* Scoring                                                             */
/* ------------------------------------------------------------------ */

/**
 * Target ranges (from public speaking research, cross-referenced with
 * conference speed for MUN — delegates often speak faster than TED pace).
 *
 *   Pace: 120–160 words per minute is the ideal window.
 *         Below 100 feels hesitant. Above 180 feels rushed.
 *   Fillers: ≤ 2 per minute is competent. 0 is ideal.
 *   Pauses: > 3.5s average suggests lost train of thought.
 *   Confidence: recognizer's own confidence, scaled 0–100.
 */
function scoreDelivery({ wpm, fillerCount, wordCount, durationSec, pauseCount, avgPauseSec, avgConfidence }) {
    if (wordCount < 20 || durationSec < 5) {
        return {
            overall: 0, pace: 0, fluency: 0, confidence: null,
            fillerPerMin: 0,
            note: 'Too short to evaluate — aim for at least 30 seconds.'
        };
    }

    // Pace: full marks inside [120, 160], linear falloff to 0 at [70, 210].
    let pace;
    if (wpm >= 120 && wpm <= 160) pace = 100;
    else if (wpm < 120) pace = Math.max(0, Math.round(((wpm - 70) / 50) * 100));
    else pace = Math.max(0, Math.round(((210 - wpm) / 50) * 100));

    // Fluency: penalty for fillers-per-minute and for extremely long pauses.
    const minutes = durationSec / 60;
    const fillerPerMin = minutes > 0 ? fillerCount / minutes : fillerCount;
    const fillerPenalty = Math.min(60, Math.round(fillerPerMin * 12));
    const pausePenalty = avgPauseSec > 3 ? Math.min(20, Math.round((avgPauseSec - 3) * 6)) : 0;
    const fluency = Math.max(0, 100 - fillerPenalty - pausePenalty);

    // Confidence: recognizer reports 0.0–1.0; scale it. 0.85+ is typically strong.
    const confidence = avgConfidence != null
        ? Math.max(0, Math.min(100, Math.round((avgConfidence - 50) * 2)))
        : null;

    const parts = [pace, fluency, confidence != null ? confidence : pace];
    const overall = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);

    return {
        overall,
        pace,
        fluency,
        confidence,
        fillerPerMin: Math.round(fillerPerMin * 10) / 10,
        note: describeDelivery({ wpm, fillerPerMin, avgPauseSec, confidence })
    };
}

function describeDelivery({ wpm, fillerPerMin, avgPauseSec, confidence }) {
    const notes = [];

    if (wpm > 0) {
        if (wpm < 100) notes.push('Speak slightly faster — your pace is well below conference speed.');
        else if (wpm > 180) notes.push('Slow down a touch — you are rushing past the committee.');
        else if (wpm >= 120 && wpm <= 160) notes.push('Pace is in the ideal range.');
        else notes.push('Pace is workable — small adjustments would help.');
    }

    if (fillerPerMin > 4) notes.push('Noticeable filler words — try pausing instead of filling.');
    else if (fillerPerMin > 0) notes.push('A few fillers. Acceptable, but watch for drift.');
    else notes.push('No filler words detected — clean delivery.');

    if (avgPauseSec > 3.5) notes.push('Long average pauses — tighten your sentence structure.');
    if (confidence != null && confidence < 60) {
        notes.push('Recognition confidence is low — speak clearly and directly into the mic.');
    }

    return notes.join(' ');
}