import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, HOME } from '../src/core/board.js';
import { createRng } from '../src/core/rng.js';
import {
  createRound, legalMoves, applyMove, depart, reroll, scoreMove, dangerAt, threats, chooseOpp,
  useSkill, skillBlocked, placeBlockade, blockadeBlocked, timeOf, tripMinutes, nextEventAt,
  CLOCK, BLOCKADE
} from '../src/core/round.js';
import { INCIDENTS } from '../src/core/incidents.js';
import { HEROES, heroOf } from '../src/core/heroes.js';
import { EVENTS, planEvents } from '../src/core/events.js';

const rngAlways = (v) => ({ next: () => v });
const step = (v) => ({ value: v, face: v, tier: Math.min(4, v), label: v + '역', faces: [v], bonus: false, chips: v * 4, back: false });
const ROUTE = ['김포공항', '청량리'];

function day(extra = {}) {
  return createRound({ number: 1, target: 100000, rerolls: 2, myPieces: 4, oppPieces: 2, charms: [], tiles: {}, boss: null, route: ROUTE, mapSeed: 21, ...extra });
}
function give(r, roll) { r.pending = { roll, granted: 0 }; r.phase = 'move'; }
const piece = (r, id) => r.pieces.find((p) => p.id === id);
const far = 24 * 60 * 2;

/** m0 을 from 에서 value 만큼 움직여 dest 로 가는 수를 둔다 */
function moveTo(r, from, dest, value, rng = rngAlways(0.99)) {
  piece(r, 'm0').node = from;
  give(r, step(value));
  const i = legalMoves(r).findIndex((m) => m.from === from && m.preview.dest === dest);
  assert.ok(i >= 0, `${from} → ${dest}`);
  return applyMove(r, i, rng);
}

// ── 운행 시계 ──

test('하루는 06:00 에 시작해 24:00 에 끝나고, 시간대가 흘러간다', () => {
  const r = day();
  assert.equal(r.clock, CLOCK.start);
  assert.equal(timeOf(r, 8 * 60), 'rush');
  assert.equal(timeOf(r, 12 * 60), 'day');
  assert.equal(timeOf(r, 19 * 60), 'rush');
  assert.equal(timeOf(r, 22 * 60 + 30), 'night');
  assert.equal(timeOf(r, 23 * 60 + 10), 'last');
});

test('한 번 달리면 출발 45분 + 역마다 15분(급행은 8분)이 흐른다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  assert.equal(tripMinutes(r, { path: [1, 2, 3] }, step(3)), 45 + 45);
  assert.equal(tripMinutes(r, { path: [1, 2, 3, 4, 5, 6, 7] }, { face: 'express' }), 45 + 56);
  const ev = moveTo(r, m.main[1], m.main[3], 2);
  assert.equal(r.clock, CLOCK.start + 45 + 30);
  assert.ok(ev.some((e) => e.type === 'clock'));
});

test('막차 시각이 지나면 그날 운행이 끝난다', () => {
  const r = day({ oppPieces: 0 });
  r.clock = r.end - 10;
  const ev = moveTo(r, r.boardInst.main[1], r.boardInst.main[2], 1);
  assert.equal(r.phase, 'over');
  assert.equal(ev.at(-1).reason, 'lastTrain');
  assert.throws(() => depart(r, createRng(1)));
});

test('도깨비 열차가 출발역을 지나 골인하면 운행이 30분 지연된다', () => {
  const r = day({ oppPieces: 1 });
  const m = r.boardInst;
  piece(r, 'd0').node = m.main[1];
  const before = r.clock;
  const ev = moveTo(r, m.main[5], m.main[6], 1, rngAlways(0.5));
  const home = ev.find((e) => e.type === 'home' && e.who === 'opp');
  if (home) assert.ok(r.clock >= before + 45 + 15 + CLOCK.delay);
});

test('연장 운행 정기권은 막차를 1시간 늦춘다', () => {
  assert.equal(day({ charms: ['bat'] }).end, CLOCK.end + 60);
});

// ── 점수 ──

test('점수 = 칩 × 배수. 잡기·골인·함께 타기가 더해진다', () => {
  const r = day();
  const s = scoreMove(r, { roll: step(3), tier: 3, stack: 2, captured: 1, homed: 0, heroes: [], groupHeroes: [] });
  assert.equal(s.chips, 12 + 50);
  assert.equal(s.mult, 1 + 1 + 1);
  const h = scoreMove(r, { roll: step(1), homed: 2, heroes: [], groupHeroes: [] });
  assert.equal(h.chips, 4 + 200);
  assert.equal(h.mult, 3);
});

