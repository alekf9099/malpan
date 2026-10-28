// 역 사건: 판이 한 바퀴 돌 때마다 확률로 역 하나에서 일이 터진다. 화면은 그 역에 연기·시계·인파·음표 움직임을 띄운다.
// 사건은 정해진 시간 동안 그 역에 머물다 사라진다.
//   block  : 아무도 들어가지 못한다
//   stop   : 지나가던 열차가 그 역에서 멈춘다(신호 대기)
//   cash   : 그 역에 서면 받는 돈 · tollX : 그 역 통행료 배수
//   again  : 그 역에 서면 한 번 더 굴린다
//   short  : 사건 카드에 쓰는 한 줄

export const INCIDENTS = {
  fire: { id: 'fire', name: '화재', minutes: 120, block: true, weight: 2, short: '2시간 동안 아무도 못 들어간다' },
  delay: { id: 'delay', name: '신호 장애', minutes: 150, stop: true, weight: 3, short: '지나가던 열차가 여기서 멈춘다' },
  crowd: { id: 'crowd', name: '인파 몰림', minutes: 120, cash: 100, tollX: 2, weight: 3, short: '서면 +100 · 주인 있으면 통행료 2배' },
  busk: { id: 'busk', name: '역 버스킹', minutes: 120, again: true, weight: 2, short: '서면 한 번 더 굴린다' }
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
