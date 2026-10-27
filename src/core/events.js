// 돌발 사건: 하루 운행 중 두 번, 미리 정해 둔 시각에 노선도 전체에 일이 일어난다.
// 어떤 사건이 언제 오는지는 하루를 시작할 때 정하고(run.js), 화면은 "다음 사건 14:00" 처럼 시각만 미리 보여준다.
// 사건 효과는 round.js 가 이벤트 목록으로 풀어낸다 — 이 파일은 목록과 고르는 규칙만 안다.

export const EVENTS = [
  { id: 'treasureRain', name: '분실물 대방출', desc: '역 곳곳에 분실물 3개가 나왔다', weight: 3, good: true },
  { id: 'goldRush', name: '황금 역', desc: '빈 역 두 곳이 오늘 하루 황금 역이 된다 (멈추면 배수 +2)', weight: 3, good: true },
  { id: 'gust', name: '도깨비 열차 회차', desc: '노선 위의 도깨비 열차가 모두 차고로 돌아간다', weight: 2, good: true },
  { id: 'feast', name: '역 버스킹', desc: '흥겨운 공연에 승객 만족도가 2 오른다', weight: 2, good: true },
  { id: 'tailwind', name: '연장 운행', desc: '오늘 운행이 1시간 늘어난다', weight: 2, good: true },
  { id: 'market', name: '토큰 줍기', desc: '도깨비가 토큰 3개를 흘리고 갔다', weight: 2, good: true },
  { id: 'raid', name: '도깨비 폭주', desc: '신이 난 도깨비 열차가 한 번 더 달린다', weight: 2, good: false }
];
export const EVENTS_PER_DAY = 2;
export const eventById = (id) => EVENTS.find((e) => e.id === id);

/**
 * 하루의 사건 계획. at 은 시각(자정부터 분). 그 시각이 지난 뒤 내 차례가 오면 터진다.
 * 첫 운행 두어 시간은 노선을 익히게 두고, 막차 무렵은 비워 둔다. 두 사건은 3시간 이상 떨어진다.
 */
export function planEvents(rng, from = 8 * 60, to = 21 * 60) {
  const a = from + Math.floor(rng.next() * ((to - from) / 2 - 90) / 30) * 30;
  const b = Math.max(a + 180, from + (to - from) / 2 + Math.floor(rng.next() * ((to - from) / 2) / 30) * 30);
  const picked = [];
  for (const at of [a, Math.min(b, to)]) {
    const pool = EVENTS.filter((e) => !picked.some((p) => p.id === e.id));
    let roll = rng.next() * pool.reduce((s, e) => s + e.weight, 0);
    const ev = pool.find((e) => (roll -= e.weight) < 0) || pool[pool.length - 1];
    picked.push({ at, id: ev.id });
  }
  return picked;
}
