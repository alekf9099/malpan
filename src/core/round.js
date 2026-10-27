// 하루 운행의 규칙. 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다.
// 판(서울 노선도의 그날 구간)은 boards/seoul.js 의 인터페이스(roll·options·tile·rollsFor·lineAt…)로만 안다.
//
// 하루는 운행 시계로 흐른다. 06:00 첫차 → 24:00 막차. 한 번 달릴 때마다 시간이 든다
// (출발 45분 + 역마다 15분, 급행은 역마다 8분). 막차 시각이 지나면 그날 운행이 끝나고,
// 그때까지 목표 점수를 넘겼으면 하루를 지킨 것이다.

import { START, HOME } from './board.js';
import { charmById } from './items.js';
import { makeSeoul, routeBySeed } from './boards/seoul.js';
import { HEROES, heroOf } from './heroes.js';
import { eventById } from './events.js';
import { INCIDENTS, INCIDENT_MAX, INCIDENT_CHANCE, pickIncident } from './incidents.js';
import { stationPrice, stationToll, links, chainOf, OWN_STOP_CHIPS, OWN_STOP_MULT_MAX } from './estate.js';

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

// 봉쇄 테이프: 하루 2개. 친 역은 3시간 동안 도깨비 열차가 지나가지 못한다.
export const BLOCKADE = { perDay: 2, minutes: 180 };

/**
 * cfg: { number, target, rerolls, myPieces, oppPieces, charms: [id], boss, events,
 *        route, mapSeed, extraLines, closure, owned, goblinStations }
 *   events     돌발 사건 계획 [{ at(시각), id }] (events.js planEvents). 없으면 사건이 없다
 *   route      그날 구간 [출발역, 종착역]. 없으면 mapSeed 로 고른다
 *   extraLines 노선 연장권 — 구간이 그만큼 넓어진다(돌아가는 길이 늘어난다)
 *   closure    도깨비 차장이 호선 하나를 운행 중지(끊어도 구간이 이어지는 호선 중에서 mapSeed 로)
 *   owned      내 역 { 역이름: true } — 원정(run)과 같은 객체를 함께 쓴다. 사면 여기에 바로 들어간다
 *   goblinStations 그날 도깨비 역(보스 날). 내 말이 서면 내가 통행료를 낸다
 */
export function createRound(cfg) {
  const pieces = [];
  for (let i = 0; i < cfg.myPieces; i++) pieces.push({ id: 'm' + i, owner: 'me', node: START, prev: null });
  for (let i = 0; i < cfg.oppPieces; i++) {
    // 짝수 번째는 빨간 사냥꾼(잡기 우선), 홀수 번째는 파란 도망꾼(골인 우선). 그림 색과 맞춘다.
    pieces.push({ id: 'd' + i, owner: 'opp', node: START, prev: null, trait: i % 2 === 0 ? 'hunter' : 'runner' });
  }
  const board = makeSeoul(cfg.route || routeBySeed(cfg.mapSeed || 1), {
    slack: 2 + (cfg.extraLines || 0),
    closeSeed: cfg.closure ? (cfg.mapSeed || 1) : null
  });
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
    incidents: [],                 // 역 사건 { node, kind, until }
    pieces,
    charms: cfg.charms.slice(),
    owned: cfg.owned || {},
    goblinStations: (cfg.goblinStations || []).slice(),
    offer: null,                   // 방금 멈춘 역을 살 수 있으면 { node, price }
    priceRate: 1,                  // 역 값 배율(돌발 사건 '역세권 세일')
    tollRate: 1,                   // 통행료 배율(정기권 '임대 계약서', 돌발 사건 '역세권 호재')
    boss: cfg.boss || null,
    coins: 0,
    escapeUsed: false,
    skillsUsed: [],
    shield: false,
    blockades: [],                 // { node, until }
    blockadesLeft: BLOCKADE.perDay,
    eventPlan: (cfg.events || []).map((e) => ({ ...e, done: false })),
    pending: null,
    phase: 'throw',
    outcome: null,
    lastMoveBest: 0,
    moves: 0
  };
  for (const id of r.charms) charmById(id)?.dayStart?.(r);
  return r;
}

export const boardFor = (r) => r.boardInst;

// ── 시간대 ─────────────────────────────────────────────────

/** 지금 시간대: 'rush' 출퇴근 러시(칩 +50%) · 'night' 심야(칩 +25%) · 'last' 막차(23시~, 골인 배수 +3) · 'day' 낮 */
export function timeOf(r, clock = r.clock) {
  if (clock >= CLOCK.last) return 'last';
  if (clock >= CLOCK.night) return 'night';
  if (CLOCK.rush.some(([a, b]) => clock >= a && clock < b)) return 'rush';
  return 'day';
}
export const minutesLeft = (r) => Math.max(0, r.end - r.clock);
const outOfTime = (r) => r.clock >= r.end;

