// 판 그리기 — 위에서 내려다본 평면 지하철 노선도.
// 서울 노선도 전체를 늘 그리고, 그날 구간(탈 수 있는 역·선)만 진하게, 나머지는 옅게 둔다.
// 판은 화면보다 훨씬 크게 그리고, 보이는 부분은 카메라(camera.js)가 정한다.

import { HOME, START } from '../core/board.js';

const INK = '#22201D';
// 역 사이가 가까운 곳에서도 역 이름·깃발 통행료 표가 겹치지 않도록 간격을 넉넉히 잡았다
// (역 이름 22px 기준으로 모든 역 이름·역 동그라미·깃발 표가 서로 겹치지 않는지 확인한 값)
const UNIT = 150;      // 지도 1단위(역 하나 간격쯤)의 px
const MARGIN = 120;    // 지도 둘레 여백
const PIECE = 58;

let board = null;
let geo = null;

export function useBoard(b) {
  board = b;
  const [dx, dy] = b.dims || [1, 1];
  geo = { dx, dy, w: dx * UNIT + MARGIN * 2, h: dy * UNIT + MARGIN * 2 };
}

export const pieceSize = () => PIECE;
export const canvasSize = () => ({ w: geo.w, h: geo.h });

/** 지도 좌표 → 판 그림(캔버스) 좌표 */
export const proj = (x, y) => [MARGIN + x * UNIT, MARGIN + y * UNIT];

/** 역의 캔버스 좌표. 출발 전·골인은 출발역·종착역에 둔다. */
export function nodeXY(node) {
  if (node === START) return proj(...board.coords[board.S]);
  if (node === HOME) return proj(...board.coords[board.G]);
  return proj(...board.coords[node]);
}

/** 아래쪽일수록 위에 그려지도록 깊이를 매긴다. */
export const depth = (y) => Math.round(y) + 10;

/** 오늘 구간이 들어오는 사각형(카메라가 처음에 맞춘다) */
export function routeBounds() {
  const pts = board.nodes.map((n) => proj(...board.coords[n]));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [[Math.min(...xs), Math.min(...ys)], [Math.max(...xs), Math.max(...ys)]];
}

// 한강: 지도 좌표의 굽이 점들(역 사이로 지나가게 잡았다)
const RIVER = [[-1, 4.6], [2.4, 4.9], [4.4, 5.9], [5.4, 6.5], [6.6, 6.7], [7.8, 7.45], [9.6, 7.55], [11.2, 7.15], [12.4, 6.85], [14.6, 6.25], [16.6, 7.05], [17.8, 6.6], [20.4, 6.0]];

