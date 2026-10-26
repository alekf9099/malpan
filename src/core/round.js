// 라운드 한 판의 규칙. 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다.
// 어떤 판(윷·주사위·체스)인지는 board 인터페이스(roll·options·tile·rollsFor)로만 안다.

import { START, HOME } from './board.js';
import { DEFAULT_P_FLAT } from './sticks.js';
import { charmById } from './items.js';
import { boardOf } from './boards/index.js';
import { KEY_CARDS } from './boards/marble.js';
import { HEROES, heroOf } from './heroes.js';
import { eventById } from './events.js';

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

/**
 * cfg: { number, target, throws, rerolls, myPieces, oppPieces, charms: [id], tiles: {node: tileId}, pFlat, boss, board, events }
 * events: 돌발 사건 계획 [{ at, id }] (events.js planEvents). 없으면 사건이 없다.
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
    boardId: cfg.board || 'yut',
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
    escapeUsed: false,
    eventPlan: (cfg.events || []).map((e) => ({ ...e, done: false })),
    pending: null,
    phase: 'throw',
    outcome: null,
    lastMoveBest: 0
  };
  for (const id of r.charms) charmById(id)?.roundStart?.(r);
  return r;
}

export const boardFor = (r) => boardOf(r.boardId);

// ── 굴리기 ─────────────────────────────────────────────────

export function throwYut(r, rng) {
  if (r.phase !== 'throw') throw new Error('지금은 던질 차례가 아닙니다: ' + r.phase);
  if (r.extra > 0) r.extra--;
  else if (r.throwsLeft > 0) r.throwsLeft--;
  else throw new Error('던질 기회가 없습니다');
  return settleThrow(r, boardFor(r).roll(rng, r), rng, false);
}

/** 이동하기 전에 결과를 다시 굴린다. 보너스로 받은 한 번 더는 되돌린다. */
export function reroll(r, rng) {
  if (r.phase !== 'move' || r.rerolls <= 0) throw new Error('다시 던질 수 없습니다');
  r.rerolls--;
  r.extra -= r.pending.granted;
  return settleThrow(r, boardFor(r).roll(rng, r), rng, true);
}

function settleThrow(r, roll, rng, rerolled) {
  const granted = roll.bonus ? 1 : 0;
  r.extra += granted;
  r.pending = { roll, granted };
  const events = [{ type: 'throw', who: 'me', board: r.boardId, roll, bonus: granted > 0, rerolled }];
  if (legalMoves(r).length === 0) {
    events.push({ type: 'noMove', roll, why: bossBlocks(r, roll) ? 'boss' : 'none' });
    r.pending = null;
    events.push(...afterMyMove(r, rng));
  } else {
    r.phase = 'move';
  }
  return events;
}

const bossBlocks = (r, roll) => r.boss?.id === 'noDo' && roll.tier === 1;

// ── 수 ─────────────────────────────────────────────────────

const mine = (r) => r.pieces.filter((p) => p.owner === 'me');
const theirs = (r) => r.pieces.filter((p) => p.owner === 'opp');
const onBoard = (p) => p.node !== START && p.node !== HOME;
const treasureAt = (r, node) => r.treasures.find((t) => t.node === node);

/** 지금 나온 결과로 둘 수 있는 수. 각 수에 예상 점수·위험도(preview)를 붙여 화면이 미리 보여줄 수 있게 한다. */
export function legalMoves(r) {
  if (!r.pending) return [];
  const roll = r.pending.roll;
  if (bossBlocks(r, roll)) return [];
  return boardFor(r).options(r.pieces, 'me', roll).map((o) => ({ ...o, preview: evaluate(r, o, roll) }));
}

/**
 * 도깨비가 다음 차례에 node 에 멈출 확률(한 번 굴린다고 보고, 갈 수 있는 수가 하나라도 있으면 위험으로 친다).
 * pieces 를 넘기면 그 배치로 계산한다 — 내가 움직인 "뒤"의 판을 미리 보려고.
 */
export function dangerAt(r, node, pieces = r.pieces) {
  if (node === START || node === HOME) return 0;
  const board = boardFor(r);
  let p = 0;
  for (const { roll, p: pr } of board.rollsFor()) {
    if (board.options(pieces, 'opp', roll).some((o) => o.path[o.path.length - 1] === node)) p += pr;
  }
  return r.boss?.id === 'fastOpp' ? 1 - (1 - p) ** 2 : p;
}

/** 토끼의 꾀가 남아 있고 이 칸 묶음에 토끼가 끼어 있으면 잡히지 않는다. */
const shielded = (r, ids) => !r.escapeUsed && ids.some((id) => heroOf(id)?.escape);

