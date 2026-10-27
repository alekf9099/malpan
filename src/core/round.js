// 하루 운행의 규칙. 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다.
// 판(노선도)은 boards/metro.js 의 인터페이스(roll·options·tile·rollsFor·lineAt…)로만 안다.
//
// 하루는 운행 시계로 흐른다. 06:00 첫차 → 24:00 막차. 한 번 달릴 때마다 시간이 든다
// (출발 45분 + 역마다 15분, 급행은 역마다 8분). 막차 시각이 지나면 그날 운행이 끝나고,
// 그때까지 목표 점수를 넘겼으면 하루를 지킨 것이다.

import { START, HOME } from './board.js';
import { charmById } from './items.js';
import { makeMetro } from './boards/metro.js';
import { HEROES, heroOf } from './heroes.js';
import { eventById } from './events.js';

export const CAPTURE_CHIPS = 50;
export const HOME_CHIPS = 100;

// 운행 시계(자정부터 분)
export const CLOCK = {
  start: 6 * 60, end: 24 * 60,
  trip: 45, perStop: 15, expressPerStop: 8,   // 한 번 달리는 시간
  wait: 30,                                   // 갈 수 있는 길이 없어 기다린 시간
  delay: 30,                                  // 도깨비 열차가 종점에 닿으면 운행 지연
  rush: [[7 * 60, 9 * 60], [18 * 60, 20 * 60]],
  night: 22 * 60, last: 23 * 60
};
// 지하철 시간표처럼 자정 넘어도 24:00 · 24:30 으로 쓴다
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

// 승객 만족도(흥): 잡기·업기·골인·분실물마다 1씩 올라 모든 이동에 배수로 붙는다. 내 말이 잡히면 떨어진다.
export const HEUNG_MAX = 5;
// 분실물: 도깨비 차례가 끝날 때 확률로 역에 나타나 내 차례 3번 동안 머문다.
export const TREASURE_CHANCE = 0.5;
export const TREASURE_TTL = 3;
export const TREASURE_CHIPS = 40;
export const TREASURE_COINS = 2;
// 봉쇄 테이프: 하루 2개. 친 역은 3시간 동안 도깨비 열차가 지나가지 못한다.
export const BLOCKADE = { perDay: 2, minutes: 180 };

// 깃발·호선 완성·승객(보상은 노선도가 클수록 작게 맞췄다)
export const METRO = { regular: 5, completeScore: 80, completeCoins: 2, toll: 1, deliverChips: 30, deliverCoins: 1, passengerTtl: 4 };

/**
 * cfg: { number, target, rerolls, myPieces, oppPieces, charms: [id], tiles: {node: tileId}, boss, events,
 *        mapSeed, extraLines, closedLine }
 *   events     돌발 사건 계획 [{ at(시각), id }] (events.js planEvents). 없으면 사건이 없다
 *   mapSeed    노선도 시드(날마다 다르게)
 *   extraLines 노선 연장권으로 더 붙일 갈래 · closedLine 도깨비 차장이 막은 호선
 */
export function createRound(cfg) {
  const pieces = [];
  for (let i = 0; i < cfg.myPieces; i++) pieces.push({ id: 'm' + i, owner: 'me', node: START, prev: null });
  for (let i = 0; i < cfg.oppPieces; i++) {
    // 짝수 번째는 빨간 사냥꾼(잡기 우선), 홀수 번째는 파란 도망꾼(골인 우선). 그림 색과 맞춘다.
    pieces.push({ id: 'd' + i, owner: 'opp', node: START, prev: null, trait: i % 2 === 0 ? 'hunter' : 'runner' });
  }
  const board = makeMetro(cfg.mapSeed || 1, { extra: cfg.extraLines || 0, closed: cfg.closedLine ?? null });
  const r = {
    number: cfg.number,
    boardId: 'metro',
    boardInst: board,
    target: cfg.target,
    score: 0,
    clock: CLOCK.start,
    end: CLOCK.end,
    freeRide: false,
    rerolls: cfg.rerolls,
    extra: 0,
    heung: 0,
    treasures: [],
    pieces,
    charms: cfg.charms.slice(),
    tiles: { ...cfg.tiles },
    boss: cfg.boss || null,
    coins: 0,
    escapeUsed: false,
    skillsUsed: [],
    shield: false,
    blockades: [],                 // { node, until }
    blockadesLeft: BLOCKADE.perDay,
    eventPlan: (cfg.events || []).map((e) => ({ ...e, done: false })),
    flags: {},                     // 내 깃발이 꽂힌 역
    completed: [],                 // 완성한 호선 id
    passengers: [],                // 역에서 기다리는 손님 { node, line, ttl }
    pending: null,
    phase: 'throw',
    outcome: null,
    lastMoveBest: 0,
    moves: 0
  };
  r.revealed = [...board.ahead([START], fogRadius(r))];
  for (const id of r.charms) charmById(id)?.dayStart?.(r);
  return r;
}

export const boardFor = (r) => r.boardInst;

// ── 시간대 ─────────────────────────────────────────────────

