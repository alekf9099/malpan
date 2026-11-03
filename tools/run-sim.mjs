// 원정 모드 시뮬레이터: 나도 AI 로 두고 원정을 N 번 끝까지 돌려 본다.
//   node tools/run-sim.mjs [원정 수=300] [판=loop|korea|world|map] [시작 시드=1]
// 본다: 스테이지마다 통과율(시도 기준) · 어디까지 가나 · 완주율 · 보너스 목표 달성률 · 유물이 몇 개 쌓이나

import { aiSteps } from '../src/core/lockstep.js';
import { newRun, stagePlan, stageMatch, finishStage, pickRelic, tally, freshStats, bonusDone, stageWon, RUN_STAGES, runReward } from '../src/core/expedition.js';
import { HEROES } from '../src/core/heroes.js';

const N = Number(process.argv[2] || 300);
const BOARD = process.argv[3] || 'loop';
const seed0 = Number(process.argv[4] || 1);

/** 스테이지 판 하나를 끝까지(내가 파산하면 바로 멈춘다) → { won, bonus } */
export function playStage(run) {
  const plan = stagePlan(run);
  const m = stageMatch(run, plan);
  const stats = freshStats();
  for (let guard = 0; m.phase !== 'over' && !m.players[0].out && guard < 5000; guard++) {
    for (const step of aiSteps(m)) for (const e of step.events || []) tally(stats, e, 'p0');
  }
  return { won: stageWon(m), bonus: bonusDone(plan.bonus, stats) };
}

const tries = RUN_STAGES.map(() => 0), wins = RUN_STAGES.map(() => 0), bonus = RUN_STAGES.map(() => 0);
let clears = 0, reached = 0, reward = 0, relics = 0;
for (let k = 0; k < N; k++) {
  const hero = HEROES[k % HEROES.length].id;
  let run = newRun({ seed: seed0 + k * 7919, hero, board: BOARD });
  while (!run.over) {
    const at = run.stage;
    const r = playStage(run);
    tries[at]++;
    if (r.won) { wins[at]++; if (r.bonus) bonus[at]++; }
    run = finishStage(run, r);
    if (run.offer) run = pickRelic(run, run.offer[0]);
  }
  if (run.won) clears++;
  reached += run.stage;
  reward += runReward(run);
  relics += run.relics.length;
}

console.log(`원정 ${N}번 · ${BOARD} 판`);
RUN_STAGES.forEach((st, i) => console.log(`  ${i + 1}. ${st.name.padEnd(6)} 상대 ${st.rivals} · ${st.rounds}바퀴 — 통과 ${tries[i] ? ((wins[i] / tries[i]) * 100).toFixed(0) : '-'}% (${wins[i]}/${tries[i]}) · 보너스 ${wins[i] ? ((bonus[i] / wins[i]) * 100).toFixed(0) : '-'}%`));
console.log(`완주 ${((clears / N) * 100).toFixed(1)}% · 평균 ${(reached / N).toFixed(2)} 스테이지 통과 · 유물 평균 ${(relics / N).toFixed(1)}개 · 보상 평균 ${(reward / N).toFixed(0)}장`);
