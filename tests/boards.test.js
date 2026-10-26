import { test } from 'node:test';
import assert from 'node:assert/strict';
import { START, HOME } from '../src/core/board.js';
import { marbleBoard, KEY_CARDS } from '../src/core/boards/marble.js';
import { chessBoard } from '../src/core/boards/chess.js';
import { BOARDS } from '../src/core/boards/index.js';
import { createRound, legalMoves, applyMove, throwYut, dangerAt } from '../src/core/round.js';
import { createRun, startRound, settleRound, buy, ROUNDS } from '../src/core/run.js';

const dice = (a, b) => ({ value: a + b, tier: 3, label: String(a + b), faces: [a, b], bonus: a === b, chips: (a + b) * 6, back: false });
const face = (f) => chessBoard.rollsFor().find((x) => x.roll.value === f).roll;
const rngAlways = (v) => ({ next: () => v });

function round(board, extra = {}) {
  return createRound({ number: 1, target: 100000, throws: 7, rerolls: 2, myPieces: 4, oppPieces: 2, charms: [], tiles: {}, pFlat: 0.55, boss: null, board, ...extra });
}
function give(r, roll) { r.pending = { roll, granted: 0 }; r.phase = 'move'; }

// ── 주사위판 ──

test('주사위판은 40칸, 결과 확률 합 1', () => {
  assert.equal(marbleBoard.nodes.length, 40);
  const sum = marbleBoard.rollsFor().reduce((s, x) => s + x.p, 0);
  assert.ok(Math.abs(sum - 1) < 1e-12);
});

test('주사위판: 새 말은 출발점에서 합만큼, 한 바퀴를 넘기면 골인', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: START }, { id: 'm1', owner: 'me', node: 'm36' }];
  const opts = marbleBoard.options(pieces, 'me', dice(3, 4));
  assert.deepEqual(opts.find((o) => o.kind === 'new').path.at(-1), 'm7');
  assert.equal(opts.find((o) => o.kind === 'stack').path.at(-1), HOME);
});

test('주사위판: 비행기 칸에 멈추면 보물섬으로 날아간다', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: 'm16' }];
  const o = marbleBoard.options(pieces, 'me', dice(2, 2))[0];
  assert.deepEqual(o.path.slice(-2), ['m20', 'm30']);
  assert.ok(o.warp);
});

test('주사위판: 더블이면 한 번 더', () => {
  const r = round('marble');
  throwYut(r, rngAlways(0.2)); // 두 주사위 모두 2
  assert.ok(r.pending.roll.double);
  assert.equal(r.extra, 1);
});

test('주사위판: 축제 칸은 배수 +3, 보물섬은 칩 +30·엽전 +2', () => {
  const r = round('marble');
  r.pieces[0].node = 'm7';
  give(r, dice(1, 2));
  const fest = legalMoves(r).find((m) => m.kind === 'stack');
  assert.equal(fest.preview.dest, 'm10');
  assert.equal(fest.preview.score.mult, 1 + 3);
  r.pieces[0].node = 'm27';
  const island = legalMoves(r).find((m) => m.kind === 'stack');
  assert.equal(island.preview.dest, 'm30');
  assert.equal(island.preview.score.chips, 18 + 30);
  applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'stack'), rngAlways(0.99));
  assert.equal(r.coins, 2);
});

test('주사위판: 함정은 흥을 끈다, 황금열쇠는 카드를 뽑는다', () => {
  const r = round('marble');
  r.heung = 3;
  r.pieces[0].node = 'm13';
  give(r, dice(1, 1)); // m15 함정
  r.pending.granted = 0;
  const ev = applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'stack'), rngAlways(0.99));
  assert.ok(ev.some((e) => e.type === 'heungLost'));
  assert.equal(r.heung, 0);

  const r2 = round('marble');
  r2.pieces[0].node = 'm3';
  give(r2, dice(1, 1)); // m5 황금열쇠
  const ev2 = applyMove(r2, legalMoves(r2).findIndex((m) => m.kind === 'stack'), rngAlways(0.0));
  const card = ev2.find((e) => e.type === 'keyCard');
  assert.ok(card);
  assert.equal(card.card.id, KEY_CARDS[0].id);
  assert.equal(r2.score, card.score);
});

