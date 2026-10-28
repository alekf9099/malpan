// 승점: 한 판이 끝나면 등수만큼 쌓이고 기록으로 남는다. 저장(ui/records.js)과 나눠 계산만 여기서 한다.
//
//   1등 +30 · 2등 +15 · 3등 +5 · 4등 0, 상대를 파산시켜 이기면 +10 더, 상대가 많을수록 1등 승점이 커진다(+5 × 상대 수)
//   오늘의 대결(날짜 시드)도 같은 방식

export const POINTS = { place: [0, 30, 15, 5, 0], perRival: 5, knockout: 10 };

/** 이 판에서 받은 승점. place = 1~4, rivals = 상대 수, knockout = 파산으로 끝냈나 */
export function matchPoints({ place, rivals, knockout }) {
  let pts = POINTS.place[place] || 0;
  if (place === 1) pts += POINTS.perRival * rivals + (knockout ? POINTS.knockout : 0);
  return pts;
}

/** 누적 승점에 따른 칭호 */
export const RANKS = [
  { min: 0, name: '수습 역무원' },
  { min: 100, name: '정식 역무원' },
  { min: 300, name: '노련한 기관사' },
  { min: 700, name: '역장' },
  { min: 1500, name: '노선왕' }
];
export function rankOf(total) {
  let r = RANKS[0];
  for (const x of RANKS) if (total >= x.min) r = x;
  const next = RANKS[RANKS.indexOf(r) + 1] || null;
  return { ...r, next };
}
