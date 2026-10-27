// 굴림 장치: 윷가락 · 주사위 2개 · 기물 주사위. 판에 따라 바꿔 끼운다.

import { stick } from './art.js';
import { tween, sleep } from './anim.js';
import { FACES } from '../core/boards/chess.js';

const INK = '#22201D';

// ── 주사위 면 ───────────────────────────────────────────────

const PIPS = {
  1: [[50, 50]],
  2: [[28, 28], [72, 72]],
  3: [[26, 26], [50, 50], [74, 74]],
  4: [[28, 28], [72, 28], [28, 72], [72, 72]],
  5: [[26, 26], [74, 26], [50, 50], [26, 74], [74, 74]],
  6: [[28, 24], [72, 24], [28, 50], [72, 50], [28, 76], [72, 76]]
};
const pipFace = (n) => `<svg viewBox="0 0 100 100">${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${n === 1 ? 13 : 10}" fill="${n === 1 ? '#E0533D' : INK}"/>`).join('')}</svg>`;

/** 체스 기물 실루엣 — 먹선 스티커 화풍에 맞춘 단순한 모양 */
export const PIECE_SVG = {
  pawn: '<circle cx="50" cy="30" r="12"/><path d="M38 46h24l6 30H32z"/><rect x="26" y="74" width="48" height="10" rx="4"/>',
  king: '<path d="M46 12h8v8h8v8h-8v8h-8v-8h-8v-8h8z"/><path d="M34 42h32l-4 34H38z"/><rect x="26" y="74" width="48" height="10" rx="4"/>',
  knight: '<path d="M36 76l2-26-10 6-4-10 18-22 14 4 10 20-4 28z"/><circle cx="48" cy="32" r="3" fill="#FFFDF7"/><rect x="26" y="74" width="48" height="10" rx="4"/>',
  bishop: '<path d="M50 12c10 8 14 18 10 28l-4 2 6 34H38l6-34-4-2c-4-10 0-20 10-28z"/><path d="M50 22l-6 10" stroke="#FFFDF7" stroke-width="4"/><rect x="26" y="74" width="48" height="10" rx="4"/>',
  rook: '<path d="M30 16h8v8h6v-8h12v8h6v-8h8v18l-6 6 4 36H32l4-36-6-6z"/><rect x="26" y="74" width="48" height="10" rx="4"/>',
  queen: '<path d="M24 26l10 14 8-18 8 18 8-18 8 18 10-14-6 50H30z"/><circle cx="24" cy="24" r="5"/><circle cx="76" cy="24" r="5"/><circle cx="50" cy="16" r="5"/><rect x="26" y="74" width="48" height="10" rx="4"/>'
};
const chessFace = (f) => `<svg viewBox="0 0 100 100"><g fill="${INK}" stroke="${INK}" stroke-width="2" stroke-linejoin="round">${PIECE_SVG[f]}</g></svg>`;

export const chessIcon = (f, size = 28) => `<svg viewBox="0 0 100 100" width="${size}" height="${size}"><g fill="${INK}">${PIECE_SVG[f]}</g></svg>`;

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

function cube(faces, cls = '') {
  // faces: 면 1~6 의 그림. 앞=1 위=2 오른쪽=3 왼쪽=4 아래=5 뒤=6
  const pos = ['', 'f1', 'f2', 'f3', 'f4', 'f5', 'f6'];
  return `<div class="die ${cls}">${[1, 2, 3, 4, 5, 6].map((n) => `<div class="face ${pos[n]}">${faces[n]}</div>`).join('')}</div>`;
}

// ── 그리기 ──────────────────────────────────────────────────

/** 굴리기 전 모습 */
export function idle(container, board) {
  if (board.roller === 'dice') {
    container.innerHTML = `<div class="dice-tray">${cube(diceFaces())}${cube(diceFaces())}</div>`;
    container.querySelectorAll('.die').forEach((d, i) => { d.style.transform = `${TILT} ${SHOW[i ? 3 : 5]}`; });
  } else if (board.roller === 'chess') {
    container.innerHTML = `<div class="dice-tray">${cube(chessFaces(), 'chess')}</div>`;
    container.querySelector('.die').style.transform = `${TILT} ${SHOW[6]}`;
  } else {
    container.innerHTML = `<div class="stick-tray">${[true, false, true, true].map((f, i) => stick(f, i === 0)).join('')}</div>`;
  }
}

const diceFaces = () => ({ 1: pipFace(1), 2: pipFace(2), 3: pipFace(3), 4: pipFace(4), 5: pipFace(5), 6: pipFace(6) });
const chessFaces = () => Object.fromEntries(FACES.map((f, i) => [i + 1, chessFace(f)]));

/** 굴리는 연출. 끝나면 결과 면이 보이는 상태로 멈춘다. who === 'opp' 면 작고 빠르게. */
export async function animate(container, board, roll, who = 'me') {
  const fast = who === 'opp';
  if (board.roller === 'dice') {
    container.innerHTML = `<div class="dice-tray ${fast ? 'opp' : ''}">${cube(diceFaces())}${cube(diceFaces())}</div>`;
    const dice = container.querySelectorAll('.die');
    await Promise.all([...dice].map((d, i) => tumble(d, roll.faces[i], fast, i)));
    return;
  }
  if (board.roller === 'chess') {
    container.innerHTML = `<div class="dice-tray ${fast ? 'opp' : ''}">${cube(chessFaces(), 'chess')}</div>`;
    await tumble(container.querySelector('.die'), FACES.indexOf(roll.value) + 1, fast, 0);
    return;
  }
  // 윷가락: 아래에서 튀어 올라 돌다가 흩어져 떨어진다
  container.innerHTML = `<div class="stick-tray ${fast ? 'opp' : ''}">${roll.faces.map((f, i) => stick(f, i === 0)).join('')}</div>`;
  const sticks = container.querySelectorAll('.stick');
  await Promise.all([...sticks].map((s, i) => {
    const end = (Math.random() - 0.5) * 40, dx = (Math.random() - 0.5) * 18;
    s.style.transform = `translateX(${dx}px) rotate(${end}deg)`;
    return tween(s, [
      { transform: 'translateY(90px) rotate(0deg)', opacity: 0 },
      { transform: `translate(${dx * 0.5}px, -110px) rotate(${300 + i * 60}deg)`, opacity: 1, offset: 0.5 },
      { transform: `translate(${dx}px, 8px) rotate(${660 + end}deg)`, offset: 0.85 },
      { transform: `translate(${dx}px, 0) rotate(${720 + end}deg)` }
    ], { duration: fast ? 480 : 700, easing: 'cubic-bezier(.3,.6,.4,1)', delay: i * 45 });
  }));
}

async function tumble(die, face, fast, i) {
  const rx = 720 + Math.floor(Math.random() * 3) * 90, ry = 540 + Math.floor(Math.random() * 3) * 90;
  const final = `${TILT} ${SHOW[face]}`;
  die.style.transform = final;
  await tween(die, [
    { transform: `translate(${i ? 40 : -40}px, -130px) ${TILT} rotateX(${rx}deg) rotateY(${ry}deg)`, opacity: 0 },
    { transform: `translate(${i ? 10 : -10}px, 6px) ${TILT} rotateX(${rx / 3}deg) rotateY(${ry / 3}deg)`, opacity: 1, offset: 0.55 },
    { transform: `translate(0, -18px) ${TILT} rotateX(30deg) rotateY(20deg)`, offset: 0.75 },
    { transform: `translate(0, 0) ${final}` }
  ], { duration: fast ? 520 : 820, easing: 'cubic-bezier(.3,.7,.4,1)', delay: i * 70 });
  await sleep(40);
}

/** 타이틀 장식: 윷가락 묶음 */
export function stickBundle() {
  return `<span class="bundle-sticks">${[true, false, true, false].map((f, i) => stick(f, i === 0)).join('')}</span>`;
}

/** 타이틀 장식: 정적인 주사위 하나(면 n 이 앞) */
export function dieIcon(n = 5) {
  return `<span class="die-icon"><svg viewBox="0 0 100 100" width="52" height="52"><rect x="6" y="6" width="88" height="88" rx="20" fill="#FFFDF7" stroke="#22201D" stroke-width="7"/>${PIPS[n].map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9" fill="${n === 1 ? '#E0533D' : '#22201D'}"/>`).join('')}</svg></span>`;
}

/** 타이틀 장식: 기물 주사위 한 면 */
export function chessDieIcon(face = 'knight') {
  return `<span class="die-icon"><svg viewBox="0 0 100 100" width="54" height="54"><rect x="6" y="6" width="88" height="88" rx="20" fill="#F5D35E" stroke="#22201D" stroke-width="7"/><g transform="translate(14 12) scale(.72)" fill="#22201D">${PIECE_SVG[face]}</g></svg></span>`;
}