/** 지금 시간대: 'rush' 출퇴근 러시 · 'night' 심야 · 'last' 막차(23시~) · 'day' 낮 */
export function timeOf(r, clock = r.clock) {
  if (clock >= CLOCK.last) return 'last';
  if (clock >= CLOCK.night) return 'night';
  if (CLOCK.rush.some(([a, b]) => clock >= a && clock < b)) return 'rush';
  return 'day';
}
const fogRadius = (r) => (r.clock >= CLOCK.night ? 4 : boardFor(r).fogRadius);
export const minutesLeft = (r) => Math.max(0, r.end - r.clock);
const outOfTime = (r) => r.clock >= r.end;

/** 이번 이동에 드는 시간 */
export function tripMinutes(r, opt, roll) {
  if (r.freeRide) return 0;
  const stops = opt.path.filter((n) => n !== HOME).length;
  return CLOCK.trip + stops * (roll.face === 'express' ? CLOCK.expressPerStop : CLOCK.perStop);
}

/** 안개 걷기: 내 말들 앞이 보이게 된다. 새로 보인 역이 있으면 이벤트 하나 */
function reveal(r) {
  const b = boardFor(r);
  const seen = new Set(r.revealed);
  const now = b.ahead(mine(r).map((p) => p.node), fogRadius(r));
  const fresh = [...now].filter((n) => !seen.has(n));
  if (!fresh.length) return [];
  r.revealed.push(...fresh);
  return [{ type: 'reveal', nodes: fresh }];
}

// ── 던지기 솜씨(손맛 게이지) ───────────────────────────────
// 'good' 두 번 굴려 좋은 쪽 · 'perfect' 세 번 굴려 가장 좋은 쪽 · 'slip' 두 번 굴려 나쁜 쪽 · 'normal' 한 번
export const QUALITY = ['normal', 'good', 'perfect', 'slip'];
const better = (a, b) => (b.tier > a.tier || (b.tier === a.tier && b.value > a.value) ? b : a);
function rollWith(r, rng, quality) {
  const board = boardFor(r);
  const n = quality === 'perfect' ? 3 : quality === 'good' || quality === 'slip' ? 2 : 1;
  let pick = board.roll(rng);
  for (let i = 1; i < n; i++) {
    const o = board.roll(rng);
    pick = quality === 'slip' ? (better(pick, o) === o ? pick : o) : better(pick, o);
  }
  return pick;
}

// ── 출발(굴리기) ───────────────────────────────────────────

/** 열차 주사위를 굴린다. 막차가 지났으면 굴릴 수 없다. */
export function depart(r, rng, quality = 'normal') {
  if (r.phase !== 'throw') throw new Error('지금은 출발할 차례가 아닙니다: ' + r.phase);
  if (outOfTime(r)) throw new Error('오늘 운행이 끝났습니다');
  if (r.extra > 0) r.extra--;
  const events = settleThrow(r, rollWith(r, rng, quality), rng, false);
  events[0].quality = quality;
  return events;
}

/** 움직이기 전에 결과를 다시 굴린다. 보너스로 받은 한 번 더는 되돌린다. 시간은 들지 않는다. */
export function reroll(r, rng) {
  if (r.phase !== 'move' || r.rerolls <= 0) throw new Error('다시 굴릴 수 없습니다');
  r.rerolls--;
  r.extra -= r.pending.granted;
  return settleThrow(r, boardFor(r).roll(rng), rng, true);
}

function settleThrow(r, roll, rng, rerolled) {
  const granted = roll.bonus ? 1 : 0;
  r.extra += granted;
  r.pending = { roll, granted };
  const events = [{ type: 'throw', who: 'me', board: r.boardId, roll, bonus: granted > 0, rerolled }];
  if (legalMoves(r).length === 0) {
    events.push({ type: 'noMove', roll, why: bossBlocks(r, roll) ? 'boss' : 'none' });
    r.pending = null;
    events.push(...spend(r, CLOCK.wait, 'wait'));
    events.push(...afterMyMove(r, rng));
  } else {
    r.phase = 'move';
  }
  return events;
}

/** 시계를 돌린다 */
function spend(r, minutes, why) {
  if (!minutes) return [];
  const before = timeOf(r);
  r.clock += minutes;
  const ev = [{ type: 'clock', clock: r.clock, minutes, why }];
  const now = timeOf(r);
  if (now !== before) ev.push({ type: 'timeShift', time: now, clock: r.clock });
  return ev;
}

const bossBlocks = (r, roll) => r.boss?.id === 'noDo' && roll.tier === 1;

// ── 수 ─────────────────────────────────────────────────────

const mine = (r) => r.pieces.filter((p) => p.owner === 'me');
const theirs = (r) => r.pieces.filter((p) => p.owner === 'opp');
const onBoard = (p) => p.node !== START && p.node !== HOME;
const treasureAt = (r, node) => r.treasures.find((t) => t.node === node);
const blockedSet = (r) => new Set(r.blockades.map((b) => b.node));

