// 서울 지하철 노선도 — 이 게임의 판. 1~9호선의 주요 역을 간추린 고정 지도다.
//
//   역 이름과 잇는 순서는 실제 노선을 따르되, 사이 역 몇 개는 건너뛰었다(간추린 노선도).
//   좌표는 지도를 단순하게 다시 그린 것 — 1단위가 역 하나 간격쯤 된다(x 동쪽, y 남쪽).
//
// 하루 운행은 "구간" 하나다: 출발역 → 종착역(예: 서울역 → 잠실).
//   지도 전체는 늘 그대로 보이고, 그날 탈 수 있는 길은 구간 안의 역들뿐이다.
//   구간 = 가장 짧은 길보다 slack 역까지 더 돌아가는 길에 놓인 역들.
//   길의 방향은 φ(역) = (출발역에서 거리) − (종착역에서 거리) 가 커지는 쪽으로만 — 되돌아가지 않는다.
//   내 말은 출발역 → 종착역, 도깨비 열차는 반대로 종착역 → 출발역. 종착역을 지나면 골인.
//
// makeSeoul({ from, to }, { slack, closeSeed }) 가 그날의 판을 만든다.
//   slack     : 구간 너비(노선 연장권으로 +1)
//   closeSeed : 주면 운행 중지할 호선 하나를 고른다(금요일 도깨비 차장). 끊어도 구간이 이어지는 호선만

import { START, HOME } from '../board.js';
import { createRng } from '../rng.js';

// ── 열차 주사위: 1~5역, 급행(7역 + 한 번 더) ──────────────────

export const METRO_FACES = [1, 2, 3, 4, 5, 'express'];
const TIER = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 4, express: 5 };

function make(face) {
  const express = face === 'express';
  return {
    value: express ? 7 : face, face, tier: TIER[face],
    label: express ? '급행' : `${face}역`, faces: [face],
    bonus: express, chips: express ? 25 : face * 4, back: false
  };
}

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

// ── 역 좌표 ────────────────────────────────────────────────

export const STATION_XY = {
  창동: [12.6, 0], 노원: [14.4, 0], 미아사거리: [11.4, 0.9], 성신여대입구: [10.8, 1.8], 혜화: [10.6, 2.7],
  석계: [14.4, 1.4], 태릉입구: [15.6, 1.6], 회기: [13.9, 2.5], 안암: [12.6, 2.2], 상봉: [16.2, 2.8], 청량리: [13.6, 3.3],
  경복궁: [8.4, 2.2], 안국: [9.6, 2.6], 광화문: [8.8, 3], 종각: [9.5, 3.75], 종로3가: [10.3, 3.4], 동대문: [11.4, 3.5], 동묘앞: [12.4, 3.4],
  시청: [8.6, 4.3], 을지로입구: [9.5, 4.5], 을지로3가: [10.4, 4.5], 동대문역사문화공원: [11.5, 4.5], 신당: [12.4, 4.5], 청구: [12.3, 5.4], 왕십리: [13.6, 4.6],
  충정로: [7.6, 3.9], 서울역: [8.6, 5.3], 명동: [9.6, 5.4], 충무로: [10.5, 5.3], 약수: [11.4, 5.9],
  신촌: [6.6, 3.8], 홍대입구: [5.6, 4.2], 합정: [5, 5], 공덕: [7.2, 5.4], 마포: [6.8, 6.2],
  삼각지: [9, 6.2], 이태원: [10.2, 6.2], 용산: [7.8, 7], 이촌: [9.4, 7.2], 옥수: [11.9, 6.6],
  성수: [14.4, 5.4], 군자: [16, 4.4], 건대입구: [15.4, 5.8], 강변: [16.6, 6.4], 천호: [18, 5.4],
  청담: [14.4, 6.8], 압구정: [12.8, 7], 신사: [12, 7.6], 강남구청: [13.6, 7.6], 논현: [12.6, 8.1],
  고속터미널: [11, 8.4], 신논현: [12.8, 8.9], 선정릉: [14.2, 8.4], 종합운동장: [15.8, 8.6], 잠실: [17, 8], 석촌: [17.2, 9], 올림픽공원: [18.6, 8.6],
  교대: [12, 9.7], 강남: [13, 9.7], 선릉: [14.2, 9.5], 삼성: [15, 9.2],
  양재: [12.6, 10.8], 도곡: [13.8, 10.8], 수서: [15.2, 11.4], 가락시장: [16.4, 10.8], 오금: [17.6, 11], 문정: [16.8, 11.8],
  동작: [9.8, 7.9], 이수: [9.9, 8.9], 사당: [10.4, 9.8], 숭실대입구: [8.6, 8.9], 서울대입구: [9.2, 10.4], 신림: [8, 10.4],
  구로디지털단지: [6.8, 10.2], 대림: [6.2, 9.6], 가산디지털단지: [5.4, 10.6], 신도림: [5.4, 8.8], 구로: [4.4, 9.4],
  노량진: [7.6, 8], 영등포: [6.4, 8.2], 여의도: [6, 7.2], 영등포구청: [5, 7.8], 당산: [4.6, 6.8],
  김포공항: [0.6, 6], 가양: [2.2, 5.6], 까치산: [2, 7.2], 목동: [3.2, 7.4]
};

