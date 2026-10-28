// 카드 두 가지 — 모두의 마블 찬스 카드처럼 날아와 뒤집힌다(화면이 연출).
//   찬스 카드: 찬스 역(노선도 곳곳의 ? 역)에 서면 그 사람이 한 장 뽑는다
//   뉴스 카드: 하루 두 번, 정해 둔 시각이 지나면 모두에게 일이 생긴다(미리 알려 주지 않는다)
// 효과는 match.js 가 id 로 풀어낸다 — 이 파일은 목록과 고르는 규칙만 안다.

export const CHANCE_CARDS = [
  { id: 'bonus', name: '단체 승객', short: '+150', good: true, weight: 3 },
  { id: 'refund', name: '정기권 환급', short: '+80', good: true, weight: 3 },
  { id: 'express', name: '급행 환승권', short: '다음 굴림 +3역', good: true, weight: 2 },
  { id: 'coupon', name: '통행료 면제권', short: '다음 통행료 한 번 면제', good: true, weight: 2 },
  { id: 'build', name: '역세권 개발', short: '내 역 하나 무료 증축', good: true, weight: 2 },
  { id: 'fine', name: '무임승차 단속', short: '−100', good: false, weight: 3 },
  { id: 'repair', name: '역사 보수', short: '내 역 하나마다 −20', good: false, weight: 2 },
  { id: 'rest', name: '신호 대기', short: '다음 차례 한 번 쉰다', good: false, weight: 2 }
];

export const NEWS_CARDS = [
  { id: 'sale', name: '역세권 세일', short: '2시간 동안 역 값 반값', good: true, weight: 3 },
  { id: 'boom', name: '역세권 호재', short: '2시간 동안 통행료 2배', good: true, weight: 3 },
  { id: 'extend', name: '연장 운행', short: '막차 1시간 연장', good: true, weight: 2 },
  { id: 'payday', name: '교통비 지원', short: '모두 +100', good: true, weight: 2 },
  { id: 'inspect', name: '안전 점검', short: '모두 내 역 하나마다 −15', good: false, weight: 2 }
];

export const chanceById = (id) => CHANCE_CARDS.find((c) => c.id === id);
export const newsById = (id) => NEWS_CARDS.find((c) => c.id === id);

export function pickWeighted(rng, pool) {
  let roll = rng.next() * pool.reduce((s, e) => s + e.weight, 0);
  return pool.find((e) => (roll -= e.weight) < 0) || pool[pool.length - 1];
}

/** 하루 뉴스 두 번: 08~21시, 3시간 넘게 떨어져서, 서로 다른 카드 */
export function planNews(rng, from = 8 * 60, to = 21 * 60) {
  const a = from + Math.floor(rng.next() * ((to - from) / 2 - 90) / 30) * 30;
  const b = Math.max(a + 180, from + (to - from) / 2 + Math.floor(rng.next() * ((to - from) / 2) / 30) * 30);
  const picked = [];
  for (const at of [a, Math.min(b, to)]) {
    const ev = pickWeighted(rng, NEWS_CARDS.filter((e) => !picked.some((p) => p.id === e.id)));
    picked.push({ at, id: ev.id });
  }
  return picked;
}
