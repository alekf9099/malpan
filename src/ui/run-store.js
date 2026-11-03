// 원정 저장: 진행 중인 원정 하나 + 기록(가장 멀리 간 스테이지 · 완주 횟수 · 원정 수). 클라우드가 켜져 있으면 함께 올린다(cloud.js).
// 원정은 스테이지 사이에만 저장한다 — 판 도중에 껐다 켜면 그 스테이지를 처음부터(목숨은 그대로).

import { queue } from './cloud.js';

const KEY = 'yeokjeon.run.v1';

function load() {
  try { const d = JSON.parse(localStorage.getItem(KEY)); if (d && typeof d === 'object') return { cur: null, best: 0, clears: 0, runs: 0, ...d }; } catch { /* 빈 기록 */ }
  return { cur: null, best: 0, clears: 0, runs: 0 };
}
function store(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 진행 */ }
  queue();
}

/** 진행 중인 원정(없으면 null) */
export const ongoing = () => load().cur;
/** 원정 상태 저장 */
export function save(run) { const d = load(); d.cur = run; store(d); }
/** 원정이 끝났다(완주 · 목숨 다함 · 포기): 기록을 남기고 진행 중에서 뺀다 */
export function finish(run) {
  const d = load();
  d.cur = null;
  d.runs++;
  d.best = Math.max(d.best, run.stage);
  if (run.won) d.clears++;
  store(d);
  return d;
}
/** 기록: { best, clears, runs } */
export const record = () => { const { best, clears, runs } = load(); return { best, clears, runs }; };
