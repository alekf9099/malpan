// 역 사건: 운행 중에 역 하나에서 일이 터진다. 화면은 그 역에 연기·시계·인파·음표 같은 움직임을 띄운다.
// 사건은 정해진 시간 동안 그 역에 머물다 사라진다. 효과는 round.js 가 이 표의 값으로 계산한다.
//   block  : 아무도 지나가지도 서지도 못한다
//   delay  : 지나가거나 서면 그만큼 시간이 더 든다
//   chips·mult : 내 말이 멈추면 점수에 붙는다
//   short  : 사건 카드에 쓰는 한 줄

export const INCIDENTS = {
  fire: { id: 'fire', name: '화재', minutes: 120, block: true, weight: 2, desc: '연기가 걷힐 때까지 아무도 지나갈 수 없다', short: '2시간 동안 아무도 못 지나간다' },
  delay: { id: 'delay', name: '신호 장애', minutes: 150, delay: 30, weight: 3, desc: '지나가거나 서면 30분 더 걸린다', short: '지나가거나 서면 30분 더' },
  crowd: { id: 'crowd', name: '인파 몰림', minutes: 120, chips: 40, weight: 3, desc: '멈추면 승객을 가득 태워 칩 +40', short: '여기 서면 칩 +40' },
  busk: { id: 'busk', name: '역 버스킹', minutes: 120, mult: 2, weight: 2, desc: '멈추면 흥겨운 공연에 배수 +2', short: '여기 서면 배수 +2' }
};

/** 한 번에 노선도에 있을 수 있는 사건 수 · 도깨비 차례가 끝날 때 새 사건이 생길 확률 */
export const INCIDENT_MAX = 3;
export const INCIDENT_CHANCE = 0.45;

export const incidentById = (id) => INCIDENTS[id];

/** 가중치로 사건 종류 하나. 러시아워엔 인파가 잦다 */
export function pickIncident(rng, rush = false) {
  const pool = Object.values(INCIDENTS).map((i) => ({ i, w: i.weight + (rush && i.id === 'crowd' ? 3 : 0) }));
  let roll = rng.next() * pool.reduce((s, x) => s + x.w, 0);
  return (pool.find((x) => (roll -= x.w) < 0) || pool[pool.length - 1]).i;
}
