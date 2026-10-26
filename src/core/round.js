// 라운드 한 판의 규칙. 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다.
// 화면은 그 목록을 순서대로 연출하기만 한다.

import { START, HOME, NODES, walk, prevAfterWalk, defaultPrev, DIAGONAL, progress } from './board.js';
import { throwSticks, isBonus, distribution, BACKDO, DO, NAMES, DEFAULT_P_FLAT } from './sticks.js';
import { charmById } from './items.js';

export const BASE_CHIPS = { [BACKDO]: 15, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
export const CAPTURE_CHIPS = 50;
export const HOME_CHIPS = 100;

// 흥: 잡기·업기·골인·보따리마다 1씩 올라 모든 이동에 배수로 붙는다. 내 말이 잡히면 꺼진다.
export const HEUNG_MAX = 5;
// 보따리: 도깨비 차례가 끝날 때 확률로 판에 나타나 내 차례 3번 동안 머문다.
export const TREASURE_CHANCE = 0.5;
export const TREASURE_TTL = 3;
export const TREASURE_CHIPS = 40;
export const TREASURE_COINS = 2;
// 도깨비가 골인하면 내 던질 기회가 하나 줄어든다 — 파란 도깨비(도망꾼)를 쫓을 이유.
export const OPP_HOME_PENALTY = 1;

const RESULTS = [BACKDO, 1, 2, 3, 4, 5];

/**
 * cfg: { number, target, throws, rerolls, myPieces, oppPieces, charms: [id], tiles: {node: tileId}, pFlat, boss }
 */
export function createRound(cfg) {
  const pieces = [];
  for (let i = 0; i < cfg.myPieces; i++) pieces.push({ id: 'm' + i, owner: 'me', node: START, prev: null });
  for (let i = 0; i < cfg.oppPieces; i++) {
    // 짝수 번째는 빨간 사냥꾼(잡기 우선), 홀수 번째는 파란 도망꾼(골인 우선). 그림 색과 맞춘다.
    pieces.push({ id: 'd' + i, owner: 'opp', node: START, prev: null, trait: i % 2 === 0 ? 'hunter' : 'runner' });
  }
  const r = {
    number: cfg.number,
    target: cfg.target,
    score: 0,
    throwsLeft: cfg.throws,
    rerolls: cfg.rerolls,
    extra: 0,
    heung: 0,
    treasures: [],
    pieces,
    charms: cfg.charms.slice(),
    tiles: { ...cfg.tiles },
    pFlat: cfg.pFlat ?? DEFAULT_P_FLAT,
    boss: cfg.boss || null,
    coins: 0,
    pending: null,
    phase: 'throw',
    outcome: null,
    lastMoveBest: 0
  };
  for (const id of r.charms) charmById(id)?.roundStart?.(r);
  return r;
}

// ── 던지기 ─────────────────────────────────────────────────

export function throwYut(r, rng) {
  if (r.phase !== 'throw') throw new Error('지금은 던질 차례가 아닙니다: ' + r.phase);
  if (r.extra > 0) r.extra--;
  else if (r.throwsLeft > 0) r.throwsLeft--;
  else throw new Error('던질 기회가 없습니다');
  return settleThrow(r, throwSticks(rng, r.pFlat), rng, false);
}

/** 이동하기 전에 결과를 다시 던진다. 윷·모로 받은 한 번 더는 되돌린다. */
export function reroll(r, rng) {
  if (r.phase !== 'move' || r.rerolls <= 0) throw new Error('다시 던질 수 없습니다');
  r.rerolls--;
  r.extra -= r.pending.granted;
  return settleThrow(r, throwSticks(rng, r.pFlat), rng, true);
}

function settleThrow(r, t, rng, rerolled) {
  const granted = isBonus(t.result) ? 1 : 0;
  r.extra += granted;
  r.pending = { result: t.result, flats: t.flats, granted };
  const events = [{ type: 'throw', who: 'me', result: t.result, flats: t.flats, bonus: granted > 0, rerolled }];
  if (legalMoves(r).length === 0) {
    const why = r.boss?.id === 'noDo' && t.result === DO ? 'boss' : 'none';
    events.push({ type: 'noMove', result: t.result, why });
    r.pending = null;
    events.push(...afterMyMove(r, rng));
  } else {
    r.phase = 'move';
  }
  return events;
}

// ── 수 ─────────────────────────────────────────────────────

const mine = (r) => r.pieces.filter((p) => p.owner === 'me');
const theirs = (r) => r.pieces.filter((p) => p.owner === 'opp');
const onBoard = (p) => p.node !== START && p.node !== HOME;
const treasureAt = (r, node) => r.treasures.find((t) => t.node === node);

/** owner 가 result 로 둘 수 있는 수. 같은 칸의 말은 업혀 있으므로 한 수로 묶는다. */
function optionsFor(pieces, owner, result) {
  const own = pieces.filter((p) => p.owner === owner);
  const opts = [];
  const seen = new Set();
  for (const p of own) {
    if (!onBoard(p) || seen.has(p.node)) continue;
    seen.add(p.node);
    const ids = own.filter((q) => q.node === p.node).map((q) => q.id);
    const path = result === BACKDO ? [p.prev || defaultPrev(p.node)] : walk(p.node, result, p.prev);
    opts.push({ kind: 'stack', from: p.node, pieceIds: ids, path });
  }
  const waiting = own.find((p) => p.node === START);
  if (waiting && result !== BACKDO) {
    opts.push({ kind: 'new', from: START, pieceIds: [waiting.id], path: walk(START, result, null) });
  }
  return opts;
}

/** 지금 나온 결과로 둘 수 있는 수. 각 수에 예상 점수·위험도(preview)를 붙여 화면이 미리 보여줄 수 있게 한다. */
export function legalMoves(r) {
  if (!r.pending) return [];
  const result = r.pending.result;
  if (r.boss?.id === 'noDo' && result === DO) return [];
  return optionsFor(r.pieces, 'me', result).map((o) => ({ ...o, preview: evaluate(r, o, result) }));
}

/**
 * 도깨비가 다음 차례에 node 에 멈출 확률(한 번 던진다고 보고, 갈 수 있는 수가 하나라도 있으면 위험으로 친다).
 * pieces 를 넘기면 그 배치로 계산한다 — 내가 움직인 "뒤"의 판을 미리 보려고.
 */
export function dangerAt(r, node, pieces = r.pieces) {
  if (node === START || node === HOME) return 0;
  const dist = distribution(DEFAULT_P_FLAT);
  let p = 0;
  for (const res of RESULTS) {
    if (optionsFor(pieces, 'opp', res).some((o) => o.path[o.path.length - 1] === node)) p += dist[res];
  }
  return r.boss?.id === 'fastOpp' ? 1 - (1 - p) ** 2 : p;
}

/** 지금 판 위 내 말 묶음마다 잡힐 확률. 화면이 위험한 말에 표시를 단다. */
export function threats(r) {
  const out = {};
  for (const p of mine(r)) if (onBoard(p) && out[p.node] == null) out[p.node] = dangerAt(r, p.node);
  return out;
}

/** 이 수를 두면 무슨 일이 생기는지 계산만 한다(상태를 바꾸지 않는다). */
function evaluate(r, opt, result) {
  const dest = opt.path[opt.path.length - 1];
  const homed = dest === HOME ? opt.pieceIds.length : 0;
  const victims = dest === HOME ? [] : theirs(r).filter((p) => p.node === dest);
  const joined = dest === HOME ? 0 : mine(r).filter((p) => p.node === dest && !opt.pieceIds.includes(p.id)).length;
  const stack = opt.pieceIds.length + joined;
  const waiting = mine(r).filter((p) => p.node === START && !opt.pieceIds.includes(p.id)).length;
  const onDiagonal = DIAGONAL.has(opt.from) || opt.path.some((n) => DIAGONAL.has(n));
  const treasure = dest !== HOME && !!treasureAt(r, dest);
  const heungUp = victims.length > 0 || homed > 0 || joined > 0 || treasure;
  const heung = Math.min(HEUNG_MAX, r.heung + (heungUp ? 1 : 0));

  // 움직인 뒤의 판으로 위험도를 본다: 잡힌 도깨비는 출발로, 내 말은 도착 칸으로.
  const after = r.pieces.map((p) => {
    if (opt.pieceIds.includes(p.id)) return { ...p, node: dest };
    if (victims.includes(p)) return { ...p, node: START, prev: null };
    return p;
  });
  const danger = dest === HOME ? 0 : dangerAt(r, dest, after);

  const score = scoreMove(r, {
    result, stack, captured: victims.length, homed, waiting, onDiagonal, tile: r.tiles[dest] || null, treasure, heung
  });
  return { dest, homed, captured: victims.length, stack, joined, treasure, heung, heungUp, danger, score };
}

export function scoreMove(r, info) {
  let chips = BASE_CHIPS[info.result], mul = 1;
  const lines = [{ src: NAMES[info.result], chips }];
  const c = {
    ...info,
    chip(n, src) { chips += n; lines.push({ src, chips: n }); },
    mult(n, src) { mul += n; lines.push({ src, mult: n }); },
    times(k, src) { mul *= k; lines.push({ src, times: k }); }
  };
  if (info.tile === 'gold') c.mult(2, '황금 칸');
  if (info.stack > 1 && r.boss?.id !== 'noStack') c.mult(info.stack - 1, '업기');
  if (info.captured > 0) { c.chip(CAPTURE_CHIPS * info.captured, '잡기'); c.mult(1, '잡기'); }
  if (info.homed > 0) { c.chip(HOME_CHIPS * info.homed, '골인'); c.mult(2, '골인'); }
  if (info.treasure) c.chip(TREASURE_CHIPS, '보따리');
  if (info.heung > 0) c.mult(info.heung, '흥');
  for (const id of r.charms) {
    const charm = charmById(id);
    if (charm?.score) charm.score(c);
  }
  if (r.boss?.id === 'halfChips') {
    const half = Math.floor(chips / 2);
    lines.push({ src: '구두쇠', chips: half - chips });
    chips = half;
  }
  return { chips, mult: mul, total: chips * mul, lines };
}

/** 내 말을 움직인다. index 는 legalMoves 의 순번. */
export function applyMove(r, index, rng) {
  if (r.phase !== 'move') throw new Error('지금은 움직일 차례가 아닙니다');
  const opt = legalMoves(r)[index];
  if (!opt) throw new Error('없는 수입니다: ' + index);
  const result = r.pending.result;
  const ev = opt.preview;
  const events = moveGroup(r, 'me', opt, result);

  r.score += ev.score.total;
  r.lastMoveBest = Math.max(r.lastMoveBest, ev.score.total);
  events.push({ type: 'score', ...ev.score, score: r.score, target: r.target });
  if (ev.heungUp && ev.heung > r.heung) {
    r.heung = ev.heung;
    events.push({ type: 'heung', value: r.heung });
  }

  r.pending = null;
  // 목표에 닿는 순간 라운드가 끝난다. 남은 던질 기회는 엽전이 된다 — 빨리 끝낼수록 이득.
  if (r.score >= r.target) return events.concat(finish(r, 'target'));
  if (mine(r).every((p) => p.node === HOME)) return events.concat(finish(r, 'allHome'));
  if (r.extra > 0) {
    r.phase = 'throw';
    events.push({ type: 'again' });
    return events;
  }
  return events.concat(afterMyMove(r, rng));
}

/** owner 의 말 묶음을 실제로 옮기고 이벤트를 만든다. 잡기·골인·칸·보따리까지. */
function moveGroup(r, owner, opt, result) {
  const movers = r.pieces.filter((p) => opt.pieceIds.includes(p.id));
  const dest = opt.path[opt.path.length - 1];
  const events = [{ type: 'move', who: owner, pieceIds: opt.pieceIds, from: opt.from, path: opt.path, result }];
  for (const p of movers) {
    p.prev = result === BACKDO ? defaultPrev(dest === HOME ? 'o0' : dest) : prevAfterWalk(opt.from, opt.path);
    p.node = dest;
  }

  if (dest === HOME) {
    if (owner === 'opp') {
      const lost = Math.min(r.throwsLeft, OPP_HOME_PENALTY * movers.length);
      r.throwsLeft -= lost;
      events.push({ type: 'home', who: owner, pieceIds: opt.pieceIds, throwsLost: lost });
    } else {
      events.push({ type: 'home', who: owner, pieceIds: opt.pieceIds });
    }
    return events;
  }

  const enemy = owner === 'me' ? 'opp' : 'me';
  const victims = r.pieces.filter((p) => p.owner === enemy && p.node === dest);
  if (victims.length) {
    for (const v of victims) { v.node = START; v.prev = null; }
    if (owner === 'me') r.extra += 1;
    events.push({ type: 'capture', who: owner, node: dest, victimIds: victims.map((v) => v.id) });
    if (owner === 'opp' && r.heung > 0) {
      events.push({ type: 'heungLost', value: r.heung });
      r.heung = 0;
    }
  }

  const loot = treasureAt(r, dest);
  if (loot) {
    r.treasures = r.treasures.filter((t) => t !== loot);
    if (owner === 'me') r.coins += TREASURE_COINS;
    events.push({ type: 'treasureTake', who: owner, node: dest, coins: owner === 'me' ? TREASURE_COINS : 0 });
  }

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
  if (r.throwsLeft <= 0 && r.extra <= 0) return events.concat(finish(r, 'outOfThrows'));
  r.phase = 'throw';
  return events;
}

/** 도깨비 차례가 끝날 때: 있던 보따리는 한 턴 줄고, 없으면 새로 나타날 수 있다. */
function tickTreasures(r, rng) {
  const events = [];
  for (const t of r.treasures) t.ttl -= 1;
  for (const t of r.treasures.filter((x) => x.ttl <= 0)) events.push({ type: 'treasureGone', node: t.node });
  r.treasures = r.treasures.filter((t) => t.ttl > 0);
  if (r.treasures.length === 0 && rng.next() < TREASURE_CHANCE) {
    const taken = new Set(r.pieces.map((p) => p.node));
    const free = NODES.filter((n) => n !== 'o0' && !taken.has(n));
    if (free.length) {
      const node = free[Math.floor(rng.next() * free.length)];
      r.treasures.push({ node, ttl: TREASURE_TTL });
      events.push({ type: 'treasureSpawn', node, ttl: TREASURE_TTL });
    }
  }
  return events;
}

function opponentTurn(r, rng) {
  const events = [];
  if (!theirs(r).some((p) => p.node !== HOME)) return events;
  const turns = r.boss?.id === 'fastOpp' ? 2 : 1;
  events.push({ type: 'oppTurn', turns });
  for (let t = 0; t < turns; t++) {
    let again = true, guard = 0;
    while (again && guard++ < 6) {
      again = false;
      const th = throwSticks(rng, DEFAULT_P_FLAT);
      events.push({ type: 'throw', who: 'opp', result: th.result, flats: th.flats, bonus: isBonus(th.result) });
      const opts = optionsFor(r.pieces, 'opp', th.result);
      if (opts.length === 0) { events.push({ type: 'noMove', who: 'opp', result: th.result }); continue; }
      const moved = moveGroup(r, 'opp', chooseOpp(r, opts), th.result);
      events.push(...moved);
      again = isBonus(th.result) || moved.some((e) => e.type === 'capture');
      if (r.throwsLeft <= 0 && r.extra <= 0 && moved.some((e) => e.type === 'home')) break;
    }
  }
  return events;
}

/**
 * 도깨비 AI. 성격마다 점수를 매겨 가장 높은 수를 고른다.
 *   사냥꾼(빨강): 잡기를 가장 좋아한다
 *   도망꾼(파랑): 골인을 가장 좋아한다 — 골인하면 플레이어의 던질 기회가 준다
 * 둘 다 보따리를 탐내고, 판 위의 말을 새 말보다 먼저 민다.
 */
export function chooseOpp(r, opts) {
  const value = (o) => {
    const trait = r.pieces.find((p) => p.id === o.pieceIds[0]).trait;
    const dest = o.path[o.path.length - 1];
    const victims = dest === HOME ? 0 : mine(r).filter((p) => p.node === dest).length;
    let v = progress(dest === HOME ? HOME : dest) * 10;
    if (victims) v += (trait === 'hunter' ? 100 : 45) + victims * 10;
    if (dest === HOME) v += trait === 'runner' ? 120 : 30;
    if (dest !== HOME && treasureAt(r, dest)) v += 25;
    if (o.kind === 'new') v -= 4;
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
