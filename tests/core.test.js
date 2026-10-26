import { test } from 'node:test';
import assert from 'node:assert/strict';
import { walk, START, HOME, NODES, prevAfterWalk } from '../src/core/board.js';
import { distribution, throwSticks, BACKDO, DO, GAE, GEOL, YUT, MO } from '../src/core/sticks.js';
import { createRound, legalMoves, applyMove, scoreMove, throwYut, reroll } from '../src/core/round.js';
import { createRun, startRound, settleRound, buy, sellCharm, moveCharm, ROUNDS } from '../src/core/run.js';
import { createRng } from '../src/core/rng.js';

// 정해진 결과만 내는 가짜 윷: 평평한 면 개수 n 을 고정한다
function fixedRound(extra = {}) {
  return createRound({
    number: 1, target: 100000, throws: 7, rerolls: 2, myPieces: 4, oppPieces: 2,
    charms: [], tiles: {}, pFlat: 0.55, boss: null, ...extra
  });
}
function give(r, result) { r.pending = { result, flats: [], granted: 0 }; r.phase = 'move'; }
const rngAlways = (v) => ({ next: () => v, int: () => 0, pick: (l) => l[0], shuffle: (l) => l });

test('판은 29칸', () => {
  assert.equal(NODES.length, 29);
});

test('출발에서 도는 o1, 모는 모서리 o5', () => {
  assert.deepEqual(walk(START, 1, null), ['o1']);
  assert.deepEqual(walk(START, 5, null).at(-1), 'o5');
});

test('모서리에 멈췄다가 출발하면 대각선, 지나가기만 하면 바깥길', () => {
  assert.deepEqual(walk('o5', 2, 'o4'), ['a1', 'a2']);
  assert.deepEqual(walk('o3', 3, 'o2'), ['o4', 'o5', 'o6']);
});

test('가운데에 멈췄다 출발하면 골인 쪽 지름길, a 대각선을 지나치면 a 를 이어 간다', () => {
  assert.deepEqual(walk('C', 3, 'a2'), ['b3', 'b4', HOME]);
  assert.deepEqual(walk('a2', 2, 'a1'), ['C', 'a3']);
  assert.deepEqual(walk('b2', 2, 'b1'), ['C', 'b3']);
});

test('왼쪽 위 모서리에서 b 대각선을 타면 6칸 만에 골인', () => {
  const path = walk('o10', 6, 'o9');
  assert.deepEqual(path, ['b1', 'b2', 'C', 'b3', 'b4', HOME]);
});

test('o19 다음은 골인, 넘쳐도 골인에서 멈춘다', () => {
  assert.deepEqual(walk('o18', 4, 'o17'), ['o19', HOME]);
});

test('첫 이동 뒤 빽도는 참먹이로', () => {
  assert.equal(prevAfterWalk(START, ['o1']), 'o0');
});

