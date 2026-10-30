// 관광 맵 — 2호선 순환선과 같은 32칸 고리(ring.js)에 여행지를 올렸다.
//   국내(korea): 한반도 KTX 일주 — 서울 출발 → 강원 → 충청 → 경북 → 부산·경남 → 전라 → 제주, KTX 경부선 · 호남선 지름길
//   해외(world): 세계 일주 항공로 — 인천공항 출국 → 아시아 → 중동·아프리카 → 유럽 → 아메리카, 직항 지름길 둘
// 칸 id 는 노선도 역 이름과 겹치지 않게 지었다(값 · 찬스를 id 로 찾는다). 그림 id 는 ui/tour-art.js.

import { makeRing } from './ring.js';

const ring = (id, rows) => {
  const tiles = rows.map((r) => r[0]);
  const pick = (k) => Object.fromEntries(rows.filter((r) => r[k] != null).map((r) => [r[0], r[k]]));
  return { tiles, groupOf: pick(1), prices: pick(2), icons: pick(3) };
};

// [칸, 구역, 값, 그림] — 모서리 · 찬스 칸은 구역 · 값이 없다
const K = ring('korea', [
  ['서울 출발', null, null, 'train'], ['서울 경복궁', '수도권', 280, 'palace'], ['남산타워', '수도권', 260, 'tower'], ['여행 카드 1', null, null], ['수원 화성', '수도권', 200, 'gate'], ['인천대교', '수도권', 180, 'bridge'], ['남이섬', '강원', 160, 'trees'], ['설악산', '강원', 180, 'mountain'],
  ['휴게소', null, null, 'rest'], ['경포대', '강원', 180, 'pavilion'], ['평창', '강원', 160, 'ski'], ['여행 카드 2', null, null], ['단양', '충청', 140, 'mountain'], ['부여', '충청', 140, 'pagoda'], ['안동 하회', '경북', 180, 'mask'], ['불국사', '경북', 220, 'pagoda'],
  ['지역 축제', null, null, 'balloons'], ['해운대', '부산·경남', 280, 'wave'], ['광안대교', '부산·경남', 260, 'bridge'], ['여행 카드 3', null, null], ['통영', '부산·경남', 180, 'boat'], ['진해', '부산·경남', 160, 'blossom'], ['여수', '전라', 200, 'moonbridge'], ['보성', '전라', 140, 'tea'],
  ['제주행', null, null, 'plane'], ['담양', '전라', 140, 'bamboo'], ['전주', '전라', 200, 'hanok'], ['여행 카드 4', null, null], ['성산일출봉', '제주', 240, 'crater'], ['돌하르방', '제주', 180, 'stone'], ['한라산', '제주', 260, 'snowpeak'], ['우도', '제주', 180, 'wave']
]);

export const KOREA_RING = makeRing({
  id: 'korea', name: '국내 여행', sub: '한반도 KTX 일주 · 32칸', short: '국내',
  ...K,
  corners: {
    '서울 출발': { kind: 'start', name: '서울 출발', short: '지나면 여비 · 서면 1.5배', icon: 'train' },
    '휴게소': { kind: 'maze', name: '휴게소', short: '한 턴 쉬기', icon: 'rest' },
    '지역 축제': { kind: 'festival', name: '지역 축제', short: '내 칸 1곳 통행료 2배(3바퀴)', icon: 'balloons' },
    '제주행': { kind: 'express', name: '제주행', short: '앞 12칸 중 원하는 칸으로 비행', icon: 'plane' }
  },
  shortcuts: [['남산타워', '해운대', '#2F6FD0', 'KTX 경부선'], ['수원 화성', '전주', '#E0533D', 'KTX 호남선']],
  chance: ['여행 카드 1', '여행 카드 2', '여행 카드 3', '여행 카드 4'], chanceName: '여행 카드',
  groups: { 수도권: '#2F6FD0', 강원: '#3E9B6A', 충청: '#17A2A8', 경북: '#8E5BC8', '부산·경남': '#E0533D', 전라: '#F08A2E', 제주: '#E2588F' },
  names: { '서울 경복궁': '경복궁' },
  lineColor: '#2F6FD0', startName: '서울', payName: '여비', arcs: true,
  // 모서리 · 여행 카드가 고리를 4칸씩 끊는다 — 4칸을 이어 가지면(그 구간을 통째로) 독점
  lineWin: 4,
  intro: '모두 <b>서울</b>에서 출발해 한반도를 한 바퀴 · 지날 때마다 <b>여비</b> · 모서리 칸: 휴게소·축제·제주행 · <b>KTX 경부선·호남선</b>으로 판을 가로지른다',
  scene: 'korea'
});

