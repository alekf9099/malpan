// 밸런스 시뮬레이터: AI 끼리 N 판을 겨뤄 본다.
//   node tools/sim.mjs [판 수=500] [인원=4] [시작 시드=1]
// 본다: 판이 어떻게 끝나나(파산 · 막차), 몇 바퀴 도나, 캐릭터별 1등 비율, 끝날 때 자산·가진 역, 거래 횟수

import { createMatch, roll, move, decide, useSkill, invest, assets, stationsOf } from '../src/core/match.js';
import { choosePath, decideOffer, wantsSkill, chooseInvest } from '../src/core/ai.js';
import { HEROES } from '../src/core/heroes.js';

const N = Number(process.argv[2] || 500);
const SIZE = Number(process.argv[3] || 4);
const seed0 = Number(process.argv[4] || 1);
const ids = HEROES.map((h) => h.id);

const stat = { bankrupt: 0, lastTrain: 0, rounds: 0, wins: {}, someOut: 0, outs: 0, buys: 0, ups: 0, takes: 0, tolls: 0, tollSum: 0, pass: 0, passSum: 0, maxToll: 0, endAssets: 0, endStations: 0, goals: 0, alive: 0 };
for (let k = 0; k < N; k++) {
  // 자리마다 캐릭터를 돌려 가며(첫 자리 이득이 한 캐릭터에 쏠리지 않게)
  const heroes = Array.from({ length: SIZE }, (_, i) => ids[(i + k) % ids.length]);
  const m = createMatch({ seed: seed0 + k, heroes, humans: 0 });
  let guard = 0;
  while (m.phase !== 'over' && guard++ < 6000) {
    let ev;
    if (m.phase === 'roll') {
      ev = [];
      for (let n = chooseInvest(m); n; n = chooseInvest(m)) ev.push(...invest(m, n));
      if (wantsSkill(m)) useSkill(m);
      ev.push(...roll(m));
    }
    else if (m.phase === 'move') ev = move(m, choosePath(m));
    else ev = decide(m, decideOffer(m));
    for (const e of ev) {
      if (e.type === 'buy') stat.buys++;
      if (e.type === 'upgrade' && !e.free) stat.ups++;
      if (e.type === 'takeover') stat.takes++;
      if (e.type === 'pay' && e.why === 'toll') { stat.tolls++; stat.tollSum += e.amount; stat.maxToll = Math.max(stat.maxToll, e.amount); }
      if (e.type === 'pay' && e.why === 'pass') { stat.pass++; stat.passSum += e.amount; }
      if (e.type === 'goal') stat.goals++;
    }
  }
  if (m.phase !== 'over') throw new Error('끝나지 않은 판 ' + (seed0 + k));
  stat[m.reason]++;
  stat.rounds += m.round;
  stat.wins[m.ranking[0].hero] = (stat.wins[m.ranking[0].hero] || 0) + 1;
  const outs = m.players.filter((p) => p.out).length;
  stat.outs += outs;
  stat.someOut += outs ? 1 : 0;
  for (const p of m.players) if (!p.out) { stat.alive++; stat.endAssets += assets(m, p); stat.endStations += stationsOf(m, p).length; }
}
const pct = (a) => (100 * a / N).toFixed(1) + '%';
console.log(`${N}판 · ${SIZE}명`);
console.log(`끝: 파산으로 ${pct(stat.bankrupt)} · 막차로 ${pct(stat.lastTrain)} · 누군가 파산한 판 ${pct(stat.someOut)}(판당 ${(stat.outs / N).toFixed(2)}명) · 평균 ${(stat.rounds / N).toFixed(1)}바퀴`);
console.log('1등:', ids.map((id) => `${id} ${(100 * (stat.wins[id] || 0) / N).toFixed(1)}%`).join(' · '));
console.log(`한 판 평균: 사기 ${(stat.buys / N).toFixed(1)} · 증축 ${(stat.ups / N).toFixed(1)} · 인수 ${(stat.takes / N).toFixed(1)} · 통행료 ${(stat.tolls / N).toFixed(1)}번(평균 ${Math.round(stat.tollSum / Math.max(1, stat.tolls))}, 최대 ${stat.maxToll}) · 통과 요금 ${(stat.pass / N).toFixed(1)}번(평균 ${Math.round(stat.passSum / Math.max(1, stat.pass))}) · 목적지 ${(stat.goals / N).toFixed(1)}번`);
console.log(`끝날 때 남은 사람 평균 자산 ${Math.round(stat.endAssets / Math.max(1, stat.alive))} · 역 ${(stat.endStations / Math.max(1, stat.alive)).toFixed(1)}곳`);
