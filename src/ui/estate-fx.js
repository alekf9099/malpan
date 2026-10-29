// 땅 연출 — 사기는 깃발 꽂기, 인수는 깃발 바꿔 꽂기, 증축은 건물이 솟기(랜드마크는 빛기둥).
// 좌표는 판(#layer) px, s 는 말 크기. onHit 은 땅에 닿는 순간(그때 판을 다시 칠한다).
// 땅에 닿을 때까지만 기다리고, 남은 여운(펄럭임·사라짐)은 알아서 치운다.

import { tween, sleep } from './anim.js';
import { Sound } from './sound.js';

const INK = '#22201D';

function put(layer, cls, [x, y], html, z) {
  const el = document.createElement('div');
  el.className = 'efx ' + cls;
  el.style.left = x + 'px';
  el.style.top = y + 'px';
  el.style.zIndex = z;
  el.innerHTML = html;
  layer.appendChild(el);
  return el;
}
const fadeOut = (el, ms = 260, delay = 0) => tween(el, [{ opacity: 1 }, { opacity: 0 }], { duration: ms, delay, fill: 'forwards' }).then(() => el.remove());

const flagSvg = (c) => `<svg viewBox="0 0 40 48" aria-hidden="true">
  <path d="M9 46V5" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
  <path class="cloth" d="M10 6h24l-6 8 6 8H10z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <path d="M19 9.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#FFFDF7" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
  <ellipse cx="9" cy="46" rx="6" ry="2" fill="rgba(34,32,29,.3)"/></svg>`;

/** 단계별 건물(아래 가운데가 바닥). 2 = 역사 증축, 3 = 랜드마크 탑 */
const BUILDING = {
  2: (c) => `<svg viewBox="0 0 60 80" aria-hidden="true">
    <rect x="10" y="32" width="40" height="45" rx="4" fill="#FFFDF7" stroke="${INK}" stroke-width="3"/>
    <path d="M5 35 L30 13 L55 35 Z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="16" y="42" width="9" height="9" rx="1.5" fill="#BFE3F5" stroke="${INK}" stroke-width="2"/><rect x="35" y="42" width="9" height="9" rx="1.5" fill="#BFE3F5" stroke="${INK}" stroke-width="2"/>
    <rect x="25" y="58" width="10" height="19" rx="2" fill="${c}" stroke="${INK}" stroke-width="2.4"/>
    <circle cx="30" cy="27" r="4" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/></svg>`,
  3: (c) => `<svg viewBox="0 0 60 80" aria-hidden="true">
    <rect x="19" y="20" width="22" height="57" rx="3" fill="#FFFDF7" stroke="${INK}" stroke-width="3"/>
    <path d="M23 28h14M23 36h14M23 44h14" stroke="#BFE3F5" stroke-width="4"/>
    <path d="M22 20 L30 4 L38 20 Z" fill="${c}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <rect x="7" y="52" width="46" height="25" rx="4" fill="${c}" stroke="${INK}" stroke-width="3"/>
    <rect x="13" y="58" width="8" height="8" rx="1.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/><rect x="39" y="58" width="8" height="8" rx="1.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/>
    <rect x="25" y="62" width="10" height="15" rx="2" fill="#FFFDF7" stroke="${INK}" stroke-width="2.4"/>
    <path d="M30 -1l1.8 3.7 4 .6-2.9 2.8.7 4L30 8.2l-3.6 1.9.7-4-2.9-2.8 4-.6z" fill="#F2B33D" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/></svg>`
};

/** 바닥에서 피어오르는 먼지 몇 점 */
function puffs(layer, [x, y], s, z, n = 4) {
  for (let i = 0; i < n; i++) {
    const side = i % 2 ? 1 : -1;
    const p = put(layer, 'efx-puff', [x + side * s * (0.25 + 0.1 * i), y - 4], '', z + 1);
    p.style.width = p.style.height = s * (0.28 + 0.06 * (i % 3)) + 'px';
    tween(p, [{ transform: 'translate(-50%,-50%) scale(.4)', opacity: 0.95 }, { transform: `translate(-50%,-50%) translate(${side * s * 0.45}px,-${s * 0.3}px) scale(1.5)`, opacity: 0 }], { duration: 520, delay: i * 40 }).then(() => p.remove());
  }
}

