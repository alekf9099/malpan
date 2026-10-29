// 기기에 남겨 두는 작은 설정: 내 캐릭터 · 상대 수 · 안내를 봤는지. 저장이 막혀 있으면 이번 실행 동안만 기억한다.

const KEY = 'yeokjeon.prefs.v1';
let memo = null;

function load() {
  if (memo) return memo;
  try { memo = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { memo = {}; }
  return memo;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* 저장소를 못 써도 된다 */ }
}

/** 내 캐릭터(ids 안에서). 없으면 첫 캐릭터 */
export function getLeader(ids) { const v = load().hero; return ids.includes(v) ? v : ids[0]; }
export function setLeader(id) { load().hero = id; save(); }

/** 상대 수 1~3 */
export function getRivals() { const v = load().rivals; return v >= 1 && v <= 3 ? v : 3; }
export function setRivals(n) { load().rivals = n; save(); }

export function seenGuide() { return !!load().guide; }
export function markGuide() { load().guide = true; save(); }

/** 판: 'loop'(2호선 순환선, 기본) · 'map'(노선도) */
export function getBoard() { return load().board === 'map' ? 'map' : 'loop'; }
export function setBoard(b) { load().board = b; save(); }
