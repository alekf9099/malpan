// 판 그리기 — 위에서 내려다본 평면 서울 지하철 노선도(역 219곳).
// 판은 화면보다 훨씬 크게 그리고, 보이는 부분은 카메라(camera.js)가 정한다.
// 역 이름은 겹치지 않게 자리를 고른다: 아래 → 위 → 오른쪽 → 왼쪽 … 처음 비는 곳(다른 이름·역 동그라미와 안 닿는 곳).

import { STATION_XY, SEOUL_DIMS, ALL_STATIONS, ALL_EDGES, LINES, isTransfer } from '../core/boards/seoul.js';
import { isChance } from '../core/match.js';
import { isHot, stationPrice } from '../core/estate.js';
import { LOOP_TILES, CORNERS, SHORTCUTS, SIDES, sideOf } from '../core/boards/loop.js';
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
export const nodeXY = (n) => (MODE === 'loop' && LOOP_XY[n] ? LOOP_XY[n] : proj(...STATION_XY[n]));
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

// ── 순환선 판(부루마블식) ─────────────────────────────────────
// 32칸 고리: 오른쪽 아래 시청에서 왼쪽으로 출발해 시계 방향. 칸은 둥근 블록(두께 있는 먹선), 안쪽 가장자리에 구역 색 띠,
// 가운데는 공원과 한강, 그 위를 3·4호선 지름길 레일이 가로지른다.

const LT = 92, LC = 140, LS = LT * 7 + LC * 2, LM = 44;   // 칸 폭 · 모서리 · 판 한 변 · 바깥 여백
const LGEO = { w: LS + LM * 2, h: LS + LM * 2 + 18 };
let MODE = 'map';
/** 판 모양: 'map'(노선도) · 'loop'(순환선) — 게임 화면을 열 때 정한다 */
export function useBoard(mode) { MODE = mode === 'loop' ? 'loop' : 'map'; }
export const boardMode = () => MODE;

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
const LOOP_XY = {};
LOOP_TILES.forEach((n, i) => { const r = loopRect(i); LOOP_XY[n] = [r.x + r.w / 2, r.y + r.h / 2 + 8]; });

/** 칸 이름(좁은 칸은 두 줄) */
const LOOP_NAME = {
  '을지로입구': ['을지로', '입구'], '을지로3가': ['을지로', '3가'], '동대문역사문화공원': ['DDP'], '건대입구': ['건대', '입구'],
  '종합운동장': ['종합', '운동장'], '서울대입구': ['서울대', '입구'], '구로디지털단지': ['구로', '디지털'], '영등포구청': ['영등포', '구청'],
  '홍대입구': ['홍대']
};
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