/** 지금 판 위 내 말 묶음마다 잡힐 확률. 화면이 위험한 말에 표시를 단다. */
export function threats(r) {
  const out = {};
  for (const p of mine(r)) {
    if (!onBoard(p) || out[p.node] != null) continue;
    const ids = mine(r).filter((q) => q.node === p.node).map((q) => q.id);
    out[p.node] = shielded(r, ids) ? 0 : dangerAt(r, p.node);
  }
  return out;
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
  const boardTile = dest === HOME ? null : boardFor(r).tile(dest);
  const trap = boardTile?.kind === 'trap';
  const heungUp = !trap && (victims.length > 0 || homed > 0 || joined > 0 || treasure || !!boardTile?.heung);
  const heung = trap ? 0 : Math.min(HEUNG_MAX, r.heung + (heungUp ? 1 : 0) + (boardTile?.heung || 0));
  const groupIds = dest === HOME ? opt.pieceIds : opt.pieceIds.concat(mine(r).filter((p) => p.node === dest && !opt.pieceIds.includes(p.id)).map((p) => p.id));
  const heroes = opt.pieceIds.map(heroOf).filter(Boolean).map((h) => h.id);
  const groupHeroes = groupIds.map(heroOf).filter(Boolean).map((h) => h.id);

  // 움직인 뒤의 판으로 위험도를 본다: 잡힌 도깨비는 출발로, 내 말은 도착 칸으로.
  const after = r.pieces.map((p) => {
    if (opt.pieceIds.includes(p.id)) return { ...p, node: dest };
    if (victims.includes(p)) return { ...p, node: START, prev: null };
    return p;
  });
  const danger = dest === HOME || shielded(r, groupIds) ? 0 : dangerAt(r, dest, after);

  const score = scoreMove(r, {
    roll, result: roll.value, tier: roll.tier, stack, captured: victims.length, homed, waiting,
    onDiagonal: !!opt.diagonal, tile: r.tiles[dest] || null, boardTile, treasure, heung, heroes, groupHeroes
  });
  return { dest, homed, captured: victims.length, stack, joined, treasure, boardTile, trap, heung, heungUp, danger, score, heroes };
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
  if (info.tile === 'gold') c.mult(2, '황금 칸');
  const bt = info.boardTile;
  if (bt?.chips) c.chip(bt.chips, bt.name);
  if (bt?.mult) c.mult(bt.mult, bt.name);
  if (info.stack > 1 && r.boss?.id !== 'noStack') c.mult(info.stack - 1, '업기');
  if (info.captured > 0) { c.chip(CAPTURE_CHIPS * info.captured, '잡기'); c.mult(1, '잡기'); }
  if (info.homed > 0) { c.chip(HOME_CHIPS * info.homed, '골인'); c.mult(2, '골인'); }
  if (info.treasure) c.chip(TREASURE_CHIPS, '보따리');
  if (info.heung > 0) c.mult(info.heung, '흥');
  // 원정대 능력 — 부적보다 먼저
  for (const h of HEROES) if (h.score && info.heroes) h.score(c);
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
  const roll = r.pending.roll;
  const ev = opt.preview;
  const events = moveGroup(r, 'me', opt, roll);

  r.score += ev.score.total;
  r.lastMoveBest = Math.max(r.lastMoveBest, ev.score.total);
  events.push({ type: 'score', ...ev.score, score: r.score, target: r.target });
  if (ev.heungUp && ev.heung > r.heung) {
    r.heung = ev.heung;
    events.push({ type: 'heung', value: r.heung });
  }
  events.push(...landOnBoardTile(r, ev, rng));

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

/** 판 고유 칸 효과 중 점수 계산 밖에서 일어나는 것: 엽전, 함정, 황금열쇠 카드. */
function landOnBoardTile(r, ev, rng) {
  const t = ev.boardTile;
  if (!t) return [];
  const events = [];
  if (t.coins) { r.coins += t.coins; events.push({ type: 'coin', node: ev.dest, amount: t.coins }); }
  if (t.kind === 'trap' && r.heung > 0) {
    events.push({ type: 'heungLost', value: r.heung, why: 'trap' });
    r.heung = 0;
  }
  if (t.kind === 'key') {
    const card = KEY_CARDS[Math.floor(rng.next() * KEY_CARDS.length)];
    const e = { type: 'keyCard', node: ev.dest, card };
    if (card.id === 'chips') { r.score += 80; e.bonus = 80; e.score = r.score; }
    if (card.id === 'coins') r.coins += 3;
    if (card.id === 'heung') r.heung = Math.min(HEUNG_MAX, r.heung + 2);
    if (card.id === 'again') r.extra += 1;
    if (card.id === 'banish') {
      const board = boardFor(r);
      const lead = theirs(r).filter(onBoard).sort((a, b) => board.progress(b.node, 'opp') - board.progress(a.node, 'opp'))[0];
      if (lead) { e.victimIds = theirs(r).filter((p) => p.node === lead.node).map((p) => p.id); for (const p of theirs(r).filter((q) => q.node === lead.node)) { p.node = START; p.prev = null; } }
    }
    e.heung = r.heung;
    events.push(e);
  }
  return events;
}

/** owner 의 말 묶음을 실제로 옮기고 이벤트를 만든다. 잡기·골인·칸·보따리까지. */
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
  // 토끼의 꾀: 도깨비가 토끼가 낀 묶음을 잡으려 하면, 거꾸로 그 도깨비가 출발로 돌아간다
  if (victims.length && owner === 'opp' && shielded(r, victims.map((v) => v.id))) {
    r.escapeUsed = true;
    for (const p of movers) { p.node = START; p.prev = null; }
    events.push({ type: 'escape', node: dest, pieceIds: victims.map((v) => v.id), attackerIds: opt.pieceIds });
    return events;
  }
  if (victims.length) {
    for (const v of victims) { v.node = START; v.prev = null; }
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
    const times = owner === 'me' ? Math.max(1, ...movers.map((p) => heroOf(p.id)?.lootMultiplier || 1)) : 0;
    const coins = TREASURE_COINS * times;
    r.coins += coins;
    events.push({ type: 'treasureTake', who: owner, node: dest, coins });
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
  if (r.throwsLeft > 0 || r.extra > 0) events.push(...fireEvent(r, rng));
  if (r.throwsLeft <= 0 && r.extra <= 0) return events.concat(finish(r, 'outOfThrows'));
  r.phase = 'throw';
  return events;
}

/** 도깨비 차례가 끝날 때: 있던 보따리는 한 턴 줄고, 없으면 새로 나타날 수 있다. */
function tickTreasures(r, rng) {
  const board = boardFor(r);
  const events = [];
  for (const t of r.treasures) t.ttl -= 1;
  for (const t of r.treasures.filter((x) => x.ttl <= 0)) events.push({ type: 'treasureGone', node: t.node });
  r.treasures = r.treasures.filter((t) => t.ttl > 0);
  if (r.treasures.length === 0 && rng.next() < TREASURE_CHANCE) {
    const taken = new Set(r.pieces.map((p) => p.node));
    const free = board.nodes.filter((n) => n !== board.entry && !taken.has(n) && !board.tile(n));
    if (free.length) {
      const node = free[Math.floor(rng.next() * free.length)];
      r.treasures.push({ node, ttl: TREASURE_TTL });
      events.push({ type: 'treasureSpawn', node, ttl: TREASURE_TTL });
    }
  }
  return events;
}

/** 다음 사건까지 남은 내 차례 수. 사건이 더 없으면 null. */
export function nextEventIn(r) {
  const due = r.eventPlan.find((e) => !e.done);
  return due ? Math.max(0, r.throwsLeft - due.at) : null;
}

/** 내 차례가 시작될 때 예정된 사건이 있으면 터뜨린다. */
function fireEvent(r, rng) {
  const due = r.eventPlan.find((e) => !e.done && r.throwsLeft <= e.at);
  if (!due) return [];
  due.done = true;
  const info = eventById(due.id);
  const board = boardFor(r);
  const events = [{ type: 'event', id: info.id, name: info.name, desc: info.desc, good: info.good }];
  const free = () => {
    const taken = new Set(r.pieces.map((p) => p.node));
    return board.nodes.filter((n) => n !== board.entry && !taken.has(n) && !board.tile(n) && !r.tiles[n] && !treasureAt(r, n));
  };
  const pickFree = () => { const f = free(); return f.length ? f[Math.floor(rng.next() * f.length)] : null; };
  if (due.id === 'treasureRain') {
    for (let i = 0; i < 3; i++) {
      const node = pickFree();
      if (!node) break;
      r.treasures.push({ node, ttl: TREASURE_TTL });
      events.push({ type: 'treasureSpawn', node, ttl: TREASURE_TTL });
    }
  } else if (due.id === 'goldRush') {
    const nodes = [];
    for (let i = 0; i < 2; i++) { const node = pickFree(); if (node) { r.tiles[node] = 'gold'; nodes.push(node); } }
    events.push({ type: 'goldRush', nodes });
  } else if (due.id === 'gust') {
    const blown = theirs(r).filter(onBoard);
    for (const p of blown) { p.node = START; p.prev = null; }
    events.push({ type: 'gust', pieceIds: blown.map((p) => p.id) });
  } else if (due.id === 'feast') {
    r.heung = Math.min(HEUNG_MAX, r.heung + 2);
    events.push({ type: 'heung', value: r.heung });
  } else if (due.id === 'tailwind') {
    r.throwsLeft += 1;
    events.push({ type: 'tailwind', throwsLeft: r.throwsLeft });
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
      // 도깨비는 윷판에서 기본 윷을 쓴다(플레이어의 윷가락 개조와 무관)
      const roll = board.roll(rng, { pFlat: DEFAULT_P_FLAT });
      events.push({ type: 'throw', who: 'opp', board: r.boardId, roll, bonus: roll.bonus });
      const opts = board.options(r.pieces, 'opp', roll);
      if (opts.length === 0) { events.push({ type: 'noMove', who: 'opp', roll }); continue; }
      const moved = moveGroup(r, 'opp', chooseOpp(r, opts), roll);
      events.push(...moved);
      again = roll.bonus || moved.some((e) => e.type === 'capture');
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
  const board = boardFor(r);
  const value = (o) => {
    const trait = r.pieces.find((p) => p.id === o.pieceIds[0]).trait;
    const dest = o.path[o.path.length - 1];
    const victims = dest === HOME ? 0 : mine(r).filter((p) => p.node === dest).length;
    let v = board.progress(dest, 'opp') * 10;
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
