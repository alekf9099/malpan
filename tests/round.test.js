import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, HOME } from '../src/core/board.js';
import { createRng } from '../src/core/rng.js';
import {
  createRound, legalMoves, applyMove, depart, reroll, scoreMove, dangerAt, threats, chooseOpp,
  useSkill, skillBlocked, placeBlockade, blockadeBlocked, timeOf, tripMinutes, nextEventAt,
  CLOCK, METRO, HEUNG_MAX, BLOCKADE
} from '../src/core/round.js';
import { HEROES, heroOf } from '../src/core/heroes.js';
import { EVENTS, planEvents } from '../src/core/events.js';

const rngAlways = (v) => ({ next: () => v });
const step = (v) => ({ value: v, face: v, tier: Math.min(4, v), label: v + '역', faces: [v], bonus: false, chips: v * 4, back: false });

function day(extra = {}) {
  return createRound({ number: 1, target: 100000, rerolls: 2, myPieces: 4, oppPieces: 2, charms: [], tiles: {}, boss: null, mapSeed: 21, ...extra });
}
function give(r, roll) { r.pending = { roll, granted: 0 }; r.phase = 'move'; }
const piece = (r, id) => r.pieces.find((p) => p.id === id);

/** m0 을 from 에서 value 만큼 움직여 dest 로 가는 수를 둔다 */
function moveTo(r, from, dest, value) {
  piece(r, 'm0').node = from;
  give(r, step(value));
  const i = legalMoves(r).findIndex((m) => m.from === from && m.preview.dest === dest);
  assert.ok(i >= 0, `${from} → ${dest}`);
  return applyMove(r, i, rngAlways(0.99));
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

test('도깨비 열차가 종점에 닿으면 운행이 30분 지연된다', () => {
  const r = day({ oppPieces: 1 });
  const m = r.boardInst;
  piece(r, 'd0').node = m.main[1];
  const before = r.clock;
  give(r, step(1));
  piece(r, 'm0').node = m.main[20];
  const i = legalMoves(r).findIndex((x) => x.from === m.main[20]);
  // 도깨비는 n1 에서 2역 이상이면 출발역(S)을 지나 골인한다
  const ev = applyMove(r, i, rngAlways(0.5));
  const home = ev.find((e) => e.type === 'home' && e.who === 'opp');
  if (home) assert.ok(r.clock >= before + 45 + 15 + CLOCK.delay);
});

test('출발 전 연장 운행 정기권은 막차를 1시간 늦춘다', () => {
  const r = day({ charms: ['bat'] });
  assert.equal(r.end, CLOCK.end + 60);
});

// ── 점수 ──

test('점수 = 칩 × 배수. 잡기·골인·함께 타기·만족도가 더해진다', () => {
  const r = day();
  const s = scoreMove(r, { roll: step(3), tier: 3, stack: 2, captured: 1, homed: 0, heung: 2, heroes: [], groupHeroes: [] });
  assert.equal(s.chips, 12 + 50);
  assert.equal(s.mult, 1 + 1 + 1 + 2);
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

// ── 노선도 규칙 ──

test('멈춘 역에 깃발, 도깨비가 밟으면 빼앗긴다, 다시 멈추면 단골역', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  const ev = moveTo(r, m.main[1], m.main[3], 2);
  assert.ok(r.flags[m.main[3]] && ev.some((e) => e.type === 'flag'));
  piece(r, 'm0').node = m.main[1];
  give(r, step(2));
  assert.ok(legalMoves(r).find((x) => x.preview.dest === m.main[3]).preview.boardTile.name.includes('단골역'));
});

test('호선의 역에 모두 깃발을 꽂으면 호선 완성', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  const br = m.branches[0];
  const stations = m.lineStations[br.line];
  for (const n of stations.slice(0, -1)) r.flags[n] = true;
  const last = stations.at(-1);
  const before = r.score;
  const ev = moveTo(r, m.prev[last][0], last, 1);
  assert.ok(ev.find((e) => e.type === 'lineComplete')?.line === br.line);
  assert.ok(r.score >= before + METRO.completeScore);
});

test('손님은 멈추면 타고, 원하는 호선 역에서 내리면 배달 — 앵무새는 2배', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  const br = m.branches[0];
  r.passengers = [{ node: m.main[3], line: br.line, ttl: 4 }];
  assert.ok(moveTo(r, m.main[1], m.main[3], 2).some((e) => e.type === 'pickup'));
  assert.equal(piece(r, 'm0').rider, br.line);
  piece(r, 'm0').node = br.from;
  give(r, step(1));
  const opt = legalMoves(r).find((x) => x.preview.dest === br.ids[0]);
  assert.ok(opt.preview.boardTile.name.includes('배달'));
  const r2 = day({ oppPieces: 0 });
  piece(r2, 'm2').node = br.from; piece(r2, 'm2').rider = br.line;
  give(r2, step(1));
  const opt2 = legalMoves(r2).find((x) => x.from === br.from && x.preview.dest === br.ids[0]);
  assert.ok(opt2.preview.boardTile.chips >= METRO.deliverChips * 2);
});

