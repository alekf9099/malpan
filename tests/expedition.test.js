import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, tollFor, priceFor, upgradeFor, current, areaOf, buyable, CLOCK, START_MONEY } from '../src/core/match.js';
import { aiSteps } from '../src/core/lockstep.js';
import {
  newRun, stagePlan, stageMatch, finishStage, pickRelic, offerRelics, equip, tally, freshStats, bonusDone, stageWon, runReward,
  RUN_STAGES, RUN_LIVES, RELICS, REWARD
} from '../src/core/expedition.js';
import { stationPrice } from '../src/core/estate.js';

const run0 = () => newRun({ seed: 99, hero: 'driver', board: 'loop' });

test('원정 유물: 능력값은 캐릭터 값에 더해지고(통행료 · 사는 값 · 증축), 시작 효과는 판을 열 때 한 번', () => {
  const m = createMatch({ seed: 3, heroes: ['driver', 'staff'], humans: 1, region: 'loop' });
  const [me, rival] = m.players;
  const n = areaOf(m).stations.find((x) => buyable(x, m));
  m.owned[n] = me.id; m.levels[n] = 1;
  const before = tollFor(m, n, rival), price = priceFor(m, n, me), build = upgradeFor(m, n, me);
  equip(m, me, ['toll', 'buy', 'build', 'cash', 'coupon', 'battery', 'spark']);
  assert.equal(tollFor(m, n, rival), Math.round(before * 1.25));
  assert.equal(priceFor(m, n, me), Math.round(stationPrice(n) * 0.75));
  assert.ok(price > priceFor(m, n, me));
  assert.ok(upgradeFor(m, n, me) < build);
  assert.equal(me.money, START_MONEY + 300);
  assert.equal(me.coupon, true);
  assert.equal(me.charge, me.cost);
  // 내가 내는 쪽: 정기권은 상대 역 통행료를 깎는다(유물을 다시 끼우면 그 묶음으로 바뀐다)
  m.owned[n] = rival.id;
  const pay = tollFor(m, n, me);
  equip(m, me, ['shield']);
  assert.ok(pay > 0);
  assert.equal(tollFor(m, n, me), Math.round(pay * 0.75));
});

test('원정 스테이지: 같은 원정 · 같은 시도면 같은 판, 다시 하면 새 판 · 상대 수 · 짧은 시계 · 보스', () => {
  const run = run0();
  assert.deepEqual(stagePlan(run), stagePlan(run));
  const m = stageMatch(run);
  assert.equal(m.players.length, 1 + RUN_STAGES[0].rivals);
  assert.equal(m.end, CLOCK.start + RUN_STAGES[0].rounds * m.roundMin);
  assert.equal(m.players[1].money, START_MONEY + RUN_STAGES[0].cash);
  const again = { ...run, tries: 1 };
  assert.notEqual(stagePlan(again).seed, stagePlan(run).seed);
  const last = { ...run, stage: RUN_STAGES.length - 1 };
  const bm = stageMatch(last);
  const boss = RUN_STAGES.at(-1).boss;
  assert.equal(bm.players[1].boss, true);
  assert.equal(bm.players[1].relics.length, boss.relics);
  assert.equal(bm.players[1].money, START_MONEY + RUN_STAGES.at(-1).cash + boss.cash + (bm.players[1].relics.includes('cash') ? 300 : 0));
  assert.ok(bm.run.last);
});

test('원정 진행: 이기면 다음 스테이지 + 유물 3장(보너스면 4장) · 지면 목숨 -1 같은 스테이지 · 목숨이 다하면 끝', () => {
  let run = finishStage(run0(), { won: true, bonus: false });
  assert.equal(run.stage, 1);
  assert.equal(run.offer.length, 3);
  assert.equal(new Set(run.offer).size, 3);
  run = pickRelic(run, 'nope');
  assert.equal(run.relics.length, 0);
  const got = run.offer[0];
  run = pickRelic(run, got);
  assert.deepEqual(run.relics, [got]);
  assert.equal(run.offer, null);
  run = finishStage(run, { won: true, bonus: true });
  assert.equal(run.offer.length, 4);
  assert.ok(!run.offer.includes(got));
  run = pickRelic(run, run.offer[1]);
  for (let i = 0; i < RUN_LIVES - 1; i++) { run = finishStage(run, { won: false }); assert.equal(run.stage, 2); assert.equal(run.over, false); }
  run = finishStage(run, { won: false });
  assert.equal(run.over, true);
  assert.equal(run.won, false);
  assert.equal(runReward(run), 2 * REWARD.stage + REWARD.bonus);
});

test('원정 완주: 마지막 스테이지를 이기면 끝 · 완주 보상', () => {
  let run = { ...run0(), stage: RUN_STAGES.length - 1 };
  run = finishStage(run, { won: true, bonus: false });
  assert.equal(run.over, true);
  assert.equal(run.won, true);
  assert.equal(run.offer, null);
  assert.equal(runReward(run), RUN_STAGES.length * REWARD.stage + REWARD.clear);
});

test('원정 유물 후보: 이미 가진 것은 안 나오고, 다 가지면 남은 만큼만', () => {
  const all = RELICS.map((r) => r.id);
  const run = { ...run0(), relics: all.slice(0, all.length - 2) };
  assert.deepEqual(offerRelics(run, 3).sort(), all.slice(-2).sort());
});

test('원정 보너스 목표 · 판 기록: 내 행동만 세고, 받은 통행료는 금액으로', () => {
  const s = freshStats();
  tally(s, { type: 'buy', player: 'p0' }, 'p0');
  tally(s, { type: 'buy', player: 'p1' }, 'p0');
  tally(s, { type: 'upgrade', player: 'p0', level: 3 }, 'p0');
  tally(s, { type: 'pay', player: 'p1', to: 'p0', amount: 450, why: 'toll' }, 'p0');
  assert.equal(s.buy, 1);
  assert.equal(s.landmark, 1);
  assert.ok(bonusDone('toll', s));
  assert.ok(bonusDone('landmark', s));
  assert.ok(!bonusDone('buy', s));
});

test('원정 스테이지 판은 AI 끼리 두어도 끝나고, 1등이면 이긴 것', () => {
  for (let k = 0; k < 6; k++) {
    const run = { ...newRun({ seed: 500 + k, hero: 'staff', board: k % 2 ? 'map' : 'loop' }), stage: k % RUN_STAGES.length };
    const m = stageMatch(run);
    for (let guard = 0; m.phase !== 'over' && guard < 5000; guard++) for (const _ of aiSteps(m));
    assert.equal(m.phase, 'over');
    assert.equal(stageWon(m), m.players[0].place === 1 && !m.players[0].out);
    assert.ok(current(m));
  }
});