/** 지금 나온 결과로 둘 수 있는 수. 각 수에 예상 점수·위험도·걸리는 시간(preview)을 붙인다. */
export function legalMoves(r) {
  if (!r.pending) return [];
  const roll = r.pending.roll;
  if (bossBlocks(r, roll)) return [];
  return boardFor(r).options(r.pieces, 'me', roll).map((o) => ({ ...o, preview: evaluate(r, o, roll) }));
}

/** 도깨비 열차가 할 수 있는 수(봉쇄 역은 지나가지 못한다) */
const oppOptions = (r, roll, pieces = r.pieces) => boardFor(r).options(pieces, 'opp', roll, blockedSet(r));

/**
 * 도깨비가 다음 차례에 node 에 멈출 확률(한 번 굴린다고 보고, 갈 수 있는 수가 하나라도 있으면 위험으로 친다).
 * pieces 를 넘기면 그 배치로 계산한다 — 내가 움직인 "뒤"의 판을 미리 보려고.
 */
export function dangerAt(r, node, pieces = r.pieces) {
  if (node === START || node === HOME || r.shield) return 0;
  const board = boardFor(r);
  let p = 0;
  for (const { roll, p: pr } of board.rollsFor()) {
    if (oppOptions(r, roll, pieces).some((o) => o.path[o.path.length - 1] === node)) p += pr;
  }
  return r.boss?.id === 'fastOpp' ? 1 - (1 - p) ** 2 : p;
}

/** 토끼의 안전 요원이 남아 있고 이 역 묶음에 토끼가 끼어 있으면 잡히지 않는다. */
const shielded = (r, ids) => !r.escapeUsed && ids.some((id) => heroOf(id)?.escape);

/** 지금 노선 위 내 말 묶음마다 잡힐 확률. 화면이 위험한 말에 표시를 단다. */
export function threats(r) {
  const out = {};
  for (const p of mine(r)) {
    if (!onBoard(p) || out[p.node] != null) continue;
    const ids = mine(r).filter((q) => q.node === p.node).map((q) => q.id);
    out[p.node] = shielded(r, ids) ? 0 : dangerAt(r, p.node);
  }
  return out;
}

// ── 노선도 규칙: 역 효과 · 깃발 · 호선 완성 · 손님 · 도깨비 행선지 ───────────
//   깃발: 내 말이 멈춘 역에 꽂힌다. 다시 멈추면 단골역. 도깨비가 밟으면 빼앗긴다
//   호선 완성: 한 호선의 역에 모두 깃발 → 즉시 점수·토큰, 그날 특화 효과 2배, 도깨비가 멈추면 통행료
//   손님: 역에서 기다리다 내 말이 멈추면 탄다. 원하는 호선 역에 내려 주면 배달 보상

/** 역 효과를 하나로 합친다: 역 종류 + 호선 특화(완성이면 2배) + 단골역 + 배달 */
function stationEffect(r, dest, opt) {
  const b = boardFor(r);
  const base = b.tile(dest);
  const line = b.lineAt(dest);
  const parts = [];
  if (base) parts.push(base);
  if (line?.perk) {
    const k = r.completed.includes(line.id) ? 2 : 1;
    const p = {};
    for (const [key, v] of Object.entries(line.perk)) p[key] = v * k;
    parts.push({ name: `${line.name}${k > 1 ? '(완성)' : ''}`, ...p });
  }
  if (r.flags[dest]) parts.push({ name: '단골역', chips: METRO.regular });
  const riders = opt ? r.pieces.filter((p) => opt.pieceIds.includes(p.id) && p.rider && p.rider === line?.id) : [];
  if (riders.length) {
    const k = Math.max(1, ...opt.pieceIds.map((id) => heroOf(id)?.deliverMultiplier || 1));
    parts.push({ name: '배달', chips: METRO.deliverChips * riders.length * k, coins: METRO.deliverCoins * riders.length * k });
  }
  if (!parts.length) return null;
  const out = { kind: base?.kind || 'line', name: parts.map((p) => p.name).join(' · ') };
  for (const p of parts) for (const key of ['chips', 'mult', 'coins', 'heung']) if (p[key]) out[key] = (out[key] || 0) + p[key];
  return out;
}

/** 내 말이 멈춘 뒤: 배달·승차·깃발·호선 완성 */
function afterMyStop(r, dest, movers) {
  const b = boardFor(r);
  if (dest === HOME) return [];
  const events = [];
  const line = b.lineAt(dest);
  const delivered = movers.filter((p) => p.rider && p.rider === line?.id);
  if (delivered.length) {
    for (const p of delivered) p.rider = null;
    events.push({ type: 'deliver', node: dest, pieceIds: delivered.map((p) => p.id), line: line.id });
  }
  for (const q of r.passengers.filter((x) => x.node === dest)) {
    const seat = movers.find((p) => !p.rider);
    if (!seat) break;
    seat.rider = q.line;
    r.passengers = r.passengers.filter((x) => x !== q);
    events.push({ type: 'pickup', node: dest, pieceId: seat.id, line: q.line });
  }
  if (!r.flags[dest]) {
    r.flags[dest] = true;
    events.push({ type: 'flag', node: dest });
    for (const [id, stations] of Object.entries(b.lineStations)) {
      const lid = Number(id);
      if (r.completed.includes(lid) || lid === b.closed) continue;
      if (stations.every((n) => r.flags[n])) {
        r.completed.push(lid);
        r.score += METRO.completeScore;
        r.coins += METRO.completeCoins;
        events.push({ type: 'lineComplete', line: lid, bonus: METRO.completeScore, coins: METRO.completeCoins, score: r.score });
      }
    }
  }
  return events;
}

