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

// ── 고리 판(부루마블식) — 2호선 순환선 · 국내 여행 · 세계 일주 ──────────────
// 32칸 고리: 오른쪽 아래 출발 칸에서 왼쪽으로 출발해 시계 방향. 칸은 둥근 블록(두께 있는 먹선), 안쪽 가장자리에 구역 색 띠,
// 가운데는 판마다 다른 그림(공원과 한강 · 남한 지도 · 세계 지도), 그 위를 지름길(레일 · 하늘길)이 가로지른다.

const LT = 92, LC = 140, LS = LT * 7 + LC * 2, LM = 44;   // 칸 폭 · 모서리 · 판 한 변 · 바깥 여백
const LGEO = { w: LS + LM * 2, h: LS + LM * 2 + 18 };
let MODE = 'map', RING = LOOP;
/** 판 모양: 고리 판 id('loop' · 'korea' · 'world')면 그 고리, 아니면 노선도 — 게임 화면을 열 때 정한다 */
export function useBoard(mode) { const r = ringOf(mode); MODE = r ? 'loop' : 'map'; RING = r || LOOP; }
export const boardMode = () => MODE;
/** 지금 그리는 고리 판(노선도면 null) */
export const boardRing = () => (MODE === 'loop' ? RING : null);

/** 순환선 칸 i 의 사각형. inner 는 판 가운데 쪽 가장자리 */
function loopRect(i) {
  const R = LM + LS - LC;
  if (i === 0) return { x: R, y: R, w: LC, h: LC };
  if (i < 8) return { x: R - i * LT, y: R, w: LT, h: LC, inner: 'top' };
  if (i === 8) return { x: LM, y: R, w: LC, h: LC };
  if (i < 16) return { x: LM, y: R - (i - 8) * LT, w: LC, h: LT, inner: 'right' };
  if (i === 16) return { x: LM, y: LM, w: LC, h: LC };
  if (i < 24) return { x: LM + LC + (i - 17) * LT, y: LM, w: LT, h: LC, inner: 'bottom' };
  if (i === 24) return { x: R, y: LM, w: LC, h: LC };
  return { x: R, y: LM + LC + (i - 25) * LT, w: LC, h: LT, inner: 'left' };
}
/** 판마다 칸 가운데 자리(한 번만 센다) */
const XY = {};
const ringXY = () => (XY[RING.id] ||= Object.fromEntries(RING.tiles.map((n, i) => { const r = loopRect(i); return [n, [r.x + r.w / 2, r.y + r.h / 2 + 8]]; })));
const BAND = 26;
/** 주인 색을 흰색 쪽으로 옅게 */
function tint(hex, k = 0.62) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(x + (255 - x) * k));
  return `rgb(${c.join(',')})`;
}
const txt = (x, y, s, { size = 25, fill = INK, weight = 900, font = 'Pretendard Variable, Pretendard, sans-serif', anchor = 'middle' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" font-family="${font}">${s}</text>`;
const DISPLAY = 'Gasoek One, sans-serif';

/** 모서리 칸 그림 */
const CORNER_ART = {
  start: (cx, cy) => `<path d="M${cx + 34} ${cy - 22} H${cx - 14} V${cy - 40} L${cx - 50} ${cy - 10} L${cx - 14} ${cy + 20} V${cy + 2} H${cx + 34} Z" fill="#E0533D" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`
    + `<circle cx="${cx + 34}" cy="${cy + 26}" r="15" fill="#F2B33D" stroke="${INK}" stroke-width="3.5"/>${txt(cx + 34, cy + 33, '₩', { size: 18 })}`,
  festival: (cx, cy) => [[-26, -14, '#E2588F'], [2, -30, '#F2B33D'], [28, -12, '#2F6BD8']].map(([dx, dy, c]) =>
    `<path d="M${cx + dx} ${cy + dy + 16} Q${cx + dx - 6} ${cy + dy + 30} ${cx + dx + 2} ${cy + 26}" fill="none" stroke="${INK}" stroke-width="2.5"/><ellipse cx="${cx + dx}" cy="${cy + dy}" rx="14" ry="17" fill="${c}" stroke="${INK}" stroke-width="3.5"/><ellipse cx="${cx + dx - 5}" cy="${cy + dy - 6}" rx="3.5" ry="5" fill="#FFFDF7" opacity=".8"/>`).join(''),
  express: (cx, cy) => `<rect x="${cx - 34}" y="${cy - 34}" width="68" height="58" rx="18" fill="#2F6BD8" stroke="${INK}" stroke-width="4"/><rect x="${cx - 24}" y="${cy - 24}" width="48" height="20" rx="5" fill="#BFE3F5" stroke="${INK}" stroke-width="3"/>`
    + `<circle cx="${cx - 18}" cy="${cy + 10}" r="5" fill="#F7C94A" stroke="${INK}" stroke-width="2.5"/><circle cx="${cx + 18}" cy="${cy + 10}" r="5" fill="#F7C94A" stroke="${INK}" stroke-width="2.5"/>`
    + `<path d="M${cx + 6} ${cy - 54} L${cx - 8} ${cy - 30} H${cx + 2} L${cx - 6} ${cy - 12}" fill="none" stroke="#F2B33D" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/>`,
  maze: (cx, cy) => `<rect x="${cx - 36}" y="${cy - 36}" width="72" height="62" rx="12" fill="#FFFDF7" stroke="${INK}" stroke-width="4"/>`
    + `<path d="M${cx - 24} ${cy - 24} H${cx + 24} V${cy + 14} H${cx - 12} V${cy - 12} H${cx + 12} V${cy + 2}" fill="none" stroke="#8E5BC8" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${cx}" cy="${cy - 2}" r="5" fill="#E0533D" stroke="${INK}" stroke-width="2"/>`
};
const CORNER_FILL = { start: '#FFE3DA', festival: '#FFE2EF', express: '#DDEBFB', maze: '#EDE3F7' };
/** 모서리 칸 바탕 햇살 · 이름 리본 색 */
const CORNER_RAY = { start: '#FFCDBE', festival: '#FFC7DE', express: '#C2DAF7', maze: '#DCCBF0' };
const CORNER_RIBBON = { start: '#E0533D', festival: '#E2588F', express: '#2F6BD8', maze: '#8E5BC8' };

/**
 * 칸 받침: 바닥 그림자 + 두께(옆면 색) + 윗면. lift 만큼 솟아 있으면 두께가 그만큼 길다.
 * 윗면은 (x, y - lift) 에서 시작한다.
 */
function slabOf(x, y, w, h, face, side, lift = 0) {
  return `<rect x="${x}" y="${y + 8}" width="${w}" height="${h}" rx="20" fill="${INK}"/>`
    + `<rect x="${x}" y="${y - lift + 5}" width="${w}" height="${h + lift}" rx="20" fill="${side}" stroke="${INK}" stroke-width="4"/>`
    + `<rect x="${x}" y="${y - lift}" width="${w}" height="${h}" rx="20" fill="${face}" stroke="${INK}" stroke-width="4"/>`;
}
/** 빛 받은 윗면 가장자리(안쪽 흰 테) */
const bevel = (x, y, w, h, r = 16) => `<rect x="${x + 4.5}" y="${y + 4.5}" width="${w - 9}" height="${h - 9}" rx="${r}" fill="none" stroke="#FFFFFF" stroke-opacity=".8" stroke-width="2.5"/>`;
/** 값 칩: 동전 + 숫자 */
const priceChip = (cx, cy, v) => `<rect x="${cx - 25}" y="${cy - 9.5}" width="50" height="19" rx="9.5" fill="#FFF3D1" stroke="${INK}" stroke-width="2.2"/>`
  + `<circle cx="${cx - 14.5}" cy="${cy}" r="6" fill="#F2B33D" stroke="${INK}" stroke-width="1.8"/><path d="M${cx - 17} ${cy - 1.5} H${cx - 12} M${cx - 14.5} ${cy - 1.5} V${cy + 3}" stroke="${INK}" stroke-width="1.4" stroke-linecap="round"/>`
  + txt(cx + 5.5, cy + 4.6, v, { size: 12.5 });
/** 이름 리본(양끝이 V 로 파인 띠) */
const ribbon = (cx, y, w, color, text, size) => {
  const x0 = cx - w / 2, x1 = cx + w / 2, hh = 26;
  return `<path d="M${x0 - 6} ${y + 4} H${x0 + 6} V${y + hh + 4} H${x0 - 6} L${x0} ${y + hh / 2 + 4} Z" fill="${shade(color, 0.35)}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
    + `<path d="M${x1 + 6} ${y + 4} H${x1 - 6} V${y + hh + 4} H${x1 + 6} L${x1} ${y + hh / 2 + 4} Z" fill="${shade(color, 0.35)}" stroke="${INK}" stroke-width="2.5" stroke-linejoin="round"/>`
    + `<rect x="${x0}" y="${y}" width="${w}" height="${hh}" rx="5" fill="${color}" stroke="${INK}" stroke-width="3"/>`
    + `<path d="M${x0 + 6} ${y + 5} H${x1 - 6}" stroke="#FFFFFF" stroke-opacity=".45" stroke-width="2" stroke-linecap="round"/>`
    + txt(cx, y + hh / 2 + size * 0.36, text, { size, font: DISPLAY, weight: 400, fill: '#FFFDF7' });
};

function loopTile(n, i, owner, level) {
  const r = loopRect(i), x = r.x + 5, y = r.y + 5, w = r.w - 10, h = r.h - 10;
  const own = owner[n], lv = level[n] || 0, c = RING.corners[n];
  const cx = x + w / 2;
  const clip = (id, inner) => `<clipPath id="${id}${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"/></clipPath><g clip-path="url(#${id}${i})">${inner}</g>`;
  if (c) {
    // 모서리: 햇살 바탕 + 큰 그림(그림자) + 이름 리본. 관광 맵은 제 그림(열차 · 휴게소 · 비행기 …), 순환선은 종류 그림
    const k = c.kind, cy0 = y + h / 2 - 12;
    const rays = Array.from({ length: 12 }, (_, j) => {
      const a0 = (j * 30 * Math.PI) / 180, a1 = ((j * 30 + 15) * Math.PI) / 180, R = 130;
      return `<path d="M${cx} ${cy0} L${(cx + R * Math.cos(a0)).toFixed(1)} ${(cy0 + R * Math.sin(a0)).toFixed(1)} L${(cx + R * Math.cos(a1)).toFixed(1)} ${(cy0 + R * Math.sin(a1)).toFixed(1)} Z" fill="${CORNER_RAY[k]}"/>`;
    }).join('');
    const art = c.icon && TOUR_ART[c.icon] ? `<svg x="${cx - 36}" y="${cy0 - 40}" width="72" height="72" viewBox="0 0 40 40" overflow="visible">${TOUR_ART[c.icon]}</svg>` : CORNER_ART[c.kind](cx, cy0 + 2);
    return slabOf(x, y, w, h, CORNER_FILL[k], shade(CORNER_RIBBON[k], 0.05)) + clip('lc', rays) + bevel(x, y, w, h)
      + `<ellipse cx="${cx}" cy="${cy0 + 36}" rx="34" ry="7" fill="${INK}" opacity=".14"/>` + art
      + ribbon(cx, y + h - 38, w - 30, CORNER_RIBBON[k], c.name, c.name.length > 5 ? 14 : c.name.length > 3 ? 17 : 20);
  }
  if (isChance(n)) {
    // 찬스: 사선 줄무늬 노란 표 + 양쪽 표 구멍 + 물음표 배지
    const wide = w > h;
    const stripes = Array.from({ length: 14 }, (_, j) => `<path d="M${x - 140 + j * 22} ${y + h + 10} L${x + j * 22} ${y - 10}" stroke="#FFFFFF" stroke-opacity=".28" stroke-width="7"/>`).join('');
    const holes = (wide ? [[cx, y], [cx, y + h]] : [[x, y + h / 2], [x + w, y + h / 2]]).map(([a, b]) => `<circle cx="${a}" cy="${b}" r="8" fill="#F1E3C6" stroke="${INK}" stroke-width="3"/>`).join('');
    const [bx, by] = wide ? [x + 40, y + h / 2] : [cx, y + h / 2 - 12];
    const lbl = RING.chanceName;
    return slabOf(x, y, w, h, '#F7C94A', '#D39A1E') + clip('lq', stripes) + bevel(x, y, w, h)
      + `<rect x="${x + 9}" y="${y + 9}" width="${w - 18}" height="${h - 18}" rx="12" fill="none" stroke="#FFFDF7" stroke-width="2.5" stroke-dasharray="7 6"/>` + holes
      + `<circle cx="${bx}" cy="${by + 3}" r="23" fill="${INK}"/><circle cx="${bx}" cy="${by}" r="23" fill="#FFFDF7" stroke="${INK}" stroke-width="3.5"/>`
      + txt(bx, by + 13, '?', { size: 36, font: DISPLAY, weight: 400, fill: '#E0533D' })
      + (wide ? txt(x + w - 40, y + h / 2 + 6, lbl, { size: lbl.length > 2 ? 14 : 17, fill: '#6B4E0E' })
        : txt(cx, y + h - 16, lbl, { size: lbl.length > 2 ? 14 : 17, fill: '#6B4E0E' }));
  }
  // 그림: 명소역은 명소 그림, 관광 맵 칸은 여행지 그림
  const hot = isHot(n), side = RING.colorOf(n) || '#8A8173';
  const pic = hot ? HOT_ART[n] : TOUR_ART[RING.icons?.[n]] || null;
  // 산 칸은 판에서 솟는다(단계마다 더 높이) — 솟은 만큼 옆면이 주인 색 그늘로 보인다. 빈 칸 옆면은 구역 색
  const lift = own ? 3 + 2 * lv : 0;
  let out = slabOf(x, y, w, h, own ? tint(own) : hot ? '#FFF4D6' : '#FFFDF7', own ? shade(own) : shade(side, 0.12), lift);
  out += `<g transform="translate(0 ${-lift})"><clipPath id="lt${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"/></clipPath>`;
  const b = r.inner === 'top' ? [x, y, w, BAND] : r.inner === 'bottom' ? [x, y + h - BAND, w, BAND] : r.inner === 'right' ? [x + w - BAND, y, BAND, h] : [x, y, BAND, h];
  // 구역 띠: 색 띠 + 가는 흰 줄(띠와 몸통 사이)
  const seam = r.inner === 'top' ? `M${x} ${y + BAND} H${x + w}` : r.inner === 'bottom' ? `M${x} ${y + h - BAND} H${x + w}` : r.inner === 'right' ? `M${x + w - BAND} ${y} V${y + h}` : `M${x + BAND} ${y} V${y + h}`;
  out += `<g clip-path="url(#lt${i})"><rect x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}" fill="${own || side}"/><path d="${seam}" stroke="${INK}" stroke-width="3"/></g>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="none" stroke="${INK}" stroke-width="4"/>` + bevel(x, y, w, h);
  // 몸통(띠를 뺀 곳): 아래에 역명판, 그 위에 건물. 넓은 칸(옆줄)은 건물을 왼쪽에, 값은 오른쪽에
  const body = r.inner === 'top' ? [x, y + BAND, w, h - BAND] : r.inner === 'bottom' ? [x, y, w, h - BAND] : r.inner === 'right' ? [x, y, w - BAND, h] : [x + BAND, y, w - BAND, h];
  const wide = body[2] > body[3];
  const plate = { x: body[0] + 5, y: body[1] + body[3] - 30, w: body[2] - 10, h: 24 };
  const name = RING.nameOf(n);
  out += `<rect x="${plate.x}" y="${plate.y + 3}" width="${plate.w}" height="${plate.h}" rx="12" fill="${INK}"/><rect x="${plate.x}" y="${plate.y}" width="${plate.w}" height="${plate.h}" rx="12" fill="${RING.lineColor || LINE2}" stroke="${INK}" stroke-width="3"/>`
    + `<path d="M${plate.x + 9} ${plate.y + 5} H${plate.x + plate.w - 9}" stroke="#FFFFFF" stroke-opacity=".35" stroke-width="2" stroke-linecap="round"/>`
    + txt(plate.x + plate.w / 2, plate.y + 17.5, name, { size: Math.min(15, ((plate.w - 8) / name.length) * 1.05), fill: '#FFFDF7' });
  const g = groundOf(n, own ? lv || 1 : 0) || [body[0] + body[2] / 2, plate.y - 22, ISO_K];
  if (!own) out += wide ? priceChip(body[0] + body[2] - 30, plate.y - 16, stationPrice(n)) : priceChip(g[0], plate.y - 13, stationPrice(n));
  if (pic && own) out += `<circle cx="${body[0] + body[2] - 18}" cy="${body[1] + 16}" r="14" fill="#FFFDF7" stroke="${INK}" stroke-width="2.5"/><svg x="${body[0] + body[2] - 29}" y="${body[1] + 5}" width="22" height="22" viewBox="0 0 40 40" overflow="visible">${pic}</svg>`;
  out += '</g>';
  // 건물은 칸을 다 깐 뒤 따로(뒤에서 앞으로) 세운다 — 높은 탑이 옆 칸 위로 솟아도 가려지지 않게
  const by = g[1] - lift;
  const up = wide ? 0 : 10; // 빈 칸 그림은 값 칩 위로
  const bld = pic && !own ? `<ellipse cx="${g[0]}" cy="${by - up - 3}" rx="19" ry="5" fill="${INK}" opacity=".16"/><svg x="${g[0] - 25}" y="${by - up - 50}" width="50" height="50" viewBox="0 0 40 40" overflow="visible">${pic}</svg>`
    : `<g transform="translate(${g[0]} ${by - (own ? 0 : up)}) scale(${g[2]})">${isoBuilding(own ? lv || 1 : 0, own)}</g>`;
  return { tile: out, bld: `<g class="lb" data-n="${n}">${bld}</g>`, y: by };
}

/** 주인 색을 검은색 쪽으로 짙게(솟은 칸 옆면 · 건물 옆면) */
function shade(hex, k = 0.32) {
  const v = parseInt(hex.slice(1), 16), c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(x * (1 - k)));
  return `rgb(${c.join(',')})`;
}