test('러시아워엔 이동 칩 +50%, 막차엔 골인 배수 +3', () => {
  const r = day();
  r.clock = 8 * 60;
  assert.equal(scoreMove(r, { roll: step(4), arriveAt: 8 * 60 + 30, heroes: [] }).chips, 16 + 8);
  assert.ok(scoreMove(r, { roll: step(1), homed: 1, arriveAt: 23 * 60 + 30, heroes: [], groupHeroes: [] }).lines.some((l) => l.src === '막차'));
});

test('정기권은 왼쪽부터 계산된다 — ×2 는 뒤에 둘수록 세다', () => {
  const base = { roll: step(4), tier: 4, stack: 2, heroes: [], groupHeroes: [] };
  const a = scoreMove(day({ charms: ['gambler', 'magpie'] }), base);
  const b = scoreMove(day({ charms: ['magpie', 'gambler'] }), base);
  assert.ok(b.mult > a.mult);
});

test('환승역에 서면 칩이 붙는다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  const t = m.main.find((n, i) => i > 0 && i < m.main.length - 1 && m.transfers.has(n));
  const i = m.main.indexOf(t);
  piece(r, 'm0').node = m.main[i - 1];
  give(r, step(1));
  const opt = legalMoves(r).find((x) => x.preview.dest === t);
  assert.ok(opt.preview.boardTile.name.includes('환승역'));
});

// ── 역 사건 ──

test('화재 역은 아무도 지나가지도 서지도 못한다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  r.incidents = [{ node: m.main[3], kind: 'fire', until: far }];
  piece(r, 'm0').node = m.main[1];
  give(r, step(3));
  for (const o of legalMoves(r)) assert.ok(!o.path.includes(m.main[3]));
  r.phase = 'throw';
  assert.match(blockadeBlocked(r, m.main[3]) || '', /불/);
});

test('신호 장애 역을 지나거나 서면 30분 더 걸린다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  r.incidents = [{ node: m.main[2], kind: 'delay', until: far }];
  assert.equal(tripMinutes(r, { path: [m.main[1], m.main[2], m.main[3]] }, step(3)), 45 + 45 + INCIDENTS.delay.delay);
});

test('인파 몰림은 칩 +40, 역 버스킹은 배수 +2 — 한 번 누리면 사라진다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  r.incidents = [{ node: m.main[3], kind: 'crowd', until: far }, { node: m.main[5], kind: 'busk', until: far }];
  piece(r, 'm0').node = m.main[2];
  give(r, step(1));
  const crowd = legalMoves(r).find((x) => x.preview.dest === m.main[3]);
  assert.ok(crowd.preview.score.lines.some((l) => l.src.includes('인파') && l.chips >= 40));
  const ev = moveTo(r, m.main[2], m.main[3], 1);
  assert.ok(ev.some((e) => e.type === 'incidentEnd' && e.used));
  assert.ok(!r.incidents.some((i) => i.kind === 'crowd'));
  piece(r, 'm0').node = m.main[4];
  give(r, step(1));
  const busk = legalMoves(r).find((x) => x.preview.dest === m.main[5]);
  assert.ok(busk.preview.score.mult >= 3);
});

test('역 사건은 시간이 다 되면 사라지고, 화재는 출발역 → 종착역 길을 끊지 않는다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  r.incidents = [{ node: m.main[6], kind: 'delay', until: r.clock + 10 }];
  const ev = moveTo(r, m.main[1], m.main[2], 1);
  assert.ok(ev.some((e) => e.type === 'incidentEnd' && e.node === m.main[6]));
  for (let s = 1; s <= 60; s++) {
    const rng = createRng(s);
    const q = createRound({ number: 1, target: 1e9, rerolls: 0, myPieces: 4, oppPieces: 2, charms: [], tiles: {}, boss: null, mapSeed: s });
    for (let g = 0; g < 120 && q.phase !== 'over'; g++) {
      if (q.phase === 'throw') depart(q, rng); else applyMove(q, 0, rng);
      const fires = new Set(q.incidents.filter((i) => i.kind === 'fire').map((i) => i.node));
      const b = q.boardInst;
      const seen = new Set([b.S]); const queue = [b.S];
      while (queue.length) { const n = queue.shift(); for (const x of b.next[n]) if (!seen.has(x) && !fires.has(x)) { seen.add(x); queue.push(x); } }
      assert.ok(seen.has(b.G), `seed ${s}: 화재가 길을 끊었다`);
    }
  }
});

// ── 봉쇄 ──

