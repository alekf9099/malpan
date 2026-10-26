// 판 그리기 — 비스듬히 내려다보는(아이소메트릭) 시점.
// 판은 단위 좌표(가로 0~dx, 세로 0~dy)로 그리고, SVG 행렬 하나로 마름모 평면에 눕힌다.
// 판은 화면보다 크게 그리고, 보이는 부분은 카메라(camera.js)가 정한다.

import { HOME, START } from '../core/board.js';

const INK = '#22201D';
const K = 0.58;      // 세로 눌림 비율
const T = 18;        // 판 두께
const MARGIN = 26;   // 판 좌우 여백
const TOPPAD = 70;   // 판 위쪽 여백(뒤쪽 말·라벨이 잘리지 않게)

// 판마다 크기(단위 길이당 px)·바깥 여백·말 크기
const STYLE = {
  yut: { scale: 290, inset: 0.07, piece: 58 },
  marble: { scale: 330, inset: 0.06, piece: 54 },
  chess: { scale: 270, inset: 0.0, piece: 50 }
};

let board = null;
let geo = null;

export function useBoard(b) {
  board = b;
  const st = STYLE[b.id];
  const [dx, dy] = b.dims || [1, 1];
  const S = st.scale;
  const ox = MARGIN + dy * S;
  geo = {
    S, dx, dy, ox, oy: TOPPAD,
    w: (dx + dy) * S + MARGIN * 2,
    h: TOPPAD + (dx + dy) * S * K + T + 34
  };
}

export const pieceSize = () => STYLE[board.id].piece;
export const canvasSize = () => ({ w: geo.w, h: geo.h });

/** 단위 좌표 → 판 그림(캔버스) 좌표 */
export function proj(x, y) {
  return [geo.ox + (x - y) * geo.S, geo.oy + (x + y) * geo.S * K];
}

function unit(node) {
  const [x, y] = board.coords[node];
  const s = STYLE[board.id].inset;
  return [s * geo.dx + (1 - 2 * s) * x, s * geo.dy + (1 - 2 * s) * y];
}

/** 노드의 캔버스 좌표. 출발 전·골인은 출발 칸(없으면 판 앞쪽 모서리)에 둔다. */
export function nodeXY(node) {
  if (node === START || node === HOME) {
    if (board.entry) return proj(...unit(board.entry));
    return proj(geo.dx * 1.03, geo.dy * 1.03);
  }
  return proj(...unit(node));
}

/** 판 앞쪽일수록 위에 그려지도록 깊이를 매긴다. */
export const depth = (y) => Math.round(y) + 10;

const NS = 'vector-effect="non-scaling-stroke"';
const plane = () => `matrix(${geo.S} ${geo.S * K} ${-geo.S} ${geo.S * K} ${geo.ox} ${geo.oy})`;

/** 판 평면 위 글자. 작은 글꼴 크기는 브라우저 최소 글꼴 설정에 걸리므로 1000배 키운 뒤 줄인다. */
function planeText(x, y, size, text, { fill = INK, weight = 900, family = 'Pretendard Variable, sans-serif' } = {}) {
  return `<g transform="translate(${x} ${y}) scale(0.001)"><text font-size="${size * 1000}" font-weight="${weight}" text-anchor="middle" fill="${fill}" font-family="${family}">${text}</text></g>`;
}

function slab(top, sideL, sideR) {
  const { dx, dy } = geo;
  const [tx, ty] = proj(0, 0), [rx, ry] = proj(dx, 0), [bx, by] = proj(dx, dy), [lx, ly] = proj(0, dy);
  return `
    <ellipse cx="${bx}" cy="${by + T + 6}" rx="${(rx - lx) / 2}" ry="14" fill="rgba(34,32,29,.16)"/>
    <polygon points="${lx},${ly} ${bx},${by} ${bx},${by + T} ${lx},${ly + T}" fill="${sideL}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="${bx},${by} ${rx},${ry} ${rx},${ry + T} ${bx},${by + T}" fill="${sideR}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
    <polygon points="${tx},${ty} ${rx},${ry} ${bx},${by} ${lx},${ly}" fill="${top}" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`;
}