/** 호선마다 역 순서(실제 노선 순서, 사이 역 몇 개 생략). 2호선은 순환선 — 끝역에서 첫 역으로 이어진다 */
export const LINE_STATIONS = {
  1: ['창동', '석계', '회기', '청량리', '동묘앞', '동대문', '종로3가', '종각', '시청', '서울역', '용산', '노량진', '영등포', '신도림', '구로'],
  2: ['시청', '을지로입구', '을지로3가', '동대문역사문화공원', '신당', '왕십리', '성수', '건대입구', '강변', '잠실', '종합운동장', '삼성', '선릉', '강남', '교대',
    '사당', '서울대입구', '신림', '구로디지털단지', '대림', '신도림', '영등포구청', '당산', '합정', '홍대입구', '신촌', '충정로', '시청'],
  3: ['경복궁', '안국', '종로3가', '을지로3가', '충무로', '약수', '옥수', '압구정', '신사', '고속터미널', '교대', '양재', '도곡', '수서', '가락시장', '오금'],
  4: ['노원', '창동', '미아사거리', '성신여대입구', '혜화', '동대문', '동대문역사문화공원', '충무로', '명동', '서울역', '삼각지', '이촌', '동작', '이수', '사당'],
  5: ['김포공항', '까치산', '목동', '영등포구청', '여의도', '마포', '공덕', '충정로', '광화문', '종로3가', '동대문역사문화공원', '청구', '왕십리', '군자', '천호'],
  6: ['합정', '공덕', '삼각지', '이태원', '약수', '청구', '신당', '동묘앞', '안암', '석계', '태릉입구'],
  7: ['노원', '태릉입구', '상봉', '군자', '건대입구', '청담', '강남구청', '논현', '고속터미널', '이수', '숭실대입구', '대림', '가산디지털단지'],
  8: ['천호', '잠실', '석촌', '가락시장', '문정'],
  9: ['김포공항', '가양', '당산', '여의도', '노량진', '동작', '고속터미널', '신논현', '선정릉', '종합운동장', '석촌', '올림픽공원']
};

/** 역 → 지나는 호선들 */
export const STATION_LINES = {};
for (const [id, list] of Object.entries(LINE_STATIONS)) for (const n of list) {
  const a = (STATION_LINES[n] ||= []);
  if (!a.includes(Number(id))) a.push(Number(id));
}
export const ALL_STATIONS = Object.keys(STATION_XY);

/** 이웃한 두 역을 잇는 선(호선마다) */
export const ALL_EDGES = [];
for (const [id, list] of Object.entries(LINE_STATIONS)) {
  for (let i = 0; i < list.length - 1; i++) ALL_EDGES.push({ a: list[i], b: list[i + 1], line: Number(id) });
}

// 화면이 쓰는 지도 크기(단위). 여백은 board-view 가 붙인다
export const SEOUL_DIMS = [19.2, 12.4];

// ── 역 종류 ────────────────────────────────────────────────
// round.js 가 아는 모양(chips·mult·coins)으로만 효과를 적는다.

export const STATIONS = {
  transfer: { kind: 'transfer', name: '환승역', chips: 8, desc: '칩 +8 · 여기서 다른 호선으로 갈아탈 수 있다' }
};

// ── 하루 구간 ──────────────────────────────────────────────
// 날마다 고르는 출발역 → 종착역. 이름난 역끼리, 너무 짧거나 길지 않고 갈림길이 여럿 있는 구간만

export const ROUTES = [
  ['김포공항', '청량리'], ['홍대입구', '잠실'], ['신도림', '왕십리'], ['사당', '청량리'], ['강남', '경복궁'],
  ['구로', '상봉'], ['여의도', '노원'], ['서울역', '오금'], ['김포공항', '천호'], ['홍대입구', '올림픽공원'],
  ['신도림', '석계'], ['강남', '혜화'], ['잠실', '신촌'], ['청량리', '신림'], ['왕십리', '가산디지털단지'],
  ['사당', '창동'], ['여의도', '상봉'], ['구로', '왕십리'], ['서울역', '노원'], ['건대입구', '홍대입구']
];