/** 도깨비가 멈춘 뒤: 깃발을 빼앗고, 완성 호선이면 통행료 */
function afterOppStop(r, dest) {
  const b = boardFor(r);
  if (dest === HOME) return [];
  const events = [];
  if (r.flags[dest]) { delete r.flags[dest]; events.push({ type: 'flagLost', node: dest }); }
  const line = b.lineAt(dest);
  if (line && r.completed.includes(line.id)) {
    r.coins += METRO.toll;
    events.push({ type: 'coin', node: dest, amount: METRO.toll, why: 'toll' });
  }
  return events;
}

/** 도깨비 열차마다 다음 갈림역에서 탈 갈래를 미리 정해 둔다(화면이 머리 위에 보여준다) */
function planHeadings(r, rng) {
  const b = boardFor(r);
  for (const p of theirs(r)) {
    if (!onBoard(p)) { p.heading = null; continue; }
    const fork = b.nextFork(p.node);
    if (!fork) { p.heading = null; continue; }
    if (p.heading?.at === fork.at) continue;
    // 사냥꾼은 내 말이 있는 쪽을, 도망꾼은 지름길(깊이가 덜 남는 쪽)을 좋아하고, 나머지는 운
    const score = (way) => {
      let v = rng.next();
      if (p.trait === 'hunter') v += mine(r).some((m) => onBoard(m) && b.depth[m.node] <= b.depth[way] && b.depth[m.node] > b.depth[way] - 6) ? 1 : 0;
      else v += b.depth[way] < b.depth[fork.at] - 1.5 ? 0.6 : 0;
      return v;
    };
    const way = fork.ways.slice().sort((x, y) => score(y) - score(x))[0];
    p.heading = { at: fork.at, node: way, line: b.lineAt(way)?.id || 1 };
  }
}

/** 손님이 역에 나타나고, 오래 기다리면 떠난다. 출퇴근 러시엔 손님이 많다 */
function tickPassengers(r, rng) {
  const b = boardFor(r);
  const events = [];
  for (const q of r.passengers) q.ttl -= 1;
  for (const q of r.passengers.filter((x) => x.ttl <= 0)) events.push({ type: 'passengerGone', node: q.node });
  r.passengers = r.passengers.filter((q) => q.ttl > 0);
  const rush = timeOf(r) === 'rush';
  const max = rush ? 3 : 2;
  if (r.passengers.length < max && rng.next() < (rush ? 0.85 : 0.45)) events.push(...spawnPassenger(r, rng));
  return events;
}

function spawnPassenger(r, rng) {
  const b = boardFor(r);
  const taken = new Set([...r.pieces.map((p) => p.node), ...r.passengers.map((q) => q.node), ...r.treasures.map((t) => t.node)]);
  const lines = Object.keys(b.lineStations).map(Number).filter((id) => id !== b.closed);
  const free = b.nodes.filter((n) => !taken.has(n) && !b.blocked(n) && n !== b.S && n !== b.G && b.lineAt(n)?.id === 1);
  if (!free.length || !lines.length) return [];
  const node = free[Math.floor(rng.next() * free.length)];
  const line = lines[Math.floor(rng.next() * lines.length)];
  r.passengers.push({ node, line, ttl: METRO.passengerTtl });
  return [{ type: 'passengerSpawn', node, line, ttl: METRO.passengerTtl }];
}

