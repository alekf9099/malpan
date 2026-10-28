// 판 그리기 — 위에서 내려다본 평면 서울 지하철 노선도(역 219곳).
// 판은 화면보다 훨씬 크게 그리고, 보이는 부분은 카메라(camera.js)가 정한다.
// 역 이름은 겹치지 않게 자리를 고른다: 아래 → 위 → 오른쪽 → 왼쪽 … 처음 비는 곳(다른 이름·역 동그라미와 안 닿는 곳).

import { STATION_XY, SEOUL_DIMS, ALL_STATIONS, ALL_EDGES, LINES, isTransfer } from '../core/boards/seoul.js';
import { isChance } from '../core/match.js';

const INK = '#22201D';
const UNIT = 120;      // 지도 1단위의 px (역 사이는 1.2단위 넘게 떨어져 있다)
const MARGIN = 120;
const PIECE = 56;
const FONT = 24;

const geo = { w: SEOUL_DIMS[0] * UNIT + MARGIN * 2, h: SEOUL_DIMS[1] * UNIT + MARGIN * 2 };

export const pieceSize = () => PIECE;
export const canvasSize = () => ({ w: geo.w, h: geo.h });
export const proj = (x, y) => [MARGIN + x * UNIT, MARGIN + y * UNIT];
export const nodeXY = (n) => proj(...STATION_XY[n]);
/** 아래쪽일수록 위에 그려지도록 */
export const depth = (y) => Math.round(y) + 10;

// ── 역 이름 자리 고르기(한 번만) ─────────────────────────────

export const LABEL = {};
{
  const charW = FONT * 1.02, lineH = FONT * 1.2;
  const textOf = (n) => (n === '동대문역사문화공원' ? ['동대문역사', '문화공원'] : [n]);
  const r = (n) => (isTransfer(n) ? 17 : 13);
  const circles = ALL_STATIONS.map((n) => { const [x, y] = nodeXY(n); const k = r(n) + 3; return [x - k, y - k, x + k, y + k]; });
  const placed = [];
  const hit = (a, b) => !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);
  // 큰 역(환승역)부터 자리를 잡는다
  const order = ALL_STATIONS.slice().sort((a, b) => (isTransfer(b) - isTransfer(a)) || a.localeCompare(b));
  for (const n of order) {
    const [x, y] = nodeXY(n);
    const lines = textOf(n);
    const w = Math.max(...lines.map((l) => [...l].length)) * charW + 8, h = lines.length * lineH;
    const gap = r(n) + 6;
    const tries = [
      { x, y: y + gap, anchor: 'middle' }, { x, y: y - gap - h, anchor: 'middle' },
      { x: x + gap, y: y - h / 2, anchor: 'start' }, { x: x - gap, y: y - h / 2, anchor: 'end' },
      { x: x + gap * 0.7, y: y + gap * 0.7, anchor: 'start' }, { x: x - gap * 0.7, y: y + gap * 0.7, anchor: 'end' },
      { x: x + gap * 0.7, y: y - gap * 0.7 - h, anchor: 'start' }, { x: x - gap * 0.7, y: y - gap * 0.7 - h, anchor: 'end' }
    ];
    const boxOf = (t) => { const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'start' ? t.x : t.x - w; return [x0, t.y, x0 + w, t.y + h]; };
    let pick = tries[0], clean = false;
    for (const t of tries) {
      const b = boxOf(t);
      if (placed.some((p) => hit(p, b))) continue;
      if (circles.some((c, i) => ALL_STATIONS[i] !== n && hit(c, b))) continue;
      pick = t; clean = true; break;
    }
    placed.push(boxOf(pick));
    LABEL[n] = { ...pick, lines, clean };
  }
}

const label = (n, { fill = INK, weight = 800, halo = '#F7F3EA' } = {}) => {
  const L = LABEL[n];
  return `<text x="${L.x}" y="${L.y + FONT * 0.92}" font-size="${FONT}" font-weight="${weight}" text-anchor="${L.anchor}" fill="${fill}" stroke="${halo}" stroke-width="5" paint-order="stroke" stroke-linejoin="round" font-family="Pretendard Variable, Pretendard, sans-serif">${
    L.lines.map((t, i) => `<tspan x="${L.x}" dy="${i ? FONT * 1.2 : 0}">${t}</tspan>`).join('')}</text>`;
};