/** 이번 이동에 드는 시간. 신호 장애 역을 지나거나 서면 더 걸린다 */
export function tripMinutes(r, opt, roll) {
  if (r.freeRide) return 0;
  const stops = opt.path.filter((n) => n !== HOME);
  const late = stops.reduce((s, n) => s + (INCIDENTS[incidentAt(r, n)?.kind]?.delay || 0), 0);
  return CLOCK.trip + stops.length * (roll.face === 'express' ? CLOCK.expressPerStop : CLOCK.perStop) + late;
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
  r.offer = null;
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
export const incidentAt = (r, node) => r.incidents.find((i) => i.node === node);
/** 화재 역: 아무도 못 지나간다 */
const fireSet = (r) => new Set(r.incidents.filter((i) => INCIDENTS[i.kind]?.block).map((i) => i.node));
/** 도깨비가 못 지나가는 역: 화재 + 봉쇄 테이프 */
const blockedSet = (r) => new Set([...fireSet(r), ...r.blockades.map((b) => b.node)]);

/** 지금 나온 결과로 둘 수 있는 수. 각 수에 예상 점수·위험도·걸리는 시간(preview)을 붙인다. */
export function legalMoves(r) {
  if (!r.pending) return [];
  const roll = r.pending.roll;
  if (bossBlocks(r, roll)) return [];
  return boardFor(r).options(r.pieces, 'me', roll, fireSet(r)).map((o) => ({ ...o, preview: evaluate(r, o, roll) }));
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

// ── 역 효과 · 도깨비 행선지 · 역 사건 ─────────────────────────

/** 역 효과를 하나로 합친다: 환승역 + 역 사건(인파·버스킹) */
function stationEffect(r, dest) {
  const base = boardFor(r).tile(dest);
  const inc = INCIDENTS[incidentAt(r, dest)?.kind];
  const parts = [];
  if (base) parts.push(base);
  if (r.owned[dest]) {
    // 이어진 내 역이면 배수가 오른다: 2역 연결 +1, 3역 이상 +2 (통행료 쪽은 ×2~×4)
    const k = chainOf(r.owned, dest);
    parts.push({ kind: 'own', name: k > 1 ? `내 역 ${k}역 연결` : '내 역', chips: OWN_STOP_CHIPS, mult: Math.min(OWN_STOP_MULT_MAX, k - 1) });
  }
  if (inc && (inc.chips || inc.mult)) parts.push(inc);
  if (!parts.length) return null;
  const out = { kind: inc?.id || parts[0].kind, name: parts.map((p) => p.name).join(' · ') };
  for (const p of parts) for (const key of ['chips', 'mult', 'coins']) if (p[key]) out[key] = (out[key] || 0) + p[key];
  return out;
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
      else v += b.depth[way] < b.depth[fork.at] - 0.5 ? 0.6 : 0;
      return v;
    };
    const way = fork.ways.slice().sort((x, y) => score(y) - score(x))[0];
    p.heading = { at: fork.at, node: way, line: b.lineOfEdge(fork.at, way) || b.lineAt(way)?.id || 1 };
  }
}

/** 역 사건이 날 수 있는 역. 화재는 출발역 → 종착역 길을 끊는 역에는 나지 않는다 */
function incidentSpots(r, kind) {
  const b = boardFor(r);
  const taken = new Set([...r.pieces.map((p) => p.node), ...r.incidents.map((i) => i.node), ...r.blockades.map((x) => x.node)]);
  let spots = b.nodes.filter((n) => n !== b.S && n !== b.G && !taken.has(n));
  if (INCIDENTS[kind].block) {
    const fires = fireSet(r);
    spots = spots.filter((n) => connected(b, new Set([...fires, n])));
  }
  return spots;
}

/** avoid 역을 피해 출발역에서 종착역까지 갈 수 있나 */
function connected(b, avoid) {
  const seen = new Set([b.S]);
  const q = [b.S];
  while (q.length) {
    const n = q.shift();
    if (n === b.G) return true;
    for (const m of b.next[n]) if (!seen.has(m) && !avoid.has(m)) { seen.add(m); q.push(m); }
  }
  return false;
}

/** 역 사건 하나를 일으킨다. kind 를 주지 않으면 가중치로 */
function spawnIncident(r, rng, kind = null) {
  const k = kind || pickIncident(rng, timeOf(r) === 'rush').id;
  const spots = incidentSpots(r, k);
  if (!spots.length) return [];
  const node = spots[Math.floor(rng.next() * spots.length)];
  const info = INCIDENTS[k];
  const until = r.clock + info.minutes;
  r.incidents.push({ node, kind: k, until });
  return [{ type: 'incident', node, kind: k, until, name: info.name, desc: info.desc, short: info.short }];
}

