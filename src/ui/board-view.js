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
  metro: { scale: 340, inset: 0.05, piece: 52 }
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

// ── 노선도 ─────────────────────────────────────────────────

// 역 표시: 안개가 걷힌 역만 종류가 보인다
const STATION_STYLE = {
  transfer: null,
  festival: { fill: '#E0533D', text: '축제', ink: '#FFFDF7' },
  bonus: { fill: '#FFFDF7', text: '+15', ink: '#E0533D' },
  treasure: { fill: '#3E9B6A', text: '보물', ink: '#FFFDF7' },
  cafe: { fill: '#7FC8E8', text: '카페', ink: INK },
  trap: { fill: '#22201D', text: '공사', ink: '#F2B33D' },
  express: { fill: '#2F6BD8', text: '급행', ink: '#FFFDF7' }
};

function drawMetro(tiles, revealed, state = {}) {
  const seen = new Set(revealed || board.nodes);
  const flags = state.flags || {}, done = new Set(state.completed || []);
  const colorOf = (line) => board.lines[line].color;
  // 도시 지도 바탕: 블록 격자 + 강 하나(시드마다 굽이가 다르다)
  let blocks = '';
  for (let i = 1; i < 12; i++) blocks += `<line x1="${i / 12}" y1="0" x2="${i / 12}" y2="1" stroke="#E2DCCB" stroke-width="1.2" ${NS}/><line x1="0" y1="${i / 12}" x2="1" y2="${i / 12}" stroke="#E2DCCB" stroke-width="1.2" ${NS}/>`;
  const w = (board.seed % 7) / 7;
  const river = `<path d="M ${0.15 + w * 0.5} -0.02 C ${0.35 + w * 0.2} 0.3, ${0.05 + w * 0.6} 0.62, ${0.4 + w * 0.3} 1.02" fill="none" stroke="#BFE0F0" stroke-width="22" stroke-linecap="round" ${NS}/>`;
  const parks = [[0.18, 0.66], [0.72, 0.31], [0.47, 0.03]].map(([x, y], i) =>
    `<rect x="${x + ((board.seed * (i + 3)) % 5) * 0.01}" y="${y}" width="0.13" height="0.08" rx="0.02" fill="#CFE6C2"/>`).join('');
  const lit = (a, b) => seen.has(a) || seen.has(b);
  const lineSeg = (e, under) => {
    const [x1, y1] = unit(e.a), [x2, y2] = unit(e.b);
    const shut = board.closed === e.line;
    if (under) {
      // 완성한 호선은 금빛 테두리로 빛난다
      const glow = done.has(e.line) ? `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#F2B33D" stroke-width="21" stroke-linecap="round" opacity=".8" ${NS}/>` : '';
      return glow + `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${INK}" stroke-width="13" stroke-linecap="round" ${NS}/>`;
    }
    const color = shut ? '#8C846F' : lit(e.a, e.b) ? colorOf(e.line) : '#C9C2B0';
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="8" stroke-linecap="round" ${shut ? 'stroke-dasharray="6 7"' : ''} ${NS}/>`;
  };
  const station = (n, dark) => {
    const [x, y] = unit(n);
    const big = board.big.has(n);
    const end = n === board.S || n === board.G;
    const r = end ? 0.04 : big ? 0.03 : 0.021;
    if (dark) return `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/>`;
    const known = seen.has(n);
    if (!known) {
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#E9E4D6" stroke="#9C9482" stroke-width="2.4" stroke-dasharray="4 3" ${NS}/>` +
        planeText(x, y + 0.009, 0.026, '?', { fill: '#8C846F' });
    }
    const t = board.tile(n);
    const st = t && STATION_STYLE[t.kind];
    let fill = end ? (n === board.S ? '#FFFDF7' : '#F2B33D') : st ? st.fill : '#FFFDF7';
    if (tiles[n]) fill = SHOP_FILL[tiles[n]];
    const line = board.lineAt(n);
    if (board.blocked(n)) fill = '#D8D2C4';
    let out = `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${line && line.id !== 1 && !st ? line.color : INK}" stroke-width="3" ${NS}/>`;
    if (big && !end) out += `<circle cx="${x}" cy="${y}" r="${r * 0.55}" fill="none" stroke="${INK}" stroke-width="2.4" ${NS}/>`;
    if (board.blocked(n)) out += `<path d="M ${x - r * 0.6} ${y - r * 0.6} L ${x + r * 0.6} ${y + r * 0.6} M ${x + r * 0.6} ${y - r * 0.6} L ${x - r * 0.6} ${y + r * 0.6}" stroke="#E0533D" stroke-width="3" stroke-linecap="round" ${NS}/>`;
    if (end) out += planeText(x, y + 0.011, 0.028, n === board.S ? '출발' : '종점', { fill: n === board.S ? '#E0533D' : INK });
    else if (st) out += planeText(x, y + 0.008, 0.019, st.text, { fill: st.ink });
    return out;
  };
  return slab('#F6F2E7', '#CFC6B1', '#B9AF97') + `
    <g transform="${plane()}">
      ${blocks}${river}${parks}
      <g>${board.edges.map((e) => lineSeg(e, true)).join('')}</g>
      <g>${board.edges.map((e) => lineSeg(e, false)).join('')}</g>
    </g>
    <g transform="translate(0 4)"><g transform="${plane()}">${board.nodes.map((n) => station(n, true)).join('')}</g></g>
    <g transform="${plane()}">${board.nodes.map((n) => station(n, false)).join('')}</g>
    ${Object.keys(flags).map(flagMark).join('')}`;
}

/** 깃발: 역 위에 꽂힌 작은 노란 깃발(화면 좌표에 세워 그린다) */
function flagMark(n) {
  const [x, y] = proj(...unit(n));
  return `<g transform="translate(${x + 7} ${y - 4})"><line x1="0" y1="0" x2="0" y2="-24" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M 0 -24 L 14 -19 L 0 -13 Z" fill="#F2B33D" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></g>`;
}

export function boardSvg(tiles = {}, revealed = null, state = {}) {
  const body = drawMetro(tiles, revealed, state);
  return `<svg class="mat" viewBox="0 0 ${geo.w} ${geo.h}" width="${geo.w}" height="${geo.h}" aria-hidden="true">${body}</svg>`;
}