const adjacency = (closed) => {
  const adj = {};
  for (const n of ALL_STATIONS) adj[n] = [];
  for (const e of ALL_EDGES) {
    if (e.line === closed) continue;
    if (!adj[e.a].includes(e.b)) adj[e.a].push(e.b);
    if (!adj[e.b].includes(e.a)) adj[e.b].push(e.a);
  }
  return adj;
};

function bfs(adj, from) {
  const d = { [from]: 0 };
  const q = [from];
  while (q.length) {
    const n = q.shift();
    for (const m of adj[n]) if (d[m] == null) { d[m] = d[n] + 1; q.push(m); }
  }
  return d;
}

/** 이 구간에서 운행 중지해도 출발역 → 종착역이 이어지는 호선들 */
export function closableLines(from, to, slack = 2) {
  const used = new Set();
  const open = corridor(from, to, slack, null);
  for (const e of open.edges) used.add(e.line);
  return [...used].filter((id) => {
    const d = bfs(adjacency(id), from);
    return d[to] != null && STATION_LINES[from].some((l) => l !== id) && STATION_LINES[to].some((l) => l !== id);
  }).sort((a, b) => a - b);
}

/** 구간 만들기: 역 목록·방향 있는 선·거리 */
function corridor(from, to, slack, closed) {
  const adj = adjacency(closed);
  const dS = bfs(adj, from), dG = bfs(adj, to);
  const D = dS[to];
  if (D == null) throw new Error(`${from} → ${to} 길이 없다`);
  let keep = new Set(ALL_STATIONS.filter((n) => dS[n] != null && dG[n] != null && dS[n] + dG[n] <= D + slack));
  const phi = (n) => dS[n] - dG[n];
  const lineOfEdge = (a, b) => ALL_EDGES.find((e) => e.line !== closed && ((e.a === a && e.b === b) || (e.a === b && e.b === a)))?.line;
  const build = () => {
    const next = {}, prev = {};
    for (const n of keep) { next[n] = []; prev[n] = []; }
    for (const n of keep) for (const m of adj[n]) if (keep.has(m) && phi(m) > phi(n)) { next[n].push(m); prev[m].push(n); }
    return { next, prev };
  };
  // 출발역에서 갈 수 있고 종착역으로 이어지는 역만 남긴다
  let { next, prev } = build();
  const reach = (start, links) => { const s = new Set([start]); const q = [start]; while (q.length) { const n = q.shift(); for (const m of links[n]) if (!s.has(m)) { s.add(m); q.push(m); } } return s; };
  const fwd = reach(from, next), back = reach(to, prev);
  keep = new Set([...keep].filter((n) => fwd.has(n) && back.has(n)));
  ({ next, prev } = build());
  const edges = [];
  for (const a of keep) for (const b of next[a]) edges.push({ a, b, line: lineOfEdge(a, b) });
  const depth = {};
  for (const n of keep) depth[n] = (phi(n) + D) / 2;
  return { nodes: [...keep], next, prev, edges, depth, D, lineOfEdge };
}

/** 시드로 구간 하나 */
export const routeBySeed = (seed) => ROUTES[((seed >>> 0) || 1) % ROUTES.length];