/** 이 수를 두면 무슨 일이 생기는지 계산만 한다(상태를 바꾸지 않는다). */
function evaluate(r, opt, roll) {
  const dest = opt.path[opt.path.length - 1];
  const homed = dest === HOME ? opt.pieceIds.length : 0;
  const victims = dest === HOME ? [] : theirs(r).filter((p) => p.node === dest);
  const joined = dest === HOME ? 0 : mine(r).filter((p) => p.node === dest && !opt.pieceIds.includes(p.id)).length;
  const stack = opt.pieceIds.length + joined;
  const waiting = mine(r).filter((p) => p.node === START && !opt.pieceIds.includes(p.id)).length;
  const treasure = dest !== HOME && !!treasureAt(r, dest);
  const boardTile = dest === HOME ? null : stationEffect(r, dest, opt);
  const trap = boardTile?.kind === 'trap';
  const heungUp = !trap && (victims.length > 0 || homed > 0 || joined > 0 || treasure || !!boardTile?.heung);
  const heung = trap ? 0 : Math.min(HEUNG_MAX, r.heung + (heungUp ? 1 : 0) + (boardTile?.heung || 0));
  const groupIds = dest === HOME ? opt.pieceIds : opt.pieceIds.concat(mine(r).filter((p) => p.node === dest && !opt.pieceIds.includes(p.id)).map((p) => p.id));
  const heroes = opt.pieceIds.map(heroOf).filter(Boolean).map((h) => h.id);
  const groupHeroes = groupIds.map(heroOf).filter(Boolean).map((h) => h.id);
  const minutes = tripMinutes(r, opt, roll);

  // 움직인 뒤의 판으로 위험도를 본다: 잡힌 도깨비는 차고로, 내 말은 도착 역으로.
  const after = r.pieces.map((p) => {
    if (opt.pieceIds.includes(p.id)) return { ...p, node: dest };
    if (victims.includes(p)) return { ...p, node: START, prev: null };
    return p;
  });
  const danger = dest === HOME || shielded(r, groupIds) ? 0 : dangerAt(r, dest, after);

  const score = scoreMove(r, {
    roll, result: roll.value, tier: roll.tier, stack, captured: victims.length, homed, waiting,
    onDiagonal: !!opt.diagonal, tile: r.tiles[dest] || null, boardTile, treasure, heung, heroes, groupHeroes,
    arriveAt: r.clock + minutes
  });
  return { dest, homed, captured: victims.length, stack, joined, treasure, boardTile, trap, heung, heungUp, danger, score, heroes, minutes };
}

export function scoreMove(r, info) {
  const roll = info.roll || { chips: 0, label: '' };
  let chips = roll.chips, mul = 1;
  const lines = [{ src: roll.label, chips }];
  const c = {
    ...info,
    chip(n, src) { chips += n; lines.push({ src, chips: n }); },
    mult(n, src) { mul += n; lines.push({ src, mult: n }); },
    times(k, src) { mul *= k; lines.push({ src, times: k }); }
  };
  if (info.tile === 'gold') c.mult(2, '황금 역');
  const bt = info.boardTile;
  if (bt?.chips) c.chip(bt.chips, bt.name);
  if (bt?.mult) c.mult(bt.mult, bt.name);
  if (info.stack > 1 && r.boss?.id !== 'noStack') c.mult(info.stack - 1, '함께 타기');
  if (info.captured > 0) { c.chip(CAPTURE_CHIPS * info.captured, '잡기'); c.mult(1, '잡기'); }
  if (info.homed > 0) { c.chip(HOME_CHIPS * info.homed, '골인'); c.mult(2, '골인'); }
  if (info.treasure) c.chip(TREASURE_CHIPS, '분실물');
  if (info.heung > 0) c.mult(info.heung, '만족도');
  // 원정대 능력 — 정기권보다 먼저
  for (const h of HEROES) if (h.score && info.heroes) h.score(c);
  for (const id of r.charms) {
    const charm = charmById(id);
    if (charm?.score) charm.score(c);
  }
  const when = timeOf(r, info.arriveAt ?? r.clock);
  if (when === 'rush' && roll.chips) c.chip(Math.round(roll.chips * 0.5), '러시아워');
  if (when === 'last' && info.homed > 0) c.mult(3, '막차');
  if (r.boss?.id === 'halfChips') {
    const half = Math.floor(chips / 2);
    lines.push({ src: '요금 반값', chips: half - chips });
    chips = half;
  }
  return { chips, mult: mul, total: chips * mul, lines };
}

/** 내 말을 움직인다. index 는 legalMoves 의 순번. */
export function applyMove(r, index, rng) {
  if (r.phase !== 'move') throw new Error('지금은 움직일 차례가 아닙니다');
  const opt = legalMoves(r)[index];
  if (!opt) throw new Error('없는 수입니다: ' + index);
  const roll = r.pending.roll;
  const ev = opt.preview;
  const events = moveGroup(r, 'me', opt, roll);
  events.push(...reveal(r));
  r.moves++;

  r.score += ev.score.total;
  r.lastMoveBest = Math.max(r.lastMoveBest, ev.score.total);
  events.push({ type: 'score', ...ev.score, score: r.score, target: r.target });
  if (ev.heungUp && ev.heung > r.heung) {
    r.heung = ev.heung;
    events.push({ type: 'heung', value: r.heung });
  }
  events.push(...landOnStation(r, ev));
  events.push(...afterMyStop(r, ev.dest, r.pieces.filter((p) => opt.pieceIds.includes(p.id))));
  // 시간이 흐른다(토끼의 추가 운행이면 공짜)
  events.push(...spend(r, ev.minutes, r.freeRide ? 'free' : 'trip'));
  r.freeRide = false;

  r.pending = null;
  // 목표에 닿는 순간 그날 운행을 마친다. 남은 운행 시간은 토큰이 된다 — 일찍 끝낼수록 이득.
  if (r.score >= r.target) return events.concat(finish(r, 'target'));
  if (mine(r).every((p) => p.node === HOME)) return events.concat(finish(r, 'allHome'));
  if (outOfTime(r)) return events.concat(finish(r, 'lastTrain'));
  if (r.extra > 0) {
    r.phase = 'throw';
    events.push({ type: 'again' });
    return events;
  }
  return events.concat(afterMyMove(r, rng));
}