// ── 체스판 ──

test('체스판은 8×10 = 80칸, 기물 6종 균등', () => {
  assert.equal(chessBoard.nodes.length, 80);
  assert.equal(chessBoard.rollsFor().length, 6);
});

test('체스판: 새 말은 내 맨 아랫줄 가운데로 들어온다', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: START }];
  const o = chessBoard.options(pieces, 'me', face('pawn'));
  assert.deepEqual(o[0].path, ['k39']);
});

test('체스판: 폰은 앞·대각선 앞 1칸, 내 말은 위로 간다', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: 'k35' }];
  const dests = chessBoard.options(pieces, 'me', face('pawn')).map((o) => o.path.at(-1)).sort();
  assert.deepEqual(dests, ['k24', 'k34', 'k44']);
});

test('체스판: 나이트는 말을 뛰어넘는다, 룩은 말 앞에서 멈춘다', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: 'k35' }, { id: 'd0', owner: 'opp', node: 'k34' }];
  const knight = chessBoard.options(pieces, 'me', face('knight')).map((o) => o.path.at(-1));
  assert.ok(knight.includes('k23') && knight.includes('k43'));
  const rook = chessBoard.options(pieces, 'me', face('rook')).filter((o) => Number(o.path.at(-1)[1]) === 3).map((o) => o.path.at(-1));
  assert.deepEqual(rook, ['k34']); // 바로 앞 도깨비를 잡고 멈춘다, 그 너머는 못 간다
});

test('체스판: 맨 윗줄에 닿으면 골인, 도깨비는 아래로 간다', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: 'k31' }, { id: 'd0', owner: 'opp', node: 'k48' }];
  assert.ok(chessBoard.options(pieces, 'me', face('pawn')).every((o) => o.path.at(-1) === HOME));
  assert.ok(chessBoard.options(pieces, 'opp', face('pawn')).every((o) => o.path.at(-1) === HOME));
});

test('체스판: 퀸이 나오면 한 번 더, 대각선 이동은 지름길 부적 대상', () => {
  const pieces = [{ id: 'm0', owner: 'me', node: 'k35' }];
  const q = face('queen');
  assert.ok(q.bonus);
  assert.ok(chessBoard.options(pieces, 'me', face('bishop')).every((o) => o.diagonal));
});

test('체스판 위험도: 도깨비가 폰으로 닿는 칸', () => {
  const r = round('chess');
  r.pieces.find((p) => p.id === 'd0').node = 'k32';
  r.pieces.find((p) => p.id === 'd1').node = HOME;
  assert.ok(dangerAt(r, 'k33') > 0);
  assert.equal(dangerAt(r, 'k31'), 0); // 도깨비는 뒤(위)로 못 간다
});

// ── 모든 판 공통 ──

for (const id of Object.keys(BOARDS)) {
  test(`${id}: 라운드는 반드시 끝난다 (500판)`, () => {
    for (let s = 0; s < 500; s++) {
      const run = createRun(s);
      const r = createRound({ number: 1, target: 800, throws: 7, rerolls: 2, myPieces: 4, oppPieces: 3, charms: [], tiles: {}, pFlat: 0.55, boss: null, board: id });
      let guard = 0;
      while (r.phase !== 'over' && guard++ < 600) {
        if (r.phase === 'throw') throwYut(r, run.rng); else applyMove(r, 0, run.rng);
      }
      assert.equal(r.phase, 'over', `${id} seed ${s}`);
    }
  });
}

test('런은 윷판 → 주사위판 → 체스판, 판마다 두 번째 라운드가 보스', () => {
  assert.deepEqual(ROUNDS.map((r) => r.board), ['yut', 'yut', 'marble', 'marble', 'chess', 'chess']);
  assert.deepEqual(ROUNDS.map((r) => !!r.boss), [false, true, false, true, false, true]);
});