const W = ring('world', [
  ['인천공항', null, null, 'plane'], ['도쿄', '아시아', 240, 'redtower'], ['후지산', '아시아', 180, 'fuji'], ['면세점 1', null, null], ['베이징', '아시아', 200, 'wall'], ['방콕', '아시아', 140, 'temple'], ['싱가포르', '아시아', 220, 'marina'], ['홍콩', '아시아', 200, 'skyline'],
  ['환승 라운지', null, null, 'lounge'], ['시드니', '오세아니아', 220, 'opera'], ['두바이', '중동·아프리카', 260, 'burj'], ['면세점 2', null, null], ['카이로', '중동·아프리카', 160, 'pyramid'], ['아그라', '중동·아프리카', 160, 'taj'], ['이스탄불', '중동·아프리카', 180, 'mosque'], ['산토리니', '유럽', 200, 'santorini'],
  ['지중해 크루즈', null, null, 'ship'], ['로마', '유럽', 240, 'colosseum'], ['피사', '유럽', 140, 'pisa'], ['면세점 3', null, null], ['베네치아', '유럽', 180, 'gondola'], ['파리', '유럽', 300, 'eiffel'], ['런던', '유럽', 280, 'bigben'], ['바르셀로나', '유럽', 220, 'sagrada'],
  ['월드 페스티벌', null, null, 'balloons'], ['뉴욕', '아메리카', 320, 'liberty'], ['샌프란시스코', '아메리카', 240, 'goldengate'], ['면세점 4', null, null], ['리우', '아메리카', 180, 'christ'], ['마추픽추', '아메리카', 160, 'machu'], ['밴쿠버', '아메리카', 180, 'snowpeak'], ['칸쿤', '아메리카', 160, 'wave']
]);

export const WORLD_RING = makeRing({
  id: 'world', name: '세계 일주', sub: '항공로 일주 · 32칸', short: '해외',
  ...W,
  corners: {
    '인천공항': { kind: 'start', name: '인천공항', short: '출국 · 지나면 여비 · 서면 1.5배', icon: 'plane' },
    '환승 라운지': { kind: 'maze', name: '환승 라운지', short: '한 턴 쉬기', icon: 'lounge' },
    '지중해 크루즈': { kind: 'express', name: '지중해 크루즈', short: '앞 12칸 중 원하는 칸으로 항해', icon: 'ship' },
    '월드 페스티벌': { kind: 'festival', name: '월드 페스티벌', short: '내 칸 1곳 통행료 2배(3바퀴)', icon: 'balloons' }
  },
  shortcuts: [['도쿄', '파리', '#2F6BD8', '직항'], ['싱가포르', '뉴욕', '#E39A1E', '직항']],
  chance: ['면세점 1', '면세점 2', '면세점 3', '면세점 4'], chanceName: '면세점',
  groups: { 아시아: '#E0533D', 오세아니아: '#8E5BC8', '중동·아프리카': '#E39A1E', 유럽: '#2F6BD8', 아메리카: '#3E9B6A' },
  names: {},
  lineColor: '#2F6BD8', startName: '인천공항', payName: '여비', flights: true,
  lineWin: 4,
  intro: '모두 <b>인천공항</b>에서 출국해 세계를 한 바퀴 · 지날 때마다 <b>여비</b> · 모서리 칸: 라운지·크루즈·페스티벌 · <b>직항</b> 두 노선으로 판을 가로지른다',
  scene: 'world'
});
