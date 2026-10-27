// 기기 안 랭킹: 끝난 원정의 승점을 이 브라우저(localStorage)에 남긴다. 다른 기기·다른 사람과는 나누지 않는다.
// 저장이 막혀 있어도(사생활 보호 창 등) 게임은 그대로 돌아가고, 기록만 남지 않는다.
// 나중에 온라인 랭킹을 붙일 때는 record() 가 만든 항목을 그대로 서버로 보내면 된다.

import { rankOf } from '../core/ranking.js';

const KEY = 'malpan.records.v1';
const KEEP = 10;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.runs)) return d;
  } catch { /* 저장소를 못 쓰면 빈 기록 */ }
  return { total: 0, plays: 0, runs: [] };
}
function store(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 진행 */ }
}

/** 끝난 원정 하나를 기록한다. 이번 기록의 순위(10위 밖이면 null)와 누적 승점·칭호를 돌려준다. */
export function record(run, cleared) {
  const d = load();
  const entry = {
    points: run.points, mode: run.daily ? 'daily' : 'full', reached: run.roundNo, rounds: run.rounds.length,
    cleared: !!cleared, seed: run.seed, at: Date.now()
  };
  const before = rankOf(d.total);
  d.total += run.points;
  d.plays = (d.plays || 0) + 1;
  d.runs.push(entry);
  d.runs.sort((a, b) => b.points - a.points || b.at - a.at);
  d.runs = d.runs.slice(0, KEEP);
  store(d);
  const rank = d.runs.indexOf(entry) + 1 || null;
  const now = rankOf(d.total);
  return { rank, best: rank === 1 && run.points > 0, total: d.total, title: now, promoted: now.name !== before.name };
}

export function summary() {
  const d = load();
  return { ...d, title: rankOf(d.total) };
}