/** 깃발 꽂기. from 이 있으면 그 색 깃발이 먼저 뽑혀 날아간다(인수) */
export async function plant(layer, at, { s = 56, z = 900, color = '#F2B33D', from = null, quick = false, onHit = () => {} } = {}) {
  const [x, y] = at, base = [x + s * 0.3, y + 2];
  const size = (el) => { el.style.width = s * 0.85 + 'px'; el.style.height = s * 1.02 + 'px'; };
  if (from) {
    const old = put(layer, 'efx-flag', base, flagSvg(from), z);
    size(old);
    await sleep(quick ? 80 : 160);
    Sound.whoosh();
    tween(old, [{ transform: 'translate(-22%,-96%) rotate(0)', opacity: 1 }, { transform: `translate(-22%,-96%) translate(${s * 0.5}px,-${s * 1.1}px) rotate(220deg)`, opacity: 1, offset: 0.5 }, { transform: `translate(-22%,-96%) translate(${s * 0.9}px,${s * 0.2}px) rotate(420deg) scale(.5)`, opacity: 0 }], { duration: 520, easing: 'cubic-bezier(.2,.6,.4,1)', fill: 'forwards' }).then(() => old.remove());
    await sleep(quick ? 120 : 220);
  }
  const f = put(layer, 'efx-flag', base, flagSvg(color), z);
  size(f);
  await tween(f, [
    { transform: `translate(-22%,-96%) translateY(-${s * 2.2}px) rotate(-14deg)`, opacity: 0 },
    { transform: 'translate(-22%,-96%) translateY(-6px) rotate(-4deg)', opacity: 1, offset: 0.7 },
    { transform: 'translate(-22%,-96%) scale(1.2,.78)', opacity: 1, offset: 0.84 },
    { transform: 'translate(-22%,-96%) scale(1)', opacity: 1 }
  ], { duration: quick ? 280 : 400, easing: 'cubic-bezier(.5,0,.7,1)', fill: 'forwards' });
  Sound.stamp();
  puffs(layer, base, s, z, 3);
  onHit();
  f.classList.add('wave');
  fadeOut(f, 280, quick ? 380 : 900);
  await sleep(quick ? 120 : 260);
}

/**
 * 건물이 땅에서 솟는다. 랜드마크면 금빛 기둥과 별.
 * art 를 주면(순환선 칸의 입체 건물) 그 그림을 at 자리에 size 크기로, anchor(%) 를 바닥으로 삼아 세운다 — 판에 남을 건물과 같은 그림
 */
export async function rise(layer, at, { s = 56, z = 900, color = '#F2B33D', level = 2, quick = false, onHit = () => {}, art = null, size = null, anchor = [50, 100] } = {}) {
  const [x, y] = at, lv = art ? level : Math.min(3, Math.max(2, level));
  const w = size ? size[0] : s * (lv === 3 ? 1.3 : 1.15), h = size ? size[1] : w * (80 / 60);
  const base = art ? [x, y] : [x - s * 0.45, y + 4];
  const T = `translate(-${anchor[0]}%,-${anchor[1]}%)`;
  let beam = null;
  if (lv === 3) {
    beam = put(layer, 'efx-beam', base, '', z - 1);
    beam.style.width = s * 1.2 + 'px';
    beam.style.height = s * 4 + 'px';
    tween(beam, [{ transform: 'translate(-50%,-100%) scaleY(0)', opacity: 0.3 }, { transform: 'translate(-50%,-100%) scaleY(1)', opacity: 1 }], { duration: 360, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' });
    Sound.rise();
  }
  const b = put(layer, 'efx-bld', base, art || BUILDING[lv](color), z);
  b.style.width = w + 'px';
  b.style.height = h + 'px';
  b.style.transformOrigin = `${anchor[0]}% ${anchor[1]}%`;
  puffs(layer, base, s, z, 4);
  Sound.clank();
  await tween(b, [
    { transform: `${T} scale(.7,0)` },
    { transform: `${T} scale(.88,1.22)`, offset: 0.55 },
    { transform: `${T} scale(1.12,.86)`, offset: 0.78 },
    { transform: `${T} scale(1)` }
  ], { duration: quick ? 380 : 560, easing: 'cubic-bezier(.3,.7,.3,1)', fill: 'forwards' });
  onHit();
  if (lv === 3) {
    for (let i = 0; i < 8; i++) {
      const st = put(layer, 'efx-star', [base[0] + (Math.random() - 0.5) * s * 1.6, base[1] - h * (0.3 + Math.random() * 0.9)], '', z + 2);
      st.style.width = st.style.height = s * (0.16 + Math.random() * 0.12) + 'px';
      tween(st, [{ transform: 'translate(-50%,-50%) scale(0) rotate(0)', opacity: 1 }, { transform: 'translate(-50%,-50%) scale(1.3) rotate(90deg)', opacity: 1, offset: 0.5 }, { transform: 'translate(-50%,-50%) scale(0) rotate(180deg)', opacity: 0 }], { duration: 640, delay: i * 50 }).then(() => st.remove());
    }
    fadeOut(beam, 320, quick ? 200 : 500);
  }
  // 판에 같은 건물이 그려졌으니 겹친 그림은 곧 걷는다
  fadeOut(b, art ? 160 : 280, art ? 60 : quick ? 380 : 900);
  await sleep(quick ? 120 : 260);
}
