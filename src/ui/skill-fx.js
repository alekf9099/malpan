// 스킬 모션 — 게임 판(#layer)과 도감 '실전 미리 보기' 판에 같은 그림으로 그린다.
// 좌표는 그 층의 px, s 는 말 크기(px). 그림은 스킬 아이콘과 같은 굵은 먹선 + 납작한 색.
// 모두 끝날 때까지 기다릴 수 있는 Promise 를 돌려주고, 만든 요소는 스스로 치운다.

import { tween, sleep } from './anim.js';
import { skillArt } from './skill-art.js';
import { Sound } from './sound.js';

const K = 'stroke="#22201D" stroke-width="3" stroke-linejoin="round"';

function put(layer, cls, [x, y], html = '', z = 900) {
  const el = document.createElement('div');
  el.className = 'sfx ' + cls;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = z;
  el.innerHTML = html;
  layer.appendChild(el);
  return el;
}
const fadeOut = (el, ms = 260) => tween(el, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, fill: 'forwards' }).then(() => el.remove());

/** 튀어나왔다 떠오르며 사라지는 큰 글자 */
export function word(layer, [x, y], text, { color = '#F2B33D', ink = '#FFFDF7', s = 56, z = 990, rot = -6 } = {}) {
  const w = put(layer, 'sfx-word', [x, y], text, z);
  w.style.setProperty('--wc', color);
  w.style.setProperty('--wi', ink);
  w.style.fontSize = Math.round(s * 0.36) + 'px';
  return tween(w, [
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(.2)`, opacity: 0 },
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1.25)`, opacity: 1, offset: 0.18 },
    { transform: `translate(-50%,-50%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.3 },
    { transform: `translate(-50%,-90%) rotate(${rot}deg) scale(1)`, opacity: 1, offset: 0.8 },
    { transform: `translate(-50%,-120%) rotate(${rot}deg) scale(.9)`, opacity: 0 }
  ], { duration: 1150, easing: 'ease-out', fill: 'forwards' }).then(() => w.remove());
}

/** 퍼지는 고리 */
export function ripple(layer, [x, y], { color = '#FFFDF7', s = 56, z = 880, delay = 0 } = {}) {
  const r = put(layer, 'sfx-ripple', [x, y], '', z);
  r.style.width = r.style.height = s * 1.1 + 'px';
  r.style.borderColor = color;
  return tween(r, [{ transform: 'translate(-50%,-50%) scaleY(.5) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scaleY(.5) scale(2.6)', opacity: 0 }], { duration: 700, delay, easing: 'ease-out', fill: 'forwards' }).then(() => r.remove());
}

const COIN = '<svg viewBox="0 0 20 20" aria-hidden="true"><circle cx="10" cy="10" r="8" fill="#F2B33D" stroke="#22201D" stroke-width="2.4"/><path d="M7 7 L10 13 L13 7" fill="none" stroke="#22201D" stroke-width="1.8" stroke-linejoin="round"/></svg>';

/** 동전이 포물선을 그리며 건너간다(통행료·회식비) */
export async function coins(layer, from, to, { s = 56, z = 960, n = 4 } = {}) {
  const flights = [];
  for (let i = 0; i < n; i++) {
    const c = put(layer, 'sfx-coin', to, COIN, z);
    c.style.width = c.style.height = s * 0.36 + 'px';
    const dx = from[0] - to[0] + (Math.random() - 0.5) * s * 0.4, dy = from[1] - to[1], h = s;
    const frames = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      frames.push({ transform: `translate(-50%,-50%) translate(${dx * (1 - t)}px, ${dy * (1 - t) - h * 4 * t * (1 - t)}px)`, opacity: t > 0.92 ? 0.3 : 1 });
    }
    flights.push(sleep(i * 70).then(() => tween(c, frames, { duration: 480, easing: 'linear' })).then(() => c.remove()));
  }
  Sound.coin();
  await Promise.all(flights);
  Sound.toll(false);
}

// ── 직통 열차 ─────────────────────────────────────────────

/** 옆에서 본 지하철 한 칸(오른쪽을 본다). 띠는 호선 색 */
const trainSvg = (line) => `<svg viewBox="0 0 124 50" aria-hidden="true">
  <path d="M5 9 H92 Q119 9 119 33 V40 H5 Z" fill="#F4F1EA" ${K}/>
  <rect x="5" y="30" width="114" height="6" fill="${line}"/>
  <path d="M5 9 H92 Q119 9 119 33 V40 H5 Z" fill="none" ${K}/>
  <rect x="12" y="14" width="15" height="11" rx="2" fill="#BFE3F5" stroke="#22201D" stroke-width="2.2"/>
  <rect x="33" y="14" width="15" height="11" rx="2" fill="#BFE3F5" stroke="#22201D" stroke-width="2.2"/>
  <rect x="55" y="13" width="13" height="23" rx="1.5" fill="#D9D3C4" stroke="#22201D" stroke-width="2.2"/>
  <path d="M61.5 13 V36" stroke="#22201D" stroke-width="1.6"/>
  <path d="M76 14 H94 Q108 14 111 26 H76 Z" fill="#BFE3F5" stroke="#22201D" stroke-width="2.2"/>
  <circle cx="114" cy="34" r="2.6" fill="#F7C94A" stroke="#22201D" stroke-width="1.6"/>
  <rect x="2" y="40" width="120" height="4" rx="2" fill="#22201D"/>
  <circle cx="22" cy="44" r="4.5" fill="#6E6A5E" ${K}/><circle cx="40" cy="44" r="4.5" fill="#6E6A5E" ${K}/>
  <circle cx="86" cy="44" r="4.5" fill="#6E6A5E" ${K}/><circle cx="104" cy="44" r="4.5" fill="#6E6A5E" ${K}/>
</svg>`;

const angle = (a, b) => (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180) / Math.PI;
/** 왼쪽으로 갈 때는 뒤집어서 바퀴가 늘 아래로 */
function pose(a, b) {
  let r = angle(a, b), f = 1;
  if (r > 90 || r < -90) { f = -1; r = r > 0 ? r - 180 : r + 180; }
  return `rotate(${r * 0.5}deg) scaleX(${f})`;
}
const BASE = 'translate(-50%,-78%)';

/**
 * 열차 한 칸. arrive → (말 태우기) → run(길) → leave 순서로 쓴다.
 * rider: 앞 창에 보일 얼굴(html), z: 숫자 또는 y 로 깊이를 주는 함수
 */
export function train(layer, at, { s = 56, line = '#2F6FD0', rider = '', z = 900 } = {}) {
  const W = s * 2.3, H = (W * 50) / 124;
  const zOf = (y) => (typeof z === 'function' ? z(y) : z);
  const el = put(layer, 'sfx-train', at, `${trainSvg(line)}<span class="tr-rider">${rider}</span>`, zOf(at[1]) + 30);
  el.style.width = W + 'px';
  el.style.height = H + 'px';
  el.style.opacity = 0;
  let here = at, look = [at[0] + 1, at[1]];
  const smoke = (p) => {
    const puff = put(layer, 'sfx-puff', [p[0], p[1] - H * 0.5], '', zOf(p[1]) + 29);
    puff.style.width = puff.style.height = s * 0.32 + 'px';
    tween(puff, [{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0.85 }, { transform: `translate(-50%,-50%) translate(0,-${s * 0.5}px) scale(1.6)`, opacity: 0 }], { duration: 520 }).then(() => puff.remove());
  };
  return {
    el,
    /** 다음 역 쪽에서 반대로 미끄러져 들어와 선다 */
    async arrive(next) {
      look = next || look;
      const dx = look[0] - here[0], dy = look[1] - here[1], d = Math.hypot(dx, dy) || 1;
      const bx = (-dx / d) * W * 1.5, by = (-dy / d) * W * 1.5;
      Sound.horn();
      const a = await tween(el, [
        { transform: `translate(${bx}px,${by}px) ${BASE} ${pose(here, look)}`, opacity: 0 },
        { transform: `translate(${bx * 0.3}px,${by * 0.3}px) ${BASE} ${pose(here, look)}`, opacity: 1, offset: 0.5 },
        { transform: `${BASE} ${pose(here, look)}`, opacity: 1 }
      ], { duration: 560, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
      el.style.opacity = 1;
      el.style.transform = `${BASE} ${pose(here, look)}`;
      a.cancel();
      Sound.brake();
    },
    /** 역을 하나씩 지나간다. onStep(i, 점) 은 카메라 따라가기 등에 쓴다 */
    async run(pts, { speed = 0.75, onStep } = {}) {
      el.classList.add('moving');
      for (let k = 0; k < pts.length; k++) {
        const b = pts[k], a = here;
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 1) continue;
        const ms = Math.max(150, len / speed);
        const first = k === 0, last = k === pts.length - 1;
        el.style.left = b[0] + 'px';
        el.style.top = b[1] + 'px';
        el.style.zIndex = zOf(b[1]) + 30;
        onStep?.(k, b, ms);
        const an = await tween(el, [
          { transform: `translate(${a[0] - b[0]}px,${a[1] - b[1]}px) ${BASE} ${pose(a, b)}` },
          { transform: `${BASE} ${pose(a, b)}` }
        ], { duration: ms, easing: first && last ? 'ease-in-out' : first ? 'ease-in' : last ? 'ease-out' : 'linear', fill: 'forwards' });
        el.style.transform = `${BASE} ${pose(a, b)}`;
        an.cancel();
        Sound.rail(k);
        smoke(a);
        look = [b[0] + (b[0] - a[0]), b[1] + (b[1] - a[1])];
        here = b;
      }
      el.classList.remove('moving');
      Sound.brake();
    },
    /** 앞으로 빠져나가며 사라진다 */
    async leave() {
      const dx = look[0] - here[0], dy = look[1] - here[1], d = Math.hypot(dx, dy) || 1;
      Sound.horn();
      await tween(el, [
        { transform: `${BASE} ${pose(here, look)}`, opacity: 1 },
        { transform: `translate(${(dx / d) * W * 1.6}px,${(dy / d) * W * 1.6}px) ${BASE} ${pose(here, look)}`, opacity: 0 }
      ], { duration: 520, easing: 'cubic-bezier(.6,0,.9,.5)', fill: 'forwards' });
      el.remove();
    }
  };
}

/** 말이 열차에 오르거나(내리거나) — 작아지며 문 쪽으로 */
export async function board(pieceEl, on = true) {
  const frames = [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: 'translateY(-14px) scale(.35)', opacity: 0 }];
  await tween(pieceEl, on ? frames : frames.slice().reverse(), { duration: 220, easing: on ? 'ease-in' : 'cubic-bezier(.3,.7,.3,1.3)', fill: 'forwards' });
  pieceEl.style.visibility = on ? 'hidden' : '';
  pieceEl.getAnimations().forEach((a) => a.cancel());
}

// ── 출입 통제 ─────────────────────────────────────────────

/** 줄무늬 차단기가 내려와 꽂힌다 */
export async function gate(layer, at, { s = 56, z = 900, hold = 700 } = {}) {
  const g = put(layer, 'sfx-gate', at, '<i class="post"></i><i class="arm"></i><i class="lamp"></i>', z);
  g.style.setProperty('--s', s + 'px');
  const arm = g.querySelector('.arm');
  tween(g, [{ transform: 'translate(-50%,-100%) translateY(-30px)', opacity: 0 }, { transform: 'translate(-50%,-100%)', opacity: 1 }], { duration: 200, fill: 'forwards' });
  await sleep(180);
  await tween(arm, [{ transform: 'rotate(-80deg)' }, { transform: 'rotate(10deg)', offset: 0.55 }, { transform: 'rotate(-6deg)', offset: 0.78 }, { transform: 'rotate(0)' }], { duration: 520, easing: 'ease-in', fill: 'forwards' });
  Sound.clank();
  ripple(layer, at, { color: '#E0533D', s, z: z - 1 });
  word(layer, [at[0], at[1] - s * 1.6], '출입 통제!', { color: '#E0533D', s, z: z + 50 });
  await sleep(hold);
  await fadeOut(g, 240);
}

// ── 회식 소집 ─────────────────────────────────────────────

/** 잔이 부딪히고 부르는 물결이 퍼진다 */
export async function cheers(layer, at, { s = 56, z = 900 } = {}) {
  const m = put(layer, 'sfx-icon', [at[0], at[1] - s * 0.9], skillArt('gather', s * 1.1), z);
  await tween(m, [{ transform: 'translate(-50%,-50%) scale(0) rotate(-20deg)' }, { transform: 'translate(-50%,-50%) scale(1.25) rotate(8deg)', offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1) rotate(0)' }], { duration: 380, easing: 'cubic-bezier(.3,.7,.3,1.3)', fill: 'forwards' });
  Sound.clink();
  tween(m, [{ transform: 'translate(-50%,-50%) rotate(0)' }, { transform: 'translate(-50%,-50%) rotate(-12deg)' }, { transform: 'translate(-50%,-50%) rotate(10deg)' }, { transform: 'translate(-50%,-50%) rotate(0)' }], { duration: 420, fill: 'forwards' });
  for (let i = 0; i < 3; i++) ripple(layer, at, { color: '#F2B33D', s: s * 1.2, z: z - 1, delay: i * 180 });
  word(layer, [at[0], at[1] - s * 1.8], '회식 소집!', { color: '#E0533D', s, z: z + 50 });
  await sleep(700);
  fadeOut(m, 300);
}

/** 불려 오는 말: 크게 포물선을 그리며 날아와 내려앉는다(요소는 이미 도착 자리에 있어야 한다) */
export async function summon(pieceEl, from, to, { s = 56, delay = 0 } = {}) {
  const dx = from[0] - to[0], dy = from[1] - to[1], h = Math.max(s * 2, Math.hypot(dx, dy) * 0.35);
  const frames = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, e = t * t * (3 - 2 * t);
    frames.push({ transform: `translate(${dx * (1 - e)}px, ${dy * (1 - e) - h * 4 * t * (1 - t)}px) rotate(${(1 - t) * -360}deg) scale(${1 - 0.25 * Math.sin(Math.PI * t)})`, offset: t });
  }
  if (delay) await sleep(delay);
  Sound.whoosh();
  await tween(pieceEl, frames, { duration: 720, easing: 'linear' });
}

// ── 벼락치기 ─────────────────────────────────────────────

const BOLT = '<svg viewBox="0 0 30 60" aria-hidden="true"><path d="M19 1 L5 33 H15 L9 59 L27 21 H16 L23 1 Z" fill="#F7C94A" stroke="#22201D" stroke-width="2.6" stroke-linejoin="round"/></svg>';

/** 책이 펼쳐지고 번개가 그 역에 꽂힌다 */
export async function bolt(layer, at, { s = 56, z = 900 } = {}) {
  const book = put(layer, 'sfx-icon', [at[0], at[1] - s * 2.1], skillArt('cram', s * 0.95), z + 2);
  await tween(book, [{ transform: 'translate(-50%,-50%) scale(0) rotate(-30deg)' }, { transform: 'translate(-50%,-50%) scale(1.2) rotate(6deg)', offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1.3)', fill: 'forwards' });
  const b = put(layer, 'sfx-bolt', [at[0], at[1] - s * 0.4], BOLT, z + 1);
  b.style.width = s * 0.5 + 'px';
  b.style.height = s + 'px';
  Sound.zap();
  await tween(b, [{ transform: `translate(-50%,-100%) translateY(-${s * 1.4}px) scaleY(.2)`, opacity: 0 }, { transform: 'translate(-50%,-100%) scaleY(1.15)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 1 }], { duration: 180, easing: 'ease-in', fill: 'forwards' });
  const f = put(layer, 'sfx-flash', at, '', z - 1);
  f.style.width = f.style.height = s * 2.2 + 'px';
  tween(f, [{ transform: 'translate(-50%,-50%) scale(.3)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.3)', opacity: 0 }], { duration: 420 }).then(() => f.remove());
  ripple(layer, at, { color: '#F7C94A', s, z: z - 2 });
  await sleep(260);
  fadeOut(b, 200);
  fadeOut(book, 300);
}

// ── 떡상 ────────────────────────────────────────────────

/** 분홍 빛기둥이 서고 화살표가 치솟는다 */
export async function hype(layer, at, { s = 56, z = 900, hold = 600 } = {}) {
  const beam = put(layer, 'sfx-beam', at, '', z - 1);
  beam.style.width = s * 1.3 + 'px';
  beam.style.height = s * 4.2 + 'px';
  const up = put(layer, 'sfx-icon', [at[0], at[1] - s * 0.6], skillArt('hype', s), z + 2);
  Sound.rise();
  tween(beam, [{ transform: 'translate(-50%,-100%) scaleY(0)', opacity: 0.2 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 1 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  await tween(up, [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0 }, { transform: `translate(-50%,-50%) translateY(-${s * 1.8}px) scale(1.25)`, opacity: 1, offset: 0.75 }, { transform: `translate(-50%,-50%) translateY(-${s * 1.6}px) scale(1)`, opacity: 1 }], { duration: 640, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
  for (let i = 0; i < 7; i++) {
    const st = put(layer, 'sfx-star', [at[0] + (Math.random() - 0.5) * s * 1.6, at[1] - Math.random() * s * 3], '', z + 1);
    st.style.width = st.style.height = s * (0.18 + Math.random() * 0.14) + 'px';
    tween(st, [{ transform: 'translate(-50%,-50%) scale(0) rotate(0)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.3) rotate(90deg)', opacity: 1, offset: 0.5 }, { transform: 'translate(-50%,-50%) scale(0) rotate(180deg)', opacity: 0 }], { duration: 700, delay: i * 60 }).then(() => st.remove());
  }
  word(layer, [at[0], at[1] - s * 2.7], '떡상!', { color: '#E2588F', s, z: z + 50 });
  await sleep(hold);
  fadeOut(beam, 300);
  fadeOut(up, 300);
}

// ── 동시 배달 ─────────────────────────────────────────────

const BOX = '<svg viewBox="0 0 30 26" aria-hidden="true"><rect x="2" y="3" width="26" height="21" rx="2" fill="#E3AD6F" stroke="#22201D" stroke-width="2.6"/><path d="M15 3 V12 M2 10 H28" stroke="#22201D" stroke-width="2"/><rect x="11" y="3" width="8" height="6" fill="#C98A4B"/></svg>';

/** 말 머리 위로 상자 둘이 떨어져 쌓인다. 상자 요소들을 돌려준다(이동 뒤에 치운다) */
export async function boxes(layer, at, { s = 56, z = 900 } = {}) {
  const out = [];
  for (let i = 0; i < 2; i++) {
    const b = put(layer, 'sfx-box', [at[0] + (i ? 4 : -3), at[1] - s * (1.15 + i * 0.36)], BOX, z + 2 + i);
    b.style.width = s * 0.46 + 'px';
    b.style.height = s * 0.4 + 'px';
    out.push(b);
    tween(b, [{ transform: `translate(-50%,-50%) translateY(-${s * 1.6}px) rotate(${i ? 20 : -20}deg)`, opacity: 0 }, { transform: 'translate(-50%,-50%) translateY(3px) rotate(0)', opacity: 1, offset: 0.75 }, { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 }], { duration: 360, easing: 'ease-in', fill: 'forwards' });
    await sleep(170);
    Sound.stack();
  }
  word(layer, [at[0], at[1] - s * 2.4], '동시 배달!', { color: '#4C9A3A', s, z: z + 50 });
  await sleep(400);
  return out;
}

/** 상자를 말과 함께 옮긴다(이동 중 한 번씩) */
export function carry(list, at, s = 56) {
  list.forEach((b, i) => { b.style.left = at[0] + (i ? 4 : -3) + 'px'; b.style.top = at[1] - s * (1.15 + i * 0.36) + 'px'; });
}

// ── 수혈 ────────────────────────────────────────────────

const DROP = '<svg viewBox="0 0 20 26" aria-hidden="true"><path d="M10 1 C14 8 18 12 18 17 A8 8 0 0 1 2 17 C2 12 6 8 10 1 Z" fill="#E0533D" stroke="#22201D" stroke-width="2.2"/><path d="M6.5 15 Q6.5 12 8.5 10" stroke="#FFFDF7" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>';

/** 1등에게서 내게로 핏방울(=돈)이 이어진다 */
export async function transfuse(layer, from, to, { s = 56, z = 900, n = 5 } = {}) {
  const bag = put(layer, 'sfx-icon', [from[0], from[1] - s * 1.7], skillArt('transfuse', s * 0.8), z + 2);
  await tween(bag, [{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1.2)', offset: 0.6 }, { transform: 'translate(-50%,-50%) scale(1)' }], { duration: 300, easing: 'cubic-bezier(.3,.7,.3,1.3)', fill: 'forwards' });
  const a = [from[0], from[1] - s * 1.3], b = [to[0], to[1] - s * 0.9];
  const flights = [];
  for (let i = 0; i < n; i++) {
    const d = put(layer, 'sfx-drop', b, DROP, z + 3);
    d.style.width = s * 0.3 + 'px';
    d.style.height = s * 0.39 + 'px';
    const dx = a[0] - b[0], dy = a[1] - b[1], h = s * 1.4;
    const frames = [];
    for (let j = 0; j <= 8; j++) {
      const t = j / 8;
      frames.push({ transform: `translate(-50%,-50%) translate(${dx * (1 - t)}px, ${dy * (1 - t) - h * 4 * t * (1 - t)}px) scale(${0.6 + 0.6 * Math.sin(Math.PI * t)})`, opacity: t > 0.92 ? 0.3 : 1 });
    }
    flights.push(sleep(i * 110).then(() => { Sound.drip(i); return tween(d, frames, { duration: 520, easing: 'linear' }); }).then(() => d.remove()));
  }
  await Promise.all(flights);
  const heart = put(layer, 'sfx-heart', b, '+', z + 4);
  heart.style.width = heart.style.height = s * 0.7 + 'px';
  heart.style.fontSize = s * 0.5 + 'px';
  ripple(layer, to, { color: '#E0533D', s, z: z - 1 });
  word(layer, [to[0], to[1] - s * 2], '수혈!', { color: '#E0533D', s, z: z + 50 });
  await tween(heart, [{ transform: 'translate(-50%,-50%) scale(0)' }, { transform: 'translate(-50%,-50%) scale(1.4)', offset: 0.5 }, { transform: 'translate(-50%,-80%) scale(1)', opacity: 0 }], { duration: 600, easing: 'ease-out', fill: 'forwards' });
  heart.remove();
  fadeOut(bag, 250);
}

// ── 강제 매수 ─────────────────────────────────────────────

/** 경매 망치가 내려치고 '낙찰' 도장이 찍힌다 */
export async function gavel(layer, at, { s = 56, z = 900 } = {}) {
  const g = put(layer, 'sfx-gavel', [at[0] + s * 0.25, at[1] - s * 0.5], skillArt('buyout', s * 1.3), z + 2);
  await tween(g, [
    { transform: 'translate(-50%,-50%) translateY(-30px) rotate(-60deg)', opacity: 0 },
    { transform: 'translate(-50%,-50%) translateY(-20px) rotate(-70deg)', opacity: 1, offset: 0.45 },
    { transform: 'translate(-50%,-50%) rotate(12deg)', opacity: 1, offset: 0.8 },
    { transform: 'translate(-50%,-50%) rotate(0)', opacity: 1 }
  ], { duration: 520, easing: 'ease-in', fill: 'forwards' });
  Sound.gavel();
  ripple(layer, at, { color: '#C98A4B', s, z: z - 1 });
  const st = put(layer, 'sfx-stamp', [at[0], at[1] - s * 1.5], '낙찰', z + 40);
  st.style.fontSize = Math.round(s * 0.42) + 'px';
  await tween(st, [{ transform: 'translate(-50%,-50%) rotate(-12deg) scale(2.4)', opacity: 0 }, { transform: 'translate(-50%,-50%) rotate(-12deg) scale(.92)', opacity: 1, offset: 0.7 }, { transform: 'translate(-50%,-50%) rotate(-12deg) scale(1)', opacity: 1 }], { duration: 260, easing: 'ease-in', fill: 'forwards' });
  await sleep(650);
  fadeOut(st, 250);
  fadeOut(g, 250);
}