/** 시간이 다 된 사건은 사라지고, 확률로 새 사건이 생긴다 */
function tickIncidents(r, rng) {
  const events = [];
  for (const i of r.incidents.filter((x) => r.clock >= x.until)) events.push({ type: 'incidentEnd', node: i.node, kind: i.kind });
  r.incidents = r.incidents.filter((x) => r.clock < x.until);
  if (r.incidents.length < INCIDENT_MAX && rng.next() < INCIDENT_CHANCE) events.push(...spawnIncident(r, rng));
  return events;
}

// ── 역 인수 · 통행료 ──────────────────────────────────────────

/** 이 역의 오늘 값(점수) */
export const priceFor = (r, node) => Math.round(stationPrice(node) * r.priceRate);

/** 도깨비 열차가 내 역에 서면 받는 통행료: 연결 ×2~×4 · 인파 ×2 · 배율. 불난 역은 못 받는다 */
export function tollFor(r, node) {
  if (!r.owned[node] || fireSet(r).has(node)) return { amount: 0, chain: 0 };
  const chain = chainOf(r.owned, node);
  const crowd = incidentAt(r, node)?.kind === 'crowd';
  const amount = Math.round(stationToll(node) * chain * (crowd ? 2 : 1) * r.tollRate);
  return { amount, chain, crowd };
}

/** 내 말이 도깨비 역에 서면 내는 통행료 */
export const goblinTollFor = (r, node) => (r.goblinStations.includes(node) ? stationToll(node) : 0);

/** 이 역을 살 수 있나: 구간 안, 출발역·종착역이 아니고, 주인이 없고, 도깨비 역이 아닌 곳 */
export function buyable(r, node) {
  const b = boardFor(r);
  return b.nodes.includes(node) && node !== b.S && node !== b.G && !r.owned[node] && !r.goblinStations.includes(node);
}

/** 방금 제안받은 역을 점수로 산다(출발 전, 다음 출발까지만). 이어진 묶음이 생기면 그 길이·호선도 알려 준다 */
export function buyStation(r, node) {
  if (r.phase !== 'throw' || r.offer?.node !== node) throw new Error('지금은 이 역을 살 수 없다');
  const price = r.offer.price;
  if (r.score < price) throw new Error('점수가 모자란다');
  r.score -= price;
  r.owned[node] = true;
  r.offer = null;
  const at = links(r.owned).at[node];
  return [{ type: 'buy', node, price, score: r.score, chain: chainOf(r.owned, node), line: at?.line ?? null, length: at?.len || 1 }];
}

/** 이 수를 두면 무슨 일이 생기는지 계산만 한다(상태를 바꾸지 않는다). */
function evaluate(r, opt, roll) {
  const dest = opt.path[opt.path.length - 1];
  const homed = dest === HOME ? opt.pieceIds.length : 0;
  const victims = dest === HOME ? [] : theirs(r).filter((p) => p.node === dest);
  const joined = dest === HOME ? 0 : mine(r).filter((p) => p.node === dest && !opt.pieceIds.includes(p.id)).length;
  const stack = opt.pieceIds.length + joined;
  const waiting = mine(r).filter((p) => p.node === START && !opt.pieceIds.includes(p.id)).length;
  const boardTile = dest === HOME ? null : stationEffect(r, dest);
  const incident = dest === HOME ? null : incidentAt(r, dest)?.kind || null;
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
    onDiagonal: !!opt.diagonal, transfers: opt.transfers || 0, boardTile, incident, heroes, groupHeroes,
    arriveAt: r.clock + minutes
  });
  const pay = dest === HOME ? 0 : goblinTollFor(r, dest);
  const price = dest !== HOME && buyable(r, dest) ? priceFor(r, dest) : 0;
  return { dest, homed, captured: victims.length, stack, joined, boardTile, incident, danger, score, heroes, minutes, pay, price };
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
  const bt = info.boardTile;
  if (bt?.chips) c.chip(bt.chips, bt.name);
  if (bt?.mult) c.mult(bt.mult, bt.name);
  if (info.stack > 1 && r.boss?.id !== 'noStack') c.mult(info.stack - 1, '함께 타기');
  if (info.captured > 0) { c.chip(CAPTURE_CHIPS * info.captured, '잡기'); c.mult(1, '잡기'); }
  if (info.homed > 0) { c.chip(HOME_CHIPS * info.homed, '골인'); c.mult(2, '골인'); }
  // 원정대 능력 — 정기권보다 먼저
  for (const h of HEROES) if (h.score && info.heroes) h.score(c);
  for (const id of r.charms) {
    const charm = charmById(id);
    if (charm?.score) charm.score(c);
  }
  const when = timeOf(r, info.arriveAt ?? r.clock);
  if (when === 'rush' && roll.chips) c.chip(Math.round(roll.chips * 0.5), '러시아워');
  if (when === 'night' && roll.chips) c.chip(Math.round(roll.chips * 0.25), '심야 할증');
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
  r.moves++;

  r.score += ev.score.total;
  r.lastMoveBest = Math.max(r.lastMoveBest, ev.score.total);
  events.push({ type: 'score', ...ev.score, score: r.score, target: r.target });
  events.push(...landOnStation(r, ev));
  if (ev.pay) {
    const paid = Math.min(ev.pay, r.score);
    r.score -= paid;
    events.push({ type: 'tollPaid', node: ev.dest, amount: paid, score: r.score });
  }
  r.offer = ev.price ? { node: ev.dest, price: ev.price } : null;
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