test('봉쇄 테이프: 하루 2개, 3시간 동안 도깨비 열차는 그 역을 지나가지 못한다', () => {
  const r = day({ oppPieces: 1 });
  const m = r.boardInst;
  assert.match(blockadeBlocked(r, m.S), /출발역/);
  piece(r, 'd0').node = m.main[8];
  placeBlockade(r, m.main[7]);
  assert.equal(r.blockadesLeft, BLOCKADE.perDay - 1);
  assert.equal(r.blockades[0].until, r.clock + BLOCKADE.minutes);
  const ev = moveTo(r, m.main[1], m.main[2], 1, rngAlways(0.5));
  for (const e of ev.filter((x) => x.type === 'move' && x.who === 'opp')) assert.ok(!e.path.includes(m.main[7]));
  placeBlockade(r, m.main[4]);
  assert.match(blockadeBlocked(r, m.main[5]), /다 썼다/);
});

test('봉쇄 테이프는 시간이 지나면 걷힌다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  placeBlockade(r, m.main[6]);
  r.clock = r.blockades[0].until - 5;
  const ev = moveTo(r, m.main[1], m.main[2], 1);
  assert.ok(ev.some((e) => e.type === 'blockadeEnd'));
  assert.equal(r.blockades.length, 0);
});

// ── 원정대 ──

test('원정대: m0 호랑이 기관사 · m1 토끼 역무원 · m2 앵무새 안내원 · m3 판다 보안관', () => {
  assert.deepEqual(['m0', 'm1', 'm2', 'm3'].map((id) => heroOf(id).id), ['tiger', 'rabbit', 'parrot', 'panda']);
  assert.deepEqual(HEROES.map((h) => h.job), ['기관사', '역무원', '안내원', '보안관']);
});

test('호랑이가 잡으면 배수 ×2, 판다가 낀 묶음은 함께 타기 배수 2배, 앵무새는 인파 역에서 칩 +40 더', () => {
  const r = day();
  assert.equal(scoreMove(r, { roll: step(2), tier: 2, stack: 1, captured: 1, heroes: ['tiger'], groupHeroes: ['tiger'] }).mult, (1 + 1) * 2);
  assert.equal(scoreMove(r, { roll: step(2), stack: 3, heroes: ['rabbit'], groupHeroes: ['rabbit', 'panda', 'tiger'] }).mult, 1 + 2 + 2);
  assert.equal(scoreMove(r, { roll: step(2), stack: 1, incident: 'crowd', heroes: ['parrot'], groupHeroes: ['parrot'] }).chips, 8 + 15 + 40);
});

test('스킬은 노선 위에 나온 캐릭터만, 출발 전에, 하루 한 번', () => {
  const r = day();
  assert.match(skillBlocked(r, 'rabbit'), /노선 위/);
  piece(r, 'm1').node = r.boardInst.main[3];
  useSkill(r, 'rabbit', createRng(1));
  assert.equal(r.extra, 1);
  assert.ok(r.freeRide);
  assert.match(skillBlocked(r, 'rabbit'), /이미/);
});

test('토끼 추가 운행: 다음 이동은 시간이 들지 않는다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  piece(r, 'm1').node = m.main[5];
  useSkill(r, 'rabbit', createRng(1));
  const t = r.clock;
  moveTo(r, m.main[1], m.main[2], 1);
  assert.equal(r.clock, t);
  assert.equal(r.freeRide, false);
});

test('호랑이 경적: 가장 앞선 도깨비 열차가 차고로', () => {
  const r = day();
  const m = r.boardInst;
  piece(r, 'm0').node = m.main[2];
  assert.match(skillBlocked(r, 'tiger'), /도깨비/);
  piece(r, 'd0').node = m.main[9];
  piece(r, 'd1').node = m.main[3];
  const ev = useSkill(r, 'tiger', createRng(1));
  assert.deepEqual(ev.find((e) => e.type === 'roar').victimIds, ['d1']);
  assert.equal(piece(r, 'd1').node, START);
});

test('앵무새 승객 호출: 역 두 곳에 인파', () => {
  const r = day();
  piece(r, 'm2').node = r.boardInst.main[4];
  const ev = useSkill(r, 'parrot', createRng(2));
  assert.equal(ev.filter((e) => e.type === 'incident' && e.kind === 'crowd').length, 2);
});

test('판다 스크린도어: 다음 도깨비 차례 동안 위험 0, 끝나면 열린다', () => {
  const r = day();
  piece(r, 'm3').node = r.boardInst.main[3];
  useSkill(r, 'panda', createRng(3));
  assert.equal(threats(r)[r.boardInst.main[3]], 0);
  moveTo(r, r.boardInst.main[1], r.boardInst.main[2], 1);
  assert.equal(r.shield, false);
});

