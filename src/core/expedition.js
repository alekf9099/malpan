// 원정 모드(로그라이크) — 혼자 AI 와 짧은 판을 이어 한다. 화면을 모르고, 원정 상태는 순수한 값(저장 · 시뮬레이터가 그대로 쓴다).
//
//   한 원정: 스테이지 RUN_STAGES 개(마지막은 보스). 스테이지마다 짧은 판 하나 — 1등으로 끝내면 통과
//   통과하면 유물 3장 중 하나를 고른다(보너스 목표까지 해내면 4장). 유물은 원정이 끝날 때까지 이어진다
//   지면 목숨이 하나 줄고 같은 스테이지를 새 판으로 다시 한다. 목숨이 다 떨어지면 원정 끝
//   뒤로 갈수록 상대가 늘고, 상대도 시작 자금 · 유물을 받는다. 보스는 유물을 여럿 들고 나온다
//
// 유물 효과는 두 가지: mods(perkOf 에 더해지는 능력값 — 통행료 · 할인 · 월급 …) · start(판을 시작할 때 한 번 — 자금 · 면제권 · 충전)

import { createMatch, CLOCK } from './match.js';
import { createRng } from './rng.js';
import { HEROES } from './heroes.js';
import { ringOf } from './boards/loop.js';
import { MAX_LEVEL } from './estate.js';

export const RUN_LIVES = 3;

/**
 * 스테이지: 상대 수 · 판 길이(바퀴) · 상대마다 시작 자금 ±(앞쪽은 상대가 덜 갖고 시작) · 상대마다 유물 수 · 보스(첫 상대가 더 세다).
 * 상대는 늘 2명 이상 — 2인 판은 같은 칸에서 같은 빠르기로 달려 서로의 역을 거의 밟지 않는다(통행료 판당 1번 남짓)
 */
export const RUN_STAGES = [
  { name: '첫차', rivals: 2, rounds: 10, cash: -350, relics: 0 },
  { name: '출근길', rivals: 2, rounds: 12, cash: -200, relics: 0 },
  { name: '러시아워', rivals: 3, rounds: 12, cash: -150, relics: 0 },
  { name: '환승 지옥', rivals: 3, rounds: 14, cash: -50, relics: 1 },
  { name: '막차 보스', rivals: 3, rounds: 14, cash: -100, relics: 0, boss: { cash: 500, relics: 3 } }
];

/** 유물. rival: 상대 · 보스도 받을 수 있는 것(AI 가 잘 쓰는 능력값만) */
export const RELICS = [
  { id: 'cash', name: '비상금 봉투', desc: '판마다 시작 자금 +300', start: { money: 300 }, rival: true },
  { id: 'toll', name: '황금 개찰구', desc: '내 역 통행료 +25%', mods: { tollBonus: 0.25 }, rival: true },
  { id: 'shield', name: '정기권', desc: '내가 내는 통행료 -25%', mods: { tollDiscount: 0.25 }, rival: true },
  { id: 'build', name: '공구 상자', desc: '증축 비용 -30%', mods: { buildDiscount: 0.3 }, rival: true },
  { id: 'deal', name: '협상 수첩', desc: '인수 비용 -30%', mods: { takeoverDiscount: 0.3 }, rival: true },
  { id: 'buy', name: '분양권', desc: '빈 역 사는 값 -25%', mods: { buyDiscount: 0.25 }, rival: true },
  { id: 'salary', name: '성과급', desc: '월급 · 목적지 보너스 +80', mods: { goalBonus: 80 }, rival: true },
  { id: 'fee', name: '중개 수수료', desc: '상대가 역을 살 때마다 +15', mods: { commission: 15 } },
  { id: 'rescue', name: '구조 보험', desc: '판마다 한 번, 파산 직전에 400 으로 버틴다', mods: { rescue: 400 } },
  { id: 'coupon', name: '무임승차권', desc: '판마다 첫 통행료 한 번 면제', start: { coupon: true } },
  { id: 'battery', name: '보조 배터리', desc: '스킬 충전 칸 -1', start: { cost: -1 } },
  { id: 'spark', name: '첫 충전', desc: '판 시작부터 스킬이 가득 충전', start: { charge: true } }
];
export const relicById = (id) => RELICS.find((r) => r.id === id);

/** 보너스 목표(스테이지마다 하나): 해내면 다음 유물 고르기가 4장 · 원정 보상 + */
export const BONUSES = [
  { id: 'landmark', text: '랜드마크 1곳 세우기', stat: 'landmark', need: 1 },
  { id: 'takeover', text: '남의 역 1곳 인수', stat: 'takeover', need: 1 },
  { id: 'toll', text: '통행료 400 받기', stat: 'toll', need: 400 },
  { id: 'buy', text: '역 6곳 사기', stat: 'buy', need: 6 },
  { id: 'upgrade', text: '증축 4번', stat: 'upgrade', need: 4 }
];
export const bonusById = (id) => BONUSES.find((b) => b.id === id);

/** 원정 보상(승차권): 통과한 스테이지마다 · 보너스마다 · 완주 */
export const REWARD = { stage: 20, bonus: 10, clear: 60 };

const mix = (...xs) => xs.reduce((h, x) => (Math.imul(h ^ (x >>> 0), 2654435761) >>> 0) || 1, 2166136261);

