// 밸런스 시뮬레이터: AI 끼리 N 판을 겨뤄 본다.
//   node tools/sim.mjs [판 수=500] [인원=4] [시작 시드=1]
// 본다: 판이 어떻게 끝나나(파산 · 막차 · 독점), 몇 바퀴 도나, 캐릭터별 1등 비율, 끝날 때 자산·가진 역, 거래 횟수

import { createMatch, roll, move, decide, choose, useSkill, invest, assets, stationsOf } from '../src/core/match.js';
import { choosePath, decideOffer, wantsSkill, chooseInvest, chooseOption } from '../src/core/ai.js';
import { HEROES } from '../src/core/heroes.js';

const N = Number(process.argv[2] || 500);
const SIZE = Number(process.argv[3] || 4);
const seed0 = Number(process.argv[4] || 1);
const ids = HEROES.map((h) => h.id);

const stat = { plays: {}, bankrupt: 0, lastTrain: 0, monopoly: 0, monoHot: 0, monoLine: 0, warns: 0, hot: 0, warps: 0, hotBuys: 0, onRival: 0, rounds: 0, wins: {}, someOut: 0, outs: 0, buys: 0, ups: 0, takes: 0, tolls: 0, tollSum: 0, pass: 0, passSum: 0, maxToll: 0, endAssets: 0, endStations: 0, goals: 0, alive: 0 };
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
    else if (m.phase === 'choose') ev = choose(m, chooseOption(m));
    else ev = decide(m, decideOffer(m));
    for (const e of ev) {
      if (e.type === 'buy') stat.buys++;
      if (e.type === 'upgrade' && !e.free) stat.ups++;
      if (e.type === 'takeover') stat.takes++;
      if (e.type === 'pay' && e.why === 'toll') { stat.tolls++; stat.tollSum += e.amount; stat.maxToll = Math.max(stat.maxToll, e.amount); }
      if (e.type === 'pay' && e.why === 'pass') { stat.pass++; stat.passSum += e.amount; }
      if (e.type === 'goal') stat.goals++;
      if (e.type === 'hotspot') stat.hot++;
      if (e.type === 'warp') stat.warps++;
      if (e.type === 'monoWarn') stat.warns++;
      if (e.type === 'monopoly') stat[e.kind === 'hot' ? 'monoHot' : 'monoLine']++;
      if (e.type === 'buy' && ['서울역', '김포공항', '고속터미널', '홍대입구', '명동', '잠실', '여의도', '강남', '동대문역사문화공원', '이태원', '성수'].includes(e.node)) stat.hotBuys++;
      if (e.type === 'pay' && (e.why === 'toll' || e.why === 'pass')) stat.onRival++;
    }
  }
  if (m.phase !== 'over') throw new Error('끝나지 않은 판 ' + (seed0 + k));
  stat[m.reason]++;
  stat.rounds += m.round;
  stat.wins[m.ranking[0].hero] = (stat.wins[m.ranking[0].hero] || 0) + 1;
  for (const h of heroes) stat.plays[h] = (stat.plays[h] || 0) + 1;
  const outs = m.players.filter((p) => p.out).length;
  stat.outs += outs;
  stat.someOut += outs ? 1 : 0;
  for (const p of m.players) if (!p.out) { stat.alive++; stat.endAssets += assets(m, p); stat.endStations += stationsOf(m, p).length; }
}
const pct = (a) => (100 * a / N).toFixed(1) + '%';
console.log(`${N}판 · ${SIZE}명`);
console.log(`끝: 파산으로 ${pct(stat.bankrupt)} · 막차로 ${pct(stat.lastTrain)} · 독점으로 ${pct(stat.monopoly)}(명소 ${stat.monoHot} · 노선 ${stat.monoLine}) · 누군가 파산한 판 ${pct(stat.someOut)}(판당 ${(stat.outs / N).toFixed(2)}명) · 평균 ${(stat.rounds / N).toFixed(1)}바퀴`);
// 캐릭터마다 나온 판 중 1등 한 비율(고르게 강하면 1/인원)
console.log(`1등(나온 판 기준, 기준 ${(100 / SIZE).toFixed(0)}%):`, ids.filter((id) => stat.plays[id]).map((id) => `${id} ${(100 * (stat.wins[id] || 0) / stat.plays[id]).toFixed(1)}%`).join(' · '));
console.log(`한 판 평균: 사기 ${(stat.buys / N).toFixed(1)} · 증축 ${(stat.ups / N).toFixed(1)} · 인수 ${(stat.takes / N).toFixed(1)} · 통행료 ${(stat.tolls / N).toFixed(1)}번(평균 ${Math.round(stat.tollSum / Math.max(1, stat.tolls))}, 최대 ${stat.maxToll}) · 통과 요금 ${(stat.pass / N).toFixed(1)}번(평균 ${Math.round(stat.passSum / Math.max(1, stat.pass))}) · 목적지 ${(stat.goals / N).toFixed(1)}번`);
console.log(`명소역: 서기 ${(stat.hot / N).toFixed(1)}번 · KTX ${(stat.warps / N).toFixed(1)}번 · 사기 ${(stat.hotBuys / N).toFixed(1)}곳 · 독점 경고 ${(stat.warns / N).toFixed(2)}번`);
console.log(`끝날 때 남은 사람 평균 자산 ${Math.round(stat.endAssets / Math.max(1, stat.alive))} · 역 ${(stat.endStations / Math.max(1, stat.alive)).toFixed(1)}곳`);