const LINE2 = '#3CB44A';
const ISO_K = 0.72;
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
/** isoBuilding 하나만 담은 svg(증축 연출이 판에 남을 건물과 똑같은 그림으로 솟게) — 원점이 아래에서 FOOT 비율 위 */
export const ISO_BOX = { x: -42, y: -126, w: 84, h: 148 };
export const isoSvg = (level, c) => `<svg viewBox="${ISO_BOX.x} ${ISO_BOX.y} ${ISO_BOX.w} ${ISO_BOX.h}" aria-hidden="true">${isoBuilding(level, c)}</svg>`;

/** 순환선 칸 건물의 바닥 가운데(판 좌표, 솟음 빼고). 노선도 판이면 null */
export function groundOf(n, lv = 0) {
  if (MODE !== 'loop') return null;
  const i = RING.tiles.indexOf(n);
  if (i < 0 || RING.corners[n]) return null;
  const r = loopRect(i), x = r.x + 5, y = r.y + 5, w = r.w - 10, h = r.h - 10;
  const body = r.inner === 'top' ? [x, y + BAND, w, h - BAND] : r.inner === 'bottom' ? [x, y, w, h - BAND] : r.inner === 'right' ? [x, y, w - BAND, h] : [x + BAND, y, w - BAND, h];
  const wide = body[2] > body[3], plateY = body[1] + body[3] - 30;
  // 넓은 칸(옆줄)은 낮아서 건물을 조금 작게 — 랜드마크 탑은 위 칸 이름을 가리지 않을 만큼
  return wide ? [body[0] + 36, plateY - 8, lv >= 3 ? 0.42 : 0.56] : [body[0] + body[2] / 2, plateY - 20, ISO_K];
}
/** 그 칸이 지금 솟은 높이(산 칸) */
export const liftOf = (lv) => (lv ? 3 + 2 * lv : 0);

