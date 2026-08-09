// ── Void Rush 3D — sound effects + chiptune BGM ─────────────────
// Synthesised with the Web Audio API (no asset files). Call ensureAudio()
// from a user gesture (click) to unlock playback.

let ctx = null;

export function ensureAudio() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch { return; } }
  if (ctx.state === 'suspended') ctx.resume();
}

// browsers auto-suspend the AudioContext for backgrounded tabs and don't
// always auto-resume it on their own — without this, switching away and
// back can leave the game permanently silent
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && ctx && ctx.state === 'suspended') ctx.resume();
});

function beep(freq, dur, type = 'square', vol = 0.05, slideTo = null) {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  gain.gain.setValueAtTime(vol, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(gain).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + dur);
}

// a short buffer of white noise, reused for every noise-based hit —
// explosions and the drum channel (kick/snare/hihat)
let noiseBuffer = null;
function getNoiseBuffer() {
  if (noiseBuffer) return noiseBuffer;
  const len = ctx.sampleRate;
  noiseBuffer = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return noiseBuffer;
}
function noiseBurst(dest, when, dur, vol, filterType, freqFrom, freqTo) {
  if (!ctx) return;
  const src = ctx.createBufferSource();
  src.buffer = getNoiseBuffer();
  const filt = ctx.createBiquadFilter();
  filt.type = filterType;
  filt.frequency.setValueAtTime(freqFrom, when);
  if (freqTo != null) filt.frequency.exponentialRampToValueAtTime(Math.max(freqTo, 20), when + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, when);
  g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  src.connect(filt).connect(g).connect(dest);
  src.start(when); src.stop(when + dur + 0.05);
}

// a soft-clip waveshaper curve — used only on the explosion's mid "boom"
// layer, to give it some grit instead of a clean filtered-noise whoosh
let distCurve = null;
function getDistCurve() {
  if (distCurve) return distCurve;
  const n = 8192, k = 65;
  distCurve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / n - 1;
    distCurve[i] = ((3 + k) * x * 20 * Math.PI / 180) / (Math.PI + k * Math.abs(x));
  }
  return distCurve;
}

// bomb-burst: a short bright crack, a tight distorted "body" noise burst,
// and two kick-drum-style punches (fast pitch drop + tight decay, one right
// after the other) for a "boom-BOOM" double-hit feel, plus a loud long
// rumble tail for aftermath/scale
function thump(when, freq0, freq1, dur, peak) {
  const kick = ctx.createOscillator();
  const kickShaper = ctx.createWaveShaper();
  kickShaper.curve = getDistCurve();
  const kickGain = ctx.createGain();
  kick.type = 'sine';
  kick.frequency.setValueAtTime(freq0, when);
  kick.frequency.exponentialRampToValueAtTime(freq1, when + dur * 0.3);
  kickGain.gain.setValueAtTime(0.001, when);
  kickGain.gain.exponentialRampToValueAtTime(peak, when + 0.006);
  kickGain.gain.exponentialRampToValueAtTime(0.0001, when + dur);
  kick.connect(kickShaper).connect(kickGain).connect(ctx.destination);
  kick.start(when); kick.stop(when + dur + 0.02);
  const subOsc = ctx.createOscillator();
  const subGain = ctx.createGain();
  subOsc.type = 'sine';
  subOsc.frequency.setValueAtTime(freq0 * 0.35, when);
  subOsc.frequency.exponentialRampToValueAtTime(freq1 * 0.55, when + dur);
  subGain.gain.setValueAtTime(0.001, when);
  subGain.gain.exponentialRampToValueAtTime(peak * 0.55, when + 0.02);
  subGain.gain.exponentialRampToValueAtTime(0.0001, when + dur * 1.5);
  subOsc.connect(subGain).connect(ctx.destination);
  subOsc.start(when); subOsc.stop(when + dur * 1.55);
}

function explosion() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noiseBurst(ctx.destination, t, 0.03, 0.46, 'highpass', 4000, 7500);
  const boomSrc = ctx.createBufferSource();
  boomSrc.buffer = getNoiseBuffer();
  const boomFilt = ctx.createBiquadFilter();
  boomFilt.type = 'lowpass';
  boomFilt.frequency.setValueAtTime(3000, t);
  boomFilt.frequency.exponentialRampToValueAtTime(100, t + 0.3);
  const shaper = ctx.createWaveShaper();
  shaper.curve = getDistCurve();
  shaper.oversample = '4x';
  const boomGain = ctx.createGain();
  boomGain.gain.setValueAtTime(0.001, t);
  boomGain.gain.exponentialRampToValueAtTime(0.6, t + 0.006);
  boomGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
  boomSrc.connect(boomFilt).connect(shaper).connect(boomGain).connect(ctx.destination);
  boomSrc.start(t); boomSrc.stop(t + 0.34);
  thump(t, 190, 30, 0.24, 0.68);
  thump(t + 0.1, 130, 24, 0.4, 0.36);
  noiseBurst(ctx.destination, t + 0.08, 1.6, 0.21, 'lowpass', 260, 25);
  noiseBurst(ctx.destination, t + 0.16, 0.18, 0.08, 'bandpass', 1200, 700);
  noiseBurst(ctx.destination, t + 0.34, 0.14, 0.05, 'bandpass', 1500, 900);
}

