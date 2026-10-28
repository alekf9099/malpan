// 서울 지하철 노선도 — 이 게임의 판. 1~9호선 서울 시내 구간의 역 219곳(좌표는 tools/seoul-layout.mjs 가 만든다).
//
// 판 전체가 무대다. 말은 실제 지하철을 타듯 움직인다:
//   - 왔던 역으로 바로 되돌아가지 않는다(노선 끝역에서만 되돌아 나온다)
//   - 환승역에서는 다른 호선으로 갈아탈 수 있다 — 갈림길마다 갈 방향을 고른다
//   - 불난 역(avoid)은 들어가지 못하고, 신호 장애 역(stopAt)에 닿으면 거기서 멈춘다
// 이 파일은 노선도 모양과 길 찾기만 안다. 역 값·통행료는 estate.js, 한 판의 규칙은 match.js.

import { LINE_STATIONS, STATION_XY, SEOUL_DIMS } from './seoul-data.js';

export { LINE_STATIONS, STATION_XY, SEOUL_DIMS };

// ── 열차 주사위: 1~5역, 급행(7역 + 한 번 더) ──────────────────

export const METRO_FACES = [1, 2, 3, 4, 5, 'express'];
const TIER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, express: 5 };

export function makeRoll(face) {
  const express = face === 'express';
  return { value: express ? 7 : face, face, tier: TIER[face], label: express ? '급행' : `${face}역`, faces: [face], bonus: express };
}
export const rollDie = (rng) => makeRoll(METRO_FACES[Math.floor(rng.next() * METRO_FACES.length)]);

// ── 호선(색은 실제 노선 색에 가깝게) ─────────────────────────

export const LINES = {
  1: { id: 1, name: '1호선', color: '#1F4FA0' },
  2: { id: 2, name: '2호선', color: '#2FA84F' },
  3: { id: 3, name: '3호선', color: '#EF7C1C' },
  4: { id: 4, name: '4호선', color: '#2EA6DA' },
  5: { id: 5, name: '5호선', color: '#8E63B0' },
  6: { id: 6, name: '6호선', color: '#B8742E' },
  7: { id: 7, name: '7호선', color: '#6F7A12' },
  8: { id: 8, name: '8호선', color: '#E2337A' },
  9: { id: 9, name: '9호선', color: '#B9A66E' }
};

/** 역 → 지나는 호선들 */
export const STATION_LINES = {};
for (const [id, list] of Object.entries(LINE_STATIONS)) for (const n of list) {
  const a = (STATION_LINES[n] ||= []);
  if (!a.includes(Number(id))) a.push(Number(id));
}
export const ALL_STATIONS = Object.keys(STATION_XY);
export const isTransfer = (n) => (STATION_LINES[n]?.length || 0) > 1;

/** 이웃한 두 역을 잇는 선(호선마다) */
export const ALL_EDGES = [];
for (const [id, list] of Object.entries(LINE_STATIONS)) {
  for (let i = 0; i < list.length - 1; i++) ALL_EDGES.push({ a: list[i], b: list[i + 1], line: Number(id) });
}

/** 이웃 역 */
export const ADJ = {};
for (const n of ALL_STATIONS) ADJ[n] = [];
for (const e of ALL_EDGES) {
  if (!ADJ[e.a].includes(e.b)) ADJ[e.a].push(e.b);
  if (!ADJ[e.b].includes(e.a)) ADJ[e.b].push(e.a);
}

/** 두 역 사이 선의 호선(여러 호선이 같은 두 역을 이으면 앞 호선) */
export const lineOfEdge = (a, b) => ALL_EDGES.find((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a))?.line ?? null;
export const lineAt = (n) => LINES[STATION_LINES[n]?.[0]] || null;

// ── 거리(역 수) ────────────────────────────────────────────

const DIST = {};
for (const s of ALL_STATIONS) {
  const d = { [s]: 0 };
  const q = [s];
  while (q.length) { const n = q.shift(); for (const m of ADJ[n]) if (d[m] == null) { d[m] = d[n] + 1; q.push(m); } }
  DIST[s] = d;
}
/** a 에서 b 까지 가장 적은 역 수 */
export const dist = (a, b) => DIST[a]?.[b] ?? Infinity;

// ── 길 ─────────────────────────────────────────────────────

/**
 * from 에서 steps 역을 가는 모든 길. prev 는 방금 떠나온 역(되돌아가지 않는다).
 *   avoid  : 들어갈 수 없는 역(불난 역)
 *   stopAt : 닿으면 거기서 멈추는 역(신호 장애)
 * 막혀서 더 못 가면 그 자리에서 멈춘다. 돌려주는 길은 도착역마다 하나(goal 을 지나는 길을 먼저).
 */
export function paths(from, prev, steps, { avoid = null, stopAt = null, goal = null } = {}) {
  const out = new Map();
  const keep = (path) => {
    const end = path[path.length - 1];
    const hit = goal != null && path.includes(goal);
    const had = out.get(end);
    if (!had || (hit && !had.includes(goal))) out.set(end, path);
  };
  const go = (node, back, path, left) => {
    if (left === 0 || (path.length && stopAt?.has(node))) { if (path.length) keep(path); return; }
    let next = ADJ[node].filter((m) => m !== back && !avoid?.has(m));
    if (!next.length) next = ADJ[node].filter((m) => !avoid?.has(m)); // 노선 끝역: 되돌아 나온다
    if (!next.length) { if (path.length) keep(path); return; }
    for (const m of next) go(m, node, path.concat(m), left - 1);
  };
  go(from, prev, [], steps);
  return [...out.values()];
}

/** 시드 하나로 서로 멀리 떨어진 역 count 곳(출발역 나누기) */
export function spreadStations(rng, count, pool = ALL_STATIONS.filter(isTransfer), minGap = 9) {
  const picked = [];
  const cands = rng.shuffle(pool.slice());
  for (const n of cands) {
    if (picked.every((p) => dist(p, n) >= minGap)) picked.push(n);
    if (picked.length === count) return picked;
  }
  return minGap > 3 ? spreadStations(rng, count, pool, minGap - 2) : cands.slice(0, count);
}