// ── 판의 살아 있는 것들: 한강 유람선 · 지름길 열차 · 구름 · 흔들리는 나무 ──
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
const CLOUD = `<g fill="#FFFDF7" opacity=".75"><ellipse cx="0" cy="0" rx="46" ry="20"/><ellipse cx="-30" cy="6" rx="28" ry="15"/><ellipse cx="32" cy="7" rx="26" ry="13"/><ellipse cx="6" cy="-14" rx="26" ry="16"/></g>`;

function ambient(river, railPaths, I0, I1) {
  if (calm()) return { back: '', mid: '', front: '' };
  const midY = (I0 + I1) / 2;
  const boats = !river ? '' : `<g><g>${BOAT}</g><animateMotion dur="38s" begin="${since(38)}" repeatCount="indefinite" rotate="auto" path="${river}"/></g>`
    + `<g><g transform="scale(.85)">${BOAT}</g><animateMotion dur="46s" begin="${since(46, 20)}" repeatCount="indefinite" rotate="auto-reverse" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="${river}"/></g>`;
  // 지름길 열차: 한쪽 역에서 나와 건너가고, 잠시 쉬었다가 다시
  const trains = railPaths.map(({ d, c }, k) => {
    const dur = 12, t = since(dur, k * 6);
    const body = RING.flights ? `<g transform="rotate(90) translate(-22 -22) scale(1.1)">${TOUR_ART.plane}</g>` : railTrain(c);
    // 고속선 호는 늘 보이게(점선 위를 KTX 가 달린다) — 레일과 같은 깜박임은 순환선만
    return `<g opacity="0"><g>${body}</g><animateMotion dur="${dur}s" begin="${t}" repeatCount="indefinite" rotate="auto" keyPoints="0;0;1;1" keyTimes="0;.45;.8;1" calcMode="linear" path="${d}"/>`
      + `<animate attributeName="opacity" dur="${dur}s" begin="${t}" repeatCount="indefinite" values="0;0;1;1;0;0" keyTimes="0;.44;.48;.77;.81;1"/></g>`;
  }).join('');
  const clouds = [[midY - 210, 70, 0, 1], [midY + 150, 95, 40, 0.8]].map(([y, dur, shift, k]) =>
    `<g transform="translate(0 ${y}) scale(${k})"><g>${CLOUD}<animateTransform attributeName="transform" type="translate" from="${(I0 - 120) / k} 0" to="${(I1 + 120) / k} 0" dur="${dur}s" begin="${since(dur, shift)}" repeatCount="indefinite"/></g></g>`).join('');
  return {
    back: boats,
    mid: trains,
    front: `<g clip-path="url(#parkClip)">${clouds}</g>`
  };
}

