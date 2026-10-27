// 노선도 — 날마다 새로 짜이는 지하철 노선도를 탐험한다(로그라이크 맵). 이 게임의 유일한 판.
//
//   판은 가로로 긴 도시 지도(1.5 : 1). 1호선(본선, 빨강) 30역이 판을 네 줄 S 자로 지난다.
//   갈래는 두 가지:
//     우회 지선  — 한 줄 안에서 본선을 벗어났다 다시 합류(역이 적은 지름길 / 역이 많은 둘러가는 길)
//     연결선     — 위·아랫줄을 곧장 가로질러 U 자 구간을 건너뛰는 큰 지름길
//   갈래마다 2~5호선 중 하나의 색이 붙고, 호선마다 특화 효과가 있다(LINES).
//   갈라지는 역·합류하는 역이 환승역. 한 역에서 세 갈래로 나뉘기도 한다.
//   내 말은 출발역 S → 종점 G, 도깨비 열차는 반대로 G → S. 종점을 지나면 골인.
//
// makeMetro(seed, { extra, closed }) 가 노선도 하나를 만든다. 같은 시드·같은 설정이면 같은 노선도.
//   extra  : 노선 연장권으로 더 붙일 갈래 수
//   closed : 운행 중지된 호선 id(도깨비 차장). 그 호선 역은 아무도 지나갈 수 없다

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

// ── 호선과 특화 효과 ─────────────────────────────────────────
// 그 호선 역에 멈추면 perk 가 붙는다. 호선의 역에 모두 깃발을 꽂으면 "완성" — 효과 2배(round.js)

export const LINES = {
  1: { id: 1, name: '1호선', color: '#E0533D', title: '본선', perk: null, desc: '판을 S 자로 지나는 본선' },
  2: { id: 2, name: '2호선', color: '#2F6BD8', title: '급행선', perk: { chips: 10 }, desc: '멈추면 칩 +10' },
  3: { id: 3, name: '3호선', color: '#3E9B6A', title: '공원선', perk: { chips: 6, coins: 1 }, desc: '멈추면 칩 +6 · 토큰 +1' },
  4: { id: 4, name: '4호선', color: '#F2A13D', title: '상업선', perk: { coins: 2 }, desc: '멈추면 토큰 +2' },
  5: { id: 5, name: '5호선', color: '#9B5BD6', title: '축제선', perk: { mult: 1 }, desc: '멈추면 배수 +1' }
};
const BRANCH_LINES = [2, 3, 4, 5];

// ── 역 종류 ────────────────────────────────────────────────
// round.js 가 아는 모양(chips·mult·coins·heung·kind 'trap')으로만 효과를 적는다.

export const STATIONS = {
  transfer: { kind: 'transfer', name: '환승역', chips: 3, desc: '칩 +3 · 여기서 노선을 고른다' },
  festival: { kind: 'festival', name: '축제역', mult: 1, desc: '배수 +1' },
  bonus: { kind: 'bonus', name: '보너스역', chips: 8, desc: '칩 +8' },
  treasure: { kind: 'treasure', name: '보물역', chips: 15, coins: 2, desc: '칩 +15 · 토큰 +2' },
  cafe: { kind: 'cafe', name: '카페역', heung: 1, desc: '만족도 +1' },
  construction: { kind: 'trap', name: '공사중', desc: '만족도가 꺼진다' },
  express: { kind: 'express', name: '급행역', desc: '다음 환승역까지 급행으로 간다' }
};

// ── 판 모양 ────────────────────────────────────────────────

export const METRO_DIMS = [1.5, 1];
const MAIN = 30;
const ROW_Y = [0.87, 0.62, 0.37, 0.12];          // 앞줄(출발) → 뒷줄(종점)
const X0 = 0.08, X1 = 1.42;
const PATH = [[X0, ROW_Y[0]], [X1, ROW_Y[0]], [X1, ROW_Y[1]], [X0, ROW_Y[1]], [X0, ROW_Y[2]], [X1, ROW_Y[2]], [X1, ROW_Y[3]], [X0, ROW_Y[3]]];

