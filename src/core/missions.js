// 일일 미션 · 출석 보상 — 정해진 규칙만 여기(저장은 ui/daily.js).
//   미션: 날마다 3개(첫째는 늘 "대결 1판"), 날짜가 시드라 그날은 누구나 같은 미션. 다 채우면 승차권을 받는다.
//   출석: 하루 한 번 받는다. 7일 달력을 차례로 채우고(빠진 날이 있어도 이어서), 7일째가 가장 크다.

import { createRng } from './rng.js';

/** stat = 한 판에서 센 값의 이름(ui 가 판 끝에 넘긴다) */
export const MISSIONS = [
  { id: 'play', stat: 'play', goal: 1, reward: 10, text: '대결 1판 하기' },
  { id: 'win', stat: 'win', goal: 1, reward: 30, text: '대결에서 1등 하기' },
  { id: 'buy', stat: 'buy', goal: 8, reward: 15, text: '역 8곳 사기' },
  { id: 'hot', stat: 'hot', goal: 3, reward: 15, text: '명소역에 3번 서기' },
  { id: 'goal', stat: 'goal', goal: 3, reward: 15, text: '목적지에 3번 닿기' },
  { id: 'upgrade', stat: 'upgrade', goal: 5, reward: 15, text: '역 5번 증축하기' },
  { id: 'toll', stat: 'toll', goal: 300, reward: 20, text: '통행료·통과 요금 300점 받기' },
  { id: 'takeover', stat: 'takeover', goal: 1, reward: 20, text: '남의 역 1곳 인수하기' },
  { id: 'landmark', stat: 'landmark', goal: 1, reward: 20, text: '랜드마크 1곳 짓기' }
];
export const missionById = (id) => MISSIONS.find((x) => x.id === id);

/** 오늘의 날짜 열쇠 YYYY-MM-DD(기기 시각 기준) */
export const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** 그날의 미션 3개: 대결 1판 + 나머지에서 둘 */
export function dailyMissions(day) {
  const seed = [...day].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const rest = createRng(seed || 1).shuffle(MISSIONS.filter((x) => x.id !== 'play')).slice(0, 2);
  return [missionById('play'), ...rest];
}

/** 출석 7일 보상(승차권) */
export const ATTEND_REWARDS = [20, 20, 30, 30, 40, 40, 100];

/** 다음에 받을 출석 칸(0~6)과 보상. count = 지금까지 받은 횟수 */
export const nextAttend = (count) => ({ index: count % 7, reward: ATTEND_REWARDS[count % 7] });