test('윷 결과 확률의 합은 1', () => {
  const d = distribution(0.55);
  const sum = Object.values(d).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

test('던지기 표본이 이론 확률과 맞는다', () => {
  const rng = createRng(7), n = 40000, count = {};
  for (let i = 0; i < n; i++) { const r = throwSticks(rng).result; count[r] = (count[r] || 0) + 1; }
  const d = distribution(0.55);
  for (const k of [BACKDO, DO, GAE, GEOL, YUT, MO]) assert.ok(Math.abs(count[k] / n - d[k]) < 0.01, `${k}`);
});

test('새 말 내기와 판 위 말 움직이기가 수로 나온다', () => {
  const r = fixedRound();
  r.pieces[0].node = 'o3'; r.pieces[0].prev = 'o2';
  give(r, GAE);
  const moves = legalMoves(r);
  assert.equal(moves.length, 2);
  assert.deepEqual(moves.map((m) => m.kind).sort(), ['new', 'stack']);
});

test('빽도는 판 위 말만, 출발 안 한 말은 못 낸다', () => {
  const r = fixedRound();
  give(r, BACKDO);
  assert.equal(legalMoves(r).length, 0);
});

test('내 말 위에 멈추면 업히고 배수가 오른다 (업기 +1, 흥 +1)', () => {
  const r = fixedRound();
  r.pieces[0].node = 'o2'; r.pieces[0].prev = 'o1';
  give(r, GAE); // 새 말이 o2 로
  const idx = legalMoves(r).findIndex((m) => m.kind === 'new');
  const ev = applyMove(r, idx, rngAlways(0.99));
  const score = ev.find((e) => e.type === 'score');
  assert.equal(score.mult, 3);
  assert.ok(ev.some((e) => e.type === 'stack'));
  assert.equal(r.heung, 1);
  // 업힌 둘이 같이 움직인다
  give(r, DO);
  const stackMove = legalMoves(r).find((m) => m.kind === 'stack');
  assert.equal(stackMove.pieceIds.length, 2);
});

test('도깨비를 잡으면 칩 +50·배수 +1(+흥 1), 잡힌 도깨비는 출발로, 한 번 더', () => {
  const r = fixedRound();
  const opp = r.pieces.find((p) => p.owner === 'opp');
  opp.node = 'o3'; opp.prev = 'o2';
  give(r, GEOL);
  const idx = legalMoves(r).findIndex((m) => m.kind === 'new');
  const ev = applyMove(r, idx, rngAlways(0.99));
  const score = ev.find((e) => e.type === 'score');
  assert.equal(score.chips, 30 + 50);
  assert.equal(score.mult, 3);
  assert.equal(opp.node, START);
  assert.equal(r.phase, 'throw');
  assert.equal(r.extra, 1);
});

test('골인하면 칩 +100·배수 +2(+흥 1)', () => {
  const r = fixedRound();
  r.pieces[0].node = 'o19'; r.pieces[0].prev = 'o18';
  give(r, DO);
  const ev = applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'stack'), rngAlways(0.99));
  const score = ev.find((e) => e.type === 'score');
  assert.equal(score.chips, 10 + 100);
  assert.equal(score.mult, 4);
  assert.equal(r.pieces[0].node, HOME);
});

test('부적은 왼쪽부터 계산된다 — ×2 가 뒤에 있어야 더 세다', () => {
  const base = { result: YUT, stack: 2, captured: 0, homed: 0, waiting: 0, onDiagonal: false, tile: null };
  const a = scoreMove({ charms: ['gambler', 'magpie'], boss: null }, base); // (1+1)×2 +1 = 5
  const b = scoreMove({ charms: ['magpie', 'gambler'], boss: null }, base); // (1+1+1)×2 = 6
  assert.equal(a.mult, 5);
  assert.equal(b.mult, 6);
});

test('보스 "도 무효"면 도가 나와도 둘 수가 없다', () => {
  const r = fixedRound({ boss: { id: 'noDo' } });
  r.pieces[0].node = 'o3'; r.pieces[0].prev = 'o2';
  give(r, DO);
  assert.equal(legalMoves(r).length, 0);
});

test('윷·모는 던질 기회를 쓰지 않고 한 번 더, 다시 던지면 그 한 번 더는 취소', () => {
  const r = fixedRound();
  throwYut(r, rngAlways(0.01)); // 모두 평평 → 윷
  assert.equal(r.pending.result, YUT);
  assert.equal(r.extra, 1);
  reroll(r, rngAlways(0.99)); // 모두 엎어짐 → 모(다시 +1)
  assert.equal(r.pending.result, MO);
  assert.equal(r.extra, 1);
  assert.equal(r.throwsLeft, 6);
});

test('라운드 승리 엽전: 기본 4 + 남은 던질 기회 + 이자', () => {
  const run = createRun(1);
  startRound(run);
  run.coins = 10;
  Object.assign(run.round, { phase: 'over', outcome: 'win', throwsLeft: 3 });
  const payout = settleRound(run);
  assert.equal(run.coins, 10 + 4 + 3 + 2);
  assert.ok(payout.length >= 3);
  assert.equal(run.status, 'shop');
  assert.equal(run.shop.offers.length, 5);
});

test('상점: 사고, 팔고, 순서 바꾸기', () => {
  const run = createRun(3);
  startRound(run);
  Object.assign(run.round, { phase: 'over', outcome: 'win', throwsLeft: 0 });
  settleRound(run);
  run.coins = 50;
  const i = run.shop.offers.findIndex((o) => o.kind === 'charm');
  assert.ok(buy(run, i).ok);
  assert.equal(run.charms.length, 1);
  assert.equal(buy(run, i).ok, false); // 이미 팔림
  const t = run.shop.offers.findIndex((o) => o.kind === 'tile');
  const res = buy(run, t);
  assert.ok(res.ok && run.tiles[res.node]);
  run.charms.push('ox');
  moveCharm(run, 1, 0);
  assert.equal(run.charms[0], 'ox');
  assert.ok(sellCharm(run, 0).ok);
});