const SHOP_FILL = { gold: '#F2B33D', luck: '#3E9B6A', trap: '#E0533D' };

// ── 윷놀이판 ───────────────────────────────────────────────

function drawYut(tiles) {
  const s = STYLE.yut.inset;
  const lines = board.edges.map(([a, b]) => {
    const [x1, y1] = unit(a), [x2, y2] = unit(b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="4" stroke-linecap="round" ${NS}/>`;
  }).join('');
  const discs = (dark) => board.nodes.map((n) => {
    const [x, y] = unit(n);
    const r = board.big.has(n) ? 0.042 : 0.026;
    const fill = dark ? INK : (SHOP_FILL[tiles[n]] || '#FFFDF7');
    return `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" ${dark ? '' : `stroke="${INK}" stroke-width="3" ${NS}`}/>` +
      (!dark && board.big.has(n) && !tiles[n] ? `<circle cx="${x}" cy="${y}" r="${r * 0.48}" fill="none" stroke="${INK}" stroke-width="2.4" ${NS}/>` : '');
  }).join('');
  const [sx, sy] = unit('o0');
  // 무명천 결 · 가장자리 바느질 · 모서리 매듭
  let weave = '';
  for (let i = 1; i < 24; i++) weave += `<line x1="${i / 24}" y1="0" x2="${i / 24}" y2="1" stroke="#DCC9A5" stroke-width="1" ${NS}/><line x1="0" y1="${i / 24}" x2="1" y2="${i / 24}" stroke="#DCC9A5" stroke-width="1" ${NS}/>`;
  return slab('#EFE2C8', '#C9AE80', '#B39566') + `
    <g transform="${plane()}">
      ${weave}
      <rect x="${s / 2}" y="${s / 2}" width="${1 - s}" height="${1 - s}" fill="none" stroke="#B8A27A" stroke-width="2.4" stroke-dasharray="7 6" ${NS}/>
      <g>${lines}</g>
    </g>
    <g transform="translate(0 4)"><g transform="${plane()}">${discs(true)}</g></g>
    <g transform="${plane()}">${discs(false)}
      ${planeText(sx - 0.015, sy + 0.07, 0.04, '출발')}
      ${planeText(0.5, 0.5 + 0.11, 0.032, '방', { fill: '#8C7A5A' })}
    </g>`;
}

// ── 주사위판 ───────────────────────────────────────────────

// 칸 색: 변마다 다른 색 무리(모두의 마블의 도시 색처럼)
const SIDE_COLORS = ['#F4A7A0', '#9CC7F0', '#A7D8A0', '#F7D27A'];
const EVENT_STYLE = {
  festival: { fill: '#E0533D', text: '축제', ink: '#FFFDF7' },
  plane: { fill: '#2F6BD8', text: '비행기', ink: '#FFFDF7' },
  island: { fill: '#3E9B6A', text: '보물섬', ink: '#FFFDF7' },
  key: { fill: '#F2B33D', text: '열쇠', ink: INK },
  trap: { fill: '#22201D', text: '함정', ink: '#F2B33D' },
  bonus: { fill: '#FFFDF7', text: '+25', ink: '#E0533D' },
  well: { fill: '#7FC8E8', text: '우물', ink: INK },
  market: { fill: '#C38FD9', text: '장터', ink: '#FFFDF7' }
};

function drawMarble(tiles) {
  const inner = STYLE.marble.inset;
  const side = board.nodes.length / 4;
  const cell = (1 - 2 * inner) / side;
  const h = (cell / 2) * 0.93;
  const tileRect = (n, dark) => {
    const [x, y] = unit(n);
    const big = board.big.has(n);
    const hh = big ? h * 1.22 : h;
    const i = Number(n.slice(1));
    const ev = board.tile(n);
    let fill = SIDE_COLORS[Math.floor(i / side) % 4];
    if (ev) fill = EVENT_STYLE[ev.kind].fill;
    if (n === 'm0') fill = '#FFFDF7';
    if (tiles[n]) fill = SHOP_FILL[tiles[n]];
    if (dark) return `<rect x="${x - hh}" y="${y - hh}" width="${hh * 2}" height="${hh * 2}" rx="0.01" fill="${INK}"/>`;
    const label = n === 'm0' ? { text: '출발', ink: '#E0533D' } : ev ? EVENT_STYLE[ev.kind] : null;
    // 일반 칸에는 도시 깃발 띠(위쪽 1/3)를 그려 모두의 마블 칸처럼
    const band = !ev && n !== 'm0' && !tiles[n] ? `<rect x="${x - hh}" y="${y - hh}" width="${hh * 2}" height="${hh * 0.6}" fill="rgba(34,32,29,.12)"/>` : '';
    return `<rect x="${x - hh}" y="${y - hh}" width="${hh * 2}" height="${hh * 2}" rx="0.01" fill="${fill}" stroke="${INK}" stroke-width="2.6" ${NS}/>` + band +
      (label ? planeText(x, y + (big ? 0.014 : 0.01), big ? 0.034 : 0.022, label.text, { fill: label.ink }) : '');
  };
  return slab('#2E5E4E', '#1E3F34', '#173328') + `
    <g transform="${plane()}">
      <rect x="${inner + cell * 1.1}" y="${inner + cell * 1.1}" width="${1 - 2 * inner - cell * 2.2}" height="${1 - 2 * inner - cell * 2.2}" rx="0.03" fill="#3B7562" stroke="#9FD4B8" stroke-width="2.4" stroke-dasharray="6 7" ${NS}/>
      ${planeText(0.5, 0.47, 0.075, '주사위판', { fill: '#F2B33D', weight: 400, family: 'Gasoek One, sans-serif' })}
      ${planeText(0.5, 0.55, 0.03, '한 바퀴 돌면 골인 · 더블이면 한 번 더', { fill: '#CFE8DC', weight: 800 })}
    </g>
    <g transform="translate(0 5)"><g transform="${plane()}">${board.nodes.map((n) => tileRect(n, true)).join('')}</g></g>
    <g transform="${plane()}">${board.nodes.map((n) => tileRect(n, false)).join('')}</g>`;
}

// ── 체스판 ─────────────────────────────────────────────────

function drawChess(tiles) {
  const cols = 8, rows = Math.round(geo.dy * 8);
  const c1 = 1 / cols;
  let cells = '';
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const light = (c + r) % 2 === 0;
    let fill = light ? '#F3E3C3' : '#B98A5E';
    const id = `k${c}${r}`;
    if (tiles[id]) fill = SHOP_FILL[tiles[id]];
    cells += `<rect x="${c * c1}" y="${r * c1}" width="${c1}" height="${c1}" fill="${fill}"/>`;
  }
  return slab('#F3E3C3', '#8C6239', '#74502D') + `
    <g transform="${plane()}">
      ${cells}
      <rect x="0" y="0" width="1" height="${c1}" fill="rgba(242,179,61,.38)"/>
      <rect x="0" y="${(rows - 1) * c1}" width="1" height="${c1}" fill="rgba(224,83,61,.25)"/>
      <rect x="0" y="0" width="1" height="${geo.dy}" fill="none" stroke="${INK}" stroke-width="3" ${NS}/>
      ${planeText(0.5, c1 / 2 + 0.012, 0.032, '내 골인 줄', { fill: '#7A4A00' })}
      ${planeText(0.5, (rows - 0.5) * c1 + 0.012, 0.032, '도깨비 골인 줄', { fill: '#7A2318' })}
    </g>`;
}

export function boardSvg(tiles = {}) {
  const body = board.id === 'marble' ? drawMarble(tiles) : board.id === 'chess' ? drawChess(tiles) : drawYut(tiles);
  return `<svg class="mat" viewBox="0 0 ${geo.w} ${geo.h}" width="${geo.w}" height="${geo.h}" aria-hidden="true">${body}</svg>`;
}
