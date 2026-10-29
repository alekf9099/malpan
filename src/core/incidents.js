// 역 사건: 판이 한 바퀴 돌 때마다 확률로 역 하나에서 일이 터진다. 화면은 그 역에 연기·시계·인파·음표 움직임을 띄운다.
// 사건은 정해진 시간 동안 그 역에 머물다 사라진다.
//   block  : 아무도 들어가지 못한다
//   stop   : 지나가던 열차가 그 역에서 멈춘다(신호 대기)
//   cash   : 그 역에 서면 받는 돈 · tollX : 그 역 통행료 배수
//   again  : 그 역에 서면 한 번 더 굴린다
//   short  : 사건 카드에 쓰는 한 줄

export const INCIDENTS = {
  fire: { id: 'fire', name: '화재', minutes: 120, block: true, weight: 2, short: '2시간 진입 불가' },
  delay: { id: 'delay', name: '신호 장애', minutes: 150, stop: true, weight: 3, short: '지나가는 열차 정차' },
  crowd: { id: 'crowd', name: '인파 몰림', minutes: 120, cash: 100, tollX: 2, weight: 3, short: '도착 시 +100 · 통행료 2배' },
  busk: { id: 'busk', name: '역 버스킹', minutes: 120, again: true, weight: 2, short: '도착 시 한 번 더' },
  // 스킬로만 생긴다 — own: 역 주인은 막히지 않는다
  gate: { id: 'gate', name: '출입 통제', minutes: 270, stop: true, own: true, weight: 0, short: '상대 열차 강제 정차' },
  hype: { id: 'hype', name: '떡상', minutes: 270, tollX: 2, weight: 0, short: '통행료 2배 · 모두의 목적지' }
};

/** 한 번에 노선도에 있을 수 있는 사건 수 · 한 바퀴마다 새 사건이 생길 확률 */
export const INCIDENT_MAX = 4;
export const INCIDENT_CHANCE = 0.55;

/** 가중치로 사건 종류 하나. 러시아워엔 인파가 잦다 */
export function pickIncident(rng, rush = false) {
  const pool = Object.values(INCIDENTS).map((i) => ({ i, w: i.weight + (rush && i.id === 'crowd' ? 3 : 0) }));
  let roll = rng.next() * pool.reduce((s, x) => s + x.w, 0);
  return (pool.find((x) => (roll -= x.w) < 0) || pool[pool.length - 1]).i;
}
