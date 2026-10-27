// 원정 전체: 월요일부터 금요일까지 5일 운행. 날마다 서울 노선도의 다른 구간을 달리고, 수·금은 도깨비 차장이 나오는 보스 날.
// "오늘의 노선"은 하루짜리 운행 — 날짜로 시드를 정해 그날은 누구나 같은 구간을 탄다.
// 하루를 목표대로 마치면 토큰을 정산하고 역 매점이 열린다.

import { createRng } from './rng.js';
import { createRound, minutesLeft } from './round.js';
import { makeSeoul, ROUTES, routeBySeed } from './boards/seoul.js';
import { CHARMS, BOSS_RULES, CLOSURE_RULE, LINE_PASS, charmById } from './items.js';
import { GOBLIN_STATIONS } from './estate.js';

/** 노선망이 클수록 그날 목표가 오른다(승객이 는다): 내 역 1곳마다 +0.5%, 최대 +35% */
export const NETWORK_GROWTH = { perStation: 0.005, max: 0.35 };
export const networkGrowth = (owned) => Math.min(NETWORK_GROWTH.max, Object.keys(owned || {}).filter((n) => owned[n]).length * NETWORK_GROWTH.perStation);
import { planEvents } from './events.js';
import { roundPoints, scaled, POINTS } from './ranking.js';

export const DAYS = [
  { day: '월', target: 1300, opp: 2 },
  { day: '화', target: 2000, opp: 2 },
  { day: '수', target: 2600, opp: 3, boss: true },
  { day: '목', target: 3700, opp: 3 },
  { day: '금', target: 4800, opp: 3, boss: true, closure: true }
];
export const DAILY = [{ day: '오늘', target: 1650, opp: 3 }];
export const REROLLS_PER_DAY = 2;
export const MY_PIECES = 4;
export const MAX_CHARMS = 5;
export const SHOP_REROLL_COST = 2;
export const START_COINS = 4;

/**
 * 원정을 만든다. daily 면 하루짜리 오늘의 노선.
 * owned 는 내 역 { 역이름: true } — 기기에 저장해 두고 원정마다 넘겨준다(산 역은 사라지지 않는다).
 */
export function createRun(seed, { daily = false, owned = {} } = {}) {
  return {
    seed,
    daily,
    rounds: daily ? DAILY : DAYS,
    rng: createRng(seed),
    roundNo: 1,
    coins: START_COINS,
    charms: [],
    owned,
    extraLines: 0,
    round: null,
    shop: null,
    lastPayout: null,
    status: 'round',
    points: 0,        // 이번 원정에서 쌓은 승점 (ranking.js)
    lastPoints: 0
  };
}

/** 오늘 날짜로 정하는 시드 — 같은 날엔 같은 노선도 */
export function dailySeed(date = new Date()) {
  return date.getFullYear() * 10000 + (date.getMonth() + 1) * 100 + date.getDate();
}

/** 날마다 다른 시드(같은 원정·같은 날이면 늘 같다) */
export const mapSeed = (run, roundNo) => ((run.seed * 31 + roundNo * 7919) >>> 0) || 1;

/** 그날 달릴 구간 [출발역, 종착역]. 한 원정 안에서는 겹치지 않는다. 오늘의 노선은 날짜로 */
export function routeFor(run, roundNo) {
  if (run.daily) return routeBySeed(run.seed);
  const order = createRng((run.seed >>> 0) || 1).shuffle(ROUTES.slice());
  return order[(roundNo - 1) % order.length];
}

/** 그날 판. 매점이 다음 날 판을 미리 볼 때도 같은 것이 나온다 */
export function dayBoard(run, roundNo, extraLines = 0) {
  const spec = run.rounds[roundNo - 1];
  return makeSeoul(routeFor(run, roundNo), { slack: 2 + extraLines, closeSeed: spec?.closure ? mapSeed(run, roundNo) : null });
}

/** 그날 운행 중지되는 호선(금요일 도깨비 차장) */
export const closedLineFor = (run, roundNo) => dayBoard(run, roundNo, run.extraLines || 0).closed;

