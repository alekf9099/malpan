// 2호선 순환선 판 — 부루마블처럼 32칸 고리를 한 방향(시계 방향)으로 돈다.
//   모서리 4칸: 시청(출발 · 지나면 월급) · 성수(팝업 축제) · 강남(급행 환승) · 신도림(환승 미로)
//   찬스 4칸(한양대 · 구의 · 서초 · 문래) · 명소 3칸(동대문역사문화공원 · 잠실 · 홍대입구)
//   환승 지름길 2개: 3호선 을지로3가 ↔ 교대 · 4호선 동대문역사문화공원 ↔ 사당 — 그 칸을 지나거나 떠날 때 갈림길이 된다
// 노선도 판의 지역(regionOf)과 같은 꼴({ stations, set, adj, dist })이라 규칙(match.js)이 거의 그대로 돈다.
// adj 는 방향이 있다(앞 칸 + 지름길) — 되돌아갈 수 없다.

export const LOOP_TILES = [
  '시청', '을지로입구', '을지로3가', '동대문역사문화공원', '신당', '왕십리', '한양대', '뚝섬',
  '성수', '건대입구', '구의', '강변', '잠실', '종합운동장', '삼성', '역삼',
  '강남', '교대', '서초', '방배', '사당', '서울대입구', '신림', '구로디지털단지',
  '신도림', '문래', '영등포구청', '당산', '합정', '홍대입구', '신촌', '이대'
];
export const LOOP_SIZE = LOOP_TILES.length;
export const LOOP_START = '시청';

/** 모서리 칸: 살 수 없고, 서면 그 칸의 일 */
export const CORNERS = {
  '시청': { kind: 'start', name: '출발', short: '지나면 월급 · 서면 1.5배' },
  '성수': { kind: 'festival', name: '팝업 축제', short: '내 역 1곳 통행료 2배(3바퀴)' },
  '강남': { kind: 'express', name: '급행 환승', short: '앞 12칸 중 원하는 칸으로' },
  '신도림': { kind: 'maze', name: '환승 미로', short: '한 턴 쉬기' }
};
export const isCorner = (n) => !!CORNERS[n];

/** 환승 지름길: [a, b, 호선] — 양쪽으로 탈 수 있다 */
export const SHORTCUTS = [['을지로3가', '교대', 3], ['동대문역사문화공원', '사당', 4]];

/** 판의 네 변(구역) — 칸 색 */
export const SIDES = [
  { name: '도심', color: '#E0533D' },
  { name: '동부', color: '#F08A2E' },
  { name: '강남', color: '#2F6BD8' },
  { name: '서남', color: '#8E5BC8' }
];
export const sideOf = (n) => Math.floor(LOOP_TILES.indexOf(n) / 8) % 4;

/** 지나면(또는 서면) 받는 월급 */
export const SALARY = 150;

export const loopIndex = (n) => LOOP_TILES.indexOf(n);
export const loopNext = (n, k = 1) => LOOP_TILES[(loopIndex(n) + k) % LOOP_SIZE];
/** a 에서 앞으로 몇 칸 가야 b 인가(고리 방향) */
export const ahead = (a, b) => (loopIndex(b) - loopIndex(a) + LOOP_SIZE) % LOOP_SIZE;
/** 앞으로 1~k 칸 */
export const forward = (n, k) => Array.from({ length: k }, (_, i) => loopNext(n, i + 1));

const adj = {};
for (const n of LOOP_TILES) adj[n] = [loopNext(n)];
for (const [a, b] of SHORTCUTS) { adj[a].push(b); adj[b].push(a); }
export const shortcutOf = (a, b) => SHORTCUTS.find(([x, y]) => (x === a && y === b) || (x === b && y === a))?.[2] ?? null;

const D = {};
const distIn = (a, b) => {
  if (!D[a]) {
    const d = { [a]: 0 }, q = [a];
    while (q.length) { const n = q.shift(); for (const m of adj[n] || []) if (d[m] == null) { d[m] = d[n] + 1; q.push(m); } }
    D[a] = d;
  }
  return D[a][b] ?? Infinity;
};

/** 순환선 판(지역과 같은 꼴) */
export const LOOP = {
  id: 'loop', name: '2호선 순환선', sub: '32칸 · 3·4호선 지름길', loop: true,
  stations: LOOP_TILES, set: new Set(LOOP_TILES), adj, dist: distIn
};

/** 연결(통행료 배수 · 노선 독점)을 셀 줄: 고리 하나(2호선) */
export const LOOP_CHAIN = { 2: [...LOOP_TILES, LOOP_TILES[0]] };
