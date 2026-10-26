// 라운드 한 판의 규칙. 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다.
// 화면은 그 목록을 순서대로 연출하기만 한다.

import { START, HOME, walk, prevAfterWalk, defaultPrev, DIAGONAL, progress } from './board.js';
import { throwSticks, isBonus, BACKDO, DO, NAMES, DEFAULT_P_FLAT } from './sticks.js';
import { charmById } from './items.js';

export const BASE_CHIPS = { [BACKDO]: 15, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };
export const CAPTURE_CHIPS = 50;
export const HOME_CHIPS = 100;

/**
 * cfg: { number, target, throws, rerolls, myPieces, oppPieces, charms: [id], tiles: {node: tileId}, pFlat, boss }
 */
export function createRound(cfg) {
  const pieces = [];
  for (let i = 0; i < cfg.myPieces; i++) pieces.push({ id: 'm' + i, owner: 'me', node: START, prev: null });
  for (let i = 0; i < cfg.oppPieces; i++) pieces.push({ id: 'd' + i, owner: 'opp', node: START, prev: null });
  const r = {
    number: cfg.number,
    target: cfg.target,
    score: 0,
    throwsLeft: cfg.throws,
    rerolls: cfg.rerolls,
    extra: 0,
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

// ── 이동 ───────────────────────────────────────────────────

const mine = (r) => r.pieces.filter((p) => p.owner === 'me');
const theirs = (r) => r.pieces.filter((p) => p.owner === 'opp');
const onBoard = (p) => p.node !== START && p.node !== HOME;

function optionsFor(r, owner, result) {
  const own = r.pieces.filter((p) => p.owner === owner);
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

/** 지금 나온 결과로 둘 수 있는 수. 각 수에 예상 점수(preview)를 붙여 화면이 미리 보여줄 수 있게 한다. */
export function legalMoves(r) {
  if (!r.pending) return [];
  const result = r.pending.result;
  if (r.boss?.id === 'noDo' && result === DO) return [];
  return optionsFor(r, 'me', result).map((o) => ({ ...o, preview: evaluate(r, o, result) }));
}

/** 이 수를 두면 무슨 일이 생기는지 계산만 한다(상태를 바꾸지 않는다). */
function evaluate(r, opt, result) {
  const dest = opt.path[opt.path.length - 1];
  const homed = dest === HOME ? opt.pieceIds.length : 0;
  const victims = dest === HOME ? [] : theirs(r).filter((p) => p.node === dest);
  const stack = dest === HOME
    ? opt.pieceIds.length
    : opt.pieceIds.length + mine(r).filter((p) => p.node === dest && !opt.pieceIds.includes(p.id)).length;
  const waiting = mine(r).filter((p) => p.node === START && !opt.pieceIds.includes(p.id)).length;
  const onDiagonal = DIAGONAL.has(opt.from) || opt.path.some((n) => DIAGONAL.has(n));
  const score = scoreMove(r, {
    result, stack, captured: victims.length, homed, waiting, onDiagonal, tile: r.tiles[dest] || null
  });
  return { dest, homed, captured: victims.length, stack, score };
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
  const events = moveGroup(r, 'me', opt, result);

  const ev = opt.preview;
  r.score += ev.score.total;
  r.lastMoveBest = Math.max(r.lastMoveBest, ev.score.total);
  events.push({ type: 'score', ...ev.score, score: r.score, target: r.target });

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

/** owner 의 말 묶음을 실제로 옮기고 이벤트를 만든다. 잡기·골인·칸 효과까지. */
function moveGroup(r, owner, opt, result) {
  const movers = r.pieces.filter((p) => opt.pieceIds.includes(p.id));
  const dest = opt.path[opt.path.length - 1];
  const events = [{ type: 'move', who: owner, pieceIds: opt.pieceIds, from: opt.from, path: opt.path, result }];
  for (const p of movers) {
    p.prev = result === BACKDO ? defaultPrev(dest === HOME ? 'o0' : dest) : prevAfterWalk(opt.from, opt.path);
    p.node = dest;
  }

  if (dest === HOME) {
    events.push({ type: 'home', who: owner, pieceIds: opt.pieceIds });
    return events;
  }

  const enemy = owner === 'me' ? 'opp' : 'me';
  const victims = r.pieces.filter((p) => p.owner === enemy && p.node === dest);
  if (victims.length) {
    for (const v of victims) { v.node = START; v.prev = null; }
    r.extra += owner === 'me' ? 1 : 0;
    events.push({ type: 'capture', who: owner, node: dest, victimIds: victims.map((v) => v.id) });
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
  if (r.throwsLeft <= 0 && r.extra <= 0) return events.concat(finish(r, 'outOfThrows'));
  r.phase = 'throw';
  return events;
}

/** 도깨비 AI: 잡을 수 있으면 잡고, 아니면 가장 앞선 말을 민다. 판에 말이 없으면 새로 낸다. */
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
      const opts = optionsFor(r, 'opp', th.result);
      if (opts.length === 0) { events.push({ type: 'noMove', who: 'opp', result: th.result }); continue; }
      const pick = chooseOpp(r, opts);
      const moved = moveGroup(r, 'opp', pick, th.result);
      events.push(...moved);
      const captured = moved.some((e) => e.type === 'capture');
      again = isBonus(th.result) || captured;
    }
  }
  return events;
}

function chooseOpp(r, opts) {
  const victimsAt = (o) => {
    const dest = o.path[o.path.length - 1];
    return dest === HOME ? 0 : mine(r).filter((p) => p.node === dest).length;
  };
  const capture = opts.filter((o) => victimsAt(o) > 0).sort((a, b) => victimsAt(b) - victimsAt(a))[0];
  if (capture) return capture;
  const onBoardOpts = opts.filter((o) => o.kind === 'stack');
  if (onBoardOpts.length) return onBoardOpts.sort((a, b) => progress(b.from) - progress(a.from))[0];
  return opts[0];
}

function finish(r, reason) {
  r.phase = 'over';
  r.outcome = r.score >= r.target ? 'win' : 'lose';
  return [{ type: 'roundOver', outcome: r.outcome, reason, score: r.score, target: r.target }];
}
