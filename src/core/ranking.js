// 승점: 한 판이 끝나면 쌓이고 기록으로 남는다. 저장(ui/records.js)과 나눠 계산만 여기서 한다.
//
//   누구나 판마다 +10, 끝날 때 가진 역 하나마다 +1(15까지) — 져도 조금씩 모인다
//   등수: 1등 +30 · 2등 +15 · 3등 +5, 막차 전에 이기면(모두 파산 · 독점) +10 더, 상대가 많을수록 1등이 크다(+5 × 상대 수)
//   받은 승점만큼 승차권도 받는다 — 승차권은 캐릭터를 여는 데 쓰고, 칭호는 쓴 것과 상관없이 누적 승점으로 정한다
//   오늘의 대결(날짜 시드)도 같은 방식

export const POINTS = { base: 10, perStation: 1, stationCap: 15, place: [0, 30, 15, 5, 0], perRival: 5, knockout: 10 };

/** 이 판에서 받은 승점. place = 1~4, rivals = 상대 수, knockout = 막차 전에 이겼나, stations = 끝날 때 가진 역 수 */
export function matchPoints({ place, rivals, knockout, stations = 0 }) {
  let pts = POINTS.base + Math.min(POINTS.stationCap, stations * POINTS.perStation) + (POINTS.place[place] || 0);
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

// ── 티어 랭크 ──────────────────────────────────────────────
// 랭크 점수(RP)로 정한다. 이기면 오르고 지면 내린다 — 다만 지금 티어 바닥 밑으로는 떨어지지 않는다(강등 보호).
// 마스터 전 티어는 III → II → I 세 단계로 나눈다.

export const TIERS = [
  { id: 'bronze', name: '브론즈', min: 0, color: '#C07A3E' },
  { id: 'silver', name: '실버', min: 150, color: '#A7B3BF' },
  { id: 'gold', name: '골드', min: 400, color: '#F2B33D' },
  { id: 'platinum', name: '플래티넘', min: 750, color: '#3EC3B0' },
  { id: 'diamond', name: '다이아', min: 1200, color: '#5B95EE' },
  { id: 'master', name: '마스터', min: 1800, color: '#9A62D6' }
];
const DIVS = ['III', 'II', 'I'];

/** RP → { id, name, color, min, div, label, lo, hi(다음 단계 시작, 마스터면 null), pct(이번 단계 진행 %) } */
export function tierOf(rp) {
  let i = 0;
  while (i + 1 < TIERS.length && rp >= TIERS[i + 1].min) i++;
  const t = TIERS[i], nextTier = TIERS[i + 1];
  if (!nextTier) return { ...t, div: '', label: t.name, lo: t.min, hi: null, pct: 100 };
  const step = (nextTier.min - t.min) / 3;
  const d = Math.min(2, Math.floor((rp - t.min) / step));
  const lo = Math.round(t.min + d * step), hi = Math.round(t.min + (d + 1) * step);
  return { ...t, div: DIVS[d], label: `${t.name} ${DIVS[d]}`, lo, hi, pct: Math.round((100 * (rp - lo)) / (hi - lo)) };
}

/** 한 판의 RP 변화: 인원별 등수 표, 막차 전에 이기면 +5 */
export const RP_TABLE = { 2: [20, -10], 3: [26, 4, -10], 4: [30, 12, -6, -14] };
export function rpDelta({ place, size, knockout = false }) {
  const row = RP_TABLE[size] || RP_TABLE[4];
  return (row[place - 1] ?? row[row.length - 1]) + (place === 1 && knockout ? 5 : 0);
}

/** RP 에 변화를 더한다. 0 밑으로, 지금 티어 바닥 밑으로는 내려가지 않는다 */
export function applyRp(rp, delta) {
  const next = rp + delta;
  return delta >= 0 ? next : Math.max(tierOf(rp).min, next, 0);
}