// boss growl: a wobbling low sawtooth (LFO-modulated) plus filtered noise grit
function growl() {
  if (!ctx) return;
  const t = ctx.currentTime;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const filt = ctx.createBiquadFilter();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(75, t);
  osc.frequency.exponentialRampToValueAtTime(42, t + 0.9);
  lfo.type = 'sine'; lfo.frequency.setValueAtTime(7.5, t);
  lfoGain.gain.setValueAtTime(16, t);
  lfo.connect(lfoGain).connect(osc.frequency);
  filt.type = 'lowpass'; filt.frequency.setValueAtTime(340, t);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.24, t + 0.09);
  g.gain.linearRampToValueAtTime(0.17, t + 0.5);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.95);
  osc.connect(filt).connect(g).connect(ctx.destination);
  lfo.start(t); lfo.stop(t + 0.95);
  osc.start(t); osc.stop(t + 0.95);
  noiseBurst(ctx.destination, t, 0.9, 0.05, 'bandpass', 150, 90);
}
// boss alert: two rising square-wave stingers, klaxon-style
function alertSiren() {
  if (!ctx) return;
  const t = ctx.currentTime;
  for (let i = 0; i < 2; i++) {
    const start = t + i * 0.22;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(440, start);
    osc.frequency.exponentialRampToValueAtTime(880, start + 0.16);
    g.gain.setValueAtTime(0.0001, start);
    g.gain.linearRampToValueAtTime(0.09, start + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, start + 0.18);
    osc.connect(g).connect(ctx.destination);
    osc.start(start); osc.stop(start + 0.2);
  }
}
// tesla zap: a bright noise crackle + a fast downward-sweeping tone
function zap() {
  if (!ctx) return;
  const t = ctx.currentTime;
  noiseBurst(ctx.destination, t, 0.014, 0.42, 'highpass', 6500, 9500);
  for (let i = 0; i < 4; i++) {
    const dt = i * 0.013 + Math.random() * 0.008;
    noiseBurst(ctx.destination, t + dt, 0.01, 0.1 + Math.random() * 0.08, 'highpass', 4000 + Math.random() * 3000, 7000);
  }
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = 'sawtooth';
  osc.frequency.setValueAtTime(2600, t);
  osc.frequency.exponentialRampToValueAtTime(3400, t + 0.015);
  osc.frequency.exponentialRampToValueAtTime(280, t + 0.11);
  g.gain.setValueAtTime(0.001, t);
  g.gain.exponentialRampToValueAtTime(0.13, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
  osc.connect(g).connect(ctx.destination);
  osc.start(t); osc.stop(t + 0.13);
  noiseBurst(ctx.destination, t + 0.02, 0.24, 0.055, 'lowpass', 320, 90);
}

// ── chiptune BGM ── two step-sequenced 8-bit style loops (peaceful / war),
// both always scheduling in the background; switching mode just crossfades
// their gains so there's never a restart click when a wave starts/ends.
const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const freqCache = {};
function freq(note) {
  if (freqCache[note]) return freqCache[note];
  const m = /^([A-G]#?)(\d)$/.exec(note);
  const idx = NOTE_NAMES.indexOf(m[1]);
  const octave = parseInt(m[2], 10);
  const midi = (octave + 1) * 12 + idx;
  const f = 440 * Math.pow(2, (midi - 69) / 12);
  freqCache[note] = f;
  return f;
}
// atk/rel let each theme choose its own envelope shape — war keeps the
// near-instant chip-gate feel (default), peaceful uses a longer, softer
// fade in/out so notes blend into each other instead of snapping
function playNote(dest, when, dur, f, type, vol, atk = 0.006, rel = null) {
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(f, when);
  const r = rel != null ? Math.min(rel, dur * 0.85) : Math.min(0.03, dur * 0.3);
  g.gain.setValueAtTime(0.0001, when);
  g.gain.linearRampToValueAtTime(vol, when + atk);
  g.gain.setValueAtTime(vol, when + Math.max(dur - r, atk));
  g.gain.linearRampToValueAtTime(0.0001, when + dur);
  osc.connect(g).connect(dest);
  osc.start(when); osc.stop(when + dur + 0.02);
}

// each chord is [root, third, fifth, octave] — melody/arp patterns index
// into this per 16th-note step (null = rest); bass/kick/snare/hat are step
// lists. One bar per chord, so `chords.length` bars per full loop.
const PEACE = {
  bpm: 112,
  chords: [
    ['C4', 'E4', 'G4', 'C5'],   // C  (I)
    ['A3', 'C4', 'E4', 'A4'],   // Am (vi)
    ['F3', 'A3', 'C4', 'F4'],   // F  (IV)
    ['G3', 'B3', 'D4', 'G4'],   // G  (V)
  ],
  melody: [0, null, 1, null, 2, 1, null, 0, 2, null, 3, 2, null, 1, 0, null],
  arp:    [0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1, 0, 1, 2, 1],
  bass:   [0, 4, 8, 12],
  kick:   [0, 8],
  snare:  [],
  hat:    [2, 6, 10, 14],
  // softer/rounder than the war theme: triangle instead of square/sawtooth,
  // slower attack/release, and quieter overall
  melodyType: 'triangle', melodyVol: 0.06, melodyAtk: 0.05, melodyRel: 0.24,
  arpType: 'triangle',    arpVol: 0.02,   arpAtk: 0.02,  arpRel: 0.12,
  bassVol: 0.11, bassAtk: 0.02, bassRel: 0.1,
  kickVol: 0.13, snareVol: 0.14, hatVol: 0.032,
};
const WAR = {
  bpm: 152,
  chords: [
    ['A3', 'C4', 'E4', 'A4'],   // Am (i)
    ['G3', 'B3', 'D4', 'G4'],   // G  (VII)
    ['F3', 'A3', 'C4', 'F4'],   // F  (VI)
    ['E3', 'G#3', 'B3', 'E4'],  // E  (V, major for tension)
  ],
  melody: [0, 0, 2, null, 1, 2, 0, null, 2, 1, 0, null, 2, 3, 2, 1],
  arp:    [0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2, 0, 2, 1, 2],
  bass:   [0, 2, 4, 6, 8, 10, 12, 14],
  kick:   [0, 8],
  snare:  [4, 12],
  hat:    [0, 2, 4, 6, 8, 10, 12, 14],
  melodyType: 'square',   melodyVol: 0.075, melodyAtk: 0.006, melodyRel: null,
  arpType: 'sawtooth',    arpVol: 0.032,    arpAtk: 0.006,    arpRel: null,
  bassVol: 0.15, bassAtk: 0.006, bassRel: null,
  kickVol: 0.22, snareVol: 0.17, hatVol: 0.05,
};

const BOSS = {
  bpm: 168,
  chords: [
    ['E3', 'G3', 'A#3', 'E4'],
    ['D3', 'F3', 'G#3', 'D4'],
    ['C3', 'D#3', 'F#3', 'C4'],
    ['B2', 'D3', 'F3', 'B3'],
  ],
  melody: [0, 0, 2, 3, 2, 0, null, 2, 0, 0, 2, 3, 2, 3, 2, null],
  arp:    [0, 2, 3, 2, 0, 2, 3, 2, 0, 2, 3, 2, 0, 2, 3, 2],
  bass:   [0, 2, 4, 6, 8, 10, 12, 14],
  kick:   [0, 4, 8, 12],
  snare:  [2, 6, 10, 14],
  hat:    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  melodyType: 'sawtooth', melodyVol: 0.085, melodyAtk: 0.004, melodyRel: null,
  arpType: 'square',      arpVol: 0.04,     arpAtk: 0.004,    arpRel: null,
  bassVol: 0.18, bassAtk: 0.004, bassRel: null,
  kickVol: 0.26, snareVol: 0.2, hatVol: 0.06,
};

const bgm = { started: false, peacefulGain: null, warGain: null, bossGain: null, peacefulTimer: null, warTimer: null, bossTimer: null };

function scheduleChiptune(theme, cfg, startTime) {
  if (!ctx || !bgm.started) return;
  // if the main thread stalled (heavy rendering, GC pause, backgrounded tab)
  // long enough that startTime already passed, resync instead of scheduling
  // a whole bar's worth of notes in the past — that's what caused the
  // "breaks up then goes silent" bug (compressed/overlapping envelopes,
  // then drift compounding forever since the old fixed delay never corrected)
  if (startTime < ctx.currentTime) startTime = ctx.currentTime + 0.05;
  const g = theme === 'war' ? bgm.warGain : theme === 'boss' ? bgm.bossGain : bgm.peacefulGain;
  const stepDur = 60 / cfg.bpm / 4;   // 16th note
  const barDur = stepDur * 16;
  cfg.chords.forEach((chord, barIdx) => {
    const barStart = startTime + barIdx * barDur;
    cfg.melody.forEach((deg, step) => {
      if (deg == null) return;
      playNote(g, barStart + step * stepDur, stepDur * 1.7, freq(chord[deg]), cfg.melodyType, cfg.melodyVol, cfg.melodyAtk, cfg.melodyRel);
    });
    cfg.arp.forEach((deg, step) => {
      playNote(g, barStart + step * stepDur, stepDur * 0.85, freq(chord[deg]), cfg.arpType, cfg.arpVol, cfg.arpAtk, cfg.arpRel);
    });
    cfg.bass.forEach((step, i) => {
      const gap = (cfg.bass[i + 1] ?? 16) - step;
      playNote(g, barStart + step * stepDur, stepDur * gap * 0.92, freq(chord[0]) / 2, 'triangle', cfg.bassVol, cfg.bassAtk, cfg.bassRel);
    });
    cfg.kick.forEach(step => noiseBurst(g, barStart + step * stepDur, 0.09, cfg.kickVol, 'lowpass', 900, 90));
    cfg.snare.forEach(step => noiseBurst(g, barStart + step * stepDur, 0.08, cfg.snareVol, 'bandpass', 1800, 1500));
    cfg.hat.forEach(step => noiseBurst(g, barStart + step * stepDur, 0.03, cfg.hatVol, 'highpass', 5500, null));
  });
  const totalDur = barDur * cfg.chords.length;
  const nextStart = startTime + totalDur;
  const key = theme === 'war' ? 'warTimer' : theme === 'boss' ? 'bossTimer' : 'peacefulTimer';
  const delayMs = Math.max(50, (nextStart - ctx.currentTime - 0.25) * 1000);
  bgm[key] = setTimeout(() => scheduleChiptune(theme, cfg, nextStart), delayMs);
}

export const music = {
  // starts both loops (idempotent) — call once from a user gesture
  start() {
    if (bgm.started || !ctx) return;
    bgm.started = true;
    bgm.peacefulGain = ctx.createGain();
    bgm.peacefulGain.gain.value = 0.42;
    bgm.peacefulGain.connect(ctx.destination);
    bgm.warGain = ctx.createGain();
    bgm.warGain.gain.value = 0;
    bgm.warGain.connect(ctx.destination);
    bgm.bossGain = ctx.createGain();
    bgm.bossGain.gain.value = 0;
    bgm.bossGain.connect(ctx.destination);
    const t = ctx.currentTime + 0.15;
    scheduleChiptune('peace', PEACE, t);
    scheduleChiptune('war', WAR, t);
  },
  // 'peaceful' | 'war' | 'boss' | 'off' — crossfades between the loops.
  // boss is by far the densest track (16 hats + 16 arp notes every bar), so
  // unlike peace/war it isn't left scheduling in the background all the time
  // — that tripled the steady-state note-scheduling load and was bringing
  // back the old "breaks up then goes silent" stall bug. It's only scheduled
  // while actually needed: started fresh on entering boss mode, stopped on exit.
  setMode(mode) {
    if (!ctx || !bgm.started) return;
    if (mode === 'boss' && !bgm.bossTimer) {
      scheduleChiptune('boss', BOSS, ctx.currentTime + 0.05);
    } else if (mode !== 'boss' && bgm.bossTimer) {
      clearTimeout(bgm.bossTimer);
      bgm.bossTimer = null;
    }
    const t = ctx.currentTime, fade = 1.1;
    const set = (node, target) => {
      node.gain.cancelScheduledValues(t);
      node.gain.setValueAtTime(node.gain.value, t);
      node.gain.linearRampToValueAtTime(target, t + fade);
    };
    set(bgm.peacefulGain, mode === 'peaceful' ? 0.42 : 0);
    set(bgm.warGain, mode === 'war' ? 0.4 : 0);
    set(bgm.bossGain, mode === 'boss' ? 0.44 : 0);
  },
};

export const sfx = {
  shoot(type) {
    if (type === 'laser')       beep(1200, 0.07, 'sawtooth', 0.08, 1900);
    else if (type === 'cannon') beep(150, 0.12, 'square', 0.13, 60);
    else if (type === 'frost')  beep(700, 0.08, 'sine', 0.075, 500);
    else if (type === 'tesla')  zap();
    else                        beep(520, 0.06, 'triangle', 0.09, 360);
  },
  hit()      { beep(230, 0.05, 'triangle', 0.03); },
  die()      { beep(420, 0.16, 'square', 0.05, 110); },
  place()    { beep(320, 0.10, 'sine', 0.07, 560); },
  leak()     { explosion(); },
  wave()     { beep(520, 0.16, 'square', 0.05, 820); },
  over(win)  { win ? beep(600, 0.5, 'square', 0.06, 1000) : beep(200, 0.6, 'sawtooth', 0.07, 70); },
  bossAlert() { alertSiren(); growl(); },
  bossGrowl() { growl(); },
};