/** 점들을 지나는 부드러운 곡선(캣멀롬 → 3차 베지에) */
function smooth(points) {
  const p = points.map(([x, y]) => proj(x, y));
  let d = `M ${p[0][0]} ${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i - 1] || p[i], b = p[i], c = p[i + 1], e = p[i + 2] || c;
    d += ` C ${b[0] + (c[0] - a[0]) / 6} ${b[1] + (c[1] - a[1]) / 6}, ${c[0] - (e[0] - b[0]) / 6} ${c[1] - (e[1] - b[1]) / 6}, ${c[0]} ${c[1]}`;
  }
  return d;
}

/** 글자: 흰 테두리를 둘러 선 위에서도 읽히게. '|' 는 줄바꿈 */
const label = (x, y, text, { size = 17, fill = INK, weight = 800, anchor = 'middle', halo = '#F7F3EA' } = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="${fill}" stroke="${halo}" stroke-width="5" paint-order="stroke" stroke-linejoin="round" font-family="Pretendard Variable, Pretendard, sans-serif">${
    text.split('|').map((t, i) => `<tspan x="${x}" dy="${i ? size * 1.1 : 0}">${t}</tspan>`).join('')}</text>`;

// 깃발 통행료 표는 기본이 깃발 오른쪽 — 옆 역 이름에 닿는 역만 왼쪽·위로
const TAG_SIDE = { 광화문: 'left', 종각: 'left', 을지로입구: 'left', 선릉: 'left', 삼성: 'left', 논현: 'up' };
export const tagSide = (n) => TAG_SIDE[n] || 'right';

// 역 이름 자리: 기본은 역 아래. 이름이 길어 옆 역과 겹치는 곳만 따로 둔다
const LABEL_AT = {
  을지로3가: { dy: -28 },
  동대문역사문화공원: { text: '동대문역사|문화공원' },
  신당: { dx: 22, dy: 7, anchor: 'start' }
};

/**
 * state.owned        내 역 — 동그라미 안을 금빛으로
 * state.goblin       도깨비 역 — 동그라미 안을 보랏빛으로
 * state.monopolyEdges 연결 구간(이어진 내 역) — 선 밑에 금빛 띠가 흐른다
 */
function drawSeoul(state = {}) {
  const owned = state.owned || {}, goblin = new Set(state.goblin || []);
  const active = new Set(board.nodes);
  const onRoute = new Set(board.edges.map((e) => [e.a, e.b].sort().join('|')));
  const color = (l) => board.lines[l].color;
  const seg = (e) => { const [x1, y1] = proj(...board.coords[e.a]), [x2, y2] = proj(...board.coords[e.b]); return `x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"`; };
  const isOn = (e) => e.line !== board.closed && onRoute.has([e.a, e.b].sort().join('|'));

  // 바탕: 종이 + 옅은 격자 + 한강
  let grid = '';
  for (let x = 0; x <= geo.w; x += UNIT) grid += `<line x1="${x}" y1="0" x2="${x}" y2="${geo.h}" stroke="#ECE6D8" stroke-width="1.5"/>`;
  for (let y = 0; y <= geo.h; y += UNIT) grid += `<line x1="0" y1="${y}" x2="${geo.w}" y2="${y}" stroke="#ECE6D8" stroke-width="1.5"/>`;
  const river = smooth(RIVER);
  const [rx, ry] = proj(3.2, 5.5);

  // 선: 구간 밖은 옅게, 구간 안은 먹선을 두른 굵은 색 선, 운행 중지 호선은 회색 점선
  const faded = board.allEdges.filter((e) => !isOn(e)).map((e) => {
    const shut = e.line === board.closed;
    return `<line ${seg(e)} stroke="${shut ? '#9C9482' : color(e.line)}" stroke-width="${shut ? 7 : 6}" stroke-linecap="round" opacity="${shut ? 0.9 : 0.28}" ${shut ? 'stroke-dasharray="10 9"' : ''}/>`;
  }).join('');
  const live = board.allEdges.filter(isOn);
  const under = live.map((e) => `<line ${seg(e)} stroke="${INK}" stroke-width="17" stroke-linecap="round"/>`).join('');
  // 연결 구간: 구간 밖이어도 금빛 띠가 흐른다
  const mono = (state.monopolyEdges || []).map((e) => `<line ${seg(e)} class="mono-glow" stroke="#F2B33D" stroke-width="30" stroke-linecap="round" opacity=".75"/>` +
    `<line ${seg(e)} class="mono-run" stroke="#FFF3C4" stroke-width="6" stroke-linecap="round" stroke-dasharray="6 22"/>`).join('');
  const over = live.map((e) => `<line ${seg(e)} stroke="${color(e.line)}" stroke-width="10" stroke-linecap="round"/>`).join('');

  // 역
  const stations = board.allNodes.map((n) => {
    const [x, y] = proj(...board.coords[n]);
    if (!active.has(n)) {
      const at = LABEL_AT[n] || {};
      return `<circle cx="${x}" cy="${y}" r="8" fill="${owned[n] ? '#F2D27A' : '#F7F3EA'}" stroke="${owned[n] ? '#B8902E' : '#B8B0A0'}" stroke-width="2.5"/>` +
        label(x + (at.dx || 0), y + (at.dy ?? 30), at.text || n, { size: 17, fill: '#A39B8A', weight: 700, anchor: at.anchor });
    }
    const end = n === board.S || n === board.G;
    const big = board.transfers.has(n);
    const fill = owned[n] ? '#FFE08A' : goblin.has(n) ? '#C9B3E6' : '#FFFDF7';
    let out;
    if (end) {
      const c = n === board.S ? '#3E9B6A' : '#E0533D';
      out = `<circle cx="${x}" cy="${y}" r="21" fill="${c}" stroke="${INK}" stroke-width="4"/><circle cx="${x}" cy="${y}" r="9" fill="#FFFDF7"/>`;
    } else if (big) {
      out = `<circle cx="${x}" cy="${y}" r="16" fill="${fill}" stroke="${INK}" stroke-width="4"/><circle cx="${x}" cy="${y}" r="8.5" fill="none" stroke="${INK}" stroke-width="2.6"/>`;
    } else {
      out = `<circle cx="${x}" cy="${y}" r="12" fill="${fill}" stroke="${INK}" stroke-width="3.5"/>`;
    }
    const at = LABEL_AT[n] || {};
    const name = label(x + (at.dx || 0), y + (at.dy ?? (end ? 52 : big ? 42 : 38)), at.text || n, { size: end ? 26 : 22, weight: end ? 900 : 800, anchor: at.anchor });
    if (end) out += label(x, y - 34, n === board.S ? '출발' : '종착', { size: 19, weight: 900, fill: n === board.S ? '#2E7D52' : '#C23E2A' });
    return out + name;
  }).join('');

  return `
    <rect width="${geo.w}" height="${geo.h}" fill="#F7F3EA"/>
    ${grid}
    <path d="${river}" fill="none" stroke="#CFE7F3" stroke-width="58" stroke-linecap="round"/>
    <path d="${river}" fill="none" stroke="#BCDDEE" stroke-width="3" stroke-dasharray="2 16" stroke-linecap="round"/>
    ${label(rx, ry, '한 강', { size: 22, fill: '#7FB5D3', weight: 900, halo: '#CFE7F3' })}
    <g>${faded}</g>
    <g>${mono}</g>
    <g>${under}</g>
    <g>${over}</g>
    <g>${stations}</g>`;
}

export function boardSvg(state = {}) {
  return `<svg class="mat" viewBox="0 0 ${geo.w} ${geo.h}" width="${geo.w}" height="${geo.h}" aria-hidden="true">${drawSeoul(state)}</svg>`;
}
