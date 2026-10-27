import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, HOME } from '../src/core/board.js';
import { makeMetro, METRO_FACES } from '../src/core/boards/metro.js';

const step = (v) => ({ value: v, face: v, tier: Math.min(4, v), label: v + '역', faces: [v], bonus: false, chips: v * 4, back: false });

test('노선도: 같은 시드면 같고, 시드가 다르면 대개 다르다', () => {
  const a = makeMetro(7), b = makeMetro(7);
  assert.deepEqual(a.edges, b.edges);
  assert.deepEqual(a.nodes.map((n) => a.tile(n)?.kind ?? null), b.nodes.map((n) => b.tile(n)?.kind ?? null));
  const sigs = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => { const m = makeMetro(s); return JSON.stringify(m.nodes.map((n) => m.tile(n)?.kind ?? '-')); }));
  assert.ok(sigs.size >= 6);
});

test('노선도: 어느 역에서든 앞으로 가면 종점에 닿고, 갈래가 넉넉하다', () => {
  for (let s = 1; s <= 80; s++) {
    const m = makeMetro(s);
    const reach = (n, seen = new Set()) => n === m.G || m.next[n].some((x) => !seen.has(x) && (seen.add(x), reach(x, seen)));
    for (const n of m.nodes) if (n !== m.G) assert.ok(reach(n), `seed ${s} ${n}`);
    const kinds = m.branches.map((b) => b.kind);
    assert.ok(kinds.includes('link'), `seed ${s}: 연결선`);
    assert.ok(m.branches.length >= 5, `seed ${s}: 갈래 ${m.branches.length}`);
    assert.ok(m.nodes.length >= 36 && m.nodes.length <= 56, `seed ${s}: ${m.nodes.length}`);
    for (const b of m.branches) assert.ok(m.next[b.from].length >= 2);
    for (const id of [2, 3, 4, 5]) assert.ok(m.lineStations[id]?.length, `seed ${s}: ${id}호선`);
  }
});

test('노선도: 갈림역을 지나면 호선마다 다른 수가 나온다', () => {
  const m = makeMetro(3);
  const br = m.branches[0];
  const opts = m.options([{ id: 'm0', owner: 'me', node: br.from }], 'me', step(1));
  assert.ok(opts.length >= 2);
  assert.ok(opts.some((o) => o.via === br.line));
});

test('노선도: 새 말은 출발역부터, 종점을 지나면 골인, 도깨비는 거꾸로', () => {
  const m = makeMetro(5);
  const mine = m.options([{ id: 'm0', owner: 'me', node: START }], 'me', step(1));
  assert.deepEqual(mine[0].path, [m.S]);
  const near = m.options([{ id: 'm0', owner: 'me', node: m.main[28] }], 'me', step(2));
  assert.ok(near.every((o) => o.path.at(-1) === HOME));
  const opp = m.options([{ id: 'd0', owner: 'opp', node: START }], 'opp', step(2));
  assert.equal(opp[0].path[0], m.G);
  assert.ok(m.progress(m.G, 'opp') < m.progress(opp[0].path.at(-1), 'opp'));
});

test('운행 중지 호선 역과 봉쇄 역은 지나갈 수 없다', () => {
  const open = makeMetro(9), shut = makeMetro(9, { closed: open.branches[0].line });
  const br = shut.branches[0];
  assert.ok(shut.options([{ id: 'm0', owner: 'me', node: br.from }], 'me', step(1)).every((o) => !br.ids.includes(o.path.at(-1))));
  const m = makeMetro(9);
  const wall = new Set([m.main[25]]);
  const opts = m.options([{ id: 'd0', owner: 'opp', node: m.main[27] }], 'opp', step(3), wall);
  assert.ok(opts.every((o) => !o.path.includes(m.main[25])));
});

test('노선 연장권: 다음 노선도에 갈래가 더 생긴다', () => {
  let more = 0;
  for (let s = 1; s <= 30; s++) if (makeMetro(s, { extra: 2 }).branches.length > makeMetro(s).branches.length) more++;
  assert.ok(more >= 25);
});

test('열차 주사위: 1~5역과 급행(7역 + 한 번 더), 확률 합 1', () => {
  const m = makeMetro(1);
  assert.deepEqual(METRO_FACES, [1, 2, 3, 4, 5, 'express']);
  const rolls = m.rollsFor();
  assert.ok(Math.abs(rolls.reduce((s, x) => s + x.p, 0) - 1) < 1e-12);
  const ex = rolls.find((x) => x.roll.face === 'express').roll;
  assert.equal(ex.value, 7);
  assert.ok(ex.bonus);
});