/** 칸 i 의 판 가운데 쪽 가장자리 가운데(지름길 레일이 닿는 곳) */
function innerPoint(i) {
  const r = loopRect(i);
  if (r.inner === 'top') return [r.x + r.w / 2, r.y + 4];
  if (r.inner === 'bottom') return [r.x + r.w / 2, r.y + r.h - 4];
  if (r.inner === 'right') return [r.x + r.w - 4, r.y + r.h / 2];
  return [r.x + 4, r.y + r.h / 2];
}

function loopSvg(state = {}) {
  const owner = state.owner || {}, level = state.level || {};
  const I0 = LM + LC, I1 = LM + LS - LC; // 가운데 마당
  // 지름길 레일: 살짝 휜 곡선(먹선 · 호선 색 · 가운데 흰 침목)
  const railPaths = [];
  // 관광 맵은 레일 대신 휜 점선(하늘길 · 고속선) — 가운데 지도를 가리지 않게. 순환선은 레일
  const arcs = RING.flights || RING.arcs;
  const rails = RING.shortcuts.map(([a, b, col, label, line], k) => {
    const p = innerPoint(RING.tiles.indexOf(a)), q = innerPoint(RING.tiles.indexOf(b));
    let mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2;
    if (arcs) { const dx = q[0] - p[0], dy = q[1] - p[1], L = Math.hypot(dx, dy) || 1, off = k === 0 ? 120 : -120; mx += (-dy / L) * off; my += (dx / L) * off; }
    else mx += k === 0 ? -70 : 70;
    const d = `M${p[0]} ${p[1]} Q${mx} ${my} ${q[0]} ${q[1]}`;
    railPaths.push({ d, c: col });
    const mark = line ?? (RING.flights ? '' : 'KTX');
    const badge = ([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="${col}" stroke="${INK}" stroke-width="3.5"/>`
      + (mark !== '' ? txt(x, y + (String(mark).length > 1 ? 5 : 7), mark, { size: String(mark).length > 1 ? 11 : 20, fill: '#FFFDF7' }) : `<svg x="${x - 11}" y="${y - 11}" width="22" height="22" viewBox="0 0 40 40">${TOUR_ART.plane}</svg>`);
    if (arcs) {
      return `<path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="14" stroke-linecap="round" opacity=".55"/><path d="${d}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-dasharray="16 11"/><path d="${d}" fill="none" stroke="${col}" stroke-width="5" stroke-linecap="round" stroke-dasharray="16 11"/>` + badge(p) + badge(q);
    }
    // 관광 맵은 가운데 지도가 보이게 레일을 조금 가늘게
    const [wo, wi] = RING.id === 'loop' ? [30, 20] : [20, 12];
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="${wo}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${col}" stroke-width="${wi}" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#FFFDF7" stroke-width="${wi > 12 ? 4 : 3}" stroke-dasharray="10 12" stroke-linecap="round" opacity=".9"/>`
      + badge(p) + badge(q);
  }).join('');
  // 이어서 가진 칸: 띠가 칸 사이 틈까지 이어진다
  const chain = (state.links || []).map((e) => {
    const ia = RING.tiles.indexOf(e.a), ib = RING.tiles.indexOf(e.b);
    if (ia < 0 || ib < 0) return '';
    const [ax, ay] = bandMid(ia), [bx, by] = bandMid(ib);
    return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${e.color}" stroke-width="${BAND - 8}" stroke-linecap="round"/>`;
  }).join('');
  const made = RING.tiles.map((n, i) => ({ n, t: loopTile(n, i, owner, level) }));
  const tiles = made.map(({ n, t }) => `<g class="lt" data-n="${n}">${t.tile ?? t}</g>`).join('');
  const blds = made.filter(({ t }) => t.bld).sort((a, b) => a.t.y - b.t.y).map(({ t }) => t.bld).join('');
  const sc = SCENES[RING.scene || 'seoul'](I0, I1);
  const amb = ambient(sc.river, railPaths, I0, I1);
  const [lx, ly, rot] = sc.logo;
  return `<svg class="mat loop-mat" viewBox="0 0 ${LGEO.w} ${LGEO.h}" width="${LGEO.w}" height="${LGEO.h}" aria-hidden="true">
    ${frameSvg()}
    <clipPath id="parkClip"><rect x="${I0 + 8}" y="${I0 + 8}" width="${I1 - I0 - 16}" height="${I1 - I0 - 16}" rx="36"/></clipPath>
    ${sc.back}
    ${amb.back}
    <g>${rails}</g>
    ${amb.mid}
    ${amb.front}
    ${sc.top || ''}
    <g transform="translate(${lx} ${ly}) rotate(${rot})">
      <rect x="-118" y="-46" width="236" height="92" rx="24" fill="${INK}"/><rect x="-118" y="-52" width="236" height="92" rx="24" fill="#FFFDF7" stroke="${INK}" stroke-width="5"/>
      ${txt(0, 6, '역전', { size: 52, font: DISPLAY, weight: 400 })}${txt(0, 32, sc.sub, { size: 17, fill: sc.subColor })}
    </g>
    <g>${tiles}</g><g>${chain}</g><g>${blds}</g>
  </svg>`;
}

// ── 판 테두리 ────────────────────────────────────────────
/** 나무 틀(두께 · 결 · 징) + 점무늬 바탕. 순환선 · 관광 맵 같이 쓴다 */
function frameSvg() {
  const o = LM - 34, W = LS + 68, inr = LM - 16, IW = LS + 32;
  const studs = [[o + 30, o + 30], [o + W - 30, o + 30], [o + 30, o + W - 30], [o + W - 30, o + W - 30], [o + W / 2, o + 13], [o + W / 2, o + W - 13], [o + 13, o + W / 2], [o + W - 13, o + W / 2]]
    .map(([x, y]) => `<circle cx="${x}" cy="${y + 1.5}" r="6.5" fill="${INK}"/><circle cx="${x}" cy="${y}" r="6.5" fill="#F2D398" stroke="${INK}" stroke-width="2.5"/><circle cx="${x - 2}" cy="${y - 2}" r="2" fill="#FFFFFF" opacity=".8"/>`).join('');
  const grain = Array.from({ length: 9 }, (_, j) => `<path d="M${o + 60 + j * 100} ${o + 6} q 30 4 60 0" stroke="#A97A45" stroke-width="2" fill="none" opacity=".55"/><path d="M${o + 40 + j * 100} ${o + W - 7} q 30 -4 60 0" stroke="#A97A45" stroke-width="2" fill="none" opacity=".55"/>`).join('');
  return `<defs><pattern id="bvDots" width="26" height="26" patternUnits="userSpaceOnUse"><circle cx="6" cy="6" r="1.7" fill="#D8C29A"/><circle cx="19" cy="19" r="1.2" fill="#E2CFAA"/></pattern></defs>
    <rect x="${o}" y="${o + 16}" width="${W}" height="${W}" rx="70" fill="${INK}"/>
    <rect x="${o}" y="${o + 9}" width="${W}" height="${W}" rx="70" fill="#7A4F2E" stroke="${INK}" stroke-width="6"/>
    <rect x="${o}" y="${o}" width="${W}" height="${W}" rx="70" fill="#C2915C" stroke="${INK}" stroke-width="6"/>
    <rect x="${o + 9}" y="${o + 7}" width="${W - 18}" height="${W - 18}" rx="62" fill="none" stroke="#E2B47C" stroke-width="4"/>
    ${grain}${studs}
    <rect x="${inr}" y="${inr}" width="${IW}" height="${IW}" rx="52" fill="#F1E3C6" stroke="${INK}" stroke-width="5"/>
    <rect x="${inr}" y="${inr}" width="${IW}" height="${IW}" rx="52" fill="url(#bvDots)"/>
    <rect x="${inr + 6}" y="${inr + 6}" width="${IW - 12}" height="${IW - 12}" rx="47" fill="none" stroke="#FFFFFF" stroke-opacity=".6" stroke-width="3"/>`;
}

// ── 판 가운데 그림 ────────────────────────────────────────────
// 판마다 { back(지름길 아래 그림), river(유람선 길), logo:[x, y, 기울기], sub(로고 아래 글자), subColor }

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
/** 지도 이름표: 흰 알약 + 먹선 */
function pill(x, y, s, { size = 15, fill = '#FFFDF7', ink = INK, anchor = 'middle' } = {}) {
  const w = s.length * size * 0.98 + 14, h = size + 9;
  const x0 = anchor === 'start' ? x : anchor === 'end' ? x - w : x - w / 2;
  return `<rect x="${x0.toFixed(1)}" y="${(y - h / 2 + 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${INK}"/><rect x="${x0.toFixed(1)}" y="${(y - h / 2).toFixed(1)}" width="${w.toFixed(1)}" height="${h}" rx="${h / 2}" fill="${fill}" stroke="${INK}" stroke-width="2.5"/>`
    + txt(x0 + w / 2, y + size * 0.36, s, { size, fill: ink });
}
/** 지도 위 도시: 핀 + 이름표(왼쪽 · 오른쪽 · 위 · 아래) */
function cityPin(x, y, name, side = 'right', big = false, color = '#FFFDF7') {
  const r = big ? 10 : 7.5;
  const pin = `<circle cx="${x}" cy="${y + 2}" r="${r}" fill="${INK}"/><circle cx="${x}" cy="${y}" r="${r}" fill="${color}" stroke="${INK}" stroke-width="3"/>${big ? `<circle cx="${x}" cy="${y}" r="3.5" fill="#FFFDF7"/>` : ''}`;
  const g = r + 8;
  const lbl = side === 'left' ? pill(x - g, y, name, { anchor: 'end', size: big ? 16 : 14 }) : side === 'up' ? pill(x, y - g - 4, name, { size: big ? 16 : 14 }) : side === 'down' ? pill(x, y + g + 6, name, { size: big ? 16 : 14 }) : pill(x + g, y, name, { anchor: 'start', size: big ? 16 : 14 });
  return pin + lbl;
}
/** 산 하나(양쪽 면 밝기 + 눈 덮인 꼭대기) */
function peak(x, y, s = 1, [l, r] = ['#A5D18A', '#7DB063']) {
  const P = (a, b) => `${(x + a * s).toFixed(1)} ${(y + b * s).toFixed(1)}`;
  return `<path d="M${P(-22, 12)} L${P(0, -16)} L${P(0, 12)} Z" fill="${l}"/><path d="M${P(0, -16)} L${P(22, 12)} L${P(0, 12)} Z" fill="${r}"/>`
    + `<path d="M${P(-7, -7)} L${P(0, -16)} L${P(7, -7)} L${P(3, -5)} L${P(0, -8)} L${P(-3, -5)} Z" fill="#FFFDF7"/>`
    + `<path d="M${P(-22, 12)} L${P(0, -16)} L${P(22, 12)} Z" fill="none" stroke="${INK}" stroke-width="2.6" stroke-linejoin="round"/>`;
}
/** 나침반(북쪽 빨강) */
function compass(x, y, R = 34) {
  const star = (a, len, w, fill) => { const c = Math.cos(a), s2 = Math.sin(a), px = -s2, py = c; return `<path d="M${x + c * len} ${y + s2 * len} L${x + px * w} ${y + py * w} L${x - px * w} ${y - py * w} Z" fill="${fill}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`; };
  return `<circle cx="${x}" cy="${y + 3}" r="${R}" fill="${INK}" opacity=".85"/><circle cx="${x}" cy="${y}" r="${R}" fill="#FFFDF7" stroke="${INK}" stroke-width="3"/><circle cx="${x}" cy="${y}" r="${R - 7}" fill="none" stroke="${INK}" stroke-width="1.5" stroke-dasharray="3 4"/>`
    + star(Math.PI / 4, R * 0.55, 5, '#D9D0BE') + star(-Math.PI / 4, R * 0.55, 5, '#D9D0BE') + star(3 * Math.PI / 4, R * 0.55, 5, '#D9D0BE') + star(-3 * Math.PI / 4, R * 0.55, 5, '#D9D0BE')
    + star(-Math.PI / 2, R * 0.85, 7, '#E0533D') + star(Math.PI / 2, R * 0.85, 7, '#FFFDF7') + star(0, R * 0.85, 7, '#FFFDF7') + star(Math.PI, R * 0.85, 7, '#FFFDF7')
    + `<circle cx="${x}" cy="${y}" r="4" fill="${INK}"/>` + txt(x, y - R - 7, 'N', { size: 15, font: DISPLAY, weight: 400 });
}
/** 갈매기 */
const gull = (x, y, s = 1) => `<path d="M${x - 9 * s} ${y} q ${4.5 * s} ${-6 * s} ${9 * s} 0 q ${4.5 * s} ${-6 * s} ${9 * s} 0" fill="none" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>`;
/** 고래 한 마리(바다 장식) */
const whale = (x, y, s = 1) => `<g transform="translate(${x} ${y}) scale(${s})"><path d="M-30 4 Q-28 -16 0 -16 Q26 -16 30 2 Q32 10 22 12 L-22 12 Q-30 12 -30 4 Z" fill="#5C8FC9" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/>`
  + `<path d="M28 0 L44 -10 L40 4 L46 14 L28 8 Z" fill="#5C8FC9" stroke="${INK}" stroke-width="3" stroke-linejoin="round"/><path d="M-22 6 Q0 14 22 6" fill="none" stroke="#BFE3F5" stroke-width="3" stroke-linecap="round"/>`
  + `<circle cx="-16" cy="-4" r="2.6" fill="${INK}"/><path d="M-6 -16 Q-10 -28 -16 -30 M-6 -16 Q-4 -28 2 -32" fill="none" stroke="#BFE3F5" stroke-width="3" stroke-linecap="round"/></g>`;
/** 작은 배(정지 장식) */
const ship = (x, y, s = 1, flip = false) => `<g transform="translate(${x} ${y}) scale(${flip ? -s : s} ${s})">${BOAT}</g>`;
/** 바다 물결 무늬 */
const ripples = (pts) => pts.map(([x, y]) => `<path d="M${x} ${y} q 9 -7 18 0 t 18 0" stroke="#FFFFFF" stroke-width="3" fill="none" stroke-linecap="round" opacity=".75"/>`).join('');
/** 지도 위 작은 명소 그림(그림자) */
const mini = (id, x, y, s = 34) => (TOUR_ART[id] ? `<ellipse cx="${x}" cy="${y + s * 0.46}" rx="${s * 0.36}" ry="${s * 0.1}" fill="${INK}" opacity=".18"/><svg x="${x - s / 2}" y="${y - s / 2}" width="${s}" height="${s}" viewBox="0 0 40 40" overflow="visible">${TOUR_ART[id]}</svg>` : '');
/** 바다 + 연안 띠(땅 둘레가 옅게) */
function seaWith(I0, I1, fill, landPaths) {
  const halo = (w, c) => landPaths.map((d) => `<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linejoin="round"/>`).join('');
  return `<rect x="${I0 + 8}" y="${I0 + 8}" width="${I1 - I0 - 16}" height="${I1 - I0 - 16}" rx="36" fill="${fill}" stroke="${INK}" stroke-width="4"/>`
    + `<g clip-path="url(#parkClip)">${halo(46, '#C5E7F7')}${halo(24, '#DDF2FB')}</g>`;
}

// 남한(경도 · 위도) — 서해 → 남해 → 동해 → 휴전선
const SK = [[126.15, 37.75], [126.6, 37.47], [126.66, 37.2], [126.86, 36.96], [126.5, 36.95], [126.14, 36.76], [126.36, 36.55], [126.52, 36.3], [126.62, 36.1], [126.76, 35.98], [126.56, 35.73], [126.45, 35.58], [126.5, 35.4], [126.3, 35.12], [126.42, 34.86], [126.25, 34.6], [126.42, 34.38], [126.62, 34.3],
  [126.92, 34.45], [127.25, 34.56], [127.6, 34.7], [127.82, 34.83], [128.06, 34.88], [128.4, 34.85], [128.66, 34.73], [128.77, 34.96], [129.05, 35.08],
  [129.3, 35.35], [129.46, 35.66], [129.57, 36.05], [129.43, 36.36], [129.45, 36.8], [129.4, 37.06], [129.2, 37.42], [128.95, 37.73], [128.75, 37.97], [128.55, 38.26], [128.36, 38.6],
  [127.9, 38.31], [127.4, 38.33], [126.9, 37.96], [126.6, 37.82]];
const NK = [[124.6, 39.6], [130.9, 39.6], [129.9, 39.2], [128.36, 38.6], [127.9, 38.31], [127.4, 38.33], [126.9, 37.96], [126.6, 37.82], [126.15, 37.75], [125.6, 37.95], [124.9, 38.4], [124.6, 38.9]];
const JEJU = [[126.15, 33.33], [126.3, 33.23], [126.6, 33.22], [126.9, 33.36], [126.96, 33.49], [126.7, 33.56], [126.35, 33.5], [126.18, 33.42]];
const ISLE = [[[128.6, 34.95], [128.72, 34.86], [128.68, 34.72], [128.56, 34.8]], [[127.92, 34.86], [128.05, 34.8], [127.98, 34.72], [127.86, 34.76]], [[126.18, 34.5], [126.32, 34.45], [126.28, 34.36], [126.14, 34.4]]];
const RIDGE = [[128.45, 38.1], [128.75, 37.62], [128.95, 37.18], [128.48, 36.92], [127.88, 36.56], [127.75, 35.86], [127.62, 35.32]];
const RIVERS = [
  [[128.1, 37.45], [127.68, 37.52], [127.3, 37.55], [127.0, 37.53], [126.76, 37.6], [126.6, 37.7]],
  [[128.72, 36.62], [128.45, 36.2], [128.4, 35.86], [128.52, 35.5], [128.95, 35.1]],
  [[127.6, 35.96], [127.45, 36.36], [127.15, 36.42], [126.95, 36.16], [126.72, 36.02]],
  [[126.98, 35.24], [126.62, 35.0], [126.42, 34.82]]
];
const KC = { 서울: [126.98, 37.57], 인천: [126.66, 37.46], 강릉: [128.9, 37.75], 대전: [127.38, 36.35], 대구: [128.6, 35.87], 광주: [126.85, 35.16], 부산: [129.07, 35.18], 경주: [129.22, 35.85], 전주: [127.15, 35.82], 여수: [127.66, 34.76], 제주: [126.53, 33.5] };

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
  [[95, 5.5], [100, 1], [106, -6], [104, -5], [98, 2]], [[109, 1.5], [116, 6], [119, 1], [116, -3.5], [110, -2.5]], [[131, -1], [141, -2.5], [150, -10], [141, -9], [133, -4]],
  [[44, -12.5], [50, -15], [47.5, -25], [44, -22]], [[172.5, -34.5], [178.5, -37.5], [175, -41.5], [171, -46], [167, -45.5]], [[-24, 65.5], [-18, 66.5], [-13.5, 65], [-18, 63.5], [-22.5, 64]], [[120, 18.5], [122.5, 18], [125.5, 9], [123, 7], [121, 12]]
];
const WC = { 서울: [127, 37.5], 도쿄: [139.7, 35.7], 파리: [2.3, 48.9], 런던: [-0.1, 51.5], 뉴욕: [-74, 40.7], 시드니: [151.2, -33.9], 카이로: [31.2, 30], 리우: [-43.2, -22.9], 두바이: [55.3, 25.2], 싱가포르: [103.8, 1.3] };