/** 역 효과 중 점수 계산 밖에서 일어나는 것: 토큰, 공사중(만족도가 꺼진다). */
function landOnStation(r, ev) {
  const t = ev.boardTile;
  if (!t) return [];
  const events = [];
  if (t.coins) { r.coins += t.coins; events.push({ type: 'coin', node: ev.dest, amount: t.coins }); }
  if (t.kind === 'trap' && r.heung > 0) {
    events.push({ type: 'heungLost', value: r.heung, why: 'trap' });
    r.heung = 0;
  }
  return events;
}

/** owner 의 말 묶음을 실제로 옮기고 이벤트를 만든다. 잡기·골인·역·분실물까지. */
function moveGroup(r, owner, opt, roll) {
  const board = boardFor(r);
  const movers = r.pieces.filter((p) => opt.pieceIds.includes(p.id));
  const dest = opt.path[opt.path.length - 1];
  const events = [{ type: 'move', who: owner, pieceIds: opt.pieceIds, from: opt.from, path: opt.path, warp: !!opt.warp, roll }];
  for (const p of movers) {
    board.afterMove(p, opt, roll);
    p.node = dest;
  }

  if (dest === HOME) {
    if (owner === 'opp') {
      // 도깨비 열차가 종점에 닿으면 운행이 지연된다 — 파란 도깨비(도망꾼)를 쫓을 이유
      const delay = CLOCK.delay * movers.length;
      events.push({ type: 'home', who: owner, pieceIds: opt.pieceIds, delay });
      events.push(...spend(r, delay, 'delay'));
    } else {
      for (const p of movers) p.rider = null;
      events.push({ type: 'home', who: owner, pieceIds: opt.pieceIds });
    }
    return events;
  }

  const enemy = owner === 'me' ? 'opp' : 'me';
  const victims = r.pieces.filter((p) => p.owner === enemy && p.node === dest);
  // 토끼 안전 요원: 도깨비가 토끼가 낀 묶음을 잡으려 하면, 거꾸로 그 도깨비가 차고로 돌아간다
  if (victims.length && owner === 'opp' && shielded(r, victims.map((v) => v.id))) {
    r.escapeUsed = true;
    for (const p of movers) { p.node = START; p.prev = null; }
    events.push({ type: 'escape', node: dest, pieceIds: victims.map((v) => v.id), attackerIds: opt.pieceIds });
    return events;
  }
  if (victims.length) {
    for (const v of victims) { v.node = START; v.prev = null; v.rider = null; }
    if (owner === 'me') r.extra += 1;
    events.push({ type: 'capture', who: owner, node: dest, victimIds: victims.map((v) => v.id), attackerIds: opt.pieceIds });
    if (owner === 'opp' && r.heung > 0) {
      events.push({ type: 'heungLost', value: r.heung });
      r.heung = 0;
    }
  }

  const loot = treasureAt(r, dest);
  if (loot) {
    r.treasures = r.treasures.filter((t) => t !== loot);
    const coins = owner === 'me' ? TREASURE_COINS : 0;
    r.coins += coins;
    events.push({ type: 'treasureTake', who: owner, node: dest, coins });
  }

  if (owner === 'opp') events.push(...afterOppStop(r, dest));
  const tile = r.tiles[dest];
  if (tile === 'luck' && owner === 'me') { r.coins += 1; events.push({ type: 'coin', node: dest, amount: 1 }); }
  if (tile === 'trap' && owner === 'opp') {
    for (const p of movers) { p.node = START; p.prev = null; }
    events.push({ type: 'trap', node: dest, pieceIds: opt.pieceIds });
  }
  if (owner === 'me') {
    const stacked = mine(r).filter((p) => p.node === dest);
    if (stacked.length > movers.length) events.push({ type: 'stack', node: dest, pieceIds: stacked.map((p) => p.id) });
  }
  return events;
}

// ── 도깨비 차례 ─────────────────────────────────────────────

function afterMyMove(r, rng) {
  const events = opponentTurn(r, rng);
  events.push(...tickTreasures(r, rng));
  events.push(...expireBlockades(r));
  if (!outOfTime(r)) events.push(...fireEvent(r, rng));
  if (outOfTime(r)) return events.concat(finish(r, 'lastTrain'));
  r.phase = 'throw';
  return events;
}

/** 도깨비 차례가 끝날 때: 있던 분실물은 한 턴 줄고, 없으면 새로 나타날 수 있다. 손님도 오간다. */
function tickTreasures(r, rng) {
  const board = boardFor(r);
  const events = tickPassengers(r, rng);
  for (const t of r.treasures) t.ttl -= 1;
  for (const t of r.treasures.filter((x) => x.ttl <= 0)) events.push({ type: 'treasureGone', node: t.node });
  r.treasures = r.treasures.filter((t) => t.ttl > 0);
  if (r.treasures.length === 0 && rng.next() < TREASURE_CHANCE) {
    const node = pickFree(r, rng);
    if (node) {
      r.treasures.push({ node, ttl: TREASURE_TTL });
      events.push({ type: 'treasureSpawn', node, ttl: TREASURE_TTL });
    }
  }
  return events;
}

