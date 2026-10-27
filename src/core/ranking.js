// 승점: 하루를 목표대로 마칠 때마다 쌓이고, 원정이 끝나면(이기든 지든) 기록으로 남는다.
// 화면이 기기에 저장하는 일(ui/records.js)과 나눠, 계산만 여기서 한다.
//
//   하루 승리 +10 · 보스 날이면 +10 더 · 목표를 넘긴 만큼 10%마다 +1(최대 +10) · 남은 운행 1시간마다 +2
//   5일 원정을 끝까지 마치면 +100. 하루짜리 "오늘의 노선"은 모든 승점이 절반(올림)

export const POINTS = { win: 10, boss: 10, overStep: 0.1, overMax: 10, perHour: 2, clearFull: 100 };

/** 이긴 하루의 승점(오늘의 노선 절반 처리 전). minutesLeft = 막차까지 남은 분 */
export function roundPoints({ score, target, minutesLeft = 0, boss }) {
  const over = Math.min(POINTS.overMax, Math.max(0, Math.floor((score / target - 1) / POINTS.overStep)));
  return POINTS.win + (boss ? POINTS.boss : 0) + over + Math.floor(Math.max(0, minutesLeft) / 60) * POINTS.perHour;
}

/** 하루짜리 오늘의 노선이면 절반 */
export const scaled = (run, pts) => (run.daily ? Math.ceil(pts / 2) : pts);

/** 누적 승점에 따른 칭호 */
export const RANKS = [
  { min: 0, name: '수습 역무원' },
  { min: 150, name: '정식 역무원' },
  { min: 500, name: '노련한 기관사' },
  { min: 1200, name: '역장' },
  { min: 3000, name: '전설의 노선 지기' }
];
export function rankOf(total) {
  let r = RANKS[0];
  for (const x of RANKS) if (total >= x.min) r = x;
  const next = RANKS[RANKS.indexOf(r) + 1] || null;
  return { ...r, next };
}
