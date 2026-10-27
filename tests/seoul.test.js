import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, HOME } from '../src/core/board.js';
import {
  makeSeoul, closableLines, ROUTES, STATION_XY, LINE_STATIONS, STATION_LINES, ALL_EDGES, METRO_FACES
} from '../src/core/boards/seoul.js';

const step = (v) => ({ value: v, face: v, tier: Math.min(4, v), label: v + '역', faces: [v], bonus: false, chips: v * 4 });

test('서울 노선도: 모든 역에 좌표가 있고, 역끼리 너무 붙어 있지 않다', () => {
  for (const list of Object.values(LINE_STATIONS)) for (const n of list) assert.ok(STATION_XY[n], n);
  const names = Object.keys(STATION_XY);
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) {
    const [a, b] = [STATION_XY[names[i]], STATION_XY[names[j]]];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 0.7, `${names[i]}·${names[j]}`);
  }
  assert.ok(STATION_LINES['종로3가'].length === 3 && STATION_LINES['고속터미널'].length === 3);
  assert.ok(ALL_EDGES.some((e) => e.line === 2 && e.a === '충정로' && e.b === '시청'), '2호선은 순환선');
});

test('구간마다 출발역 → 종착역이 이어지고, 길은 되돌아가지 않으며, 갈림길이 여럿 있다', () => {
  for (const route of ROUTES) {
    const m = makeSeoul(route);
    assert.equal(m.main[0], route[0]);
    assert.equal(m.main.at(-1), route[1]);
    assert.ok(m.length >= 9, route.join('→'));
    assert.ok(m.forks.length >= 5, route.join('→') + ' 갈림길');
    for (const n of m.nodes) for (const x of m.next[n]) assert.ok(m.depth[x] > m.depth[n]);
    for (let i = 0; i < m.main.length - 1; i++) assert.ok(m.next[m.main[i]].includes(m.main[i + 1]));
  }
});

test('운행 중지: 끊어도 구간이 이어지는 호선만 고르고, 그 호선으로는 달릴 수 없다', () => {
  for (const route of ROUTES.slice(0, 8)) {
    for (let seed = 1; seed <= 5; seed++) {
      const m = makeSeoul(route, { closeSeed: seed });
      assert.ok(closableLines(...route).includes(m.closed));
      assert.ok(!m.edges.some((e) => e.line === m.closed));
      assert.equal(m.main.at(-1), route[1]);
    }
  }
});

test('수: 차고에서 나오면 출발역부터, 종착역을 지나면 골인, 막힌 역은 피한다', () => {
  const m = makeSeoul(['김포공항', '청량리']);
  const pieces = [{ id: 'm0', owner: 'me', node: START }];
  const opts = m.options(pieces, 'me', step(1));
  assert.deepEqual(opts.map((o) => o.path), [[m.S]]);
  const near = [{ id: 'm0', owner: 'me', node: m.main.at(-2) }];
  assert.ok(m.options(near, 'me', step(3)).every((o) => o.path.at(-1) === HOME));
  const at = m.main[2];
  const avoid = new Set([m.main[3]]);
  for (const o of m.options([{ id: 'm0', owner: 'me', node: at }], 'me', step(3), avoid)) assert.ok(!o.path.includes(m.main[3]));
});

test('도깨비 열차는 종착역에서 출발역 쪽으로 거꾸로 달린다', () => {
  const m = makeSeoul(['서울역', '오금']);
  const opts = m.options([{ id: 'd0', owner: 'opp', node: START }], 'opp', step(2));
  assert.ok(opts.every((o) => o.path[0] === m.G));
  for (const o of opts) assert.ok(m.depth[o.path[1]] < m.depth[o.path[0]]);
});

test('다른 호선으로 갈아타는 수는 transfers 가 붙는다', () => {
  const m = makeSeoul(['홍대입구', '잠실']);
  let found = false;
  for (const n of m.nodes) {
    for (const o of m.options([{ id: 'm0', owner: 'me', node: n }], 'me', step(4))) if (o.transfers > 0) { found = true; assert.ok(o.diagonal); }
  }
  assert.ok(found);
  assert.equal(METRO_FACES.length, 6);
});