export function startRound(run) {
  const spec = run.rounds[run.roundNo - 1];
  const closedLine = spec.closure ? closedLineFor(run, run.roundNo) : null;
  const boss = !spec.boss ? null : spec.closure ? { ...CLOSURE_RULE, line: closedLine } : run.rng.pick(BOSS_RULES);
  run.round = createRound({
    number: run.roundNo,
    day: spec.day,
    target: Math.round(spec.target * (1 + networkGrowth(run.owned)) / 10) * 10,
    rerolls: REROLLS_PER_DAY,
    myPieces: MY_PIECES,
    oppPieces: spec.opp,
    charms: run.charms,
    owned: run.owned,
    goblinStations: spec.boss ? goblinStationsFor(run, run.roundNo) : [],
    boss,
    mapSeed: mapSeed(run, run.roundNo),
    route: routeFor(run, run.roundNo),
    closure: !!spec.closure,
    extraLines: run.extraLines || 0,
    events: planEvents(run.rng)
  });
  run.round.day = spec.day;
  run.extraLines = 0; // 노선 연장권은 그날 구간에서 다 쓴다
  run.status = 'round';
  return run.round;
}

/** 하루가 끝난 뒤. 목표를 넘겼으면 토큰을 정산하고 매점을 연다. */
export function settleRound(run) {
  const r = run.round;
  if (!r || r.phase !== 'over') throw new Error('운행이 끝나지 않았습니다');
  if (r.outcome !== 'win') { run.status = 'lost'; return null; }

  const before = run.coins;
  const left = minutesLeft(r);
  const payout = [
    { label: '운행 완료', amount: 4 },
    { label: '남은 운행 시간 (1시간당 1)', amount: Math.floor(left / 60) },
    { label: '이자 (토큰 5개당 1)', amount: Math.min(5, Math.floor(before / 5)) }
  ];
  if (r.coins) payout.push({ label: '오늘 모은 토큰', amount: r.coins });
  run.coins += payout.reduce((s, p) => s + p.amount, 0);
  for (const id of run.charms) {
    const c = charmById(id);
    if (c?.dayWin) { const b = run.coins; c.dayWin(run); payout.push({ label: c.name, amount: run.coins - b }); }
  }
  run.lastPayout = payout.filter((p) => p.amount > 0);
  run.lastPoints = scaled(run, roundPoints({ score: r.score, target: r.target, minutesLeft: left, boss: !!r.boss }));
  if (run.roundNo >= run.rounds.length) run.lastPoints += scaled(run, POINTS.clearFull);
  run.points += run.lastPoints;

  if (run.roundNo >= run.rounds.length) { run.status = 'won'; return run.lastPayout; }
  run.shop = makeShop(run);
  run.status = 'shop';
  return run.lastPayout;
}

/** 보스 날 도깨비 차장이 차지하는 역: 구간 안의 주인 없는 역 중에서 시드로 */
export function goblinStationsFor(run, roundNo) {
  const b = dayBoard(run, roundNo, run.extraLines || 0);
  const free = b.nodes.filter((n) => n !== b.S && n !== b.G && !run.owned[n]).sort();
  return createRng(mapSeed(run, roundNo) + 17).shuffle(free).slice(0, GOBLIN_STATIONS);
}

function makeShop(run) {
  const charms = run.rng.shuffle(CHARMS.filter((c) => !run.charms.includes(c.id))).slice(0, 3);
  const offers = charms.map((c) => ({ kind: 'charm', id: c.id, price: c.price, sold: false }));
  offers.push({ kind: 'line', id: LINE_PASS.id, price: LINE_PASS.price, sold: false });
  return { offers };
}


export function buy(run, index) {
  const offer = run.shop?.offers[index];
  if (!offer || offer.sold) return { ok: false, reason: '이미 팔렸습니다' };
  if (run.coins < offer.price) return { ok: false, reason: '토큰이 모자랍니다' };
  if (offer.kind === 'charm' && run.charms.length >= MAX_CHARMS) return { ok: false, reason: '정기권 칸이 꽉 찼습니다' };

  run.coins -= offer.price;
  offer.sold = true;
  if (offer.kind === 'charm') run.charms.push(offer.id);
  if (offer.kind === 'line') run.extraLines = (run.extraLines || 0) + 1;
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

/** 정기권 순서 바꾸기 — 점수는 왼쪽부터 계산되므로 ×2 정기권을 뒤로 보낼수록 세다. */
export function moveCharm(run, from, to) {
  if (from === to || from < 0 || to < 0 || from >= run.charms.length || to >= run.charms.length) return;
  const [c] = run.charms.splice(from, 1);
  run.charms.splice(to, 0, c);
}

export function rerollShop(run) {
  if (run.coins < SHOP_REROLL_COST) return { ok: false, reason: '토큰이 모자랍니다' };
  run.coins -= SHOP_REROLL_COST;
  run.shop = makeShop(run);
  return { ok: true };
}

export function nextRound(run) {
  run.roundNo += 1;
  run.shop = null;
  return startRound(run);
}
