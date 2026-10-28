// 판 그리기 — 위에서 내려다본 평면 서울 지하철 노선도(역 219곳).
// 판은 화면보다 훨씬 크게 그리고, 보이는 부분은 카메라(camera.js)가 정한다.
// 역 이름은 겹치지 않게 자리를 고른다: 아래 → 위 → 오른쪽 → 왼쪽 … 처음 비는 곳(다른 이름·역 동그라미와 안 닿는 곳).

import { STATION_XY, SEOUL_DIMS, ALL_STATIONS, ALL_EDGES, LINES, isTransfer } from '../core/boards/seoul.js';
import { isChance } from '../core/match.js';
import { isHot } from '../core/estate.js';
import { HOT_ART } from './hot-art.js';

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
  const r = (n) => (isHot(n) ? 25 : isTransfer(n) ? 17 : 13);
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
    LABEL[n] = { ...pick, lines, clean, box: boxOf(pick) };
  }
}

const label = (n, { fill = INK, weight = 800, halo = '#F7F3EA', plate = null, haloW = 5 } = {}) => {
  const L = LABEL[n];
  const [x0, y0, x1, y1] = L.box;
  const bg = plate ? `<rect x="${x0 - 4}" y="${y0 - 2}" width="${x1 - x0 + 8}" height="${y1 - y0 + 4}" rx="${Math.min(16, (y1 - y0 + 4) / 2)}" fill="${plate}" stroke="${INK}" stroke-width="3"/>` : '';
  return bg + `<text x="${L.x}" y="${L.y + FONT * 0.92}" font-size="${FONT}" font-weight="${weight}" text-anchor="${L.anchor}" fill="${fill}" stroke="${halo}" stroke-width="${haloW}" paint-order="stroke" stroke-linejoin="round" font-family="Pretendard Variable, Pretendard, sans-serif">${
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

// 내 땅 표시(동그라미 안 흰 그림): 1단계 깃발 · 2단계 집 · 3단계 빌딩
const GLYPH = [
  '',
  '<path d="M -4 9 V -9" stroke="#FFFDF7" stroke-width="3" stroke-linecap="round"/><path d="M -4 -9 L 8 -5 L -4 -1 Z" fill="#FFFDF7"/>',
  '<path d="M -9 1 L 0 -8 L 9 1 V 9 H -9 Z" fill="#FFFDF7"/><rect x="-2.5" y="3" width="5" height="6" fill="var(--ink, #22201D)"/>',
  '<path d="M -9 9 V -2 H -2 V 9 Z M 0 9 V -10 H 8 V 9 Z" fill="#FFFDF7"/>'
];
const STAR = (x, y) => `<path d="M ${x} ${y} l 5 10 11 1.4 -8 7.4 2.1 11 -10.1 -5.4 -10.1 5.4 2.1 -11 -8 -7.4 11 -1.4 z" fill="#F2B33D" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`;

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
  // 산 역 둘레의 주인 색 번짐(선 밑)
  const halos = Object.entries(owner).map(([n, c]) => { const [x, y] = nodeXY(n); return `<circle cx="${x}" cy="${y}" r="${isHot(n) ? 52 : isTransfer(n) ? 44 : 38}" fill="${c}" opacity=".32"/>`; }).join('');
  const glow = (state.links || []).map((e) => `<line ${seg(e)} class="mono-glow" stroke="${e.color}" stroke-width="30" stroke-linecap="round" opacity=".55"/>`).join('');
  const under = ALL_EDGES.map((e) => `<line ${seg(e)} stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`).join('');
  const over = ALL_EDGES.map((e) => `<line ${seg(e)} stroke="${LINES[e.line].color}" stroke-width="9" stroke-linecap="round"/>`).join('');
  const stations = ALL_STATIONS.map((n) => {
    const [x, y] = nodeXY(n);
    const big = isTransfer(n);
    const own = owner[n], lv = level[n] || 0;
    if (isChance(n)) {
      const r = big ? 17 : 13;
      return `<circle cx="${x}" cy="${y}" r="${r}" fill="#F2B33D" stroke="${INK}" stroke-width="3.5"/><text x="${x}" y="${y + 7}" font-size="19" font-weight="900" text-anchor="middle" fill="${INK}" font-family="Gasoek One, sans-serif">?</text>` + label(n, { fill: '#8A6A1F' });
    }
    if (isHot(n)) {
      // 명소역: 금테 둥근 네모 간판 + 그 역 그림(hot-art.js)
      const h = 24;
      let out = `<rect x="${x - h}" y="${y - h}" width="${h * 2}" height="${h * 2}" rx="12" fill="${own || '#FFF4D6'}" stroke="${INK}" stroke-width="4"/>`
        + `<rect x="${x - h + 4}" y="${y - h + 4}" width="${h * 2 - 8}" height="${h * 2 - 8}" rx="9" fill="none" stroke="${own ? '#FFFDF7' : '#E0A526'}" stroke-width="3"/>`
        + `<svg x="${x - 19}" y="${y - 19}" width="38" height="38" viewBox="0 0 40 40">${HOT_ART[n]}</svg>`;
      if (own && lv >= 2) out += `<circle cx="${x + h}" cy="${y - h}" r="11" fill="${own}" stroke="${INK}" stroke-width="2.5"/><text x="${x + h}" y="${y - h + 5}" font-size="14" font-weight="900" text-anchor="middle" fill="#FFFDF7">${lv}</text>`;
      if (own && lv >= 3) out += STAR(x, y - h - 34);
      return out + label(n, own ? { fill: '#FFFDF7', halo: INK, haloW: 4, plate: own, weight: 900 } : { fill: INK, halo: '#FFF4D6', plate: '#F2B33D', weight: 900 });
    }
    if (own) {
      // 내 땅: 크게, 주인 색으로 꽉 채우고 단계 그림 + 주인 색 이름표
      const r = big ? 22 : 18;
      let out = `<circle cx="${x}" cy="${y}" r="${r}" fill="${own}" stroke="${INK}" stroke-width="4"/>`
        + `<g transform="translate(${x} ${y}) scale(${big ? 1.1 : 0.9})">${GLYPH[lv || 1]}</g>`;
      if (lv >= 3) out += STAR(x, y - r - 32);
      return out + label(n, { fill: '#FFFDF7', halo: INK, haloW: 4, plate: own, weight: 900 });
    }
    const r = big ? 16 : 12;
    let out = `<circle cx="${x}" cy="${y}" r="${r}" fill="#FFFDF7" stroke="${INK}" stroke-width="${big ? 4 : 3.5}"/>`;
    if (big) out += `<circle cx="${x}" cy="${y}" r="${r * 0.52}" fill="none" stroke="${INK}" stroke-width="2.6"/>`;
    return out + label(n);
  }).join('');
  return `<svg class="mat" viewBox="0 0 ${geo.w} ${geo.h}" width="${geo.w}" height="${geo.h}" aria-hidden="true">
    <rect width="${geo.w}" height="${geo.h}" fill="#F7F3EA"/>
    ${grid}
    <path d="${river}" fill="none" stroke="#CFE7F3" stroke-width="80" stroke-linecap="round"/>
    <g>${halos}</g><g>${glow}</g><g>${under}</g><g>${over}</g><g>${stations}</g>
  </svg>`;
}
