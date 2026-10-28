// 기기 안 랭킹: 끝난 판의 승점을 이 브라우저(localStorage)에 남긴다. 다른 기기·다른 사람과는 나누지 않는다.
// 저장이 막혀 있어도(사생활 보호 창 등) 게임은 그대로 돌아가고, 기록만 남지 않는다.

import { rankOf } from '../core/ranking.js';

const KEY = 'yeokjeon.records.v1';
const KEEP = 10;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.games)) return d;
  } catch { /* 저장소를 못 쓰면 빈 기록 */ }
  return { total: 0, plays: 0, wins: 0, games: [] };
}
function store(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 진행 */ }
}

/**
 * 끝난 판 하나를 기록한다. entry = { points, place, size, hero, daily, seed }
 * 이번 기록의 순위(10위 밖이면 null)와 누적 승점·칭호를 돌려준다.
 */
export function record(entry) {
  const d = load();
  const e = { ...entry, at: Date.now() };
  const before = rankOf(d.total);
  d.total += e.points;
  d.plays = (d.plays || 0) + 1;
  if (e.place === 1) d.wins = (d.wins || 0) + 1;
  d.games.push(e);
  d.games.sort((a, b) => b.points - a.points || b.at - a.at);
  d.games = d.games.slice(0, KEEP);
  store(d);
  const rank = d.games.indexOf(e) + 1 || null;
  const now = rankOf(d.total);
  return { rank, best: rank === 1 && e.points > 0, total: d.total, title: now, promoted: now.name !== before.name };
}

export function summary() {
  const d = load();
  return { ...d, title: rankOf(d.total) };
}
