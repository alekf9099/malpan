// 판 그리기 — 위에서 내려다본 평면 서울 지하철 노선도(역 219곳).
// 판은 화면보다 훨씬 크게 그리고, 보이는 부분은 카메라(camera.js)가 정한다.
// 역 이름은 겹치지 않게 자리를 고른다: 아래 → 위 → 오른쪽 → 왼쪽 … 처음 비는 곳(다른 이름·역 동그라미와 안 닿는 곳).

import { STATION_XY, SEOUL_DIMS, ALL_STATIONS, ALL_EDGES, LINES, isTransfer } from '../core/boards/seoul.js';
import { isChance } from '../core/match.js';
import { isHot, stationPrice } from '../core/estate.js';
import { ringOf, LOOP } from '../core/boards/loop.js';
import { TOUR_ART } from './tour-art.js';
import { HOT_ART } from './hot-art.js';

const INK = '#22201D';
const UNIT = 120;      // 지도 1단위의 px (역 사이는 1.2단위 넘게 떨어져 있다)
const MARGIN = 120;
const PIECE = 56;
const FONT = 24;

const geo = { w: SEOUL_DIMS[0] * UNIT + MARGIN * 2, h: SEOUL_DIMS[1] * UNIT + MARGIN * 2 };

export const pieceSize = () => PIECE;
export const canvasSize = () => (MODE === 'loop' ? { w: LGEO.w, h: LGEO.h } : { w: geo.w, h: geo.h });
export const proj = (x, y) => [MARGIN + x * UNIT, MARGIN + y * UNIT];
export const nodeXY = (n) => (MODE === 'loop' && ringXY()[n] ? ringXY()[n] : proj(...STATION_XY[n]));
/** 아래쪽일수록 위에 그려지도록 */
export const depth = (y) => Math.round(y) + 10;

// ── 역 이름 자리 고르기(한 번만) ─────────────────────────────

