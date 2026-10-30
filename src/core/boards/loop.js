// 2호선 순환선 판 — 부루마블처럼 32칸 고리를 한 방향(시계 방향)으로 돈다.
//   모서리 4칸: 시청(출발 · 지나면 월급) · 성수(팝업 축제) · 강남(급행 환승) · 신도림(환승 미로)
//   찬스 4칸(한양대 · 구의 · 서초 · 문래) · 명소 3칸(동대문역사문화공원 · 잠실 · 홍대입구)
//   환승 지름길 2개: 3호선 을지로3가 ↔ 교대 · 4호선 동대문역사문화공원 ↔ 사당 — 그 칸을 지나거나 떠날 때 갈림길이 된다
// 고리 판 틀(ring.js)로 만든다. 관광 맵(국내 · 해외)은 tour.js. 판을 고르는 곳은 RINGS · ringOf.
// adj 는 방향이 있다(앞 칸 + 지름길) — 되돌아갈 수 없다.

import { makeRing } from './ring.js';
import { LINES } from './seoul.js';
import { KOREA_RING, WORLD_RING } from './tour.js';

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

/** 환승 지름길: [a, b, 색, 이름, 호선] — 양쪽으로 탈 수 있다 */
export const SHORTCUTS = [['을지로3가', '교대', LINES[3].color, '3호선', 3], ['동대문역사문화공원', '사당', LINES[4].color, '4호선', 4]];

/** 판의 네 변(구역) — 칸 색 */
export const SIDES = [
  { name: '도심', color: '#E0533D' },
  { name: '동부', color: '#F08A2E' },
  { name: '강남', color: '#2F6BD8' },
  { name: '서남', color: '#8E5BC8' }
];

/** 지나면(또는 서면) 받는 월급 */
export const SALARY = 150;

/** 순환선 판 */
export const LOOP = makeRing({
  id: 'loop', name: '2호선 순환선', sub: '32칸 · 3·4호선 지름길', short: '순환선',
  tiles: LOOP_TILES, corners: CORNERS, shortcuts: SHORTCUTS,
  chance: ['한양대', '구의', '서초', '문래'], chanceName: '찬스',
  groups: Object.fromEntries(SIDES.map((s) => [s.name, s.color])),
  groupOf: Object.fromEntries(LOOP_TILES.map((n, i) => [n, SIDES[Math.floor(i / 8) % 4].name])),
  names: {
    '을지로입구': '을지로입구', '동대문역사문화공원': 'DDP', '구로디지털단지': '구로디지털'
  },
  chainLine: 2, lineColor: '#3CB44A', startName: '시청', payName: '월급',
  intro: '모두 <b>시청</b>에서 출발 · 한 바퀴 돌 때마다 <b>월급</b> · 모서리 칸: 축제·급행·미로 · <b>3·4호선 지름길</b>로 판을 가로지른다',
  scene: 'seoul'
});

/** 고리 판 전부(region id → 판) */
export const RINGS = { loop: LOOP, korea: KOREA_RING, world: WORLD_RING };
export const ringOf = (id) => RINGS[id] || null;

// 순환선 전용(옛 이름) — 테스트·도구가 쓴다
export const loopIndex = LOOP.index;
export const ahead = LOOP.ahead;
export const forward = LOOP.forward;
export const LOOP_CHAIN = LOOP.chain;
