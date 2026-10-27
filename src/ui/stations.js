// 내 역 저장 — 산 역은 기기(localStorage)에 남아 다음 원정에서도 내 역이다.
// 저장이 막힌 곳(사생활 보호 창 등)에서는 이번 원정 동안만 기억한다.

const KEY = 'malpan.owned.v1';

export function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || '{}');
    return raw && typeof raw === 'object' ? raw : {};
  } catch { return {}; }
}

export function save(owned) {
  try { localStorage.setItem(KEY, JSON.stringify(owned)); } catch { /* 저장 못 해도 게임은 계속된다 */ }
}

/** 전부 팔아 치우고 처음부터(랭킹 화면의 초기화) */
export function reset(owned) {
  for (const k of Object.keys(owned)) delete owned[k];
  save(owned);
}
