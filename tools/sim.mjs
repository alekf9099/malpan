// 밸런스 시뮬레이터: 정책별로 N 런을 돌려 라운드별 통과율과 클리어율을 본다.
//   node tools/sim.mjs [런 수=2000] [시작 시드=1] [판 하나만: yut|marble|chess]
//
// 정책
//   random  아무 수나 둔다. 상점은 안 쓴다
//   greedy  예상 점수가 가장 큰 수. 다시 던지기는 도·빽도일 때. 상점은 안 쓴다
//   shopper greedy + 상점에서 살 수 있는 부적 중 가장 비싼 것부터 산다(부적 순서는 ×2 를 맨 뒤로)
//   careful shopper 와 같되, 잡힐 위험이 큰 칸은 점수를 깎아 본다(위험 표시가 쓸모 있는 정보인지 확인용)

import { createRun, startRound, settleRound, nextRound, buy, ROUNDS as ALL_ROUNDS, BOARD_RUNS } from '../src/core/run.js';
import { throwYut, applyMove, reroll, legalMoves } from '../src/core/round.js';
import { charmById } from '../src/core/items.js';

const runs = Number(process.argv[2] || 2000);
const seed0 = Number(process.argv[3] || 1);
const only = process.argv[4] || null;
const ROUNDS = only ? BOARD_RUNS[only] : ALL_ROUNDS;

const policies = {
  random(r, rng) { return rng.int(legalMoves(r).length); },
  greedy(r) {
    const moves = legalMoves(r);
    let best = 0;
    moves.forEach((m, i) => { if (m.preview.score.total > moves[best].preview.score.total) best = i; });
    return best;
  },
  careful(r) {
    const moves = legalMoves(r);
    const v = (m) => m.preview.score.total - m.preview.danger * (40 + 30 * r.heung) * m.preview.stack;
    let best = 0;
    moves.forEach((m, i) => { if (v(m) > v(moves[best])) best = i; });
    return best;
  }
};

function playRound(run, policy) {
  const r = run.round;
  let guard = 0;
  while (r.phase !== 'over' && guard++ < 500) {
    if (r.phase === 'throw') { throwYut(r, run.rng); continue; }
    const tier = r.pending.roll.tier;
    if (policy !== 'random' && r.rerolls > 0 && tier <= 1) { reroll(r, run.rng); continue; }
    const pick = policy === 'random' ? 'random' : policy === 'careful' ? 'careful' : 'greedy';
    applyMove(r, policies[pick](r, run.rng), run.rng);
  }
}

function shop(run) {
  const order = run.shop.offers
    .map((o, i) => ({ o, i, v: o.kind === 'charm' ? o.price + 10 : o.kind === 'tile' && o.id === 'gold' ? o.price : -1 }))
    .filter((x) => x.v > 0)
    .sort((a, b) => b.v - a.v);
  for (const { i } of order) buy(run, i);
  // ×2 부적은 맨 뒤로
  run.charms.sort((a, b) => (charmById(a).id === 'tiger' || charmById(a).id === 'gambler') - (charmById(b).id === 'tiger' || charmById(b).id === 'gambler'));
}

function simulate(policy) {
  const reached = new Array(ROUNDS.length + 1).fill(0);
  let clears = 0, scoreSum = new Array(ROUNDS.length).fill(0), scoreN = new Array(ROUNDS.length).fill(0);
  for (let k = 0; k < runs; k++) {
    const run = createRun(seed0 + k, { board: only });
    startRound(run);
    while (true) {
      reached[run.roundNo]++;
      playRound(run, policy);
      scoreSum[run.roundNo - 1] += run.round.score; scoreN[run.roundNo - 1]++;
      settleRound(run);
      if (run.status === 'lost') break;
      if (run.status === 'won') { clears++; break; }
      if (policy === 'shopper' || policy === 'careful') shop(run);
      nextRound(run);
    }
  }
  return { reached, clears, avg: scoreSum.map((s, i) => Math.round(s / Math.max(1, scoreN[i]))) };
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—').padStart(6);
console.log(`런 ${runs}개 · 시드 ${seed0}~${seed0 + runs - 1}`);
console.log('라운드 목표: ' + ROUNDS.map((r, i) => `R${i + 1} ${r.board} ${r.target}${r.boss ? '(보스)' : ''}`).join(' · '));
console.log('');
console.log('정책      ' + ROUNDS.map((_, i) => `R${i + 1}통과`.padStart(8)).join('') + '   클리어   R별 평균점수');
for (const p of ['random', 'greedy', 'shopper', 'careful']) {
  const { reached, clears, avg } = simulate(p);
  const pass = ROUNDS.map((_, i) => pct(i + 1 < ROUNDS.length ? reached[i + 2] : clears, reached[i + 1]).padStart(8)).join('');
  console.log(p.padEnd(9) + ' ' + pass + '   ' + pct(clears, runs) + '   ' + avg.join(' / '));
}