test('같은 시드면 같은 판', () => {
  const play = (seed) => {
    const run = createRun(seed);
    const r = startRound(run);
    const log = [];
    while (r.phase !== 'over') {
      if (r.phase === 'throw') log.push(...throwYut(r, run.rng).map((e) => e.type + (e.result ?? '')));
      else log.push(...applyMove(r, 0, run.rng).map((e) => e.type));
    }
    return log.join(',') + '|' + r.score;
  };
  assert.equal(play(42), play(42));
  assert.notEqual(play(42), play(43));
});

test('라운드는 반드시 끝난다 (1000판)', () => {
  for (let s = 0; s < 1000; s++) {
    const run = createRun(s);
    const r = startRound(run);
    let guard = 0;
    while (r.phase !== 'over' && guard++ < 500) {
      if (r.phase === 'throw') throwYut(r, run.rng); else applyMove(r, 0, run.rng);
    }
    assert.equal(r.phase, 'over', 'seed ' + s);
  }
});

test('라운드 목표는 갈수록 오른다', () => {
  for (let i = 1; i < ROUNDS.length; i++) assert.ok(ROUNDS[i].target > ROUNDS[i - 1].target);
});

test('목표 점수에 닿는 순간 라운드가 끝나고 남은 던질 기회가 남는다', () => {
  const r = createRound({ number: 1, target: 50, throws: 7, rerolls: 2, myPieces: 4, oppPieces: 2, charms: [], tiles: {}, pFlat: 0.55, boss: null });
  r.throwsLeft = 5;
  give(r, MO); // 모 50 → 목표 50
  const ev = applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'new'), rngAlways(0.99));
  assert.equal(r.phase, 'over');
  assert.equal(r.outcome, 'win');
  assert.equal(r.throwsLeft, 5);
  assert.equal(ev.at(-1).reason, 'target');
});

import { dangerAt, chooseOpp, HEUNG_MAX, TREASURE_CHIPS, TREASURE_COINS } from '../src/core/round.js';

test('위험도: 도깨비가 한 번 던져 닿을 수 있는 칸의 확률', () => {
  const r = fixedRound();
  const d = r.pieces.find((p) => p.owner === 'opp');
  d.node = 'o3'; d.prev = 'o2';
  const dist = distribution(0.55);
  // o3 에서 도(1)로 o4, 개(2)로 o5. 출발 대기 도깨비는 도로 o1, 개로 o2 …
  assert.ok(Math.abs(dangerAt(r, 'o4') - (dist[1] + 0)) < 1e-9 || dangerAt(r, 'o4') >= dist[1]);
  assert.ok(Math.abs(dangerAt(r, 'o5') - (dist[2] + dist[5])) < 1e-9); // o3+개, 출발+모
  assert.equal(dangerAt(r, 'C'), 0);
});

test('미리보기는 위험도를 보여 준다: 도깨비 바로 앞 칸은 위험하다', () => {
  const r = fixedRound();
  const d = r.pieces.find((p) => p.owner === 'opp');
  d.node = 'o6'; d.prev = 'o5';
  r.pieces.find((p) => p.id === 'd1').node = 'home'; // 대기 도깨비 없애서 계산 단순화
  r.pieces[0].node = 'o5'; r.pieces[0].prev = 'o4';
  give(r, GAE);
  const m = legalMoves(r).find((x) => x.kind === 'stack');
  assert.equal(m.preview.dest, 'a2'); // 모서리에서 지름길
  assert.equal(m.preview.danger, 0);
  const n = legalMoves(r).find((x) => x.kind === 'new');
  assert.equal(n.preview.dest, 'o2');
});

