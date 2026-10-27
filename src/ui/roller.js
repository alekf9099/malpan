// 2D 열차 주사위 — three.js(roller3d)를 못 불러왔을 때 쓰는 대체 그림과, 타이틀 장식 아이콘.

import { tween, sleep } from './anim.js';
import { METRO_FACES } from '../core/boards/seoul.js';

const INK = '#22201D';

/** 급행 면의 열차 그림(3D 주사위 면에도 쓴다) */
export const TRAIN_SVG = '<rect x="20" y="22" width="60" height="50" rx="14" fill="#FFFDF7" stroke="#22201D" stroke-width="5"/><rect x="29" y="31" width="17" height="15" rx="3" fill="#22201D"/><rect x="54" y="31" width="17" height="15" rx="3" fill="#22201D"/><circle cx="34" cy="60" r="4" fill="#E0533D"/><circle cx="66" cy="60" r="4" fill="#E0533D"/><path d="M30 84l8-12M70 84l-8-12" stroke="#22201D" stroke-width="5" stroke-linecap="round"/>';
const metroFace = (f) => f === 'express'
  ? `<svg viewBox="0 0 100 100" style="background:#2F6BD8">${TRAIN_SVG}</svg>`
  : `<svg viewBox="0 0 100 100"><text x="50" y="68" text-anchor="middle" font-family="Gasoek One, sans-serif" font-size="58" fill="${INK}">${f}</text></svg>`;
const metroFaces = () => Object.fromEntries(METRO_FACES.map((f, i) => [i + 1, metroFace(f)]));

// 면 번호 1~6 이 정면에 오도록 하는 회전
const SHOW = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(-90deg) rotateY(0deg)',
  3: 'rotateX(0deg) rotateY(-90deg)',
  4: 'rotateX(0deg) rotateY(90deg)',
  5: 'rotateX(90deg) rotateY(0deg)',
  6: 'rotateX(0deg) rotateY(180deg)'
};
const TILT = 'rotateX(-22deg) rotateY(28deg)';

function cube(faces) {
  // faces: 면 1~6 의 그림. 앞=1 위=2 오른쪽=3 왼쪽=4 아래=5 뒤=6
  const pos = ['', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
  return `<div class="die chess">${[1, 2, 3, 4, 5, 6].map((n) => `<div class="face ${pos[n]}">${faces[n]}</div>`).join('')}</div>`;
}

/** 굴리기 전 모습 */
export function idle(container) {
  container.innerHTML = `<div class="dice-tray">${cube(metroFaces())}</div>`;
  container.querySelector('.die').style.transform = `${TILT} ${SHOW[6]}`;
}

/** 굴리는 연출. 끝나면 결과 면이 보이는 상태로 멈춘다. who === 'opp' 면 작고 빠르게. */
export async function animate(container, board, roll, who = 'me') {
  const fast = who === 'opp';
  container.innerHTML = `<div class="dice-tray ${fast ? 'opp' : ''}">${cube(metroFaces())}</div>`;
  const die = container.querySelector('.die');
  const face = METRO_FACES.indexOf(roll.face) + 1;
  const rx = 720 + Math.floor(Math.random() * 3) * 90, ry = 540 + Math.floor(Math.random() * 3) * 90;
  const final = `${TILT} ${SHOW[face]}`;
  die.style.transform = final;
  await tween(die, [
    { transform: `translate(-40px, -130px) ${TILT} rotateX(${rx}deg) rotateY(${ry}deg)`, opacity: 0 },
    { transform: `translate(-10px, 6px) ${TILT} rotateX(${rx / 3}deg) rotateY(${ry / 3}deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(0, -18px) ${TILT} rotateX(30deg) rotateY(20deg)`, offset: 0.75 },
    { transform: `translate(0, 0) ${final}` }
  ], { duration: fast ? 520 : 820, easing: 'cubic-bezier(.3,.7,.4,1)' });
  await sleep(40);
}

/** 타이틀 장식: 열차 주사위 급행 면 */
export function metroDieIcon() {
  return `<span class="die-icon"><svg viewBox="0 0 100 100" width="54" height="54"><rect x="6" y="6" width="88" height="88" rx="20" fill="#2F6BD8" stroke="#22201D" stroke-width="7"/><g transform="translate(12 8) scale(.76)">${TRAIN_SVG}</g></svg></span>`;
}
