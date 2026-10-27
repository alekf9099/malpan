// 효과음은 파일 없이 Web Audio 로 합성한다. 첫 탭 뒤에 켜진다(브라우저 자동 재생 정책).
// 음계는 국악 5음(궁상각치우: 다·라·마·솔·라)만 쓴다 — 짧은 소리여도 판의 분위기가 맞도록.

let ctx = null, master = null, noise = null;
let on = true;
try { on = localStorage.getItem('yut.sound') !== 'off'; } catch { /* 저장 불가 환경 */ }

const PENTA = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25, 783.99, 880.0];

function init() {
  if (ctx || !on) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  const len = ctx.sampleRate;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
}

function tone(freq, dur, { type = 'triangle', vol = 0.12, delay = 0, to } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.05);
}

function knock(freq, { vol = 0.35, delay = 0, dur = 0.07, q = 6 } = {}) {
  if (!ctx) return;
  const t = ctx.currentTime + delay, src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
}

export const Sound = {
  unlock() { init(); if (ctx?.state === 'suspended') ctx.resume(); },
  isOn: () => on,
  toggle() {
    on = !on;
    try { localStorage.setItem('yut.sound', on ? 'on' : 'off'); } catch { /* 저장 불가 환경 */ }
    if (!on && ctx) { ctx.close(); ctx = null; }
    if (on) init();
    return on;
  },
  /** 바닥에 떨어지는 소리: 열차 주사위가 데구르르 */
  clatter() {
    for (let i = 0; i < 7; i++) knock(2200 + Math.random() * 1400, { vol: 0.2, delay: i * 0.06 + Math.random() * 0.03, dur: 0.035, q: 14 });
  },
  toss() { knock(500, { vol: 0.12, dur: 0.18, q: 1 }); },
  /** 하늘에서 떨어지는 말 */
  drop() { tone(880, 0.25, { type: 'sine', vol: 0.06, to: 220 }); knock(160, { vol: 0.45, dur: 0.14, q: 1.2, delay: 0.38 }); },
  whoosh() { knock(900, { vol: 0.25, dur: 0.45, q: 0.6 }); tone(300, 0.4, { type: 'sine', vol: 0.04, to: 900 }); },
  stamp() { knock(180, { vol: 0.5, dur: 0.16, q: 1.4 }); tone(98, 0.18, { type: 'sine', vol: 0.2, to: 60 }); },
  step(i = 0) { knock(900 + (i % 3) * 120, { vol: 0.18, dur: 0.05, q: 12 }); },
  stack() { tone(PENTA[5], 0.12, { vol: 0.1 }); tone(PENTA[7], 0.14, { vol: 0.1, delay: 0.07 }); },
  capture() { tone(PENTA[8], 0.08, { type: 'square', vol: 0.06 }); tone(196, 0.3, { type: 'sawtooth', vol: 0.08, to: 70, delay: 0.05 }); knock(220, { vol: 0.4, dur: 0.2, q: 1, delay: 0.05 }); },
  caught() { tone(330, 0.4, { type: 'sawtooth', vol: 0.06, to: 110 }); },
  home() { [0, 2, 4, 7].forEach((n, i) => tone(PENTA[n + 2], 0.18, { vol: 0.1, delay: i * 0.08 })); },
  chip(n = 0) { tone(PENTA[Math.min(9, 3 + n)], 0.07, { type: 'square', vol: 0.045 }); },
  mult(n = 0) { tone(PENTA[Math.min(9, 5 + n)], 0.09, { type: 'square', vol: 0.05 }); knock(2600, { vol: 0.1, dur: 0.04 }); },
  score() { tone(PENTA[4], 0.1, { vol: 0.1 }); tone(PENTA[7], 0.16, { vol: 0.1, delay: 0.08 }); },
  coin() { tone(1318, 0.06, { type: 'square', vol: 0.05 }); tone(1760, 0.12, { type: 'square', vol: 0.05, delay: 0.06 }); },
  click() { knock(1800, { vol: 0.15, dur: 0.03, q: 10 }); },
  deny() { tone(150, 0.15, { type: 'square', vol: 0.05 }); },
  win() { [0, 1, 2, 4, 5, 7].forEach((n, i) => tone(PENTA[n], 0.22, { vol: 0.11, delay: i * 0.09 })); },
  lose() { [5, 4, 2, 0].forEach((n, i) => tone(PENTA[n] / 2, 0.36, { vol: 0.1, delay: i * 0.18 })); },
  heung(level = 1) { tone(PENTA[Math.min(9, 3 + level)], 0.12, { type: 'square', vol: 0.06 }); tone(PENTA[Math.min(9, 5 + level)], 0.16, { type: 'triangle', vol: 0.08, delay: 0.06 }); },
  heungLost() { tone(PENTA[7], 0.5, { type: 'sawtooth', vol: 0.05, to: 120 }); knock(300, { vol: 0.3, dur: 0.25, q: 1 }); },
  bundle() { tone(PENTA[6], 0.08, { vol: 0.07 }); tone(PENTA[8], 0.12, { vol: 0.07, delay: 0.07 }); },
  bundleGone() { knock(600, { vol: 0.12, dur: 0.2, q: 1 }); },
  big() { [0, 2, 4, 5, 7, 9].forEach((n, i) => tone(PENTA[n], 0.14, { type: 'square', vol: 0.05, delay: i * 0.05 })); knock(140, { vol: 0.5, dur: 0.3, q: 1 }); },
  penalty() { tone(220, 0.25, { type: 'square', vol: 0.06, to: 110 }); },
  skill() { tone(PENTA[2], 0.5, { type: 'sawtooth', vol: 0.05, to: PENTA[9] }); [0, 3, 5, 8].forEach((n, i) => tone(PENTA[n + 1], 0.12, { type: 'square', vol: 0.05, delay: 0.12 + i * 0.05 })); knock(140, { vol: 0.5, dur: 0.3, q: 1, delay: 0.1 }); },
  roar() { tone(140, 0.7, { type: 'sawtooth', vol: 0.12, to: 70 }); tone(210, 0.6, { type: 'square', vol: 0.05, to: 90 }); knock(90, { vol: 0.7, dur: 0.5, q: 0.8 }); },
  boss() { tone(110, 0.6, { type: 'sawtooth', vol: 0.08, to: 82 }); knock(120, { vol: 0.5, dur: 0.4, q: 1 }); }
};