test('토끼 안전 요원: 하루 한 번 위험도 0', () => {
  const r = day();
  piece(r, 'm1').node = r.boardInst.main[3];
  assert.equal(threats(r)[r.boardInst.main[3]], 0);
  r.escapeUsed = true;
  assert.ok(threats(r)[r.boardInst.main[3]] >= 0);
});

// ── 굴림·사건·AI ──

test('던지기 솜씨: 굿은 두 번 굴려 좋은 쪽, 삐끗은 나쁜 쪽', () => {
  const seq = () => { const v = [0, 0.99]; let i = 0; return { next: () => v[i++ % v.length] }; };
  const g = day({ oppPieces: 0 }); depart(g, seq(), 'good');
  assert.equal(g.pending.roll.face, 'express');
  const s = day({ oppPieces: 0 }); depart(s, seq(), 'slip');
  assert.equal(s.pending.roll.face, 1);
});

test('다시 굴리기는 시간이 들지 않고 횟수만 준다', () => {
  const r = day({ oppPieces: 0 });
  depart(r, rngAlways(0.3));
  const t = r.clock;
  reroll(r, rngAlways(0.6));
  assert.equal(r.clock, t);
  assert.equal(r.rerolls, 1);
});

test('사건 계획: 하루 두 번, 08~21시, 3시간 이상 떨어진다', () => {
  for (let s = 1; s <= 200; s++) {
    const plan = planEvents(createRng(s));
    assert.equal(plan.length, 2);
    assert.notEqual(plan[0].id, plan[1].id);
    assert.ok(plan[1].at - plan[0].at >= 180);
    for (const p of plan) { assert.ok(p.at >= 8 * 60 && p.at <= 21 * 60); assert.ok(EVENTS.some((e) => e.id === p.id)); }
  }
});

test('돌발 사건은 예정 시각이 지나면 터진다 — 연장 운행은 막차를, 역 축제는 버스킹 세 곳을', () => {
  const r = day({ oppPieces: 0, events: [{ at: 6 * 60 + 30, id: 'tailwind' }] });
  assert.equal(nextEventAt(r), 6 * 60 + 30);
  const ev = moveTo(r, r.boardInst.main[1], r.boardInst.main[3], 2);
  assert.ok(ev.some((e) => e.type === 'event' && e.id === 'tailwind'));
  assert.equal(r.end, CLOCK.end + 60);
  assert.equal(nextEventAt(r), null);
  const f = day({ oppPieces: 0, events: [{ at: 6 * 60 + 30, id: 'feast' }] });
  const fe = moveTo(f, f.boardInst.main[1], f.boardInst.main[2], 1, rngAlways(0.99));
  assert.equal(fe.filter((e) => e.type === 'incident' && e.kind === 'busk').length, 3);
});

test('도깨비 AI: 사냥꾼은 잡기를, 도망꾼은 골인을 좋아한다', () => {
  const r = day();
  const m = r.boardInst;
  piece(r, 'm0').node = m.main[5];
  const catchIt = { kind: 'stack', from: m.main[7], pieceIds: ['d0'], path: [m.main[6], m.main[5]] };
  const walk = { kind: 'stack', from: m.main[7], pieceIds: ['d0'], path: [m.main[6]] };
  assert.equal(chooseOpp(r, [walk, catchIt]), catchIt);
  const home = { kind: 'stack', from: m.main[1], pieceIds: ['d1'], path: [m.S, HOME] };
  const hit = { kind: 'stack', from: m.main[7], pieceIds: ['d1'], path: [m.main[6], m.main[5]] };
  assert.equal(chooseOpp(r, [hit, home]), home);
});

test('위험도: 도깨비 열차가 닿을 수 있는 역만 위험하다', () => {
  const r = day({ oppPieces: 1 });
  const m = r.boardInst;
  piece(r, 'd0').node = m.main[8];
  assert.ok(dangerAt(r, m.main[7]) > 0);
  assert.equal(dangerAt(r, m.main[9]), 0);
});

test('하루 300판: 무작위로 둬도 늘 끝난다', () => {
  for (let s = 1; s <= 300; s++) {
    const rng = createRng(s);
    const r = createRound({ number: 1, target: 1e9, rerolls: 2, myPieces: 4, oppPieces: 3, charms: [], tiles: {}, boss: null, mapSeed: s, closure: s % 3 === 0, events: planEvents(rng) });
    let g = 0;
    while (r.phase !== 'over' && g++ < 400) {
      if (r.phase === 'throw') depart(r, rng);
      else applyMove(r, Math.floor(rng.next() * legalMoves(r).length), rng);
    }
    assert.equal(r.phase, 'over', `seed ${s}`);
  }
});
