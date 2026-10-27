// 밸런스 시뮬레이터: 정책별로 N 원정을 돌려 날마다 통과율과 완주율을 본다.
//   node tools/sim.mjs [원정 수=2000] [시작 시드=1] [daily: 오늘의 노선만]
//
// 정책
//   random  아무 수나 둔다. 매점·스킬·봉쇄는 안 쓴다
//   greedy  예상 점수가 가장 큰 수. 다시 굴리기는 1역일 때. 스킬은 쓸 수 있으면 바로(스크린도어는 위험한 말이 있을 때). 매점은 안 쓴다
//   shopper greedy + 매점에서 살 수 있는 정기권 중 비싼 것부터(×2 정기권은 맨 뒤로)
//   careful shopper 와 같되, 잡힐 위험이 큰 역은 점수를 깎아 보고, 위험한 말이 선 역에 봉쇄 테이프를 친다
// 손맛 게이지는 쓰지 않는다(늘 보통 던지기) — 사람이 게이지를 잘 쓰면 이보다 쉽다.

import { createRun, startRound, settleRound, nextRound, buy, DAYS, DAILY } from '../src/core/run.js';
import { depart, applyMove, reroll, legalMoves, useSkill, skillBlocked, threats, placeBlockade, blockadeBlocked } from '../src/core/round.js';
import { charmById } from '../src/core/items.js';

const runs = Number(process.argv[2] || 2000);
const seed0 = Number(process.argv[3] || 1);
const daily = process.argv[4] === 'daily';
const ROUNDS = daily ? DAILY : DAYS;

const policies = {
  random(r, rng) { return Math.floor(rng.next() * legalMoves(r).length); },
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
  while (r.phase !== 'over' && guard++ < 600) {
    if (r.phase === 'throw') {
      if (policy !== 'random') {
        for (const h of ['tiger', 'rabbit', 'parrot', 'panda']) {
          if (skillBlocked(r, h)) continue;
          if (h === 'panda' && !Object.values(threats(r)).some((d) => d >= 0.2)) continue;
          useSkill(r, h, run.rng);
        }
      }
      if (policy === 'careful' && r.blockadesLeft > 0) {
        const t = threats(r);
        const worst = Object.entries(t).sort((a, b) => b[1] - a[1])[0];
        if (worst && worst[1] >= 0.3 && !blockadeBlocked(r, worst[0])) placeBlockade(r, worst[0]);
      }
      depart(r, run.rng);
      continue;
    }
    if (policy !== 'random' && r.rerolls > 0 && r.pending.roll.tier <= 1) { reroll(r, run.rng); continue; }
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
  const late = (id) => (id === 'tiger' || id === 'gambler' ? 1 : 0);
  run.charms.sort((a, b) => late(charmById(a).id) - late(charmById(b).id));
}

function simulate(policy) {
  const reached = new Array(ROUNDS.length + 1).fill(0);
  let clears = 0;
  const scoreSum = new Array(ROUNDS.length).fill(0), scoreN = new Array(ROUNDS.length).fill(0), moveSum = new Array(ROUNDS.length).fill(0);
  for (let k = 0; k < runs; k++) {
    const run = createRun(seed0 + k, { daily });
    startRound(run);
    while (true) {
      reached[run.roundNo]++;
      playRound(run, policy);
      scoreSum[run.roundNo - 1] += run.round.score; scoreN[run.roundNo - 1]++; moveSum[run.roundNo - 1] += run.round.moves;
      settleRound(run);
      if (run.status === 'lost') break;
      if (run.status === 'won') { clears++; break; }
      if (policy === 'shopper' || policy === 'careful') shop(run);
      nextRound(run);
    }
  }
  const avg = (a) => a.map((s, i) => Math.round(s / Math.max(1, scoreN[i])));
  return { reached, clears, avg: avg(scoreSum), moves: moveSum.map((s, i) => (s / Math.max(1, scoreN[i])).toFixed(1)) };
}

const pct = (a, b) => (b ? (100 * a / b).toFixed(1) + '%' : '—').padStart(6);
console.log(`원정 ${runs}개 · 시드 ${seed0}~${seed0 + runs - 1}${daily ? ' · 오늘의 노선' : ''}`);
console.log('목표: ' + ROUNDS.map((r) => `${r.day} ${r.target}${r.boss ? '(보스)' : ''}`).join(' · '));
console.log('');
console.log('정책      ' + ROUNDS.map((r) => `${r.day}통과`.padStart(8)).join('') + '   완주    평균점수 / 하루 이동 횟수');
for (const p of ['random', 'greedy', 'shopper', 'careful']) {
  const { reached, clears, avg, moves } = simulate(p);
  const pass = ROUNDS.map((_, i) => pct(i + 1 < ROUNDS.length ? reached[i + 2] : clears, reached[i + 1]).padStart(8)).join('');
  console.log(p.padEnd(9) + ' ' + pass + '   ' + pct(clears, runs) + '   ' + avg.join(' / ') + '   (' + moves.join(' / ') + ')');
}
