// 일일 미션·출석 저장(이 기기). 규칙은 core/missions.js. 저장이 막혀 있으면 이번 실행 동안만 기억한다.
// 받은 보상은 승차권으로 들어간다(records.js — 칭호용 누적 승점은 늘지 않는다).

import { dailyMissions, dayKey, nextAttend } from '../core/missions.js';
import * as Records from './records.js';

const KEY = 'yeokjeon.daily.v1';
let memo = null;

function load() {
  if (!memo) {
    try { memo = JSON.parse(localStorage.getItem(KEY)) || {}; } catch { memo = {}; }
  }
  const today = dayKey();
  if (memo.day !== today) { memo.day = today; memo.progress = {}; memo.claimed = []; }
  memo.attend ||= { count: 0, last: null };
  return memo;
}
function save() {
  try { localStorage.setItem(KEY, JSON.stringify(memo)); } catch { /* 저장 못 해도 진행 */ }
}

/** 오늘의 미션: [{ id, text, goal, reward, have, done, claimed }] */
export function missions() {
  const d = load();
  return dailyMissions(d.day).map((m) => {
    const have = Math.min(m.goal, d.progress[m.id] || 0);
    return { ...m, have, done: have >= m.goal, claimed: d.claimed.includes(m.id) };
  });
}
/** 받을 수 있는(다 채우고 아직 안 받은) 미션 수 */
export const claimable = () => missions().filter((m) => m.done && !m.claimed).length;

/** 한 판이 끝나면 센 값을 미션에 더한다. 새로 다 채운 미션을 돌려준다 */
export function addMatch(stats) {
  const d = load();
  const fresh = [];
  for (const m of dailyMissions(d.day)) {
    const before = d.progress[m.id] || 0;
    d.progress[m.id] = before + (stats[m.stat] || 0);
    if (before < m.goal && d.progress[m.id] >= m.goal) fresh.push(m);
  }
  save();
  return fresh;
}

/** 미션 보상 받기. 받은 승차권 수(못 받으면 0) */
export function claim(id) {
  const m = missions().find((x) => x.id === id);
  if (!m || !m.done || m.claimed) return 0;
  load().claimed.push(id);
  save();
  Records.addTickets(m.reward);
  return m.reward;
}

/** 출석: { count, today(오늘 받았나), next: { index, reward } } */
export function attendance() {
  const d = load();
  return { count: d.attend.count, today: d.attend.last === d.day, next: nextAttend(d.attend.count) };
}
/** 오늘 출석 보상 받기. 받은 승차권 수(이미 받았으면 0) */
export function checkIn() {
  const d = load();
  if (d.attend.last === d.day) return 0;
  const { reward } = nextAttend(d.attend.count);
  d.attend.count++;
  d.attend.last = d.day;
  save();
  Records.addTickets(reward);
  return reward;
}

/** 하루가 끝날 때까지 남은 시간(밀리초) */
export function untilReset(now = new Date()) {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  return next - now;
}
