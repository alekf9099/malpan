import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRun, startRound, settleRound, buy, sellCharm, moveCharm, DAYS, DAILY, closedLineFor, dailySeed } from '../src/core/run.js';
import { roundPoints, rankOf } from '../src/core/ranking.js';

const win = (run, extra = {}) => { Object.assign(run.round, { phase: 'over', outcome: 'win', score: run.round.target, ...extra }); return settleRound(run); };

test('원정은 월~금 5일, 수·금이 보스 날이고 금요일은 운행 중지', () => {
  assert.deepEqual(DAYS.map((d) => d.day), ['월', '화', '수', '목', '금']);
  assert.deepEqual(DAYS.map((d) => !!d.boss), [false, false, true, false, true]);
  for (let i = 1; i < DAYS.length; i++) assert.ok(DAYS[i].target > DAYS[i - 1].target);
  const run = createRun(13);
  run.roundNo = 5;
  startRound(run);
  assert.equal(run.round.boss.id, 'closure');
  assert.equal(run.round.boardInst.closed, closedLineFor(run, 5));
  run.roundNo = 3;
  startRound(run);
  assert.ok(run.round.boss && run.round.boss.id !== 'closure');
});

test('같은 원정·같은 날이면 같은 노선도', () => {
  const a = createRun(31); startRound(a);
  const b = createRun(31); startRound(b);
  assert.deepEqual(a.round.boardInst.edges, b.round.boardInst.edges);
});

test('오늘의 노선: 하루짜리, 날짜 시드', () => {
  const run = createRun(dailySeed(new Date(2026, 9, 27)), { daily: true });
  assert.equal(run.rounds, DAILY);
  assert.equal(run.seed, 20261027);
  startRound(run);
  win(run);
  assert.equal(run.status, 'won');
});

test('하루를 마치면 토큰 정산: 기본 4 + 남은 운행 1시간당 1 + 이자, 매점이 열린다', () => {
  const run = createRun(1);
  startRound(run);
  run.coins = 10;
  run.round.clock = run.round.end - 3 * 60 - 10;
  win(run);
  assert.equal(run.coins, 10 + 4 + 3 + 2);
  assert.equal(run.status, 'shop');
  assert.equal(run.shop.offers.length, 5); // 정기권 3 + 역 개조 1 + 노선 연장권 1
});

test('매점: 사고, 팔고, 순서 바꾸기, 노선 연장권·역 개조는 다음 날에', () => {
  const run = createRun(3);
  startRound(run);
  win(run);
  run.coins = 99;
  for (let i = 0; i < run.shop.offers.length; i++) buy(run, i);
  assert.equal(run.charms.length, 3);
  assert.equal(run.extraLines, 1);
  assert.equal(Object.keys(run.tiles.metro).length, 1);
  const [a, b] = run.charms;
  moveCharm(run, 0, 1);
  assert.deepEqual(run.charms.slice(0, 2), [b, a]);
  const coins = run.coins;
  sellCharm(run, 0);
  assert.ok(run.coins > coins);
  run.roundNo = 2;
  startRound(run);
  assert.equal(run.extraLines, 0);
  assert.equal(Object.keys(run.round.tiles).length, 1);
});

test('지면 원정이 끝난다', () => {
  const run = createRun(4);
  startRound(run);
  Object.assign(run.round, { phase: 'over', outcome: 'lose' });
  assert.equal(settleRound(run), null);
  assert.equal(run.status, 'lost');
});

test('승점: 승리 10 · 보스 +10 · 목표 초과 10%마다 +1(최대 10) · 남은 운행 1시간 ×2', () => {
  assert.equal(roundPoints({ score: 400, target: 400, minutesLeft: 0, boss: false }), 10);
  assert.equal(roundPoints({ score: 500, target: 400, minutesLeft: 130, boss: true }), 10 + 10 + 2 + 4);
  assert.equal(roundPoints({ score: 4000, target: 400, minutesLeft: 0 }), 20);
  assert.equal(rankOf(0).name, '수습 역무원');
  assert.equal(rankOf(600).next.name, '역장');
});

test('승점은 하루를 이길 때 쌓이고, 오늘의 노선은 절반, 완주하면 보너스', () => {
  const full = createRun(4);
  startRound(full);
  full.round.clock = full.round.end - 70;
  win(full);
  assert.equal(full.points, 12);
  const daily = createRun(4, { daily: true });
  startRound(daily);
  daily.round.clock = daily.round.end;
  win(daily);
  assert.equal(daily.points, Math.ceil(10 / 2) + 50);
});