function along(t) {
  let total = 0;
  const segs = [];
  for (let i = 0; i < PATH.length - 1; i++) {
    const [x1, y1] = PATH[i], [x2, y2] = PATH[i + 1];
    const len = Math.hypot(x2 - x1, y2 - y1);
    segs.push({ x1, y1, x2, y2, len, start: total });
    total += len;
  }
  const d = t * total;
  const s = segs.find((q) => d <= q.start + q.len + 1e-9) || segs[segs.length - 1];
  const u = (d - s.start) / s.len;
  return [s.x1 + (s.x2 - s.x1) * u, s.y1 + (s.y2 - s.y1) * u];
}

// 우회 지선이 비켜 가는 쪽: 앞줄은 판 앞 가장자리, 둘째 줄은 앞줄 쪽 틈, 셋째 줄은 뒷줄 쪽 틈, 뒷줄은 뒤 가장자리.
// 비어 있는 틈 구간은 연결선이 쓴다. 틈 g 는 g번째 줄과 g+1번째 줄 사이.
const BYPASS_OFF = [0.1, 0.11, -0.11, -0.1];

export function makeMetro(seed = 1, { extra = 0, closed = null } = {}) {
  const rng = createRng(seed >>> 0 || 1);
  const coords = {}, next = {}, prev = {}, depth = {}, lineOf = {};
  const main = Array.from({ length: MAIN }, (_, i) => 'n' + i);
  main.forEach((n, i) => {
    coords[n] = along(i / (MAIN - 1));
    depth[n] = i;
    next[n] = i < MAIN - 1 ? [main[i + 1]] : [];
    prev[n] = i > 0 ? [main[i - 1]] : [];
    lineOf[n] = 1;
  });
  const S = main[0], G = main[MAIN - 1];
  const rowOf = (i) => ROW_Y.findIndex((y) => Math.abs(coords[main[i]][1] - y) < 1e-6);
  const rows = ROW_Y.map((_, r) => main.map((_, i) => i).filter((i) => rowOf(i) === r));
  const edges = main.slice(1).map((n, i) => ({ a: main[i], b: n, line: 1 }));
  const branches = [];
  const gapUsed = { 0: [], 1: [], 2: [] };   // 틈마다 이미 쓰인 x 구간 — 갈래끼리 겹치지 않게
  const free = (gap, xa, xb) => !gapUsed[gap].some(([p, q]) => !(xb < p - 0.06 || xa > q + 0.06));

  /** main[fromIdx] → ids… → toNode 사슬을 잇는다 */
  const addChain = (ids, fromIdx, toNode, kind, pos, extraInfo) => {
    ids.forEach((id, j) => {
      coords[id] = pos(j);
      depth[id] = fromIdx + ((depth[toNode] - fromIdx) * (j + 1)) / (ids.length + 1);
      next[id] = []; prev[id] = [];
    });
    const chain = [main[fromIdx], ...ids, toNode];
    for (let j = 0; j < chain.length - 1; j++) {
      next[chain[j]].push(chain[j + 1]);
      prev[chain[j + 1]].push(chain[j]);
    }
    branches.push({ kind, from: main[fromIdx], to: toNode, ids, line: 0, ...extraInfo });
  };

  // 1) 우회 지선: 줄마다 1개, 확률로 하나 더(노선 연장권이면 더)
  const bypassTry = (r) => {
    const idx = rows[r].filter((i) => i > 0 && i < MAIN - 1);
    for (let t = 0; t < 10; t++) {
      const len = 2 + Math.floor(rng.next() * 3);           // 본선 2~4역 구간을 비켜 간다
      if (idx.length <= len) return false;
      const a = idx[Math.floor(rng.next() * (idx.length - len))];
      const b = a + len;
      if (!idx.includes(b)) continue;
      if (branches.some((br) => br.row === r && !(b < br.a || a > br.b))) continue;
      const [ax, ay] = coords[main[a]], [bx, by] = coords[main[b]];
      const xa = Math.min(ax, bx), xb = Math.max(ax, bx);
      const gap = BYPASS_OFF[r] > 0 ? r - 1 : r;
      const edgeSide = gap < 0 || gap > 2;
      if (!edgeSide && !free(gap, xa, xb)) continue;
      const kind = rng.next() < 0.5 ? 'short' : 'long';
      const k = kind === 'short' ? Math.max(1, len - 1) : len + 1;
      const ids = Array.from({ length: k }, (_, j) => `b${branches.length}_${j}`);
      addChain(ids, a, main[b], kind, (j) => {
        const u = (j + 1) / (k + 1);
        return [ax + (bx - ax) * u, ay + (by - ay) * u + BYPASS_OFF[r] * Math.sin(Math.PI * u) ** 0.35];
      }, { row: r, a, b });
      if (!edgeSide) gapUsed[gap].push([xa, xb]);
      return true;
    }
    return false;
  };

  // 2) 연결선: 윗줄 역에서 아랫줄의 같은 자리 역으로 곧장(가운데 역 하나). U 자 구간을 건너뛴다
  const connectorTry = (gap) => {
    const upper = rows[gap], lower = rows[gap + 1];
    const cands = [];
    for (const i of upper) for (const j of lower) {
      if (j <= i + 3 || i === 0 || j === MAIN - 1) continue;
      const [xi] = coords[main[i]], [xj] = coords[main[j]];
      if (Math.abs(xi - xj) < 0.13 && free(gap, Math.min(xi, xj) - 0.05, Math.max(xi, xj) + 0.05)) cands.push([i, j]);
    }
    if (!cands.length) return false;
    const [i, j] = cands[Math.floor(rng.next() * cands.length)];
    const [xi, yi] = coords[main[i]], [xj, yj] = coords[main[j]];
    addChain([`c${branches.length}_0`], i, main[j], 'link', () => [(xi + xj) / 2, (yi + yj) / 2], { gap, a: i, b: j });
    gapUsed[gap].push([Math.min(xi, xj) - 0.05, Math.max(xi, xj) + 0.05]);
    return true;
  };

  for (let r = 0; r < 4; r++) bypassTry(r);
  for (let gap = 0; gap < 3; gap++) connectorTry(gap);
  for (let r = 0; r < 4; r++) if (rng.next() < 0.4) bypassTry(r);
  if (rng.next() < 0.5) connectorTry(1);
  for (let e = 0; e < extra; e++) { if (!bypassTry(Math.floor(rng.next() * 4))) connectorTry(Math.floor(rng.next() * 3)); }

  // 갈래에 호선 나눠 주기: 2~5호선이 고루 나오게(갈래가 많으면 한 호선이 여러 구간)
  const order = rng.shuffle(BRANCH_LINES.slice());
  branches.forEach((br, i) => {
    br.line = order[i % order.length];
    for (const id of br.ids) lineOf[id] = br.line;
    const chain = [br.from, ...br.ids, br.to];
    for (let j = 0; j < chain.length - 1; j++) edges.push({ a: chain[j], b: chain[j + 1], line: br.line });
  });

  // 환승역: 갈래가 갈리거나 합쳐지는 본선 역
  const transfers = new Set(main.filter((n) => next[n].length > 1 || prev[n].length > 1));

  // 역 종류 나눠 주기. 둘러가는 길엔 보물·축제가 몰리고, 지름길엔 공사중이 끼기 쉽다.
  const tiles = {};
  for (const t of transfers) tiles[t] = STATIONS.transfer;
  const plain = rng.shuffle(main.filter((n) => n !== S && n !== G && !transfers.has(n)));
  const put = (n, type) => { if (n && !tiles[n]) tiles[n] = STATIONS[type]; };
  function warpTarget(n) {
    const i = main.indexOf(n);
    if (i < 0) return null;
    for (let j = i + 1; j < MAIN - 1; j++) if (transfers.has(main[j])) return main[j];
    return null;
  }
  plain.filter((n) => warpTarget(n) && depth[warpTarget(n)] - depth[n] >= 3).slice(0, 2).forEach((n) => put(n, 'express'));
  const rest = plain.filter((n) => !tiles[n]);
  ['festival', 'festival', 'bonus', 'bonus', 'bonus', 'cafe', 'construction', 'construction', 'construction', 'treasure']
    .forEach((type) => put(rest.pop(), type));
  for (const br of branches) {
    const pool = rng.shuffle(br.ids.slice());
    if (br.kind === 'long') { put(pool.pop(), 'treasure'); if (pool.length) put(pool.pop(), rng.next() < 0.5 ? 'festival' : 'cafe'); }
    else if (br.kind === 'short' && rng.next() < 0.55) put(pool.pop(), 'construction');
  }

  const nodes = Object.keys(coords);
  const lineStations = {};
  for (const n of nodes) if (lineOf[n] !== 1) (lineStations[lineOf[n]] ||= []).push(n);
  const blocked = (n) => closed != null && lineOf[n] === closed;

  /** from 에서 steps 만큼 걷는 모든 길. 끝역을 지나면 HOME. 운행 중지 역·avoid(봉쇄) 역은 지나가지 못한다. */
  function paths(from, steps, owner, avoid) {
    const links = owner === 'me' ? next : prev;
    const enter = owner === 'me' ? S : G, end = owner === 'me' ? G : S;
    const out = [];
    const go = (node, path, left) => {
      if (blocked(node) || avoid?.has(node)) return;
      if (node === end) { out.push(path.concat(HOME)); return; }
      if (left === 0) { out.push(path); return; }
      for (const nx of links[node]) go(nx, path.concat(nx), left - 1);
    };
    if (from === START) go(enter, [enter], steps - 1);
    else for (const nx of links[from]) go(nx, [nx], steps - 1);
    return out;
  }

  return {
    id: 'metro',
    name: '노선도',
    roller: 'metro',
    rollName: '열차 출발',
    blurb: '노선도는 날마다 새로 짜인다. 환승역에서 호선을 고르고 종점을 지나면 골인. 같은 호선 역에 모두 깃발을 꽂으면 호선 완성.',
    seed, extra, closed,
    nodes,
    coords,
    dims: METRO_DIMS,
    edges,
    big: new Set([S, G, ...transfers]),
    entry: null,
    S, G, main, branches, transfers, next, prev, depth,
    lines: LINES,
    lineAt: (n) => LINES[lineOf[n]] || null,
    lineStations,
    blocked,
    fogRadius: 7,

    roll(rng2) { return make(METRO_FACES[Math.floor(rng2.next() * METRO_FACES.length)]); },
    rollsFor() { return METRO_FACES.map((f) => ({ roll: make(f), p: 1 / METRO_FACES.length })); },

    /** avoid: 이 수에서 지나갈 수 없는 역(봉쇄 테이프 — 도깨비에게만 넘긴다) */
    options(pieces, owner, roll, avoid = null) {
      const own = pieces.filter((p) => p.owner === owner);
      const opts = [];
      const add = (base, path) => {
        const last = path[path.length - 1];
        const t = tiles[last];
        const warp = owner === 'me' && t?.kind === 'express' ? warpTarget(last) : null;
        const full = warp && !blocked(warp) ? path.concat(warp) : path;
        const key = base.from + '>' + full[full.length - 1];
        if (opts.some((o) => o.from + '>' + o.path[o.path.length - 1] === key)) return;
        // 어느 호선으로 가는지(처음 타는 지선의 호선). 지선을 탄 수는 '지름길 부적'이 알아보도록 diagonal
        const via = path.find((n) => lineOf[n] !== 1);
        opts.push({ ...base, path: full, warp: full !== path, diagonal: !!via, via: via ? lineOf[via] : null });
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
      const d = depth[node] / (MAIN - 1);
      return owner === 'me' ? d : 1 - d;
    },

    tile(node) { return tiles[node] || null; },

    /** 안개: 이 역들에서 앞으로 radius 걸음 안에 있는 역(내 말 기준) */
    ahead(froms, radius = 7) {
      const out = new Set();
      const go = (n, left) => { out.add(n); if (left > 0) for (const nx of next[n]) go(nx, left - 1); };
      for (const f of froms) { if (f === START) go(S, radius - 1); else if (f !== HOME) go(f, radius); }
      return out;
    },

    /** 도깨비 행선지: node 에서 거꾸로 가다 처음 만나는 갈림역과 그 갈래들 */
    nextFork(node) {
      const seen = new Set();
      let cur = node === START ? G : node;
      while (cur && !seen.has(cur)) {
        seen.add(cur);
        if (prev[cur].length > 1) return { at: cur, ways: prev[cur].slice() };
        cur = prev[cur][0];
      }
      return null;
    }
  };
}