// 한강: 옛 지도 좌표의 굽이를 새 지도에 맞춰 늘린다(tools/seoul-layout.mjs 의 K=3.2, 옮김 13·9)
const RIVER_OLD = [[-4.5, 4.6], [0, 4.85], [2.4, 4.9], [4.4, 5.9], [5.4, 6.5], [6.6, 6.7], [7.8, 7.45], [9.6, 7.55], [11.2, 7.15], [12.4, 6.85], [14.6, 6.25], [16.6, 7.05], [17.8, 6.6], [20.4, 6.0]];
const RIVER = RIVER_OLD.map(([x, y]) => [x * 3.2 + 13, y * 3.2 + 9]);
function smooth(points) {
  const p = points.map(([x, y]) => proj(x, y));
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C ${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6}, ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6}, ${c[0]} ${c[1]}`;
  }
  return d;
}

/**
 * state.owner  { 역: 주인 색 } — 동그라미 안을 그 색으로
 * state.level  { 역: 1~3 }    — 2단계 이중 테, 3단계(랜드마크) 별
 * state.links  [{ a, b, color }] — 같은 주인이 이어서 가진 구간: 선 밑에 그 색 띠
 */
export function boardSvg(state = {}) {
  const owner = state.owner || {}, level = state.level || {};
  const seg = (e) => { const [x1, y1] = nodeXY(e.a), [x2, y2] = nodeXY(e.b); return `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`; };
  let grid = '';
  for (let x = 0; x <= geo.w; x += UNIT * 2) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${geo.h}" stroke="#ECE6D8" stroke-width="2"/>`;
  for (let y = 0; y <= geo.h; y += UNIT * 2) grid += `<line x1="0" y1="${y}" x2="${geo.w}" y2="${y}" stroke="#ECE6D8" stroke-width="2"/>`;
  const river = smooth(RIVER);
  const glow = (state.links || []).map((e) => `<line ${seg(e)} class="mono-glow" stroke="${e.color}" stroke-width="30" stroke-linecap="round" opacity=".55"/>`).join('');
  const under = ALL_EDGES.map((e) => `<line ${seg(e)} stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`).join('');
  const over = ALL_EDGES.map((e) => `<line ${seg(e)} stroke="${LINES[e.line].color}" stroke-width="9" stroke-linecap="round"/>`).join('');
  const stations = ALL_STATIONS.map((n) => {
    const [x, y] = nodeXY(n);
    const big = isTransfer(n);
    const r = big ? 16 : 12;
    if (isChance(n)) {
      return `<circle cx="${x}" cy="${y}" r="${r + 1}" fill="#F2B33D" stroke="${INK}" stroke-width="3.5"/><text x="${x}" y="${y + 7}" font-size="19" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Gasoek One, sans-serif">?</text>` + label(n, { fill: '#8A6A1F' });
    }
    const fill = owner[n] || '#FFFDF7';
    let out = `<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${INK}" stroke-width="${big ? 4 : 3.5}"/>`;
    if (big) out += `<circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="none" stroke="${owner[n] ? '#FFFDF7' : INK}" stroke-width="2.6"/>`;
    if (level[n] >= 2) out += `<circle cx="${x}" cy="${y}" r="${r + 6}" fill="none" stroke="${owner[n]}" stroke-width="4"/><circle cx="${x}" cy="${y}" r="${r + 6}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-dasharray="4 4"/>`;
    if (level[n] >= 3) out += `<path d="M ${x} ${y - r - 18} l 4 8 9 1 -6.5 6 1.7 9 -8.2 -4.4 -8.2 4.4 1.7 -9 -6.5 -6 9 -1 z" fill="#F2B33D" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`;
    return out + label(n);
  }).join('');
  return `<svg class="mat" viewBox="0 0 ${geo.w} ${geo.h}" width="${geo.w}" height="${geo.h}" aria-hidden="true">
    <rect width="${geo.w}" height="${geo.h}" fill="#F7F3EA"/>
    ${grid}
    <path d="${river}" fill="none" stroke="#CFE7F3" stroke-width="80" stroke-linecap="round"/>
    <g>${glow}</g><g>${under}</g><g>${over}</g><g>${stations}</g>
  </svg>`;
}