/** 아무것도 없는 역 하나(분실물·사건용) */
function pickFree(r, rng) {
  const b = boardFor(r);
  const taken = new Set([...r.pieces.map((p) => p.node), ...r.passengers.map((q) => q.node)]);
  const free = b.nodes.filter((n) => n !== b.S && n !== b.G && !taken.has(n) && !b.tile(n) && !r.tiles[n] && !treasureAt(r, n) && !b.blocked(n));
  return free.length ? free[Math.floor(rng.next() * free.length)] : null;
}

// ── 봉쇄 테이프 ─────────────────────────────────────────────

/** 이 역에 봉쇄 테이프를 칠 수 있나. 칠 수 없으면 이유, 칠 수 있으면 null */
export function blockadeBlocked(r, node) {
  const b = boardFor(r);
  if (r.phase !== 'throw') return '출발 전에만 칠 수 있다';
  if (r.blockadesLeft <= 0) return '오늘 봉쇄 테이프를 다 썼다';
  if (!b.nodes.includes(node) || node === b.S || node === b.G) return '출발역·종점은 막을 수 없다';
  if (b.blocked(node)) return '이미 운행 중지된 역이다';
  if (r.blockades.some((x) => x.node === node)) return '이미 봉쇄한 역이다';
  if (theirs(r).some((p) => p.node === node)) return '도깨비 열차가 서 있는 역은 막을 수 없다';
  return null;
}

/** 봉쇄 테이프를 친다: 3시간 동안 도깨비 열차는 이 역을 지나가지도, 멈추지도 못한다 */
export function placeBlockade(r, node) {
  const why = blockadeBlocked(r, node);
  if (why) throw new Error(why);
  r.blockadesLeft--;
  const until = r.clock + BLOCKADE.minutes;
  r.blockades.push({ node, until });
  return [{ type: 'blockade', node, until, left: r.blockadesLeft }];
}

function expireBlockades(r) {
  const gone = r.blockades.filter((b) => r.clock >= b.until);
  if (!gone.length) return [];
  r.blockades = r.blockades.filter((b) => r.clock < b.until);
  return gone.map((b) => ({ type: 'blockadeEnd', node: b.node }));
}

// ── 돌발 사건 ──────────────────────────────────────────────

/** 다음 사건 시각. 사건이 더 없으면 null. */
export function nextEventAt(r) {
  const due = r.eventPlan.find((e) => !e.done);
  return due ? due.at : null;
}

/** 내 차례가 시작될 때 예정 시각이 지난 사건이 있으면 터뜨린다. */
function fireEvent(r, rng) {
  const due = r.eventPlan.find((e) => !e.done && r.clock >= e.at);
  if (!due) return [];
  due.done = true;
  const info = eventById(due.id);
  const events = [{ type: 'event', id: info.id, name: info.name, desc: info.desc, good: info.good }];
  if (due.id === 'treasureRain') {
    for (let i = 0; i < 3; i++) {
      const node = pickFree(r, rng);
      if (!node) break;
      r.treasures.push({ node, ttl: TREASURE_TTL });
      events.push({ type: 'treasureSpawn', node, ttl: TREASURE_TTL });
    }
  } else if (due.id === 'goldRush') {
    const nodes = [];
    for (let i = 0; i < 2; i++) { const node = pickFree(r, rng); if (node) { r.tiles[node] = 'gold'; nodes.push(node); } }
    events.push({ type: 'goldRush', nodes });
  } else if (due.id === 'gust') {
    const blown = theirs(r).filter(onBoard);
    for (const p of blown) { p.node = START; p.prev = null; p.heading = null; }
    events.push({ type: 'gust', pieceIds: blown.map((p) => p.id) });
  } else if (due.id === 'feast') {
    r.heung = Math.min(HEUNG_MAX, r.heung + 2);
    events.push({ type: 'heung', value: r.heung });
  } else if (due.id === 'tailwind') {
    r.end += 60;
    events.push({ type: 'tailwind', end: r.end });
  } else if (due.id === 'market') {
    r.coins += 3;
    events.push({ type: 'eventCoins', amount: 3 });
  } else if (due.id === 'raid') {
    events.push(...opponentTurn(r, rng));
  }
  return events;
}