/** 역 효과 중 점수 계산 밖에서 일어나는 것: 토큰. 인파·버스킹은 한 번 누리면 끝난다 */
function landOnStation(r, ev) {
  const events = [];
  const t = ev.boardTile;
  if (t?.coins) { r.coins += t.coins; events.push({ type: 'coin', node: ev.dest, amount: t.coins }); }
  const inc = incidentAt(r, ev.dest);
  if (inc && (INCIDENTS[inc.kind].chips || INCIDENTS[inc.kind].mult)) {
    r.incidents = r.incidents.filter((i) => i !== inc);
    events.push({ type: 'incidentEnd', node: inc.node, kind: inc.kind, used: true });
  }
  return events;
}

/** owner 의 말 묶음을 실제로 옮기고 이벤트를 만든다. 잡기·골인·통행료까지. */
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
    for (const v of victims) { v.node = START; v.prev = null; }
    if (owner === 'me') r.extra += 1;
    events.push({ type: 'capture', who: owner, node: dest, victimIds: victims.map((v) => v.id), attackerIds: opt.pieceIds });
  }

  if (owner === 'opp') {
    const toll = tollFor(r, dest);
    if (toll.amount) {
      r.score += toll.amount;
      events.push({ type: 'toll', node: dest, pieceIds: opt.pieceIds, ...toll, score: r.score });
    }
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
  events.push(...tickIncidents(r, rng));
  events.push(...expireBlockades(r));
  if (!outOfTime(r)) events.push(...fireEvent(r, rng));
  // 도깨비가 낸 통행료로 목표를 넘길 수도 있다
  if (r.score >= r.target) return events.concat(finish(r, 'target'));
  if (outOfTime(r)) return events.concat(finish(r, 'lastTrain'));
  r.phase = 'throw';
  return events;
}

// ── 봉쇄 테이프 ─────────────────────────────────────────────

/** 이 역에 봉쇄 테이프를 칠 수 있나. 칠 수 없으면 이유, 칠 수 있으면 null */
export function blockadeBlocked(r, node) {
  const b = boardFor(r);
  if (r.phase !== 'throw') return '출발 전에만 칠 수 있다';
  if (r.blockadesLeft <= 0) return '오늘 봉쇄 테이프를 다 썼다';
  if (!b.nodes.includes(node) || node === b.S || node === b.G) return '출발역·종점은 막을 수 없다';
  if (fireSet(r).has(node)) return '불이 난 역은 이미 막혀 있다';
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
  const events = [{ type: 'event', id: info.id, name: info.name, desc: info.desc, short: info.short, good: info.good }];
  if (due.id === 'sale') {
    r.priceRate *= 0.5;
    events.push({ type: 'sale' });
  } else if (due.id === 'boom') {
    r.tollRate *= 2;
    events.push({ type: 'boom' });
  } else if (due.id === 'gust') {
    const blown = theirs(r).filter(onBoard);
    for (const p of blown) { p.node = START; p.prev = null; p.heading = null; }
    events.push({ type: 'gust', pieceIds: blown.map((p) => p.id) });
  } else if (due.id === 'feast') {
    for (let i = 0; i < 3; i++) events.push(...spawnIncident(r, rng, 'busk'));
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
      if (opts.length === 0) { events.push({ type: 'noMove', who: 'opp', roll, why: r.shield ? 'shield' : r.blockades.length ? 'blockade' : fireSet(r).size ? 'fire' : 'none' }); continue; }
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
    for (let i = 0; i < 2; i++) events.push(...spawnIncident(r, rng, 'crowd'));
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
 * 노선 위의 열차를 차고 열차보다 먼저 민다. 미리 정해 둔 갈래(행선지)를 따른다.
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
