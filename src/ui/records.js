// 기기 안 랭킹·승차권: 끝난 판의 승점을 이 브라우저(localStorage)에 남긴다. 다른 기기·다른 사람과는 나누지 않는다.
// 승점만큼 승차권이 쌓이고, 승차권으로 잠긴 캐릭터를 연다(칭호는 누적 승점 그대로).
// 저장이 막혀 있어도(사생활 보호 창 등) 게임은 그대로 돌아가고, 기록만 남지 않는다.

import { rankOf, tierOf, applyRp } from '../core/ranking.js';
import { STARTERS } from '../core/heroes.js';

const KEY = 'yeokjeon.records.v1';
const KEEP = 10;

function load() {
  try {
    const d = JSON.parse(localStorage.getItem(KEY));
    if (d && Array.isArray(d.games)) {
      // 승차권이 생기기 전 기록이면 그동안 모은 승점을 승차권으로 쳐 준다
      if (typeof d.tickets !== 'number') d.tickets = d.total || 0;
      if (!Array.isArray(d.unlocked)) d.unlocked = [];
      if (typeof d.rp !== 'number') d.rp = 0;
      return d;
    }
  } catch { /* 저장소를 못 쓰면 빈 기록 */ }
  return { total: 0, plays: 0, wins: 0, games: [], tickets: 0, unlocked: [], rp: 0 };
}
function store(d) {
  try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* 저장 못 해도 진행 */ }
}

/**
 * 끝난 판 하나를 기록한다. entry = { points, rp(이번 판 RP 변화), place, size, hero, daily, seed }
 * 이번 기록의 순위(10위 밖이면 null)와 누적 승점·칭호를 돌려준다.
 */
export function record(entry) {
  const d = load();
  const e = { ...entry, at: Date.now() };
  const before = rankOf(d.total);
  d.total += e.points;
  d.tickets += e.points;
  const rpBefore = d.rp;
  d.rp = applyRp(d.rp, e.rp || 0);
  d.plays = (d.plays || 0) + 1;
  if (e.place === 1) d.wins = (d.wins || 0) + 1;
  d.games.push(e);
  d.games.sort((a, b) => b.points - a.points || b.at - a.at);
  d.games = d.games.slice(0, KEEP);
  store(d);
  const rank = d.games.indexOf(e) + 1 || null;
  const now = rankOf(d.total);
  const tierBefore = tierOf(rpBefore), tier = tierOf(d.rp);
  return {
    rank, best: rank === 1 && e.points > 0, total: d.total, tickets: d.tickets, title: now, promoted: now.name !== before.name,
    rpBefore, rp: d.rp, tierBefore, tier, tierUp: tier.label !== tierBefore.label && d.rp > rpBefore, tierDown: tier.label !== tierBefore.label && d.rp < rpBefore
  };
}

/** 가진 승차권 */
export const tickets = () => load().tickets;
/** 쓸 수 있는 캐릭터: 처음부터 있는 넷 + 승차권으로 연 캐릭터 */
export const unlocked = () => [...STARTERS, ...load().unlocked];
/** 미션·출석 보상: 승차권만 늘린다(칭호용 누적 승점은 그대로) */
export function addTickets(n) {
  const d = load();
  d.tickets += n;
  store(d);
  return d.tickets;
}
/** 승차권으로 캐릭터를 연다. 모자라면 false */
export function unlock(id, price) {
  const d = load();
  if (d.unlocked.includes(id) || STARTERS.includes(id)) return true;
  if (d.tickets < price) return false;
  d.tickets -= price;
  d.unlocked.push(id);
  store(d);
  return true;
}

export function summary() {
  const d = load();
  return { ...d, title: rankOf(d.total), tier: tierOf(d.rp) };
}
