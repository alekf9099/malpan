// 런 전체: 윷놀이판 2라운드 → 주사위판 2라운드 → 체스판 2라운드. 판마다 두 번째 라운드가 보스.
// 판 하나만 고르면 그 판의 2라운드만 한다(BOARD_RUNS). 처음부터 부적 없이 시작하므로 목표가 낮다.

import { createRng } from './rng.js';
import { createRound } from './round.js';
import { boardOf } from './boards/index.js';
import { DEFAULT_P_FLAT } from './sticks.js';
import { CHARMS, TILES, STICKS, BOSS_RULES, charmById } from './items.js';
import { planEvents } from './events.js';

export const ROUNDS = [
  { board: 'yut', target: 400, opp: 2 },
  { board: 'yut', target: 650, opp: 3, boss: true },
  { board: 'marble', target: 1100, opp: 2 },
  { board: 'marble', target: 1400, opp: 3, boss: true },
  { board: 'chess', target: 1450, opp: 2 },
  { board: 'chess', target: 1800, opp: 3, boss: true }
];
export const BOARD_RUNS = {
  yut: ROUNDS.filter((r) => r.board === 'yut'),
  marble: [{ board: 'marble', target: 900, opp: 2 }, { board: 'marble', target: 1250, opp: 3, boss: true }],
  chess: [{ board: 'chess', target: 360, opp: 2 }, { board: 'chess', target: 600, opp: 3, boss: true }]
};
export const THROWS_PER_ROUND = 7;
export const REROLLS_PER_ROUND = 2;
export const MY_PIECES = 4;
export const MAX_CHARMS = 5;
export const SHOP_REROLL_COST = 2;
export const START_COINS = 4;

/** board 를 주면 그 판만 하는 짧은 원정 */
export function createRun(seed, { board = null } = {}) {
  return {
    seed,
    board,
    rounds: board ? BOARD_RUNS[board] : ROUNDS,
    rng: createRng(seed),
    roundNo: 1,
    coins: START_COINS,
    charms: [],
    tiles: {},
    stick: null,
    round: null,
    shop: null,
    lastPayout: null,
    status: 'round'
  };
}

export function pFlatOf(run) {
  let p = DEFAULT_P_FLAT;
  if (run.stick) p += STICKS.find((s) => s.id === run.stick).pFlat;
  for (const id of run.charms) p += charmById(id)?.pFlat || 0;
  return p;
}

export function startRound(run) {
  const spec = run.rounds[run.roundNo - 1];
  const boss = spec.boss ? run.rng.pick(BOSS_RULES) : null;
  run.round = createRound({
    number: run.roundNo,
    target: spec.target,
    throws: THROWS_PER_ROUND,
    rerolls: REROLLS_PER_ROUND,
    myPieces: MY_PIECES,
    oppPieces: spec.opp,
    charms: run.charms,
    tiles: run.tiles[spec.board] || {},
    pFlat: pFlatOf(run),
    boss,
    board: spec.board,
    events: planEvents(run.rng, THROWS_PER_ROUND)
  });
  run.status = 'round';
  return run.round;
}

/** 라운드가 끝난 뒤. 이기면 엽전을 정산하고 상점을 연다. */
export function settleRound(run) {
  const r = run.round;
  if (!r || r.phase !== 'over') throw new Error('라운드가 끝나지 않았습니다');
  if (r.outcome !== 'win') { run.status = 'lost'; return null; }

  const before = run.coins;
  const payout = [
    { label: '라운드 승리', amount: 4 },
    { label: '남은 던질 기회', amount: r.throwsLeft },
    { label: '이자 (엽전 5개당 1)', amount: Math.min(5, Math.floor(before / 5)) }
  ];
  if (r.coins) payout.push({ label: '복 칸', amount: r.coins });
  run.coins += payout.reduce((s, p) => s + p.amount, 0);
  for (const id of run.charms) {
    const c = charmById(id);
    if (c?.roundWin) { const b = run.coins; c.roundWin(run); payout.push({ label: c.name, amount: run.coins - b }); }
  }
  run.lastPayout = payout.filter((p) => p.amount > 0);

  if (run.roundNo >= run.rounds.length) { run.status = 'won'; return run.lastPayout; }
  run.shop = makeShop(run);
  run.status = 'shop';
  return run.lastPayout;
}

function makeShop(run) {
  const charms = run.rng.shuffle(CHARMS.filter((c) => !run.charms.includes(c.id))).slice(0, 3);
  const tile = run.rng.pick(TILES);
  const sticks = STICKS.filter((s) => s.id !== run.stick);
  const stick = sticks.length ? run.rng.pick(sticks) : null;
  const offers = charms.map((c) => ({ kind: 'charm', id: c.id, price: c.price, sold: false }));
  offers.push({ kind: 'tile', id: tile.id, price: tile.price, sold: false });
  if (stick) offers.push({ kind: 'stick', id: stick.id, price: stick.price, sold: false });
  return { offers };
}

/** 칸 개조는 다음 라운드의 판에 놓는다. 출발점·판 고유 이벤트 칸은 피한다. */
function nextBoard(run) {
  return boardOf(run.rounds[Math.min(run.roundNo, run.rounds.length - 1)].board);
}
function freeNodes(run) {
  const b = nextBoard(run);
  const used = run.tiles[b.id] || {};
  return b.nodes.filter((n) => n !== b.entry && !used[n] && !b.tile(n));
}

export function buy(run, index) {
  const offer = run.shop?.offers[index];
  if (!offer || offer.sold) return { ok: false, reason: '이미 팔렸습니다' };
  if (run.coins < offer.price) return { ok: false, reason: '엽전이 모자랍니다' };
  if (offer.kind === 'charm' && run.charms.length >= MAX_CHARMS) return { ok: false, reason: '부적 칸이 꽉 찼습니다' };

  run.coins -= offer.price;
  offer.sold = true;
  if (offer.kind === 'charm') run.charms.push(offer.id);
  if (offer.kind === 'stick') run.stick = offer.id;
  if (offer.kind === 'tile') {
    const node = run.rng.pick(freeNodes(run));
    const b = nextBoard(run).id;
    (run.tiles[b] ||= {})[node] = offer.id;
    return { ok: true, node, board: b };
  }
  return { ok: true };
}

export function sellCharm(run, index) {
  const id = run.charms[index];
  if (!id) return { ok: false };
  run.charms.splice(index, 1);
  const refund = Math.floor(charmById(id).price / 2);
  run.coins += refund;
  return { ok: true, refund };
}

/** 부적 순서 바꾸기 — 점수는 왼쪽부터 계산되므로 ×2 부적을 뒤로 보낼수록 세다. */
export function moveCharm(run, from, to) {
  if (from === to || from < 0 || to < 0 || from >= run.charms.length || to >= run.charms.length) return;
  const [c] = run.charms.splice(from, 1);
  run.charms.splice(to, 0, c);
}

export function rerollShop(run) {
  if (run.coins < SHOP_REROLL_COST) return { ok: false, reason: '엽전이 모자랍니다' };
  run.coins -= SHOP_REROLL_COST;
  run.shop = makeShop(run);
  return { ok: true };
}

export function nextRound(run) {
  run.roundNo += 1;
  run.shop = null;
  return startRound(run);
}
