// 돌발 사건: 라운드마다 두 번, 미리 정해진 차례(남은 던질 기회)에 판 전체에 일이 일어난다.
// 어떤 사건이 언제 오는지는 라운드 시작 때 정하고(run.js), 화면은 "몇 번 뒤에 사건" 만 미리 보여준다.
// 사건 효과는 round.js 가 이벤트 목록으로 풀어낸다 — 이 파일은 목록과 고르는 규칙만 안다.

export const EVENTS = [
  { id: 'treasureRain', name: '보따리 소나기', desc: '하늘에서 보따리 3개가 쏟아진다', weight: 3, good: true },
  { id: 'goldRush', name: '황금 칸', desc: '빈 칸 두 곳이 이번 라운드 동안 황금 칸이 된다 (멈추면 배수 +2)', weight: 3, good: true },
  { id: 'gust', name: '회오리바람', desc: '판 위의 도깨비가 모두 출발로 날아간다', weight: 2, good: true },
  { id: 'feast', name: '신명 굿판', desc: '풍악이 울려 흥이 2 오른다', weight: 2, good: true },
  { id: 'tailwind', name: '순풍', desc: '던질 기회가 1번 늘어난다', weight: 2, good: true },
  { id: 'market', name: '도깨비 장날', desc: '도깨비가 엽전 3개를 흘리고 갔다', weight: 2, good: true },
  { id: 'raid', name: '도깨비 잔치', desc: '신이 난 도깨비들이 한 번 더 움직인다', weight: 2, good: false }
];
export const EVENTS_PER_ROUND = 2;
export const eventById = (id) => EVENTS.find((e) => e.id === id);

/**
 * 라운드의 사건 계획. at 은 "남은 던질 기회가 이만큼일 때 내 차례가 시작되면" 터진다는 뜻.
 * 처음 한두 번은 판을 익히게 두고, 마지막 한 번은 남겨 둔다.
 */
export function planEvents(rng, throws) {
  const slots = [];
  for (let t = throws - 2; t >= 2; t--) slots.push(t);
  const at = rng.shuffle(slots).slice(0, EVENTS_PER_ROUND).sort((a, b) => b - a);
  const picked = [];
  for (const a of at) {
    const pool = EVENTS.filter((e) => !picked.some((p) => p.id === e.id));
    let roll = rng.next() * pool.reduce((s, e) => s + e.weight, 0);
    const ev = pool.find((e) => (roll -= e.weight) < 0) || pool[pool.length - 1];
    picked.push({ at: a, id: ev.id, done: false });
  }
  return picked;
}