export function makeSeoul([from, to] = ROUTES[0], { slack = 2, closeSeed = null } = {}) {
  let closed = null;
  if (closeSeed != null) {
    const can = closableLines(from, to, slack);
    if (can.length) closed = can[createRng((closeSeed >>> 0) || 1).next() * can.length | 0];
  }
  const c = corridor(from, to, slack, closed);
  const { next, prev, depth } = c;
  const S = from, G = to;
  const nodes = c.nodes;
  const coords = {};
  for (const n of ALL_STATIONS) coords[n] = STATION_XY[n];
  const transfers = new Set(nodes.filter((n) => STATION_LINES[n].filter((l) => l !== closed).length > 1));
  const tiles = {};
  for (const t of transfers) if (t !== S && t !== G) tiles[t] = STATIONS.transfer;

  // 가장 짧은 길 하나(화면·테스트가 "본선"처럼 쓴다)
  const main = [S];
  while (main[main.length - 1] !== G) {
    const cur = main[main.length - 1];
    const nx = next[cur].slice().sort((a, b) => depth[a] - depth[b] || (a < b ? -1 : 1))[0];
    main.push(nx);
  }
  const forks = nodes.filter((n) => next[n].length > 1);
  const lineOf = (n) => STATION_LINES[n].find((l) => l !== closed) ?? STATION_LINES[n][0];

  /** from 에서 steps 만큼 걷는 모든 길. 끝역을 지나면 HOME. avoid 역은 지나가지도 서지도 못한다. */
  function paths(fromNode, steps, owner, avoid) {
    const links = owner === 'me' ? next : prev;
    const enter = owner === 'me' ? S : G, end = owner === 'me' ? G : S;
    const out = [];
    const go = (node, path, left) => {
      if (avoid?.has(node)) return;
      if (node === end) { out.push(path.concat(HOME)); return; }
      if (left === 0) { out.push(path); return; }
      for (const nx of links[node]) go(nx, path.concat(nx), left - 1);
    };
    if (fromNode === START) go(enter, [enter], steps - 1);
    else for (const nx of links[fromNode]) go(nx, [nx], steps - 1);
    return out;
  }

  /** 길 위에서 갈아탄 횟수(같은 호선으로 이어 가면 0) */
  function transfersOn(fromNode, path) {
    const seq = (fromNode === START ? [] : [fromNode]).concat(path.filter((n) => n !== HOME));
    let changes = 0, cur = null;
    for (let i = 0; i < seq.length - 1; i++) {
      const l = c.lineOfEdge(seq[i], seq[i + 1]);
      if (cur != null && l !== cur) changes++;
      cur = l;
    }
    return changes;
  }

  return {
    id: 'seoul',
    name: '서울 노선도',
    roller: 'metro',
    rollName: '열차 출발',
    route: [S, G],
    slack, closed,
    nodes,
    allNodes: ALL_STATIONS,
    allEdges: ALL_EDGES,
    coords,
    dims: SEOUL_DIMS,
    edges: c.edges,
    big: new Set([S, G, ...transfers]),
    entry: null,
    S, G, main, forks, transfers, next, prev, depth,
    length: c.D,
    lines: LINES,
    stationLines: (n) => (STATION_LINES[n] || []).filter((l) => l !== closed),
    lineAt: (n) => LINES[lineOf(n)] || null,
    lineOfEdge: c.lineOfEdge,
    blocked: () => false,

    roll(rng2) { return make(METRO_FACES[Math.floor(rng2.next() * METRO_FACES.length)]); },
    rollsFor() { return METRO_FACES.map((f) => ({ roll: make(f), p: 1 / METRO_FACES.length })); },

    /** avoid: 이 수에서 지나갈 수 없는 역(화재·봉쇄 테이프) */
    options(pieces, owner, roll, avoid = null) {
      const own = pieces.filter((p) => p.owner === owner);
      const opts = [];
      const add = (base, path) => {
        const key = base.from + '>' + path[path.length - 1];
        if (opts.some((o) => o.from + '>' + o.path[o.path.length - 1] === key)) return;
        const changes = transfersOn(base.from, path);
        opts.push({ ...base, path, warp: false, diagonal: changes > 0, transfers: changes });
      };
      const seen = new Set();
      for (const p of own) {
        if (p.node === START || p.node === HOME || seen.has(p.node)) continue;
        seen.add(p.node);
        const ids = own.filter((q) => q.node === p.node).map((q) => q.id);
        for (const path of paths(p.node, roll.value, owner, avoid)) add({ kind: 'stack', from: p.node, pieceIds: ids }, path);
      }
      const waiting = own.find((p) => p.node === START);
      if (waiting) for (const path of paths(START, roll.value, owner, avoid)) add({ kind: 'new', from: START, pieceIds: [waiting.id] }, path);
      return opts;
    },

    afterMove(piece) { piece.prev = null; },

    progress(node, owner = 'me') {
      if (node === START) return 0;
      if (node === HOME) return 1;
      const d = depth[node] / c.D;
      return owner === 'me' ? d : 1 - d;
    },

    tile(node) { return tiles[node] || null; },

    /** 도깨비 행선지: node 에서 거꾸로 가다 처음 만나는 갈림역과 그 갈래들 */
    nextFork(node) {
      const seenN = new Set();
      let cur = node === START ? G : node;
      while (cur && !seenN.has(cur)) {
        seenN.add(cur);
        if (prev[cur].length > 1) return { at: cur, ways: prev[cur].slice() };
        cur = prev[cur][0];
      }
      return null;
    }
  };
}