test('칸 개조는 다음 라운드의 판에 놓인다', () => {
  const run = createRun(9);
  run.roundNo = 2;
  startRound(run);
  Object.assign(run.round, { phase: 'over', outcome: 'win', throwsLeft: 0 });
  settleRound(run);
  run.coins = 99;
  const i = run.shop.offers.findIndex((o) => o.kind === 'tile');
  const res = buy(run, i);
  assert.equal(res.board, 'marble');
  assert.ok(run.tiles.marble[res.node]);
  assert.ok(!marbleBoard.tile(res.node));
});

// ── 원정대 능력 ──
import { HEROES, heroOf } from '../src/core/heroes.js';
import { scoreMove } from '../src/core/round.js';

test('원정대: m0 호랑이 · m1 토끼 · m2 앵무새 · m3 판다', () => {
  assert.deepEqual(['m0', 'm1', 'm2', 'm3'].map((id) => heroOf(id).id), ['tiger', 'rabbit', 'parrot', 'panda']);
  assert.equal(heroOf('d0'), null);
  assert.equal(HEROES.length, 4);
});

test('호랑이가 잡으면 배수 ×2, 다른 말이 잡으면 그대로', () => {
  const r = round('yut');
  const base = { roll: { chips: 30, label: '걸' }, tier: 3, stack: 1, captured: 1, homed: 0, waiting: 0, onDiagonal: false, tile: null, heung: 0, groupHeroes: [] };
  assert.equal(scoreMove(r, { ...base, heroes: ['tiger'] }).mult, (1 + 1) * 2);
  assert.equal(scoreMove(r, { ...base, heroes: ['rabbit'] }).mult, 1 + 1);
});

test('앵무새는 움직일 때마다 칩 +15, 판다가 낀 묶음은 업기 배수 두 배', () => {
  const r = round('yut');
  const base = { roll: { chips: 30, label: '걸' }, tier: 3, stack: 3, captured: 0, homed: 0, waiting: 0, onDiagonal: false, tile: null, heung: 0 };
  assert.equal(scoreMove(r, { ...base, heroes: ['parrot'], groupHeroes: ['parrot', 'tiger', 'rabbit'] }).chips, 30 + 15);
  assert.equal(scoreMove(r, { ...base, heroes: ['tiger'], groupHeroes: ['tiger', 'panda', 'rabbit'] }).mult, 1 + 2 + 2);
});

test('토끼의 꾀: 라운드에 한 번, 잡으러 온 도깨비가 출발로 돌아간다', () => {
  const r = round('marble');
  const rabbit = r.pieces.find((p) => p.id === 'm1');
  rabbit.node = 'm6';
  const d0 = r.pieces.find((p) => p.id === 'd0');
  d0.node = 'm4';
  r.pieces.find((p) => p.id === 'd1').node = HOME;
  r.pieces[0].node = 'm8';
  r.throwsLeft = 3;
  give(r, dice(1, 2));
  // 도깨비가 1+1 을 굴려 토끼 칸(m6)에 오게: 첫 두 굴림 0.0 → 1,1
  const seq = [0.0, 0.0, 0.4, 0.6, 0.99]; // 1·1(더블) → 토끼 칸, 다음은 3·4
  let i = 0;
  const ev = applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'stack' && m.from === 'm8'), { next: () => seq[Math.min(i++, seq.length - 1)] });
  const esc = ev.find((e) => e.type === 'escape');
  assert.ok(esc, JSON.stringify(ev.map((e) => e.type)));
  assert.equal(rabbit.node, 'm6');
  assert.deepEqual(esc.attackerIds, ['d0']);
  assert.ok(r.escapeUsed);
});

test('토끼가 낀 묶음은 꾀가 남아 있는 동안 위험도 0', () => {
  const r = round('yut');
  r.pieces[1].node = 'o3'; r.pieces[1].prev = 'o2'; // 토끼
  r.pieces.find((p) => p.id === 'd0').node = 'o1';
  give(r, { value: 1, tier: 1, label: '도', faces: [], bonus: false, chips: 10, back: false });
  const m = legalMoves(r).find((x) => x.kind === 'stack');
  assert.equal(m.preview.danger, 0);
  r.escapeUsed = true;
  assert.ok(legalMoves(r).find((x) => x.kind === 'stack').preview.danger > 0);
});