function loopTile(n, i, owner, level) {
  const r = loopRect(i), x = r.x + 5, y = r.y + 5, w = r.w - 10, h = r.h - 10;
  const own = owner[n], lv = level[n] || 0, c = CORNERS[n];
  const slab = (fill) => `<rect x="${x}" y="${y + 8}" width="${w}" height="${h}" rx="20" fill="${INK}"/><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="${fill}" stroke="${INK}" stroke-width="4"/>`;
  const cx = x + w / 2;
  if (c) {
    return slab(CORNER_FILL[c.kind]) + `<rect x="${x + 8}" y="${y + 8}" width="${w - 16}" height="${h - 16}" rx="14" fill="none" stroke="#FFFDF7" stroke-width="3" opacity=".9"/>`
      + CORNER_ART[c.kind](cx, y + h / 2 - 2) + txt(cx, y + h - 14, c.name, { size: 22, font: DISPLAY, weight: 400 });
  }
  if (isChance(n)) {
    return slab('#F7C94A') + `<rect x="${x + 7}" y="${y + 7}" width="${w - 14}" height="${h - 14}" rx="14" fill="none" stroke="#FFFDF7" stroke-width="3" stroke-dasharray="8 7"/>`
      + (w > h ? txt(cx - 20, y + h / 2 + 20, '?', { size: 54, font: DISPLAY, weight: 400 }) + txt(cx + 22, y + h / 2 + 7, '찬스', { size: 18, fill: '#8A6A1F' })
        : txt(cx, y + h / 2 + 14, '?', { size: 62, font: DISPLAY, weight: 400 }) + txt(cx, y + h - 14, '찬스', { size: 18, fill: '#8A6A1F' }));
  }
  const hot = isHot(n), side = SIDES[sideOf(n)].color;
  let out = slab(own ? tint(own) : hot ? '#FFF4D6' : '#FFFDF7');
  out += `<clipPath id="lt${i}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20"/></clipPath>`;
  const b = r.inner === 'top' ? [x, y, w, BAND] : r.inner === 'bottom' ? [x, y + h - BAND, w, BAND] : r.inner === 'right' ? [x + w - BAND, y, BAND, h] : [x, y, BAND, h];
  out += `<rect x="${b[0]}" y="${b[1]}" width="${b[2]}" height="${b[3]}" fill="${own || side}" clip-path="url(#lt${i})"/>`
    + `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="20" fill="none" stroke="${INK}" stroke-width="4"/>`;
  // 글자 자리: 띠를 뺀 몸통 가운데
  const body = r.inner === 'top' ? [x, y + BAND, w, h - BAND] : r.inner === 'bottom' ? [x, y, w, h - BAND] : r.inner === 'right' ? [x, y, w - BAND, h] : [x + BAND, y, w - BAND, h];
  // 주인 배지가 바깥 모서리에 붙으니, 주인 있는 칸은 글자를 띠 쪽으로 조금 민다
  const push = own ? (r.inner === 'left' || r.inner === 'right' ? 16 : 10) : 0;
  const bx = body[0] + body[2] / 2 + (r.inner === 'right' ? push : r.inner === 'left' ? -push : 0);
  const by = body[1] + body[3] / 2 + (r.inner === 'top' ? -push : r.inner === 'bottom' ? push : 0);
  const lines = LOOP_NAME[n] || [n];
  const fs = lines.some((t) => t.length > 3) ? 20 : 23, gap = fs + 3;
  const icon = hot ? 40 : 0, price = own ? 0 : 19;
  let top = by - (icon + lines.length * gap + price) / 2;
  if (hot) out += `<svg x="${bx - 20}" y="${top - 2}" width="40" height="40" viewBox="0 0 40 40">${HOT_ART[n]}</svg>`;
  top += icon;
  lines.forEach((t, k) => { out += txt(bx, top + fs * 0.86 + k * gap, t, { size: fs }); });
  if (!own) out += txt(bx, top + lines.length * gap + 15, stationPrice(n), { size: 16, fill: '#8A8173', weight: 800 });
  else {
    // 주인 표시: 바깥쪽 모서리에 주인 색 동그라미 + 단계 그림, 랜드마크는 별
    const ox = r.inner === 'left' ? x + w - 22 : r.inner === 'right' ? x + 22 : x + w - 22;
    const oy = r.inner === 'bottom' ? y + 22 : y + h - 22;
    out += `<circle cx="${ox}" cy="${oy}" r="15" fill="${own}" stroke="${INK}" stroke-width="3.5"/><g transform="translate(${ox} ${oy}) scale(.75)">${GLYPH[lv || 1]}</g>`;
    if (lv >= 3) out += `<g transform="translate(${ox - 30} ${oy - 18}) scale(.8)">${STAR(0, 0)}</g>`;
  }
  return out;
}

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
  const boats = `<g><g>${BOAT}</g><animateMotion dur="38s" begin="${since(38)}" repeatCount="indefinite" rotate="auto" path="${river}"/></g>`
    + `<g><g transform="scale(.85)">${BOAT}</g><animateMotion dur="46s" begin="${since(46, 20)}" repeatCount="indefinite" rotate="auto-reverse" keyPoints="1;0" keyTimes="0;1" calcMode="linear" path="${river}"/></g>`;
  // 지름길 열차: 한쪽 역에서 나와 건너가고, 잠시 쉬었다가 다시
  const trains = railPaths.map(({ d, c }, k) => {
    const dur = 12, t = since(dur, k * 6);
    return `<g opacity="0"><g>${railTrain(c)}</g><animateMotion dur="${dur}s" begin="${t}" repeatCount="indefinite" rotate="auto" keyPoints="0;0;1;1" keyTimes="0;.45;.8;1" calcMode="linear" path="${d}"/>`
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
  const rails = SHORTCUTS.map(([a, b, l]) => {
    const p = innerPoint(LOOP_TILES.indexOf(a)), q = innerPoint(LOOP_TILES.indexOf(b));
    const mx = (p[0] + q[0]) / 2 + (l === 3 ? -70 : 70), my = (p[1] + q[1]) / 2;
    const d = `M${p[0]} ${p[1]} Q${mx} ${my} ${q[0]} ${q[1]}`;
    railPaths.push({ d, c: LINES[l].color });
    const badge = ([x, y]) => `<circle cx="${x}" cy="${y}" r="17" fill="${LINES[l].color}" stroke="${INK}" stroke-width="3.5"/>${txt(x, y + 7, l, { size: 20, fill: '#FFFDF7' })}`;
    return `<path d="${d}" fill="none" stroke="${INK}" stroke-width="30" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${LINES[l].color}" stroke-width="20" stroke-linecap="round"/>`
      + `<path d="${d}" fill="none" stroke="#FFFDF7" stroke-width="4" stroke-dasharray="10 12" stroke-linecap="round" opacity=".9"/>`
      + badge(p) + badge(q);
  }).join('');
  // 이어서 가진 칸: 띠가 칸 사이 틈까지 이어진다
  const chain = (state.links || []).map((e) => {
    const ia = LOOP_TILES.indexOf(e.a), ib = LOOP_TILES.indexOf(e.b);
    if (ia < 0 || ib < 0) return '';
    const [ax, ay] = bandMid(ia), [bx, by] = bandMid(ib);
    return `<line x1="${ax}" y1="${ay}" x2="${bx}" y2="${by}" stroke="${e.color}" stroke-width="${BAND - 8}" stroke-linecap="round"/>`;
  }).join('');
  const trees = [[I0 + 70, I0 + 90], [I1 - 80, I0 + 70], [I0 + 110, I1 - 70], [I1 - 60, I1 - 110], [I0 + 300, I0 + 60]].map(([x, y], k) =>
    `<g class="amb-tree" style="transform-origin:${x}px ${y + 18}px;animation-delay:${since(3.4, k * 0.7)}"><rect x="${x - 4}" y="${y}" width="8" height="18" rx="3" fill="#8A5A3B" stroke="${INK}" stroke-width="2.5"/><circle cx="${x}" cy="${y - 8}" r="20" fill="#6CBF5A" stroke="${INK}" stroke-width="3.5"/></g>`).join('');
  const midY = (I0 + I1) / 2;
  const river = `M${I0} ${midY + 40} C ${I0 + 150} ${midY - 30}, ${I0 + 260} ${midY + 120}, ${I0 + 420} ${midY + 50} S ${I1 - 60} ${midY - 10}, ${I1} ${midY + 30}`;
  const tiles = LOOP_TILES.map((n, i) => `<g class="lt" data-n="${n}">${loopTile(n, i, owner, level)}</g>`).join('');
  const amb = ambient(river, railPaths, I0, I1);
  return `<svg class="mat loop-mat" viewBox="0 0 ${LGEO.w} ${LGEO.h}" width="${LGEO.w}" height="${LGEO.h}" aria-hidden="true">
    <rect x="${LM - 22}" y="${LM - 6}" width="${LS + 44}" height="${LS + 44}" rx="60" fill="#B59E78" stroke="${INK}" stroke-width="6"/>
    <rect x="${LM - 22}" y="${LM - 22}" width="${LS + 44}" height="${LS + 44}" rx="60" fill="#F1E3C6" stroke="${INK}" stroke-width="6"/>
    <rect x="${I0 + 8}" y="${I0 + 8}" width="${I1 - I0 - 16}" height="${I1 - I0 - 16}" rx="36" fill="#D8EDC4" stroke="${INK}" stroke-width="4"/>
    <path d="${river}" fill="none" stroke="${INK}" stroke-width="64" stroke-linecap="round"/><path d="${river}" fill="none" stroke="#BFE3F5" stroke-width="56" stroke-linecap="round"/>
    <clipPath id="parkClip"><rect x="${I0 + 8}" y="${I0 + 8}" width="${I1 - I0 - 16}" height="${I1 - I0 - 16}" rx="36"/></clipPath>
    <path class="amb-flow" style="animation-delay:${since(2.4)}" d="${river}" fill="none" stroke="#FFFDF7" stroke-width="3" stroke-dasharray="18 30" opacity=".8"/>
    ${amb.back}
    ${trees}
    <g>${rails}</g>
    ${amb.mid}
    ${amb.front}
    <g transform="translate(${(I0 + I1) / 2} ${midY - 120}) rotate(-4)">
      <rect x="-118" y="-46" width="236" height="92" rx="24" fill="${INK}"/><rect x="-118" y="-52" width="236" height="92" rx="24" fill="#FFFDF7" stroke="${INK}" stroke-width="5"/>
      ${txt(0, 6, '역전', { size: 52, font: DISPLAY, weight: 400 })}${txt(0, 32, '2호선 순환선', { size: 17, fill: '#2FA84F' })}
    </g>
    <g>${tiles}</g><g>${chain}</g>
  </svg>`;
}

/** 칸 i 의 띠 가운데 */
function bandMid(i) {
  const r = loopRect(i), x = r.x + 5, y = r.y + 5, w = r.w - 10, h = r.h - 10;
  if (r.inner === 'top') return [x + w / 2, y + BAND / 2];
  if (r.inner === 'bottom') return [x + w / 2, y + h - BAND / 2];
  if (r.inner === 'right') return [x + w - BAND / 2, y + h / 2];
  return [x + BAND / 2, y + h / 2];
}