/** 새 원정 */
export function newRun({ seed, hero, board }) {
  return { v: 1, seed: seed >>> 0 || 1, hero, board, stage: 0, tries: 0, lives: RUN_LIVES, relics: [], bonuses: 0, offer: null, log: [], over: false, won: false };
}

/** 지금 스테이지를 어떻게 꾸릴지(같은 원정 · 같은 스테이지 · 같은 시도면 늘 같다) */
export function stagePlan(run) {
  const st = RUN_STAGES[run.stage];
  const rng = createRng(mix(run.seed, run.stage + 1, run.tries + 1));
  const rivals = rng.shuffle(HEROES.map((h) => h.id).filter((id) => id !== run.hero)).slice(0, st.rivals);
  const pool = RELICS.filter((r) => r.rival).map((r) => r.id);
  const rivalRelics = rivals.map((_, i) => rng.shuffle(pool).slice(0, i === 0 && st.boss ? st.boss.relics : st.relics));
  const bonus = BONUSES[rng.int(BONUSES.length)].id;
  return { ...st, index: run.stage, last: run.stage === RUN_STAGES.length - 1, seed: (rng.next() * 0x7fffffff) | 0 || 1, rivals, rivalRelics, bonus };
}

/** 유물 묶음을 한 사람에게: mods 는 더하고, start 는 지금 적용 */
export function equip(m, p, ids) {
  const mods = {};
  for (const id of ids) {
    const r = relicById(id);
    if (!r) continue;
    for (const [k, v] of Object.entries(r.mods || {})) mods[k] = (mods[k] || 0) + v;
    const s = r.start || {};
    if (s.money) p.money += s.money;
    if (s.coupon) p.coupon = true;
    if (s.cost) p.cost = Math.max(2, p.cost + s.cost);
    if (s.charge) p.charge = p.cost;
  }
  if (Object.keys(mods).length) p.mods = mods;
  p.relics = ids.slice();
}

/** 스테이지 판을 만든다: 첫 자리가 나, 짧은 시계, 상대 자금 · 유물, 보스 표시 */
export function stageMatch(run, plan = stagePlan(run)) {
  const m = createMatch({ seed: plan.seed, heroes: [run.hero, ...plan.rivals], humans: 1, region: ringOf(run.board) ? run.board : null });
  m.end = CLOCK.start + plan.rounds * m.roundMin;
  m.run = { stage: plan.index, name: plan.name, bonus: plan.bonus, boss: plan.boss ? 'p1' : null, last: plan.last };
  equip(m, m.players[0], run.relics);
  m.players.slice(1).forEach((p, i) => {
    p.money += plan.cash + (plan.boss && i === 0 ? plan.boss.cash : 0);
    equip(m, p, plan.rivalRelics[i]);
    if (plan.boss && i === 0) p.boss = true;
  });
  return m;
}

/** 판 하나의 기록(보너스 목표 확인용) — 화면의 미션 집계와 같은 기준 */
export function tally(s, e, meId) {
  if (e.player === meId) {
    if (e.type === 'buy') s.buy++;
    if (e.type === 'upgrade') { s.upgrade++; if (e.level >= MAX_LEVEL) s.landmark++; }
    if (e.type === 'takeover') s.takeover++;
    if (e.type === 'goal') s.goal++;
    if (e.type === 'hotspot') s.hot++;
  }
  if (e.type === 'pay' && e.to === meId && (e.why === 'toll' || e.why === 'pass')) s.toll += e.amount;
}
export const freshStats = () => ({ buy: 0, upgrade: 0, landmark: 0, takeover: 0, goal: 0, hot: 0, toll: 0 });
export const bonusDone = (id, stats) => { const b = bonusById(id); return !!b && (stats[b.stat] || 0) >= b.need; };

/** 끝난 스테이지 판 → 이겼나(1등). 내가 파산했으면 판이 덜 끝났어도 진 것 */
export const stageWon = (m) => { const me = m.players[0]; return !me.out && m.phase === 'over' && me.place === 1; };

/** 유물 고르기 후보: 아직 없는 것 중 n 장(같은 원정 · 같은 스테이지면 늘 같다) */
export function offerRelics(run, n) {
  const rng = createRng(mix(run.seed, 777, run.stage, run.relics.length));
  return rng.shuffle(RELICS.filter((r) => !run.relics.includes(r.id)).map((r) => r.id)).slice(0, n);
}

/** 스테이지 결과를 원정에 반영 → 새 원정 상태 */
export function finishStage(run, { won, bonus }) {
  const r = { ...run, relics: run.relics.slice(), log: [...run.log, { stage: run.stage, won, bonus: !!bonus }] };
  if (won) {
    if (bonus) r.bonuses++;
    r.stage++;
    r.tries = 0;
    if (r.stage >= RUN_STAGES.length) { r.over = true; r.won = true; r.offer = null; }
    else r.offer = offerRelics(r, bonus ? 4 : 3);
  } else {
    r.lives--;
    r.tries++;
    r.offer = null;
    if (r.lives <= 0) r.over = true;
  }
  return r;
}

/** 유물 하나를 고른다(후보에 있는 것만) */
export function pickRelic(run, id) {
  if (!run.offer?.includes(id)) return run;
  return { ...run, relics: [...run.relics, id], offer: null };
}

/** 원정 보상(승차권) */
export const runReward = (run) => run.stage * REWARD.stage + run.bonuses * REWARD.bonus + (run.won ? REWARD.clear : 0);