test('앵무새가 주운 보따리는 엽전 두 배', () => {
  const r = round('yut');
  r.treasures = [{ node: 'o2', ttl: 3 }];
  const parrot = r.pieces.find((p) => p.id === 'm2');
  parrot.node = 'o1';
  parrot.prev = 'o0';
  give(r, { value: 1, tier: 1, label: '도', faces: [], bonus: false, chips: 10, back: false });
  applyMove(r, legalMoves(r).findIndex((m) => m.kind === 'stack'), rngAlways(0.99));
  assert.equal(r.coins, 4);
});

// ── 돌발 사건 · 판 하나만 하기 ──
import { EVENTS, planEvents } from '../src/core/events.js';
import { nextEventIn } from '../src/core/round.js';
import { BOARD_RUNS } from '../src/core/run.js';
import { createRng } from '../src/core/rng.js';

test('사건 계획: 라운드마다 서로 다른 사건 2개, 첫 두 번과 마지막 한 번은 비운다', () => {
  for (let s = 1; s <= 200; s++) {
    const plan = planEvents(createRng(s), 7);
    assert.equal(plan.length, 2);
    assert.notEqual(plan[0].id, plan[1].id);
    assert.ok(plan[0].at > plan[1].at);
    for (const p of plan) { assert.ok(p.at >= 2 && p.at <= 5); assert.ok(EVENTS.some((e) => e.id === p.id)); }
  }
});

/** 도 한 번 두고 도깨비 차례가 끝난 직후의 이벤트 목록 */
function afterOneMove(r) {
  r.throwsLeft -= 1;
  give(r, { value: 1, tier: 1, label: '도', faces: [], bonus: false, chips: 10, back: false });
  return applyMove(r, 0, createRng(3));
}

test('순풍: 예정된 차례가 오면 던질 기회 +1, 사건은 한 번만', () => {
  const r = round('yut', { events: [{ at: 6, id: 'tailwind' }] });
  assert.equal(nextEventIn(r), 1);
  const ev = afterOneMove(r);
  assert.ok(ev.some((e) => e.type === 'event' && e.id === 'tailwind'));
  assert.equal(r.throwsLeft, 7);
  assert.equal(nextEventIn(r), null);
  assert.ok(!afterOneMove(r).some((e) => e.type === 'event'));
});

test('보따리 소나기는 빈 칸에 보따리 3개, 황금 칸은 이번 라운드 칸에만', () => {
  const r = round('marble', { events: [{ at: 6, id: 'treasureRain' }, { at: 5, id: 'goldRush' }] });
  afterOneMove(r);
  assert.ok(r.treasures.length >= 3);
  afterOneMove(r);
  const golds = Object.values(r.tiles).filter((t) => t === 'gold');
  assert.equal(golds.length, 2);
});

test('회오리바람: 판 위 도깨비가 모두 출발로', () => {
  const r = round('yut', { events: [{ at: 6, id: 'gust' }] });
  r.pieces.find((p) => p.id === 'd0').node = 'o9';
  const ev = afterOneMove(r);
  const gust = ev.find((e) => e.type === 'gust');
  assert.ok(gust);
  assert.ok(r.pieces.filter((p) => p.owner === 'opp').every((p) => p.node === START || p.node === HOME || !gust.pieceIds.includes(p.id)));
});

test('판 하나만: 그 판의 두 라운드로 끝나고 두 번째가 보스', () => {
  for (const id of Object.keys(BOARD_RUNS)) {
    const run = createRun(5, { board: id });
    assert.equal(run.rounds.length, 2);
    assert.ok(run.rounds.every((x) => x.board === id));
    assert.ok(run.rounds[1].boss && run.rounds[1].target > run.rounds[0].target);
    run.roundNo = 2;
    startRound(run);
    Object.assign(run.round, { phase: 'over', outcome: 'win', score: 99999 });
    settleRound(run);
    assert.equal(run.status, 'won');
  }
});