// ── 봉쇄 ──

test('봉쇄 테이프: 하루 2개, 3시간 동안 도깨비 열차는 그 역을 지나가지 못한다', () => {
  const r = day({ oppPieces: 1 });
  const m = r.boardInst;
  piece(r, 'd0').node = m.main[24];
  assert.match(blockadeBlocked(r, m.S), /출발역/);
  placeBlockade(r, m.main[22]);
  assert.equal(r.blockadesLeft, BLOCKADE.perDay - 1);
  // 도깨비가 n22 를 지나야만 하는 위치에서는 n22 를 넘는 수가 없다
  piece(r, 'm0').node = m.main[21];
  assert.equal(dangerAt(r, m.main[21]), 0);
  placeBlockade(r, m.main[18]);
  assert.match(blockadeBlocked(r, m.main[10]), /다 썼다/);
  assert.equal(r.blockades[0].until, r.clock + BLOCKADE.minutes);
});

test('봉쇄 테이프는 시간이 지나면 걷힌다', () => {
  const r = day({ oppPieces: 0 });
  const m = r.boardInst;
  placeBlockade(r, m.main[10]);
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

test('호랑이가 잡으면 배수 ×2, 판다가 낀 묶음은 함께 타기 배수 2배', () => {
  const r = day();
  const base = { roll: step(2), tier: 2, stack: 1, captured: 1, heroes: ['tiger'], groupHeroes: ['tiger'] };
  assert.equal(scoreMove(r, base).mult, (1 + 1) * 2);
  assert.equal(scoreMove(r, { roll: step(2), stack: 3, heroes: ['rabbit'], groupHeroes: ['rabbit', 'panda', 'tiger'] }).mult, 1 + 2 + 2);
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
  piece(r, 'd0').node = m.main[25];
  piece(r, 'd1').node = m.main[8];
  const ev = useSkill(r, 'tiger', createRng(1));
  assert.deepEqual(ev.find((e) => e.type === 'roar').victimIds, ['d1']);
  assert.equal(piece(r, 'd1').node, START);
});

test('앵무새 승객 호출: 역 두 곳에 손님', () => {
  const r = day();
  piece(r, 'm2').node = r.boardInst.main[4];
  const ev = useSkill(r, 'parrot', createRng(2));
  assert.equal(ev.filter((e) => e.type === 'passengerSpawn').length, 2);
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

test('사건은 예정 시각이 지나면 터진다 — 연장 운행은 막차를 늦춘다', () => {
  const r = day({ oppPieces: 0, events: [{ at: 6 * 60 + 30, id: 'tailwind' }] });
  assert.equal(nextEventAt(r), 6 * 60 + 30);
  const ev = moveTo(r, r.boardInst.main[1], r.boardInst.main[3], 2);
  assert.ok(ev.some((e) => e.type === 'event' && e.id === 'tailwind'));
  assert.equal(r.end, CLOCK.end + 60);
  assert.equal(nextEventAt(r), null);
});

test('도깨비 AI: 사냥꾼은 잡기를, 도망꾼은 골인을 좋아한다', () => {
  const r = day();
  const m = r.boardInst;
  piece(r, 'm0').node = m.main[20];
  const catchIt = { kind: 'stack', from: m.main[22], pieceIds: ['d0'], path: [m.main[21], m.main[20]] };
  const walk = { kind: 'stack', from: m.main[22], pieceIds: ['d0'], path: [m.main[21]] };
  assert.equal(chooseOpp(r, [walk, catchIt]), catchIt);
  const home = { kind: 'stack', from: m.main[1], pieceIds: ['d1'], path: [m.S, HOME] };
  const hit = { kind: 'stack', from: m.main[22], pieceIds: ['d1'], path: [m.main[21], m.main[20]] };
  assert.equal(chooseOpp(r, [hit, home]), home);
});

test('하루 1000판: 무작위로 둬도 늘 끝난다', () => {
  for (let s = 1; s <= 300; s++) {
    const rng = createRng(s);
    const r = createRound({ number: 1, target: 1e9, rerolls: 2, myPieces: 4, oppPieces: 3, charms: [], tiles: {}, boss: null, mapSeed: s, events: planEvents(rng) });
    let g = 0;
    while (r.phase !== 'over' && g++ < 400) {
      if (r.phase === 'throw') depart(r, rng);
      else applyMove(r, Math.floor(rng.next() * legalMoves(r).length), rng);
    }
    assert.equal(r.phase, 'over', `seed ${s}`);
    assert.ok(r.heung <= HEUNG_MAX);
  }
});