export const LABEL = {};
{
  const charW = FONT * 1.02, lineH = FONT * 1.2;
  const textOf = (n) => (n === '동대문역사문화공원' ? ['동대문역사', '문화공원'] : [n]);
  const r = (n) => (isHot(n) ? 25 : isTransfer(n) ? 17 : 13);
  const circles = ALL_STATIONS.map((n) => { const [x, y] = proj(...STATION_XY[n]); const k = r(n) + 3; return [x - k, y - k, x + k, y + k]; });
  const placed = [];
  const hit = (a, b) => !(a[2] <= b[0] || b[2] <= a[0] || a[3] <= b[1] || b[3] <= a[1]);
  // 큰 역(환승역)부터 자리를 잡는다
  const order = ALL_STATIONS.slice().sort((a, b) => (isTransfer(b) - isTransfer(a)) || a.localeCompare(b));
  for (const n of order) {
    const [x, y] = proj(...STATION_XY[n]);
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
 * state.region Set — 이 판의 지역. 밖의 역·선은 흐리게(이름 없이) 그려 위치만 알려 준다
 */
export function boardSvg(state = {}) {
  if (MODE === 'loop') return loopSvg(state);
  const owner = state.owner || {}, level = state.level || {};
  const inside = (n) => !state.region || state.region.has(n);
  const edgeIn = (e) => inside(e.a) && inside(e.b);
  const seg = (e) => { const [x1, y1] = nodeXY(e.a), [x2, y2] = nodeXY(e.b); return `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`; };
  let grid = '';
  for (let x = 0; x <= geo.w; x += UNIT * 2) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${geo.h}" stroke="#ECE6D8" stroke-width="2"/>`;
  for (let y = 0; y <= geo.h; y += UNIT * 2) grid += `<line x1="0" y1="${y}" x2="${geo.w}" y2="${y}" stroke="#ECE6D8" stroke-width="2"/>`;
  const river = smooth(RIVER);
  // 산 역 둘레의 주인 색 번짐(선 밑)
  const halos = Object.entries(owner).map(([n, c]) => { const [x, y] = nodeXY(n); return `<circle cx="${x}" cy="${y}" r="${isHot(n) ? 52 : isTransfer(n) ? 44 : 38}" fill="${c}" opacity=".32"/>`; }).join('');
  const glow = (state.links || []).map((e) => `<line ${seg(e)} class="mono-glow" stroke="${e.color}" stroke-width="30" stroke-linecap="round" opacity=".55"/>`).join('');
  const faded = ALL_EDGES.filter((e) => !edgeIn(e)).map((e) => `<line ${seg(e)} stroke="#D9CFBE" stroke-width="8" stroke-linecap="round"/>`).join('');
  const under = ALL_EDGES.filter(edgeIn).map((e) => `<line ${seg(e)} stroke="${INK}" stroke-width="15" stroke-linecap="round"/>`).join('');
  const over = ALL_EDGES.filter(edgeIn).map((e) => `<line ${seg(e)} stroke="${LINES[e.line].color}" stroke-width="9" stroke-linecap="round"/>`).join('');
  const stations = ALL_STATIONS.map((n) => {
    const [x, y] = nodeXY(n);
    const big = isTransfer(n);
    if (!inside(n)) return `<circle cx="${x}" cy="${y}" r="${big ? 9 : 7}" fill="#EDE6D8" stroke="#CFC5B3" stroke-width="3"/>`;
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
    <g>${faded}</g><g>${halos}</g><g>${glow}</g><g>${under}</g><g>${over}</g><g>${stations}</g>
  </svg>`;
}

// ── 고리 판(모두의 마블식 쿼터뷰) — 2호선 순환선 · 국내 여행 · 세계 일주 ──────────
// 판은 평면(정사각)으로 짜고, 비스듬히 내려다본 마름모로 눕혀 그린다(45° 돌리고 세로 0.58 — 캐릭터 그림과 같은 시점).
//   칸 · 가운데 그림 · 지름길처럼 판에 "칠한" 것은 평면 좌표로 그리고 한 번에 눕힌다(MATRIX)
//   건물 · 여행지 그림 · 모서리 그림처럼 판에 "서 있는" 것은 눕힌 화면 좌표에 똑바로 세운다(뒤에서 앞으로)
// 32칸 고리: 오른쪽 아래 출발 칸에서 왼쪽으로 출발해 시계 방향(눕히면 아래 꼭짓점에서 왼쪽 위로).

const LT = 92, LC = 140, LS = LT * 7 + LC * 2, LM = 44;   // 칸 폭 · 모서리 · 판 한 변 · 바깥 여백(평면)
const FS = LS + LM * 2;                                  // 평면 판 한 변
const K1 = Math.SQRT1_2, K2 = Math.SQRT1_2 * 0.58;       // 눕히기: 45° 돌리고 세로 0.58
const THICK = 40, PAD_T = 190, PAD_B = 70, PAD_S = 30;   // 판 두께 · 위(건물이 솟을 자리) · 아래 · 옆 여백(화면)
const PW = Math.round(FS * 2 * K1) + PAD_S * 2, PH = Math.round(FS * 2 * K2) + PAD_T + PAD_B + THICK;
/** 평면 (u, v) → 화면 */
const isoPt = (u, v) => [PW / 2 + (u - v) * K1, PAD_T + (u + v) * K2];
const MATRIX = `matrix(${K1} ${K2} ${-K1} ${K2} ${PW / 2} ${PAD_T})`;
const LGEO = { w: PW, h: PH };
let MODE = 'map', RING = LOOP;
/** 판 모양: 고리 판 id('loop' · 'korea' · 'world')면 그 고리, 아니면 노선도 — 게임 화면을 열 때 정한다 */
export function useBoard(mode) { const r = ringOf(mode); MODE = r ? 'loop' : 'map'; RING = r || LOOP; }
export const boardMode = () => MODE;
/** 지금 그리는 고리 판(노선도면 null) */
export const boardRing = () => (MODE === 'loop' ? RING : null);

/** 고리 칸 i 의 평면 사각형. inner 는 판 가운데 쪽 가장자리 */
function loopRect(i) {
  const R = LM + LS - LC;
  if (i === 0) return { x: R, y: R, w: LC, h: LC };
  if (i < 8) return { x: R - i * LT, y: R, w: LT, h: LC, inner: 'top' };
  if (i === 8) return { x: LM, y: R, w: LC, h: LC };
  if (i < 16) return { x: LM, y: R - (i - 8) * LT, w: LC, h: LT, inner: 'right' };
  if (i === 16) return { x: LM, y: LM, w: LC, h: LC };
  if (i < 24) return { x: LM + LC + (i - 17) * LT, y: LM, w: LT, h: LC, inner: 'bottom' };
  if (i === 24) return { x: LM + LS - LC, y: LM, w: LC, h: LC };
  return { x: LM + LS - LC, y: LM + LC + (i - 25) * LT, w: LC, h: LT, inner: 'left' };
}
/** 칸 안 쓰는 자리(틈 4) */
const tileBox = (i) => { const r = loopRect(i); return { ...r, x: r.x + 4, y: r.y + 4, w: r.w - 8, h: r.h - 8 }; };
/**
 * 칸에 서 있는 것(말 · 여행지 그림)의 바닥 — 평면 좌표. 이름띠(앞쪽 = 평면 아래 가장자리) 위 몸통 가운데.
 * 눕힌 판에서 평면 아래 · 오른쪽 가장자리가 화면 앞이라, 이름띠를 앞에 두면 칸에 선 것이 이름을 가리지 않는다.
 */
const HB = 30;
function standFlat(i) {
  const b = tileBox(i);
  if (!b.inner) return [b.x + b.w / 2, b.y + b.h / 2 + 4];
  return b.w > b.h ? [b.x + b.w / 2 - 18, b.y + (b.h - HB) * 0.55] : [b.x + b.w / 2, b.y + (b.h - HB) * 0.52];
}
/** 산 칸 건물의 바닥(평면): 칸 뒤쪽(화면 위쪽)으로 물려 세운다 — 이름띠 · 말을 덜 가리게 */
function buildFlat(i) {
  const [x, y] = standFlat(i);
  return [x - 8, y - 8];
}
/** 판마다 칸 자리(화면, 한 번만 센다) */
const XY = {};
const ringXY = () => (XY[RING.id] ||= Object.fromEntries(RING.tiles.map((n, i) => [n, isoPt(...standFlat(i))])));

/** 주인 색을 흰색 쪽으로 옅게 */
function tint(hex, k = 0.62) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(x + (255 - x) * k));
  return `rgb(${c.join(',')})`;
}
/** 주인 색을 검은색 쪽으로 짙게(건물 옆면 · 판 두께) */
function shade(hex, k = 0.32) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(x * (1 - k)));
  return `rgb(${c.join(',')})`;
}
const txt = (x, y, s, { size = 25, fill = INK, weight = 900, font = 'Pretendard Variable, Pretendard, sans-serif', anchor = 'middle' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" font-family="${font}">${s}</text>`;
const DISPLAY = 'Gasoek One, sans-serif';

/** 모서리 칸 그림(화면에 똑바로 세운다) */
const CORNER_ART = {
  start: (cx, cy) => `<path d="M${cx + 34} ${cy - 22} H${cx - 14} V${cy - 40} L${cx - 50} ${cy - 10} L${cx - 14} ${cy + 20} V${cy + 2} H${cx + 34} Z" fill="#E0533D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    + `<circle cx="${cx + 34}" cy="${cy + 26}" r="15" fill="#F2B33D" stroke="${INK}" stroke-width="3.5"/>${txt(cx + 34, cy + 33, '₩', { size: 18 })}`,
  festival: (cx, cy) => [[-26, -14, '#E2588F'], [2, -30, '#F2B33D'], [28, -12, '#2F6BD8']].map(([dx, dy, c]) =>
    `<path d="M${cx + dx} ${cy + dy + 16} Q${cx + dx - 6} ${cy + dy + 30} ${cx + dx + 2} ${cy + 26}" fill="none" stroke="${INK}" stroke-width="2.5"/><ellipse cx="${cx + dx}" cy="${cy + dy}" rx="14" ry="17" fill="${c}" stroke="${INK}" stroke-width="3.5"/><ellipse cx="${cx + dx - 5}" cy="${cy + dy - 6}" rx="3.5" ry="5" fill="#FFFDF7" opacity=".8"/>`).join(''),
  express: (cx, cy) => `<rect x="${cx - 34}" y="${cy - 34}" width="68" height="58" rx="18" fill="#2F6BD8" stroke="${INK}" stroke-width="4"/><rect x="${cx - 24}" y="${cy - 24}" width="48" height="20" rx="5" fill="#BFE3F5" stroke="${INK}" stroke-width="3"/>`
    + `<circle cx="${cx - 18}" cy="${cy + 10}" r="5" fill="#F7C94A" stroke="${INK}" stroke-width="2.5"/><circle cx="${cx + 18}" cy="${cy + 10}" r="5" fill="#F7C94A" stroke="${INK}" stroke-width="2.5"/>`,
  maze: (cx, cy) => `<rect x="${cx - 36}" y="${cy - 36}" width="72" height="62" rx="12" fill="#FFFDF7" stroke="${INK}" stroke-width="4"/>`
    + `<path d="M${cx - 24} ${cy - 24} H${cx + 24} V${cy + 14} H${cx - 12} V${cy - 12} H${cx + 12} V${cy + 2}" fill="none" stroke="#8E5BC8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy - 2}" r="5" fill="#E0533D" stroke="${INK}" stroke-width="2"/>`
};
const CORNER_FILL = { start: '#FFD9CC', festival: '#FFD3E6', express: '#CFE2FA', maze: '#E2D5F3' };
const CORNER_INK = { start: '#C0392B', festival: '#B8336A', express: '#1F4F99', maze: '#6B3FA0' };

/**
 * 칸 하나. tile = 판에 칠할 평면 그림, bld = 화면에 세울 것(건물 · 그림), y = 세울 것의 화면 바닥(앞뒤 순서)
 * 땅 칸: 위쪽 머리띠(구역 색 + 이름) · 몸통 · 값. 산 칸은 몸통이 주인 색이고 주인 색 테.
 */
function loopTile(n, i, owner, level) {
  const b = tileBox(i), { x, y, w, h } = b, cx = x + w / 2;
  const own = owner[n], lv = level[n] || 0, c = RING.corners[n];
  const clip = (inner) => `<clipPath id="lt${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12"/></clipPath><g clip-path="url(#lt${i})">${inner}</g>`;
  const [gx, gy] = isoPt(...standFlat(i));
  if (c) {
    const k = c.kind;
    const tile = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="14" fill="${CORNER_FILL[k]}" stroke="${INK}" stroke-width="4"/>`
      + `<rect x="${x + 9}" y="${y + 9}" width="${w - 18}" height="${h - 18}" rx="9" fill="none" stroke="#FFFFFF" stroke-width="3" stroke-dasharray="10 7" opacity=".9"/>`
      + txt(cx, y + h - 22, c.name, { size: c.name.length > 5 ? 19 : 24, font: DISPLAY, weight: 400, fill: CORNER_INK[k] });
    const art = c.icon && TOUR_ART[c.icon] ? `<svg x="${gx - 40}" y="${gy - 86}" width="80" height="80" viewBox="0 0 40 40" overflow="visible">${TOUR_ART[c.icon]}</svg>` : CORNER_ART[k](gx, gy - 46);
    return { tile, bld: `<g class="lb" data-n="${n}"><ellipse cx="${gx}" cy="${gy - 4}" rx="40" ry="12" fill="${INK}" opacity=".16"/>${art}</g>`, y: gy };
  }
  if (isChance(n)) {
    const wide = w > h;
    const tile = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="#F7C94A" stroke="${INK}" stroke-width="3.5"/>`
      + `<rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="8" fill="none" stroke="#FFFDF7" stroke-width="2.5" stroke-dasharray="8 6"/>`
      + (wide ? txt(x + 38, y + h / 2 + 22, '?', { size: 60, font: DISPLAY, weight: 400, fill: '#E0533D' }) + txt(x + w - 40, y + h / 2 + 7, RING.chanceName, { size: RING.chanceName.length > 2 ? 15 : 19, fill: '#6B4E0E' })
        : txt(cx, y + h / 2 + 18, '?', { size: 70, font: DISPLAY, weight: 400, fill: '#E0533D' }) + txt(cx, y + h - 14, RING.chanceName, { size: RING.chanceName.length > 2 ? 15 : 19, fill: '#6B4E0E' }));
    return { tile, bld: '', y: gy };
  }
  const hot = isHot(n), col = RING.colorOf(n) || '#8A8173';
  const pic = hot ? HOT_ART[n] : TOUR_ART[RING.icons?.[n]] || null;
  const name = RING.nameOf(n), wide = w > h;
  // 이름띠는 앞쪽(평면 아래 가장자리), 값은 뒤쪽 위
  const hy = y + h - HB;
  let tile = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="12" fill="${own ? tint(own, 0.55) : hot ? '#FFF4D6' : '#FFFDF7'}" stroke="${INK}" stroke-width="3.5"/>`
    + clip(`<rect x="${x}" y="${hy}" width="${w}" height="${HB}" fill="${col}"/><path d="M${x} ${hy} H${x + w}" stroke="${INK}" stroke-width="3"/>`)
    + txt(cx, hy + HB / 2 + 7, name, { size: Math.min(19, ((w - 10) / name.length) * 1.05), fill: '#FFFDF7' });
  if (own) tile += `<rect x="${x + 4}" y="${y + 4}" width="${w - 8}" height="${h - HB - 7}" rx="8" fill="none" stroke="${own}" stroke-width="5"/>`;
  else {
    const px = wide ? x + w - 30 : cx, py = wide ? y + 26 : y + 22;
    tile += `<circle cx="${px - 22}" cy="${py - 5}" r="7" fill="#F2B33D" stroke="${INK}" stroke-width="2"/>` + txt(px + 6, py, stationPrice(n), { size: 17, fill: '#5A5248' });
  }
  // 세울 것: 산 칸은 단계 건물, 빈 칸은 여행지 · 명소 그림(없으면 지하철 입구)
  const shadow = `<ellipse cx="${gx}" cy="${gy}" rx="26" ry="8" fill="${INK}" opacity=".16"/>`;
  const stand = own ? buildingSvg(...isoPt(...buildFlat(i)), lv || 1, own)
    : pic ? `${shadow}<svg x="${gx - 30}" y="${gy - 56}" width="60" height="60" viewBox="0 0 40 40" overflow="visible">${pic}</svg>`
      : `<g transform="translate(${gx} ${gy}) scale(${ISO_K})">${isoBuilding(0)}</g>`;
  return { tile, bld: `<g class="lb" data-n="${n}">${stand}</g>`, y: gy };
}

const LINE2 = '#3CB44A';
const ISO_K = 0.8;
/**
 * 비스듬히 내려다본 입체 건물(원점 = 바닥 가운데). 윗면 · 앞면 · 옆면 밝기를 달리해 입체감을 낸다.
 * 0 = 빈 칸(지하철 입구) · 1 = 역사 + 깃발 · 2 = 빌딩 · 3 = 랜드마크 탑. c 는 주인 색(지붕)
 */
export function isoBuilding(level, c = LINE2) {
  const K = `stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"`, W = 'fill="#BFE3F5" stroke="#22201D" stroke-width="1.6"';
  const ground = (a, b) => `<path d="M-${a} 0 L0 -${b} L${a} 0 L0 ${b} Z" fill="#E8E1D2" ${K}/>`;
  if (level === 0) {
    return ground(22, 11) + `<path d="M-22 0 V8 L0 19 V11 Z" fill="#CFC6B3" ${K}/><path d="M22 0 V8 L0 19 V11 Z" fill="#B9AF9A" ${K}/>`
      + `<path d="M-12 -8 Q0 -24 12 -8 Z" fill="${LINE2}" ${K}/><rect x="-4" y="-16" width="8" height="9" fill="#FFFDF7" ${K}/>`;
  }
  if (level === 1) {
    return ground(24, 12) + `<path d="M-20 -22 L0 -32 L20 -22 V-2 L0 8 L-20 -2 Z" fill="#FFFDF7" ${K}/><path d="M0 -12 V8 L20 -2 V-22 Z" fill="#D9D0BE" ${K}/>`
      + `<path d="M-24 -22 L0 -42 L24 -22 L0 -10 Z" fill="${c}" ${K}/><path d="M0 -10 L24 -22 L0 -42 Z" fill="${shade(c)}" ${K}/>`
      + `<path d="M-14 -12 V-4 L-8 -1 V-9 Z" ${W}/><path d="M6 -6 V2 L12 -1 V-9 Z" ${W}/>`
      + `<path d="M24 -48 V-24" stroke="${INK}" stroke-width="2.5" stroke-linecap="round"/><path d="M24 -48 L38 -44 L24 -39 Z" fill="${c}" ${K}/>`;
  }
  if (level === 2) {
    return ground(26, 13) + `<path d="M-22 -46 L0 -57 L22 -46 V-2 L0 9 L-22 -2 Z" fill="#FFFDF7" ${K}/><path d="M0 -35 V9 L22 -2 V-46 Z" fill="#D9D0BE" ${K}/>`
      + `<path d="M-22 -46 L0 -57 L22 -46 L0 -35 Z" fill="${c}" ${K}/>`
      + ['-17 -34', '-17 -20', '-8 -30', '-8 -16'].map((p) => { const [a, b] = p.split(' ').map(Number); return `<path d="M${a} ${b} V${b + 7} L${a + 6} ${b + 10} V${b + 3} Z" ${W}/>`; }).join('')
      + ['5 -31', '14 -35', '5 -17', '14 -21'].map((p) => { const [a, b] = p.split(' ').map(Number); return `<path d="M${a} ${b} V${b + 7} L${a + 5} ${b + 4} V${b - 3} Z" ${W}/>`; }).join('');
  }
  return ground(30, 15) + `<path d="M-26 -20 L0 -33 L26 -20 V-2 L0 11 L-26 -2 Z" fill="${c}" ${K}/><path d="M0 -7 V11 L26 -2 V-20 Z" fill="${shade(c)}" ${K}/>`
    + `<path d="M-13 -78 L0 -84 L13 -78 V-12 L0 -6 L-13 -12 Z" fill="#FFFDF7" ${K}/><path d="M0 -72 V-6 L13 -12 V-78 Z" fill="#D9D0BE" ${K}/>`
    + `<path d="M-13 -78 L0 -106 L13 -78 L0 -72 Z" fill="#F2B33D" ${K}/>`
    + ['-62', '-46', '-30'].map((y) => `<path d="M-10 ${y} V${+y + 6} L-3 ${+y + 9} V${+y + 3} Z" ${W}/>`).join('')
    + `<path d="M0 -122 l3 6 6.5 1 -4.7 4.5 1.1 6.4 -5.9 -3.1 -5.9 3.1 1.1 -6.4 -4.7 -4.5 6.5 -1 z" fill="#F2B33D" stroke="${INK}" stroke-width="1.8" stroke-linejoin="round"/>`;
}
/** isoBuilding 하나만 담은 svg 의 틀(원점 = 바닥 가운데) */
export const ISO_BOX = { x: -42, y: -126, w: 84, h: 148 };
export const isoSvg = (level, c) => `<svg viewBox="${ISO_BOX.x} ${ISO_BOX.y} ${ISO_BOX.w} ${ISO_BOX.h}" aria-hidden="true">${isoBuilding(level, c)}</svg>`;

// ── 산 칸 건물 그림: Kenney City Kit Commercial(CC0) 3D 건물을 판 시점으로 찍은 것(tools/render-buildings.html) ──
// 단계마다(1 · 2 · 3) 주인 색(캐릭터 색) 한 장씩. 그림 틀 176×248, 바닥 가운데가 (50%, 86%)
const SPRITE = { w: 176, h: 248, ax: 0.5, ay: 0.86 };
/** 단계별 배율 — 칸보다 크지 않게(높이로 단계가 보인다) */
const SPRITE_K = { 1: 0.5, 2: 0.56, 3: 0.6 };
const kOf = (level) => SPRITE_K[Math.min(3, Math.max(1, level))];
const SPRITE_COLORS = new Set(['2f6fd0', 'f08a2e', 'e0533d', '8e5bc8', 'e2588f', '4c9a3a', '17a2a8', 'e39a1e', '8a5a3b']);
const spriteUrl = (level, color) => {
  const hex = String(color).replace('#', '').toLowerCase();
  return SPRITE_COLORS.has(hex) ? new URL(`../../assets/buildings/lv${Math.min(3, Math.max(1, level))}-${hex}.webp`, import.meta.url).href : null;
};
/** 판(화면 좌표)에 세울 건물: 그림이 있으면 그림, 없는 색이면 손그림 상자 */
function buildingSvg(gx, gy, level, color) {
  const src = spriteUrl(level, color);
  if (!src) return `<g transform="translate(${gx} ${gy}) scale(${ISO_K})">${isoBuilding(level, color)}</g>`;
  const w = SPRITE.w * kOf(level), h = SPRITE.h * kOf(level);
  return `<ellipse cx="${gx}" cy="${gy + 2}" rx="${w * 0.3}" ry="${w * 0.1}" fill="${INK}" opacity=".16"/><image href="${src}" x="${(gx - w * SPRITE.ax).toFixed(1)}" y="${(gy - h * SPRITE.ay).toFixed(1)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}"/>`;
}
/**
 * 증축 연출용 건물(화면 px): { html, w, h, anchor:[%, %] } — 판에 남을 건물과 같은 그림·크기·바닥
 */
export function buildingArt(level, color) {
  const src = spriteUrl(level, color);
  if (!src) return { html: isoSvg(level, color), w: ISO_BOX.w * ISO_K, h: ISO_BOX.h * ISO_K, anchor: [(-ISO_BOX.x / ISO_BOX.w) * 100, (-ISO_BOX.y / ISO_BOX.h) * 100] };
  return { html: `<img src="${src}" alt="" style="display:block;width:100%;height:100%">`, w: SPRITE.w * kOf(level), h: SPRITE.h * kOf(level), anchor: [SPRITE.ax * 100, SPRITE.ay * 100] };
}
/** 처음 살 때 그림이 늦게 뜨지 않게 미리 받아 둔다 */
export function preloadBuildings() {
  for (const hex of SPRITE_COLORS) for (const lv of [1, 2, 3]) { const im = new Image(); im.src = spriteUrl(lv, hex); }
}

/** 고리 칸 건물의 바닥(화면 좌표)과 크기. 노선도 판 · 모서리 칸이면 null */
export function groundOf(n) {
  if (MODE !== 'loop') return null;
  const i = RING.tiles.indexOf(n);
  if (i < 0 || RING.corners[n]) return null;
  return [...isoPt(...buildFlat(i)), ISO_K];
}
/** 칸이 솟은 높이 — 쿼터뷰 판은 칸이 솟지 않는다(건물이 단계를 보여 준다) */
export const liftOf = () => 0;

// ── 판의 살아 있는 것들: 유람선 · 지름길 열차 · 흔들리는 나무 ──
// 판은 살 때마다 다시 그려진다. 움직임이 처음으로 튀지 않게, 처음 그린 뒤 흐른 시간만큼 앞당겨 시작한다.
const T0 = performance.now();
const since = (dur, shift = 0) => `-${((((performance.now() - T0) / 1000) + shift) % dur).toFixed(2)}s`;
const calm = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** 유람선(오른쪽을 본다, 가운데가 원점) */
const BOAT = `<path d="M-30 6 h8 M-38 12 h10" stroke="#FFFDF7" stroke-width="3" stroke-linecap="round" opacity=".9"/>
  <path d="M-22 -2 H24 L15 11 H-15 Z" fill="#FFFDF7" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>
  <rect x="-12" y="-13" width="20" height="11" rx="3" fill="#E0533D" stroke="${INK}" stroke-width="3"/>
  <rect x="-8" y="-10" width="5" height="4" fill="#BFE3F5"/><rect x="0" y="-10" width="5" height="4" fill="#BFE3F5"/>`;
/** 지름길 두 칸 열차(오른쪽을 본다) */
const railTrain = (c) => `<rect x="-34" y="-9" width="32" height="18" rx="7" fill="#F4F1EA" stroke="${INK}" stroke-width="3"/>
  <rect x="0" y="-9" width="34" height="18" rx="8" fill="#F4F1EA" stroke="${INK}" stroke-width="3"/>
  <rect x="-34" y="2" width="68" height="4" fill="${c}"/><rect x="24" y="-5" width="7" height="6" rx="2" fill="#BFE3F5" stroke="${INK}" stroke-width="1.6"/>
  <rect x="-28" y="-5" width="7" height="5" fill="#BFE3F5"/><rect x="-16" y="-5" width="7" height="5" fill="#BFE3F5"/><rect x="6" y="-5" width="7" height="5" fill="#BFE3F5"/>`;

function ambient(river, railPaths) {
  if (calm()) return { back: '', mid: '' };
  const boats = !river ? '' : `<g><g>${BOAT}</g><animateMotion dur="38s" begin="${since(38)}" repeatCount="indefinite" rotate="auto" path="${river}"/></g>`;
  // 지름길 열차 · 비행기: 한쪽에서 나와 건너가고, 잠시 쉬었다가 다시
  const trains = railPaths.map(({ d, c }, k) => {
    const dur = 12, t = since(dur, k * 6);
    const body = RING.flights ? `<g transform="rotate(90) translate(-22 -22) scale(1.1)">${TOUR_ART.plane}</g>` : railTrain(c);
    return `<g opacity="0"><g>${body}</g><animateMotion dur="${dur}s" begin="${t}" repeatCount="indefinite" rotate="auto" keyPoints="0;0;1;1" keyTimes="0;.45;.8;1" calcMode="linear" path="${d}"/>`
      + `<animate attributeName="opacity" dur="${dur}s" begin="${t}" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;.44;.48;.77;.81;1"/></g>`;
  }).join('');
  return { back: boats, mid: trains };
}

/** 칸 i 의 판 가운데 쪽 가장자리 가운데(지름길이 닿는 곳, 평면) */
function innerPoint(i) {
  const r = loopRect(i);
  if (r.inner === 'top') return [r.x + r.w / 2, r.y + 4];
  if (r.inner === 'bottom') return [r.x + r.w / 2, r.y + r.h - 4];
  if (r.inner === 'right') return [r.x + r.w - 4, r.y + r.h / 2];
  return [r.x + 4, r.y + r.h / 2];
}

function loopSvg(state = {}) {
  const owner = state.owner || {}, level = state.level || {};
  const I0 = LM + LC, I1 = LM + LS - LC; // 가운데 마당(평면)
  // 지름길: 순환선은 레일, 관광 맵은 휜 점선(하늘길 · 고속선)
  const arcs = RING.flights || RING.arcs;
  const railPaths = [];
  const rails = RING.shortcuts.map(([a, b2, col, label, line], k) => {
    const p = innerPoint(RING.tiles.indexOf(a)), q = innerPoint(RING.tiles.indexOf(b2));
    let mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (arcs) { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, off = k === 0 ? 110 : -110; mx += (-dy / L) * off; my += (dx / L) * off; }
    else mx += k === 0 ? -70 : 70;
    const d = `M${p[0]} ${p[1]} Q${mx} ${my} ${q[0]} ${q[1]}`;
    railPaths.push({ d, c: col });
    const mark = line ?? (RING.flights ? '' : 'KTX');
    const badge = ([x, y]) => `<circle cx="${x}" cy="${y}" r="18" fill="${col}" stroke="${INK}" stroke-width="3.5"/>`
      + (mark !== '' ? txt(x, y + (String(mark).length > 1 ? 5 : 7), mark, { size: String(mark).length > 1 ? 11 : 20, fill: '#FFFDF7' }) : `<svg x="${x - 12}" y="${y - 12}" width="24" height="24" viewBox="0 0 40 40">${TOUR_ART.plane}</svg>`);
    if (arcs) return `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" opacity=".6"/><path d="${d}" fill="none" stroke="${col}" stroke-width="6" stroke-linecap="round" stroke-dasharray="18 12"/>` + badge(p) + badge(q);
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="28" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="18" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#FFFDF7" stroke-width="4" stroke-dasharray="10 12" stroke-linecap="round" opacity=".9"/>` + badge(p) + badge(q);
  }).join('');
  // 이어서 가진 칸: 판 가운데 쪽 가장자리를 주인 색 띠로 잇는다
  const chain = (state.links || []).map((e) => {
    const ia = RING.tiles.indexOf(e.a), ib = RING.tiles.indexOf(e.b);
    if (ia < 0 || ib < 0) return '';
    const [ax, ay] = innerPoint(ia), [bx, by] = innerPoint(ib);
    return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${INK}" stroke-width="14" stroke-linecap="round"/><line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${e.color}" stroke-width="8" stroke-linecap="round"/>`;
  }).join('');
  const made = RING.tiles.map((n, i) => ({ n, t: loopTile(n, i, owner, level) }));
  const tiles = made.map(({ n, t }) => `<g class="lt" data-n="${n}">${t.tile}</g>`).join('');
  const blds = made.filter(({ t }) => t.bld).sort((a, b) => a.t.y - b.t.y).map(({ t }) => t.bld).join('');
  const sc = SCENES[RING.scene || 'seoul'](I0, I1);
  const amb = ambient(sc.river, railPaths);
  const cx = (I0 + I1) / 2;
  // 판 바깥 배경: 판마다 은은한 색 + 물결 결(판이 바다·들판 위에 놓인 듯)
  const BACK = { seoul: ['#DCEBC9', '#CFE3B9'], korea: ['#CDE8F4', '#BCDFEF'], world: ['#D3E4F6', '#C2D8F0'] }[RING.scene || 'seoul'];
  const backdrop = `<defs><pattern id="bvBack" width="90" height="46" patternUnits="userSpaceOnUse"><path d="M6 30 q 12 -10 24 0 t 24 0" fill="none" stroke="${BACK[1]}" stroke-width="4" stroke-linecap="round"/></pattern></defs>`
    + `<rect x="-400" y="-400" width="${PW + 800}" height="${PH + 800}" fill="${BACK[0]}"/><rect x="-400" y="-400" width="${PW + 800}" height="${PH + 800}" fill="url(#bvBack)"/>`;
  return `<svg class="mat loop-mat" viewBox="0 0 ${PW} ${PH}" width="${PW}" height="${PH}" aria-hidden="true" overflow="visible">
    ${backdrop}
    ${baseSvg()}
    <g transform="${MATRIX}">
      ${topSvg()}
      <clipPath id="parkClip"><rect x="${I0 + 10}" y="${I0 + 10}" width="${I1 - I0 - 20}" height="${I1 - I0 - 20}" rx="30"/></clipPath>
      <rect x="${I0 + 10}" y="${I0 + 10}" width="${I1 - I0 - 20}" height="${I1 - I0 - 20}" rx="30" fill="${sc.fill}" stroke="${INK}" stroke-width="4"/>
      <g clip-path="url(#parkClip)"><g transform="rotate(-45 ${cx} ${cx})">${sc.art}${amb.back}</g></g>
      <g>${rails}</g>
      ${amb.mid}
      <g>${tiles}</g><g>${chain}</g>
    </g>
    ${logoSvg(...isoPt(cx, cx), sc)}
    <g>${blds}</g>
  </svg>`;
}

/** 판 가운데 위에 똑바로 선 로고 간판(받침 그림자 + 두께) */
function logoSvg(x0, y0, sc) {
  const [dx, dy] = sc.logo || [0, -30], x = x0 + dx, y = y0 + dy;
  return `<g><ellipse cx="${x}" cy="${y + 66}" rx="120" ry="20" fill="${INK}" opacity=".18"/>
    <rect x="${x - 6}" y="${y + 20}" width="12" height="46" fill="#8A5A2C" stroke="${INK}" stroke-width="3"/>
    <rect x="${x - 128}" y="${y - 50}" width="256" height="96" rx="26" fill="${INK}"/>
    <rect x="${x - 128}" y="${y - 58}" width="256" height="96" rx="26" fill="#FFFDF7" stroke="${INK}" stroke-width="5"/>
    <path d="M${x - 108} ${y - 48} H${x + 108}" stroke="#FFFFFF" stroke-width="4" stroke-linecap="round" opacity=".9"/>
    ${txt(x, y - 2, '역전', { size: 56, font: DISPLAY, weight: 400 })}${txt(x, y + 26, sc.sub, { size: 17, fill: sc.subColor })}</g>`;
}

// ── 판 받침 ────────────────────────────────────────────────
/** 판 윗면(평면): 나무 테 + 바탕 */
function topSvg() {
  const o = LM - 30, W = LS + 60;
  return `<rect x="${o}" y="${o}" width="${W}" height="${W}" rx="26" fill="#C2915C" stroke="${INK}" stroke-width="6"/>
    <rect x="${o + 8}" y="${o + 8}" width="${W - 16}" height="${W - 16}" rx="20" fill="none" stroke="#E2B47C" stroke-width="4"/>
    <rect x="${LM - 12}" y="${LM - 12}" width="${LS + 24}" height="${LS + 24}" rx="16" fill="#F4E8CF" stroke="${INK}" stroke-width="4"/>`;
}
/** 판 두께(화면): 앞쪽 두 옆면 + 바닥 그림자 */
function baseSvg() {
  const o = LM - 30, W = LS + 60;
  const D = isoPt(o, o + W), C = isoPt(o + W, o + W), B = isoPt(o + W, o), A = isoPt(o, o);
  const down = ([x, y], t) => `${x.toFixed(1)} ${(y + t).toFixed(1)}`;
  return `<path d="M${down(A, 26)} L${down(B, 26)} L${down(C, 26)} L${down(D, 26)} Z" fill="${INK}" opacity=".22" transform="translate(0 ${THICK - 10})"/>`
    + `<path d="M${down(D, 0)} L${down(C, 0)} L${down(C, THICK)} L${down(D, THICK)} Z" fill="#A9763F" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
    + `<path d="M${down(C, 0)} L${down(B, 0)} L${down(B, THICK)} L${down(C, THICK)} Z" fill="#8A5A2C" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`
    + `<path d="M${down(D, THICK * 0.45)} L${down(C, THICK * 0.45)} L${down(B, THICK * 0.45)}" fill="none" stroke="#C99A62" stroke-width="3" opacity=".7"/>`;
}

// ── 판 가운데 그림(평면에 칠한다, 로고는 따로) ──────────────────────
// 판마다 { back, river(유람선 길), sub(로고 아래 글자), subColor } — 장식은 덜고 판의 얼굴만 크게

/** 부드러운 곡선(점 목록 → 베지어). closed 면 닫는다 */
function smoothPath(P, closed = true) {
  const n = P.length;
  if (n < 2) return '';
  const at = (i) => (closed ? P[(i + n) % n] : P[Math.max(0, Math.min(n - 1, i))]);
  let d = `M${P[0][0].toFixed(1)} ${P[0][1].toFixed(1)}`;
  for (let i = 0; i < (closed ? n : n - 1); i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
    d += ` C${(p1[0] + (p2[0] - p0[0]) / 6).toFixed(1)} ${(p1[1] + (p2[1] - p0[1]) / 6).toFixed(1)} ${(p2[0] - (p3[0] - p1[0]) / 6).toFixed(1)} ${(p2[1] - (p3[1] - p1[1]) / 6).toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`;
  }
  return closed ? d + 'Z' : d;
}
/** 땅 둘레 연안 띠(바다 위 옅은 테) */
const halo = (paths) => [[40, 'rgba(255,255,255,.35)'], [18, 'rgba(255,255,255,.45)']].map(([w, c]) => paths.map((d) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`).join('')).join('');

// 남한(경도 · 위도) — 서해 → 남해 → 동해 → 휴전선
const SK = [[126.15, 37.75], [126.6, 37.47], [126.66, 37.2], [126.86, 36.96], [126.5, 36.95], [126.14, 36.76], [126.36, 36.55], [126.52, 36.3], [126.62, 36.1], [126.76, 35.98], [126.56, 35.73], [126.45, 35.58], [126.5, 35.4], [126.3, 35.12], [126.42, 34.86], [126.25, 34.6], [126.42, 34.38], [126.62, 34.3],
  [126.92, 34.45], [127.25, 34.56], [127.6, 34.7], [127.82, 34.83], [128.06, 34.88], [128.4, 34.85], [128.66, 34.73], [128.77, 34.96], [129.05, 35.08],
  [129.3, 35.35], [129.46, 35.66], [129.57, 36.05], [129.43, 36.36], [129.45, 36.8], [129.4, 37.06], [129.2, 37.42], [128.95, 37.73], [128.75, 37.97], [128.55, 38.26], [128.36, 38.6],
  [127.9, 38.31], [127.4, 38.33], [126.9, 37.96], [126.6, 37.82]];
const JEJU = [[126.15, 33.33], [126.3, 33.23], [126.6, 33.22], [126.9, 33.36], [126.96, 33.49], [126.7, 33.56], [126.35, 33.5], [126.18, 33.42]];
// 세계(경도 · 위도)
const WORLD = [
  [[-165, 65], [-160, 71], [-140, 70], [-120, 72], [-96, 70], [-80, 73], [-64, 62], [-56, 52], [-66, 45], [-75, 40], [-81, 31], [-80, 25.5], [-90, 29.5], [-97, 26], [-97, 20], [-90, 16], [-83, 9], [-78, 8], [-87, 13], [-105, 20], [-110, 24], [-115, 30], [-118, 34], [-124, 40], [-124, 48], [-131, 55], [-140, 60], [-152, 59], [-165, 60]],
  [[-50, 60], [-42, 61], [-22, 70], [-20, 79], [-35, 80], [-58, 79], [-68, 76], [-58, 70], [-53, 65]],
  [[-78, 8], [-72, 12], [-62, 10], [-50, 2], [-35, -6], [-38, -14], [-40, -22], [-48, -28], [-58, -38], [-65, -42], [-68, -52], [-73, -50], [-74, -40], [-71, -30], [-70, -18], [-76, -12], [-81, -5], [-80, 0], [-77, 6]],
  [[-9, 37], [-9, 43], [-2, 44], [-5, 48], [2, 51], [8, 54], [10, 58], [5, 62], [15, 69], [25, 71], [40, 68], [60, 70], [80, 73], [100, 76], [115, 74], [140, 72], [160, 70], [180, 68], [178, 64], [163, 60], [156, 51], [150, 59], [140, 54], [135, 44], [130, 42], [129, 36], [126, 35], [124, 39], [121, 40], [122, 37], [120, 35], [121, 30], [117, 24], [110, 21], [109, 12], [105, 9], [100, 13], [103, 1.5], [101, 3], [98, 8], [98, 16], [94, 18], [91, 22], [87, 21], [80, 15], [77, 8], [73, 18], [70, 22], [66, 25], [57, 25], [59, 22], [52, 16], [44, 12], [43, 15], [39, 22], [35, 28], [34, 31], [36, 36], [30, 36], [27, 37], [26, 40], [23, 37], [20, 40], [18, 40], [16, 38], [12, 42], [9, 44], [3, 43], [-1, 37], [-6, 36]],
  [[-17, 21], [-17, 15], [-12, 6], [-8, 4], [2, 6], [9, 4], [9, -1], [13, -6], [12, -15], [15, -27], [18, -34], [26, -34], [32, -28], [35, -20], [40, -15], [40, -5], [43, 0], [51, 11], [43, 12], [37, 22], [33, 31], [25, 32], [20, 31], [10, 33], [10, 37], [0, 36], [-6, 35], [-10, 30], [-13, 27]],
  [[114, -22], [114, -34], [118, -35], [125, -33], [130, -32], [135, -35], [140, -38], [147, -39], [150, -36], [153, -28], [153, -25], [146, -19], [142, -11], [136, -12], [130, -12], [125, -15], [122, -18]],
  [[130, 31], [133, 33.5], [136, 34], [140, 35], [141.5, 38], [142, 41], [141, 45], [139.5, 42], [138, 37], [134, 35.5], [131, 34.5]],
  [[-5.5, 50], [1.5, 51.2], [0, 53], [-1.5, 55], [-3, 58.5], [-6, 57.5], [-5, 54.5], [-3.2, 53.4], [-4.8, 52]],
  [[95, 5.5], [100, 1], [106, -6], [104, -5], [98, 2]], [[109, 1.5], [116, 6], [119, 1], [116, -3.5], [110, -2.5]],
  [[44, -12.5], [50, -15], [47.5, -25], [44, -22]], [[172.5, -34.5], [178.5, -37.5], [175, -41.5], [171, -46], [167, -45.5]]
];

// 장면 그림은 판 가운데 마당에서 -45° 돌려 칠한다 — 눕힌 판에서 북쪽이 화면 위로 온다
const SCENES = {
  seoul(I0, I1) {
    const c = (I0 + I1) / 2;
    const river = `M${I0 - 160} ${c + 30} C ${I0 + 90} ${c - 40}, ${I0 + 230} ${c + 110}, ${c + 70} ${c + 40} S ${I1 - 20} ${c - 20}, ${I1 + 160} ${c + 20}`;
    const bridge = (x, y, rot) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 12}" y="${y - 44}" width="24" height="88" rx="4" fill="#E8E1D2" stroke="${INK}" stroke-width="3"/><path d="M${x} ${y - 40} V${y + 40}" stroke="#F2B33D" stroke-width="2.5" stroke-dasharray="7 6"/></g>`;
    return {
      fill: '#CFE8B5',
      art: `<path d="${river}" fill="none" stroke="${INK}" stroke-width="66" stroke-linecap="round"/><path d="${river}" fill="none" stroke="#9FD6F0" stroke-width="58" stroke-linecap="round"/><path d="${river}" fill="none" stroke="#C4E8F8" stroke-width="22" stroke-linecap="round"/>`
        + bridge(c - 150, c + 12, 6) + bridge(c + 190, c + 18, -4),
      river, logo: [0, -70], sub: '2호선 순환선', subColor: '#2FA84F'
    };
  },
  korea(I0, I1) {
    const c = (I0 + I1) / 2, K = 62;
    // 눕히면 세로가 0.58 로 눌리니 미리 늘려 그린다
    const P = ([lon, lat]) => [c - 30 + (lon - 127.8) * K, c - 330 + (38.7 - lat) * K * 1.9];
    const land = smoothPath(SK.map(P)), jeju = smoothPath(JEJU.map(P));
    return {
      fill: '#9FD6F0',
      art: halo([land, jeju]) + [land, jeju].map((d) => `<path d="${d}" fill="${INK}" opacity=".18" transform="translate(5 6)"/><path d="${d}" fill="#C9E5B0" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>`).join(''),
      river: `M${I0 - 60} ${I1 - 40} Q${c} ${I1 + 10} ${I1 + 60} ${I1 - 70}`, logo: [210, -40], sub: '한반도 KTX 일주', subColor: '#2F6FD0'
    };
  },
  world(I0, I1) {
    const c = (I0 + I1) / 2, K = 2.25;
    const P = ([lon, lat]) => [c + (lon - 10) * K, c + 60 + (20 - lat) * K * 2.0];
    const lands = WORLD.map((pts) => smoothPath(pts.map(P)));
    return {
      fill: '#9FD6F0',
      art: halo(lands) + lands.map((d) => `<path d="${d}" fill="${INK}" opacity=".16" transform="translate(4 5)"/>`).join('') + lands.map((d) => `<path d="${d}" fill="#F1DFAE" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`).join(''),
      river: `M${I0 - 60} ${c + 260} Q${c} ${c + 300} ${I1 + 60} ${c + 250}`, logo: [0, -150], sub: '세계 일주 항공로', subColor: '#2F6BD8'
    };
  }
};