function opponentTurn(r, rng) {
  const board = boardFor(r);
  const events = [];
  if (!theirs(r).some((p) => p.node !== HOME)) return events;
  const turns = r.boss?.id === 'fastOpp' ? 2 : 1;
  events.push({ type: 'oppTurn', turns });
  for (let t = 0; t < turns; t++) {
    let again = true, guard = 0;
    while (again && guard++ < 6) {
      again = false;
      const roll = board.roll(rng);
      events.push({ type: 'throw', who: 'opp', board: r.boardId, roll, bonus: roll.bonus });
      let opts = oppOptions(r, roll);
      // 판다의 스크린도어: 내 말을 잡는 수는 막힌다
      if (r.shield) opts = opts.filter((o) => { const d = o.path[o.path.length - 1]; return d === HOME || !mine(r).some((p) => p.node === d); });
      if (opts.length === 0) { events.push({ type: 'noMove', who: 'opp', roll, why: r.shield ? 'shield' : r.blockades.length ? 'blockade' : 'none' }); continue; }
      const moved = moveGroup(r, 'opp', chooseOpp(r, opts), roll);
      events.push(...moved);
      again = roll.bonus || moved.some((e) => e.type === 'capture');
      if (outOfTime(r)) break;
    }
  }
  if (r.shield) { r.shield = false; events.push({ type: 'shieldDown' }); }
  planHeadings(r, rng);
  return events;
}

// ── 원정대 스킬 ─────────────────────────────────────────────

/** heroId 캐릭터가 지금 스킬을 쓸 수 있나. 쓸 수 없으면 이유 문자열, 쓸 수 있으면 null. */
export function skillBlocked(r, heroId) {
  const h = HEROES.find((x) => x.id === heroId);
  if (!h?.active) return '스킬이 없다';
  if (r.phase !== 'throw') return '출발 전에만 쓸 수 있다';
  if (r.skillsUsed.includes(heroId)) return '오늘 이미 썼다';
  const piece = mine(r).find((p) => heroOf(p.id)?.id === heroId);
  if (!piece || !onBoard(piece)) return '노선 위에 나와 있어야 쓸 수 있다';
  if (h.active.id === 'roar' && !theirs(r).some(onBoard)) return '돌려보낼 도깨비 열차가 없다';
  if (h.active.id === 'shield' && r.shield) return '이미 스크린도어를 닫았다';
  return null;
}

/** 스킬을 쓴다. 이벤트 목록: skill(컷인) 다음에 효과 이벤트들. */
export function useSkill(r, heroId, rng) {
  const why = skillBlocked(r, heroId);
  if (why) throw new Error(why);
  const h = HEROES.find((x) => x.id === heroId);
  const piece = mine(r).find((p) => heroOf(p.id)?.id === heroId);
  r.skillsUsed.push(heroId);
  const events = [{ type: 'skill', hero: heroId, pieceId: piece.id, node: piece.node, skill: h.active.id, name: h.active.name, desc: h.active.desc }];
  const board = boardFor(r);
  if (h.active.id === 'roar') {
    const lead = theirs(r).filter(onBoard).sort((a, b) => board.progress(b.node, 'opp') - board.progress(a.node, 'opp'))[0];
    const victims = theirs(r).filter((p) => p.node === lead.node);
    for (const p of victims) { p.node = START; p.prev = null; p.heading = null; }
    events.push({ type: 'roar', pieceId: piece.id, from: piece.node, node: lead.node, victimIds: victims.map((p) => p.id) });
  } else if (h.active.id === 'hop') {
    r.extra += 1;
    r.freeRide = true;
    events.push({ type: 'hop', pieceId: piece.id });
  } else if (h.active.id === 'chatter') {
    for (let i = 0; i < 2; i++) events.push(...spawnPassenger(r, rng));
  } else if (h.active.id === 'shield') {
    r.shield = true;
    events.push({ type: 'shieldUp', pieceIds: mine(r).filter(onBoard).map((p) => p.id) });
  }
  return events;
}

/**
 * 도깨비 AI. 성격마다 점수를 매겨 가장 높은 수를 고른다.
 *   사냥꾼(빨강): 잡기를 가장 좋아한다
 *   도망꾼(파랑): 골인을 가장 좋아한다 — 골인하면 운행이 지연된다
 * 둘 다 분실물을 탐내고, 노선 위의 열차를 차고 열차보다 먼저 민다. 미리 정해 둔 갈래(행선지)를 따른다.
 */
export function chooseOpp(r, opts) {
  const board = boardFor(r);
  const value = (o) => {
    const piece = r.pieces.find((p) => p.id === o.pieceIds[0]);
    const dest = o.path[o.path.length - 1];
    const victims = dest === HOME ? 0 : mine(r).filter((p) => p.node === dest).length;
    let v = board.progress(dest, 'opp') * 10;
    if (victims) v += (piece.trait === 'hunter' ? 100 : 45) + victims * 10;
    if (dest === HOME) v += piece.trait === 'runner' ? 120 : 30;
    if (dest !== HOME && treasureAt(r, dest)) v += 25;
    if (o.kind === 'new') v -= 4;
    const h = piece.heading;
    if (h && o.path.includes(h.at) && o.path.indexOf(h.at) < o.path.length - 1) v += o.path.includes(h.node) ? 35 : -35;
    return v;
  };
  let best = opts[0], bestV = -Infinity;
  for (const o of opts) { const v = value(o); if (v > bestV) { bestV = v; best = o; } }
  return best;
}

function finish(r, reason) {
  r.phase = 'over';
  r.outcome = r.score >= r.target ? 'win' : 'lose';
  return [{ type: 'roundOver', outcome: r.outcome, reason, score: r.score, target: r.target }];
}