const SCENES = {
  seoul(I0, I1) {
    const midY = (I0 + I1) / 2;
    const river = `M${I0} ${midY + 40} C ${I0 + 150} ${midY - 30}, ${I0 + 260} ${midY + 120}, ${I0 + 420} ${midY + 50} S ${I1 - 60} ${midY - 10}, ${I1} ${midY + 30}`;
    const trees = [[I0 + 70, I0 + 90], [I1 - 80, I0 + 70], [I0 + 110, I1 - 70], [I1 - 60, I1 - 110], [I0 + 300, I0 + 60], [I0 + 60, I1 - 150], [I1 - 150, I1 - 60]].map(([x, y], k) =>
      `<g class="amb-tree" style="transform-origin:${x}px ${y + 18}px;animation-delay:${since(3.4, k * 0.7)}"><ellipse cx="${x}" cy="${y + 18}" rx="16" ry="4.5" fill="${INK}" opacity=".15"/><rect x="${x - 4}" y="${y}" width="8" height="18" rx="3" fill="#8A5A3B" stroke="${INK}" stroke-width="2.5"/><circle cx="${x}" cy="${y - 8}" r="20" fill="#6CBF5A" stroke="${INK}" stroke-width="3.5"/><circle cx="${x - 7}" cy="${y - 15}" r="6" fill="#9CD983"/></g>`).join('');
    // 한강 다리 셋 · 남산과 타워 · 길
    const bridge = (x, y, w2 = 26, rot = 0) => `<g transform="rotate(${rot} ${x} ${y})"><rect x="${x - 12}" y="${y - w2 * 1.7}" width="24" height="${w2 * 3.4}" rx="4" fill="#E8E1D2" stroke="${INK}" stroke-width="3"/><path d="M${x - 8} ${y - w2 * 1.5} V${y + w2 * 1.5} M${x + 8} ${y - w2 * 1.5} V${y + w2 * 1.5}" stroke="#B9AF9A" stroke-width="2"/><path d="M${x} ${y - w2 * 1.5} V${y + w2 * 1.5}" stroke="#F2B33D" stroke-width="2" stroke-dasharray="6 5"/></g>`;
    const roads = `<path d="M${I0 + 8} ${I0 + 200} C ${I0 + 200} ${I0 + 170}, ${I0 + 320} ${I0 + 240}, ${I1 - 8} ${I0 + 190}" stroke="#E9E0CA" stroke-width="18" fill="none"/><path d="M${I0 + 8} ${I0 + 200} C ${I0 + 200} ${I0 + 170}, ${I0 + 320} ${I0 + 240}, ${I1 - 8} ${I0 + 190}" stroke="#FFFDF7" stroke-width="2" stroke-dasharray="10 10" fill="none"/>`
      + `<path d="M${I0 + 8} ${I1 - 150} C ${I0 + 200} ${I1 - 120}, ${I1 - 260} ${I1 - 200}, ${I1 - 8} ${I1 - 160}" stroke="#E9E0CA" stroke-width="18" fill="none"/><path d="M${I0 + 8} ${I1 - 150} C ${I0 + 200} ${I1 - 120}, ${I1 - 260} ${I1 - 200}, ${I1 - 8} ${I1 - 160}" stroke="#FFFDF7" stroke-width="2" stroke-dasharray="10 10" fill="none"/>`;
    const hill = `<path d="M${I0 + 360} ${I0 + 150} Q${I0 + 440} ${I0 + 60} ${I0 + 520} ${I0 + 150} Z" fill="#9CCB7F" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/><path d="M${I0 + 410} ${I0 + 112} Q${I0 + 440} ${I0 + 86} ${I0 + 470} ${I0 + 112}" fill="none" stroke="#C3E3A8" stroke-width="5" stroke-linecap="round"/>` + mini('tower', I0 + 440, I0 + 68, 56);
    const blocks = [[I0 + 70, I1 - 220], [I0 + 120, I1 - 236], [I1 - 120, I0 + 250], [I1 - 70, I0 + 236]].map(([x, y], k) => `<g transform="translate(${x} ${y}) scale(.42)">${isoBuilding(2, ['#E0533D', '#2F6BD8', '#8E5BC8', '#F08A2E'][k])}</g>`).join('');
    return {
      back: `<rect x="${I0 + 8}" y="${I0 + 8}" width="${I1 - I0 - 16}" height="${I1 - I0 - 16}" rx="36" fill="#D8EDC4" stroke="${INK}" stroke-width="4"/>
        <g clip-path="url(#parkClip)">${roads}
        <path d="${river}" fill="none" stroke="${INK}" stroke-width="64" stroke-linecap="round"/><path d="${river}" fill="none" stroke="#BFE3F5" stroke-width="56" stroke-linecap="round"/><path d="${river}" fill="none" stroke="#D9F0FB" stroke-width="22" stroke-linecap="round" opacity=".8"/>
        <path class="amb-flow" style="animation-delay:${since(2.4)}" d="${river}" fill="none" stroke="#FFFDF7" stroke-width="3" stroke-dasharray="18 30" opacity=".8"/>
        ${bridge(I0 + 120, midY + 30, 26, 8)}${bridge(I0 + 330, midY + 75, 26, -10)}${bridge(I1 - 120, midY + 18, 26, 6)}</g>${hill}${blocks}${trees}`,
      river, logo: [(I0 + I1) / 2, midY - 130, -4], sub: '2호선 순환선', subColor: '#2FA84F'
    };
  },
  korea(I0, I1) {
    const K = 82, cx0 = I0 + 300;
    const X = (lon) => cx0 + (lon - 127.8) * K, Y = (lat) => I0 + 14 + (39.4 - lat) * K * 1.18;
    const P = ([lon, lat]) => [X(lon), Y(lat)];
    const land = smoothPath(SK.map(P)), jeju = smoothPath(JEJU.map(P)), isles = ISLE.map((pts) => smoothPath(pts.map(P)));
    const north = smoothPath(NK.map(P));
    const ul = [X(130.87), Y(37.5)], dokdo = [X(131.6), Y(37.24)];
    const ridgeZone = smoothPath([[128.3, 38.45], [128.95, 37.7], [129.3, 36.9], [129.05, 36.1], [128.2, 35.45], [127.55, 35.15], [127.35, 35.6], [127.8, 36.3], [128.3, 37.0], [127.95, 37.6], [128.0, 38.25]].map(P));
    const rivers = RIVERS.map((pts) => { const d = smoothPath(pts.map(P), false); return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#8FD0F0" stroke-width="4.5" stroke-linecap="round" stroke-linejoin="round"/>`; }).join('');
    const ktx = (names, c) => { const d = smoothPath(names.map((n) => P(KC[n])), false); return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/><path d="${d}" fill="none" stroke="#FFFFFF" stroke-width="1.6" stroke-dasharray="5 6" stroke-linecap="round"/>`; };
    const lines = ktx(['서울', '대전', '대구', '부산'], '#2F6FD0') + ktx(['대전', '전주', '광주'], '#E0533D') + ktx(['전주', '여수'], '#E0533D') + ktx(['서울', '강릉'], '#3E9B6A') + ktx(['인천', '서울'], '#2F6FD0');
    const ridge = RIDGE.map((p, k) => peak(...P(p), k % 2 ? 0.95 : 1.15)).join('') + peak(X(126.55), Y(33.4) - 4, 1.05);
    const SIDE = { 서울: 'up', 인천: 'left', 강릉: 'right', 대전: 'left', 대구: 'left', 광주: 'left', 부산: 'right', 경주: 'right', 전주: 'left', 여수: 'down', 제주: 'right' };
    const pins = Object.keys(KC).map((n) => cityPin(...P(KC[n]), n, SIDE[n], n === '서울', n === '서울' ? '#E0533D' : '#FFFDF7')).join('');
    const minis = mini('palace', X(126.98) - 46, Y(37.57) + 8, 34) + mini('pavilion', X(128.9) + 4, Y(37.75) + 40, 30) + mini('pagoda', X(129.22) + 36, Y(35.85) + 34, 30)
      + mini('wave', X(129.07) + 44, Y(35.18) + 32, 30) + mini('hanok', X(127.15) - 44, Y(35.82) + 30, 30) + mini('moonbridge', X(127.66) + 44, Y(34.76) + 12, 30) + mini('stone', X(126.53) - 52, Y(33.5) + 4, 30);
    const seaName = (x, y, s) => txt(x, y, s, { size: 22, font: DISPLAY, weight: 400, fill: '#6FAED3' });
    const deco = seaName(I0 + 70, Y(36.3), '서해') + seaName(I1 - 92, Y(36.6), '동해') + seaName(X(128.4), Y(33.9), '남해')
      + compass(I0 + 70, I1 - 74, 32) + whale(I1 - 96, Y(35.4), 0.9) + ship(I0 + 74, Y(35.0), 0.9) + ship(X(129.6), Y(34.6), 0.8, true)
      + gull(I0 + 120, I0 + 140) + gull(I0 + 140, I0 + 128, 0.8) + gull(I1 - 170, I1 - 120, 0.9)
      + ripples([[I0 + 40, I0 + 230], [I0 + 90, I1 - 220], [I1 - 120, I0 + 330], [I1 - 80, I1 - 230], [X(127.2), Y(33.9)], [I0 + 150, Y(34.2)]]);
    const islands = [jeju, ...isles].map((d) => `<path d="${d}" fill="${INK}" opacity=".22" transform="translate(4 6)"/><path d="${d}" fill="#D6EBBE" stroke="${INK}" stroke-width="4" stroke-linejoin="round"/>`).join('')
      + [ul, dokdo].map(([x, y], k) => `<circle cx="${x}" cy="${y}" r="${k ? 4 : 7}" fill="#D6EBBE" stroke="${INK}" stroke-width="3"/>`).join('') + pill(ul[0] - 4, ul[1] - 22, '울릉도', { size: 11 }) + pill(dokdo[0] - 6, dokdo[1] + 20, '독도', { size: 11 });
    return {
      back: seaWith(I0, I1, '#A9DBF2', [land, jeju, north]) + `<g clip-path="url(#parkClip)">${deco}
        <path d="${north}" fill="#E9E1CC" stroke="${INK}" stroke-width="4" stroke-linejoin="round" opacity=".9"/>
        <path d="${land}" fill="${INK}" opacity=".22" transform="translate(5 7)"/><path d="${land}" fill="#D6EBBE" stroke="${INK}" stroke-width="5" stroke-linejoin="round"/>
        <clipPath id="bvLand"><path d="${land}"/></clipPath><g clip-path="url(#bvLand)"><path d="${ridgeZone}" fill="#BEDC9E"/></g>
        <path d="M${X(126.15)} ${Y(37.75)} L${X(126.6)} ${Y(37.82)} L${X(126.9)} ${Y(37.96)} L${X(127.4)} ${Y(38.33)} L${X(127.9)} ${Y(38.31)} L${X(128.36)} ${Y(38.6)}" fill="none" stroke="#E0533D" stroke-width="3" stroke-dasharray="7 6" stroke-linecap="round"/>
        ${islands}${rivers}${ridge}${lines}</g>`,
      top: `<g clip-path="url(#parkClip)">${minis}${pins}</g>`,
      river: `M${I0 + 20} ${Y(34.2)} Q${X(127.5)} ${Y(33.95)} ${I1 - 20} ${Y(34.5)}`,
      logo: [I1 - 150, I0 + 96, 4], sub: '한반도 KTX 일주', subColor: '#2F6FD0'
    };
  },
  world(I0, I1) {
    const K = (I1 - I0 - 40) / 360, x0 = I0 + 20;
    const X = (lon) => x0 + (lon + 168) * K, Y = (lat) => I0 + 190 + (78 - lat) * K * 1.42;
    const P = ([lon, lat]) => [X(lon), Y(lat)];
    const lands = WORLD.map((pts) => smoothPath(pts.map(P)));
    const grid = [-120, -60, 0, 60, 120].map((lon) => `<path d="M${X(lon)} ${I0 + 12} V${I1 - 12}" stroke="#FFFFFF" stroke-width="2" stroke-dasharray="4 9" opacity=".55"/>`).join('')
      + [[0, 0.75], [23.4, 0.45], [-23.4, 0.45], [60, 0.4], [-50, 0.4]].map(([lat, o]) => `<path d="M${I0 + 12} ${Y(lat)} H${I1 - 12}" stroke="#FFFFFF" stroke-width="${lat ? 2 : 3}" stroke-dasharray="${lat ? '4 9' : '12 8'}" opacity="${o}"/>`).join('');
    const desert = (pts) => { const d = smoothPath(pts.map(P)); return `<path d="${d}" fill="#EED7A0"/>`; };
    const patches = desert([[-12, 26], [5, 30], [30, 28], [36, 20], [20, 15], [0, 16]]) + desert([[45, 26], [55, 24], [56, 18], [47, 17]]) + desert([[122, -22], [135, -20], [140, -26], [128, -30]])
      + `<path d="${smoothPath([[-75, 0], [-55, -2], [-50, -10], [-62, -14], [-74, -9]].map(P))}" fill="#BFDDA0"/>` + `<path d="${smoothPath([[12, 3], [28, 4], [30, -6], [18, -8]].map(P))}" fill="#BFDDA0"/>`;
    const peaks = [[-112, 44], [-120, 38], [-70, -22], [-71, -36], [10, 46], [84, 30], [92, 31], [100, 33]].map(([a, b2], k) => peak(...P([a, b2]), 0.62, ['#D9C79C', '#BFA97A'])).join('');
    const SIDE = { 서울: 'left', 도쿄: 'right', 파리: 'right', 런던: 'left', 뉴욕: 'right', 시드니: 'down', 카이로: 'left', 리우: 'right', 두바이: 'down', 싱가포르: 'down' };
    const arcsD = [['서울', '시드니'], ['파리', '카이로'], ['카이로', '두바이'], ['두바이', '서울'], ['뉴욕', '리우'], ['런던', '뉴욕']].map(([a, b2]) => {
      const [x1, y1] = P(WC[a]), [x2, y2] = P(WC[b2]), mx = (x1 + x2) / 2, my = Math.min(y1, y2) - Math.abs(x2 - x1) * 0.25 - 18;
      return `<path d="M${x1} ${y1} Q${mx} ${my} ${x2} ${y2}" stroke="${INK}" stroke-width="2.4" stroke-dasharray="7 7" fill="none" opacity=".55"/>`;
    }).join('');
    const pins = Object.keys(WC).map((n) => cityPin(...P(WC[n]), n, SIDE[n], n === '서울', n === '서울' ? '#E0533D' : '#FFFDF7')).join('');
    const minis = mini('eiffel', X(2.3) + 2, Y(48.9) - 30, 30) + mini('liberty', X(-74) - 26, Y(40.7) - 18, 30) + mini('pyramid', X(31.2) + 26, Y(30) - 12, 28)
      + mini('opera', X(151.2) - 30, Y(-33.9) - 12, 30) + mini('redtower', X(139.7) + 6, Y(35.7) - 30, 28) + mini('burj', X(55.3) + 22, Y(25.2) - 20, 28) + mini('christ', X(-43.2) - 26, Y(-22.9) - 14, 28);
    const deco = compass(I1 - 74, I1 - 78, 34) + whale(X(-140), Y(-20), 0.95) + whale(X(75), Y(-38), 0.75) + ship(X(-30), Y(20), 0.9) + ship(X(165), Y(10), 0.8, true)
      + gull(X(-20), Y(52)) + gull(X(-14), Y(55), 0.8) + gull(X(160), Y(-48), 0.9)
      + ripples([[X(-150), Y(30)], [X(-30), Y(-40)], [X(70), Y(-15)], [X(170), Y(30)], [X(-100), Y(-45)], [X(115), Y(-50)]]);
    const shapes = lands.map((d) => `<path d="${d}" fill="${INK}" opacity=".2" transform="translate(4 5)"/>`).join('') + `<g>${lands.map((d) => `<path d="${d}" fill="#F3E3B8" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`).join('')}</g>`;
    return {
      back: seaWith(I0, I1, '#9FD3EE', lands) + `<g clip-path="url(#parkClip)">${grid}${deco}${shapes}
        <clipPath id="bvWorld">${lands.map((d) => `<path d="${d}"/>`).join('')}</clipPath><g clip-path="url(#bvWorld)">${patches}</g>
        ${lands.map((d) => `<path d="${d}" fill="none" stroke="${INK}" stroke-width="3.5" stroke-linejoin="round"/>`).join('')}${peaks}${arcsD}</g>`,
      top: `<g clip-path="url(#parkClip)">${minis}${pins}</g>`,
      river: `M${I0 + 30} ${I1 - 60} Q${(I0 + I1) / 2} ${I1 - 20} ${I1 - 140} ${I1 - 70}`,
      logo: [(I0 + I1) / 2, I0 + 96, -3], sub: '세계 일주 항공로', subColor: '#2F6BD8'
    };
  }
};

/** 칸 i 의 띠 가운데 */
function bandMid(i) {
  const r = loopRect(i), x = r.x + 5, y = r.y + 5, w = r.w - 10, h = r.h - 10;
  if (r.inner === 'top') return [x + w / 2, y + BAND / 2];
  if (r.inner === 'bottom') return [x + w / 2, y + h - BAND / 2];
  if (r.inner === 'right') return [x + w - BAND / 2, y + h / 2];
  return [x + BAND / 2, y + h / 2];
}