test('흥은 최대 5, 내 말이 잡히면 꺼진다', () => {
  const r = fixedRound();
  r.heung = HEUNG_MAX;
  const base = { result: GAE, stack: 1, captured: 1, homed: 0, waiting: 0, onDiagonal: false, tile: null, treasure: false, heung: HEUNG_MAX };
  assert.equal(scoreMove(r, base).mult, 1 + 1 + HEUNG_MAX);
  // 도깨비가 내 말을 잡는 상황
  const me = r.pieces[0]; me.node = 'o2'; me.prev = 'o1';
  for (const p of r.pieces.filter((q) => q.owner === 'opp')) { p.node = 'o1'; p.prev = 'o0'; }
  r.pieces.find((p) => p.id === 'd1').node = 'home';
  r.throwsLeft = 3;
  give(r, MO);
  // 내 새 말을 모로 o5 에 두면 도깨비 차례 — 도(평평 1개=표시 아님)가 나오게 rng 를 맞춘다
  const seq = [0.99, 0.01, 0.99, 0.99, 0.99]; // 보따리 굴림은 마지막
  let i = 0;
  const rng = { next: () => seq[Math.min(i++, seq.length - 1)] };
  r.extra = 0; r.pending.granted = 0;
  const ev = applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'new'), rng);
  assert.ok(ev.some((e) => e.type === 'capture' && e.who === 'opp'));
  assert.ok(ev.some((e) => e.type === 'heungLost'));
  assert.equal(r.heung, 0);
});

test('보따리를 밟으면 칩 +40·엽전 +2·흥 +1, 도깨비가 밟으면 사라진다', () => {
  const r = fixedRound();
  r.treasures = [{ node: 'o2', ttl: 3 }];
  give(r, GAE);
  const m = legalMoves(r).find((x) => x.kind === 'new');
  assert.ok(m.preview.treasure);
  assert.equal(m.preview.score.chips, 20 + TREASURE_CHIPS);
  applyMove(r, legalMoves(r).findIndex((x) => x.kind === 'new'), rngAlways(0.99));
  assert.equal(r.coins, TREASURE_COINS);
  assert.equal(r.heung, 1);
  assert.equal(r.treasures.length, 0);
});

test('보따리는 내 차례 3번이 지나면 사라진다', () => {
  const r = fixedRound();
  r.treasures = [{ node: 'C', ttl: 3 }];
  const rng = rngAlways(0.99); // 도깨비는 모(전부 엎어짐)… 보따리 새로 생기지 않게 0.99
  for (let k = 0; k < 3; k++) {
    give(r, DO);
    r.pending.granted = 0; r.extra = 0;
    applyMove(r, 0, rng);
    if (r.phase === 'over') break;
  }
  assert.ok(!r.treasures.some((t) => t.node === 'C'));
});

test('도깨비 성격: 사냥꾼은 잡기, 도망꾼은 골인을 고른다', () => {
  const r = fixedRound();
  const [hunter, runner] = r.pieces.filter((p) => p.owner === 'opp');
  assert.equal(hunter.trait, 'hunter');
  assert.equal(runner.trait, 'runner');
  r.pieces[0].node = 'o4'; // 내 말
  const optCapture = { kind: 'stack', from: 'o2', pieceIds: [hunter.id], path: ['o3', 'o4'] };
  const optHome = { kind: 'stack', from: 'o18', pieceIds: [hunter.id], path: ['o19', 'home'] };
  hunter.node = 'o2';
  assert.equal(chooseOpp(r, [optHome, optCapture]), optCapture);
  const rCapture = { ...optCapture, pieceIds: [runner.id] };
  const rHome = { ...optHome, pieceIds: [runner.id] };
  assert.equal(chooseOpp(r, [rCapture, rHome]), rHome);
});

test('도깨비가 골인하면 내 던질 기회가 하나 준다', () => {
  const r = fixedRound();
  const runner = r.pieces.find((p) => p.id === 'd1');
  runner.node = 'o19'; runner.prev = 'o18';
  r.pieces.find((p) => p.id === 'd0').node = 'home';
  r.throwsLeft = 4;
  give(r, GEOL);
  r.pending.granted = 0; r.extra = 0;
  // 도깨비가 도(평평 1개, 표시 아닌 가락)를 던지게: 가락0 엎어짐, 가락1 평평, 나머지 엎어짐
  const seq = [0.99, 0.01, 0.99, 0.99, 0.99];
  let i = 0;
  const ev = applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'new'), { next: () => seq[Math.min(i++, seq.length - 1)] });
  const home = ev.find((e) => e.type === 'home' && e.who === 'opp');
  assert.ok(home);
  assert.equal(home.throwsLost, 1);
  assert.equal(r.throwsLeft, 3);
});
