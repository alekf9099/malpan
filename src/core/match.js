// 한 판의 규칙 — 역전(驛戰): 역을 차지하라.
// 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다(화면은 그 목록을 차례로 연출).
//
// 2~4명이 서울의 한 지역(72역 — 도심 · 강남 · 서남 · 동부, 판마다 하나)에서 겨룬다. 06:00 첫차 → 24:00 막차가 한 판.
//   차례: 열차 주사위 2개(1~5역 · 급행 7역+한 번 더)를 굴려 하나를 고르고 그만큼 달린다. 갈림길에서는 갈 방향을 고른다.
//   멈춘 역: 빈 역이면 산다 · 내 역이면 증축한다 · 남의 역이면 통행료를 내고, 돈이 되면 인수할 수 있다
//   지나가는 남의 역: 서지 않아도 통과 요금(통행료의 20%) — 이어서 가진 노선은 유료 도로가 된다
//   노선 투자: 내 차례에 굴리기 전, 이어진(2역 이상) 내 역은 어디서든 증축할 수 있다(모두의 마블의 건물 짓기)
//   목적지: 저마다 목적지 역이 있다. 지나가거나 서면 보너스를 받고 새 목적지를 받는다
//   찬스 역(?): 서면 찬스 카드를 뽑는다
//   통행료를 못 내면 역을 팔아서라도 내고, 그래도 모자라면 파산 — 마지막 한 명이 남으면 그 사람이 이긴다
//   명소역(11곳): 서면 그 역만의 일(KTX 순간이동 · 하늘길 · 쇼핑 …). 목적지는 주로 명소역으로 나온다
//   독점 승리: 그 지역 명소역을 거의 다(지역마다 3~4곳) 갖거나 한 호선에서 6역을 이어 가지면 그 자리에서 이긴다(하나 남으면 경고)
//   막차 시각이 되면 자산(돈 + 역에 들인 값)이 가장 많은 사람이 이긴다
// 모두 한 차례씩 돌면 한 바퀴 — 시계가 90분 흐른다(한 판 12바퀴). 규칙을 덜려고 뉴스 · 시간대 통행료 · 무작위 역 사건은 뺐다
// (인파는 스킬·명소역으로만 생긴다).
//
// 순환선 판(region 'loop', boards/loop.js): 부루마블처럼 32칸 고리를 한 방향으로 돈다. 모두 시청에서 출발하고 목적지는 없다.
//   시청을 지나면 월급(서면 1.5배) · 모서리 칸(축제 · 급행 · 미로) · 환승 지름길 · 통과 요금 없음 · 한 바퀴 60분(18바퀴)
//   노선 독점은 고리에서 LOOP_LINE_WIN 칸을 이어 갖기

import { createRng } from './rng.js';
import { paths, rollDie, spreadStations, isTransfer, regionOf, REGIONS, STATION_LINES, LINE_STATIONS } from './boards/seoul.js';
import { stationPrice, upgradeCost, takeoverPrice, sellValue, invested, baseToll, MAX_LEVEL, links, HOTSPOTS, HOT_LIST, isHot, useChainLines } from './estate.js';
import { LOOP, LOOP_CHAIN, LOOP_START, CORNERS, SALARY, forward, loopIndex, shortcutOf } from './boards/loop.js';
import { INCIDENTS } from './incidents.js';
import { CHANCE_CARDS, chanceById, pickWeighted } from './events.js';
import { heroById, activeDesc, chargeOf } from './heroes.js';

export const START_MONEY = 1000;
export const GOAL_BONUS = 200;
export const MIN_GOAL_DIST = 6;
export const CLOCK = {
  start: 6 * 60, end: 24 * 60, round: 90,
  rush: [[7 * 60, 9 * 60], [18 * 60, 20 * 60]],
  night: 22 * 60, last: 23 * 60
};
/** 남의 역을 지나가기만 해도 내는 통과 요금 = 통행료 × PASS_RATE */
export const PASS_RATE = 0.2;
/** 인원이 적으면 서로 만날 일이 적으니 통행료를 키운다 */
export const CROWD_TOLL = { 2: 1.6, 3: 1.25, 4: 1 };
/** 독점 승리: 명소역 HOT_WIN 곳(지역 명소역이 4곳 이하면 전부, 5곳 이상이면 하나 빼고) · 한 호선에서 LINE_WIN 역 이어 갖기 */
export const HOT_WIN = 5;
export const LINE_WIN = 6;
/** 새 목적지가 명소역일 확률, 명소역 목적지의 최소 거리 */
export const HOT_GOAL_CHANCE = 0.6;
export const HOT_GOAL_DIST = 4;
/** 순환선 판: 한 바퀴 시계(분) · 노선 독점 칸 수 · 직통 열차·급행 환승으로 갈 수 있는 앞 칸 수 */
export const LOOP_ROUND = 60;
export const LOOP_LINE_WIN = 5;
export const DIRECT_REACH = 8;
/** 배달 라이더(순환선): 지름길 수당 */
export const SHORTCUT_PAY = 45;
/** 순환선의 떡상은 목적지를 못 바꾸는 대신 통행료 3배 */
export const HYPE_LOOP_X = 3;
export const EXPRESS_REACH = 12;
export const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;

/** 찬스 역: 노선도 곳곳의 한 호선 역. 살 수 없고, 서면 찬스 카드를 뽑는다 */
export const CHANCE_STATIONS = ['녹천', '광운대', '외대앞', '제기동', '종로5가', '남영', '대방', '문래', '봉천', '서초', '잠실나루', '구의',
  '한양대', '금호', '매봉', '학여울', '경찰병원', '송정', '오목교', '상수', '녹사평', '창신', '월곡', '공릉', '사가정', '학동',
  '장승배기', '남구로', '몽촌토성', '증미', '샛강', '언주', '삼전', '무악재', '수유'];
const CHANCE_SET = new Set(CHANCE_STATIONS);
export const isChance = (n) => CHANCE_SET.has(n);

/**
 * 새 판. heroes 는 자리 순서대로 캐릭터 id(첫 자리가 사람). seed 가 같으면 같은 출발역·목적지·사건.
 */
export function createMatch({ seed = 1, heroes, humans = 1, daily = false, region = null }) {
  const rng = createRng((seed >>> 0) || 1);
  const loop = region === 'loop';
  const regionId = loop ? 'loop' : region || REGIONS[Math.floor(rng.next() * REGIONS.length)].id;
  useChainLines(loop ? LOOP_CHAIN : undefined);
  const R = loop ? LOOP : regionOf(regionId);
  const starts = loop ? heroes.map(() => LOOP_START) : spreadStations(rng, heroes.length, R.stations.filter(isTransfer), 6, R.dist);
  const hots = HOT_LIST.filter((n) => R.set.has(n) && !(loop && CORNERS[n]));
  const m = {
    seed, daily, rng,
    region: regionId,
    roundMin: loop ? LOOP_ROUND : CLOCK.round,
    lineWin: loop ? LOOP_LINE_WIN : LINE_WIN,
    hotWin: Math.min(HOT_WIN, hots.length >= 5 ? hots.length - 1 : Math.max(3, hots.length)),
    players: heroes.map((hero, i) => ({
      id: 'p' + i, hero, human: i < humans, money: START_MONEY,
      node: starts[i], prev: null, goal: null, out: false, place: null,
      charge: 0, cost: chargeOf(heroById(hero), loop), dash: 0, fly: false, again: false, rest: 0, coupon: false, goals: 0,
      combo: false, rescued: false
    })),
    owned: {},          // 역 → 주인 id
    levels: {},         // 역 → 단계(1~3)
    turn: 0, round: 1,
    clock: CLOCK.start, end: CLOCK.end,
    incidents: [],      // { node, kind, until } — 인파(스킬·명소역)
    phase: 'roll',      // roll → (pick 주사위 고르기) → move → (choose) → decide → (다음 사람) roll … → over
    pending: null, offer: null, choice: null, ranking: null, reason: null, winner: null
  };
  for (const p of m.players) p.goal = pickGoal(m, p);
  return m;
}

export const current = (m) => m.players[m.turn];
/** 이 판의 지역(regionOf) */
export const areaOf = (m) => (m.region === 'loop' ? LOOP : regionOf(m.region));
export const isLoop = (m) => m.region === 'loop';
/** 캐릭터 능력값(순환선이면 heroes.js 의 loop 값으로 덮는다) */
export const perkOf = (m, p) => { const h = heroById(p.hero); return isLoop(m) && h.loop ? { ...h, ...h.loop } : h; };
/** 순환선 판의 모서리 칸이면 그 정보 */
export const cornerAt = (m, n) => (isLoop(m) ? CORNERS[n] || null : null);
/** 이 판에서 갈 수 있는 명소역 */
export const hotsOf = (m) => HOT_LIST.filter((n) => areaOf(m).set.has(n) && !cornerAt(m, n));
/** 한 판의 바퀴 수 */
export const roundsOf = (m) => Math.round((m.end - CLOCK.start) / m.roundMin);
export const playerById = (m, id) => m.players.find((p) => p.id === id);
export const alive = (m) => m.players.filter((p) => !p.out);

export function timeOf(m, clock = m.clock) {
  if (clock >= CLOCK.last) return 'last';
  if (clock >= CLOCK.night) return 'night';
  if (CLOCK.rush.some(([a, b]) => clock >= a && clock < b)) return 'rush';
  return 'day';
}

/** 지금 이 사람의 자산 = 돈 + 가진 역에 들인 값 */
export function assets(m, p) {
  let v = p.money;
  for (const [n, o] of Object.entries(m.owned)) if (o === p.id) v += invested(n, m.levels[n]);
  return v;
}
export const stationsOf = (m, p) => Object.keys(m.owned).filter((n) => m.owned[n] === p.id);

/** 목적지: 주로(60%) 4역 넘게 떨어진 명소역, 아니면 6역 넘게 떨어진 아무 역(지역 안) — 모두 명소 쪽으로 몰리게 */
function pickGoal(m, p) {
  if (isLoop(m)) return null; // 순환선에는 목적지가 없다(월급이 그 몫)
  const R = areaOf(m);
  const hot = hotsOf(m).filter((n) => n !== p.goal && n !== p.node && R.dist(p.node, n) >= HOT_GOAL_DIST);
  if (hot.length && m.rng.next() < HOT_GOAL_CHANCE) return hot[Math.floor(m.rng.next() * hot.length)];
  let far = R.stations.filter((n) => R.dist(p.node, n) >= MIN_GOAL_DIST && n !== p.goal);
  if (!far.length) far = R.stations.filter((n) => n !== p.node && n !== p.goal);
  return far[Math.floor(m.rng.next() * far.length)];
}

// ── 값 ─────────────────────────────────────────────────────

export const incidentAt = (m, n) => m.incidents.find((i) => i.node === n);
const fires = (m) => new Set(m.incidents.filter((i) => INCIDENTS[i.kind].block).map((i) => i.node));
/** p 를 세우는 역: 신호 장애 · 출입 통제(주인은 빼고) */
const delays = (m, p = current(m)) => new Set(m.incidents.filter((i) => INCIDENTS[i.kind].stop && !(INCIDENTS[i.kind].own && m.owned[i.node] === p.id)).map((i) => i.node));
export const buyable = (n, m = null) => !isChance(n) && !(m && cornerAt(m, n));
export const priceFor = (m, n) => stationPrice(n);
export const upgradeFor = (m, n, p) => Math.round(upgradeCost(n) * (1 - (perkOf(m, p).buildDiscount || 0)));
/** 인수 값: 들인 값 × 1.5 — 중개인은 30% 싸게 */
export const takeoverFor = (m, n, p = current(m)) => Math.round(takeoverPrice(n, m.levels[n] || 1) * (1 - (perkOf(m, p).takeoverDiscount || 0)));
/** 강제 매수 값: 들인 값의 70% */
export const BUYOUT_RATE = 0.7;
export const buyoutFor = (m, n) => Math.round(invested(n, m.levels[n] || 1) * BUYOUT_RATE);

/** payer 가 이 역에 서면 낼 통행료(면제권은 따로) */
export function tollFor(m, n, payer) {
  const owner = m.owned[n];
  if (!owner || owner === payer.id || fires(m).has(n)) return 0;
  const at = incidentAt(m, n), inc = INCIDENTS[at?.kind];
  if (inc?.free) return 0; // 공사 중
  const x = (at?.tollX || inc?.tollX || 1) * (CROWD_TOLL[m.players.length] || 1) * (1 - (perkOf(m, payer).tollDiscount || 0)) * (1 + (perkOf(m, playerById(m, owner)).tollBonus || 0));
  return Math.round(baseToll(m.owned, m.levels, n) * x);
}

// ── 차례 ───────────────────────────────────────────────────

/** 굴리기: 주사위 2개. 같은 눈이면 바로 그 눈으로, 다르면 하나를 고른다(pickDie). 쉬어야 하는 사람이면 넘어간다 */
export function roll(m, rng = m.rng) {
  if (m.phase !== 'roll') throw new Error('지금은 굴릴 차례가 아닙니다: ' + m.phase);
  const p = current(m);
  if (p.rest > 0) {
    p.rest--;
    return [{ type: 'rest', player: p.id }, ...endTurn(m)];
  }
  const rolls = [rollDie(rng), rollDie(rng)];
  m.pending = { rolls, steps: null };
  m.phase = 'pick';
  const events = [{ type: 'roll', player: p.id, rolls }];
  // 던질 때마다 스킬 1칸 충전
  const cost = skillCost(p);
  if (p.charge < cost && ++p.charge === cost) events.push({ type: 'charged', player: p.id });
  if (p.combo) { m.pending.combo = true; return events; }
  if (rolls[0].face === rolls[1].face) return events.concat(pickDie(m, 0));
  return events;
}

/** 고를 수 있는 주사위: 0·1, 동시 배달 중이면 2(둘의 합)도 */
export const dieChoices = (m) => (m.pending?.combo ? [0, 1, 2] : [0, 1]);
/** 주사위 i(0·1, 2 는 둘의 합 — 동시 배달) */
export function dieAt(m, i) {
  const [a, b] = m.pending.rolls;
  if (i !== 2) return m.pending.rolls[i];
  return { value: a.value + b.value, face: 'sum', label: `${a.label}+${b.label}`, faces: [a.face, b.face], bonus: a.bonus || b.bonus, sum: true };
}
/** 주사위 i 를 고르면 몇 역 가나(급행 카드 +3 · 하늘길 ×2 포함) */
export function dieSteps(m, i) {
  const p = current(m), r = dieAt(m, i);
  return r.value * (p.fly ? 2 : 1) + p.dash;
}
/** 주사위 i 로 갈 수 있는 길(도착역마다 하나) — 고르기 전에 보여 주거나 AI 가 따져 본다 */
export function dieOptions(m, i) {
  const p = current(m);
  return paths(p.node, p.prev, dieSteps(m, i), { avoid: fires(m), stopAt: delays(m), goal: p.goal, adj: areaOf(m).adj });
}

/** 주사위 하나를 고른다. 급행이면 한 번 더 */
export function pickDie(m, i) {
  if (m.phase !== 'pick') throw new Error('고를 주사위가 없습니다');
  const p = current(m);
  if (i === 2 && !m.pending.combo) throw new Error('동시 배달 중이 아닙니다');
  if (!m.pending.rolls[i] && i !== 2) throw new Error('없는 주사위입니다: ' + i);
  const r = dieAt(m, i);
  const steps = dieSteps(m, i);
  const events = [{ type: 'die', player: p.id, roll: r, index: i, steps, dash: p.dash, fly: p.fly }];
  p.dash = 0;
  p.fly = false;
  p.combo = false;
  if (r.bonus) p.again = true;
  m.pending = { roll: r, rolls: m.pending.rolls, steps, free: !!m.pending.combo };
  m.phase = 'move';
  if (!legalPaths(m).length) {
    events.push({ type: 'stuck', player: p.id });
    m.pending = null;
    events.push(...endTurn(m));
  }
  return events;
}

/** 지금 갈 수 있는 길(도착역마다 하나). AI 가 쓴다 */
export function legalPaths(m) {
  const p = current(m);
  return paths(p.node, p.prev, m.pending.steps, { avoid: fires(m), stopAt: delays(m), goal: p.goal, adj: areaOf(m).adj });
}

/** 갈림길에서 고를 수 있는 다음 역(사람이 한 역씩 고를 때). 막히면 빈 목록 */
export function nextStations(m, node, back) {
  const avoid = fires(m), adj = areaOf(m).adj;
  let next = adj[node].filter((x) => x !== back && !avoid.has(x));
  if (!next.length) next = adj[node].filter((x) => !avoid.has(x));
  return next;
}
/** 이 역에 닿으면 남은 칸이 있어도 멈추나(신호 장애 · 출입 통제) */
export const stopsAt = (m, n, p = current(m)) => delays(m, p).has(n);

/** 길이 규칙에 맞나: 한 역씩 이웃 · 되돌아가지 않기 · 불난 역 피하기 · 칸 수(신호 장애·막힘이면 더 짧게) */
export function validPath(m, path) {
  const p = current(m);
  if (!path.length || path.length > m.pending.steps) return false;
  let node = p.node, back = p.prev;
  for (let i = 0; i < path.length; i++) {
    if (!nextStations(m, node, back).includes(path[i])) return false;
    back = node; node = path[i];
    if (i < path.length - 1 && stopsAt(m, node)) return false;
  }
  return path.length === m.pending.steps || stopsAt(m, node) || !nextStations(m, node, back).length;
}

/** 달린다: 목적지를 지나면 보너스, 멈춘 역에서 사건·찬스·통행료, 살 수 있으면 제안 */
export function move(m, path) {
  if (m.phase !== 'move') throw new Error('지금은 달릴 차례가 아닙니다');
  if (!validPath(m, path)) throw new Error('갈 수 없는 길입니다: ' + path.join('→'));
  const p = current(m);
  const from = p.node;
  const free = m.pending.free; // 동시 배달: 통과 요금 없이
  p.prev = path.length > 1 ? path[path.length - 2] : from;
  p.node = path[path.length - 1];
  m.pending = null;
  const events = [{ type: 'move', player: p.id, from, path }];
  if (path.includes(p.goal)) events.push(...reachGoal(m, p));
  if (isLoop(m) && path.includes(LOOP_START)) events.push(...salary(m, p, p.node === LOOP_START));
  // 배달 라이더(순환선): 지름길을 탈 때마다 수당
  if (isLoop(m) && perkOf(m, p).passDiscount) {
    const rides = [from, ...path].slice(1).filter((n, i) => shortcutOf([from, ...path][i], n)).length;
    if (rides) { p.money += SHORTCUT_PAY * rides; events.push({ type: 'cash', player: p.id, amount: SHORTCUT_PAY * rides, why: 'shortcut' }); }
  }
  for (const [owner, info] of free ? [] : passFares(m, p, path)) {
    events.push(...pay(m, p, info.amount, owner, { why: 'pass', nodes: info.nodes }));
    if (p.out) return events.concat(endTurn(m));
  }
  events.push(...land(m, p));
  if (p.out) return events.concat(endTurn(m));
  const corner = cornerAt(m, p.node);
  if (corner) events.push(...cornerPower(m, p, corner));
  else if (isHot(p.node)) events.push(...hotspotPower(m, p));
  if (p.out) return events.concat(endTurn(m));
  if (!m.choice) m.choice = transferChoice(m, p);
  if (m.choice) {
    m.phase = 'choose';
    events.push({ type: 'choice', player: p.id, ...m.choice });
    return events;
  }
  return afterLand(m, p, events);
}

/** 멈춘 뒤: 살 수 있으면 제안, 아니면 다음 차례 */
function afterLand(m, p, events) {
  if (alive(m).length <= 1) return events.concat(endTurn(m));
  m.offer = offerFor(m, p);
  if (m.offer) { m.phase = 'decide'; events.push({ type: 'offer', player: p.id, ...m.offer }); return events; }
  return events.concat(endTurn(m));
}

// ── 명소역 ─────────────────────────────────────────────────

/** KTX 로 갈 수 있는 곳: 내 목적지 + 다른 명소역(불난 역 빼고) */
export function warpOptions(m, p = current(m)) {
  const fire = fires(m);
  return [...new Set([p.goal, ...hotsOf(m)])].filter((n) => n && n !== p.node && !fire.has(n));
}

/** 명소역에 서면(주인이어도) 그 역만의 일이 일어난다 */
function hotspotPower(m, p) {
  const n = p.node, h = HOTSPOTS[n];
  const events = [{ type: 'hotspot', player: p.id, node: n, tag: h.tag, desc: h.desc }];
  const cash = (amount) => { p.money += amount; events.push({ type: 'cash', player: p.id, node: n, amount, why: 'hot' }); };
  const hero = perkOf(m, p);
  if (hero.hotBonus) cash(hero.hotBonus);          // 여행 유튜버: 명소 브이로그
  if (n === '서울역') {
    const options = warpOptions(m, p);
    if (options.length) m.choice = { kind: 'warp', node: n, options };
  } else if (n === '김포공항') p.fly = true;
  else if (n === '고속터미널') {
    cash(100);
    const from = p.goal;
    p.goal = pickGoal(m, p);
    events.push({ type: 'newGoal', player: p.id, from, goal: p.goal });
  } else if (n === '홍대입구') p.again = true;
  else if (n === '명동') {
    const a = pickWeighted(m.rng, CHANCE_CARDS);
    let b = a;
    for (let i = 0; i < 12 && b.id === a.id; i++) b = pickWeighted(m.rng, CHANCE_CARDS);
    m.choice = { kind: 'card', node: n, options: [a.id, b.id] };
  } else if (n === '여의도') {
    const v = Math.min(150, Math.round(p.money * 0.1));
    if (v > 0) cash(v);
  } else if (n === '동대문역사문화공원') {
    for (const q of alive(m)) if (q !== p) events.push(...pay(m, q, 30, p.id, { why: 'fashion' }));
  } else if (n === '이태원') {
    const mine = stationsOf(m, p).filter((x) => !incidentAt(m, x)).sort((a, b) => baseToll(m.owned, m.levels, b) - baseToll(m.owned, m.levels, a));
    if (mine.length) events.push(...spawnIncident(m, 'crowd', mine[0])); else cash(80);
  } else if (n === '성수') {
    if (p.coupon) cash(80); else p.coupon = true;
  }
  // 잠실(증축 한 번에 랜드마크) · 강남(통행료 2배)은 그 역의 값에 붙은 힘이라 여기서는 할 일이 없다
  return events;
}

// ── 순환선: 월급 · 모서리 칸 ───────────────────────────────

/** 시청을 지나면 월급(서면 1.5배). 기관사는 수당이 붙는다 */
function salary(m, p, landed = false) {
  const amount = Math.round((SALARY + (perkOf(m, p).goalBonus || 0)) * (landed ? 1.5 : 1));
  p.money += amount;
  return [{ type: 'cash', player: p.id, node: LOOP_START, amount, why: 'salary', landed }];
}
/** 순간 이동(직통 열차 · 급행 환승)이 시청을 넘어가면 월급 */
function crossStart(m, p, from, to) {
  if (!isLoop(m) || from === to) return [];
  return to === LOOP_START || loopIndex(to) < loopIndex(from) ? salary(m, p, to === LOOP_START) : [];
}
/** 순간 이동으로 갈 수 있는 앞 칸: 모서리(시청 빼고)·불난 역 빼고 */
const reachAhead = (m, n, k) => forward(n, k).filter((x) => !fires(m).has(x) && (!CORNERS[x] || x === LOOP_START));

/** 모서리 칸에 서면: 축제(내 역 하나 통행료 2배) · 급행(앞 칸으로 순간 이동) · 미로(한 턴 쉬기) */
function cornerPower(m, p, c) {
  const n = p.node;
  const events = [{ type: 'corner', player: p.id, node: n, kind: c.kind, name: c.name, short: c.short }];
  if (c.kind === 'festival') {
    const mine = stationsOf(m, p).filter((x) => !fires(m).has(x));
    if (mine.length) m.choice = { kind: 'festival', node: n, options: mine };
    else { p.money += 50; events.push({ type: 'cash', player: p.id, node: n, amount: 50, why: 'corner' }); }
  } else if (c.kind === 'express') {
    const options = reachAhead(m, n, EXPRESS_REACH);
    if (options.length) m.choice = { kind: 'warp', node: n, options };
  } else if (c.kind === 'maze') p.rest = 1;
  return events;
}

// ── 현장소장: 환승센터 · 착공 ─────────────────────────────────

/** 환승센터: 내 랜드마크에 서면 다른 내 랜드마크로 갈 수 있다(지금 역을 고르면 그대로) */
export function transferOptions(m, p) {
  if (!perkOf(m, p).transfer || m.owned[p.node] !== p.id || m.levels[p.node] < MAX_LEVEL) return [];
  const fire = fires(m);
  return stationsOf(m, p).filter((n) => n !== p.node && m.levels[n] >= MAX_LEVEL && !fire.has(n));
}
function transferChoice(m, p) {
  const options = transferOptions(m, p);
  return options.length ? { kind: 'transfer', node: p.node, options: [...options, p.node] } : null;
}

/** 공사가 걷힌다(주인이 바뀌거나 역이 팔리면 공사도 끝) */
function dropBuild(m, n) {
  const at = incidentAt(m, n);
  if (at?.kind !== 'build') return [];
  m.incidents = m.incidents.filter((i) => i !== at);
  return [{ type: 'incidentEnd', node: n, kind: 'build', cancelled: true }];
}

/** 공사가 끝나면: 그대로 내 역이면 랜드마크로 개통 + 개통 축제 */
function openBuild(m, i) {
  const p = playerById(m, i.by);
  if (!p || p.out || m.owned[i.node] !== p.id) return [];
  m.levels[i.node] = MAX_LEVEL;
  return [{ type: 'upgrade', player: p.id, node: i.node, price: 0, level: MAX_LEVEL, free: true, opened: true, chain: links(m.owned, p.id).at[i.node]?.len || 1 },
    ...spawnIncident(m, 'opening', i.node)];
}

/** 명소역에서 고르기: warp 면 갈 역, card 면 찬스 카드 id */
export function choose(m, value) {
  if (m.phase !== 'choose' || !m.choice) throw new Error('고를 것이 없습니다');
  const p = current(m), c = m.choice;
  if (!c.options.includes(value)) throw new Error('고를 수 없는 것입니다: ' + value);
  m.choice = null;
  const events = [];
  if (c.kind === 'card') events.push(...applyChance(m, p, chanceById(value), true));
  else if (c.kind === 'festival') events.push(...spawnIncident(m, 'festival', value));
  else if (c.kind === 'transfer') {
    if (value !== p.node) {
      const from = p.node;
      p.prev = null;
      p.node = value;
      events.push({ type: 'warp', player: p.id, from, to: value, by: 'transfer' });
      if (value === p.goal) events.push(...reachGoal(m, p));
      events.push(...crossStart(m, p, from, value));
      events.push(...land(m, p));
    }
  } else {
    const from = p.node;
    p.prev = null;
    p.node = value;
    events.push({ type: 'warp', player: p.id, from, to: value, by: isLoop(m) ? 'express' : undefined });
    if (value === p.goal) events.push(...reachGoal(m, p));
    events.push(...crossStart(m, p, from, value));
    events.push(...land(m, p));
  }
  if (p.out) return events.concat(endTurn(m));
  return afterLand(m, p, events);
}

// ── 독점 ───────────────────────────────────────────────────

/** 독점까지 얼마나 왔나: 가진 명소역 수, 한 호선에서 가장 길게 이어 가진 역 수 */
export function monopolyOf(m, p) {
  const hot = HOT_LIST.filter((n) => m.owned[n] === p.id).length;
  let line = 0, lineId = null;
  for (const r of links(m.owned, p.id).runs) if (r.stations.length > line) { line = r.stations.length; lineId = r.line; }
  return { hot, line, lineId };
}
const monoWin = (m, s) => s.hot >= m.hotWin || s.line >= m.lineWin;

/** 지나간 남의 역마다 통과 요금(주인별로 묶는다). 도착역은 통행료라서 빼고 센다 */
export function passFares(m, p, path) {
  const out = new Map();
  if (isLoop(m)) return out; // 순환선은 모두가 같은 칸을 지나니 통과 요금이 없다
  for (const n of path.slice(0, -1)) {
    const amount = Math.round(tollFor(m, n, p) * PASS_RATE * (1 - (perkOf(m, p).passDiscount || 0)));
    if (!amount) continue;
    const o = m.owned[n];
    const had = out.get(o) || { amount: 0, nodes: [] };
    had.amount += amount; had.nodes.push(n);
    out.set(o, had);
  }
  return out;
}

function reachGoal(m, p) {
  const bonus = (GOAL_BONUS + (perkOf(m, p).goalBonus || 0)) * (timeOf(m) === 'last' ? 2 : 1);
  p.money += bonus;
  p.goals++;
  const at = p.goal;
  p.goal = pickGoal(m, p);
  return [{ type: 'goal', player: p.id, node: at, bonus, next: p.goal }];
}

/** 멈춘 역에서 일어나는 일 */
function land(m, p) {
  const n = p.node;
  const events = [];
  const inc = incidentAt(m, n);
  if (inc && INCIDENTS[inc.kind].cash) {
    const cash = INCIDENTS[inc.kind].cash * (perkOf(m, p).crowdBonus || 1);
    p.money += cash;
    events.push({ type: 'cash', player: p.id, node: n, amount: cash, why: 'crowd' });
  }
  // 순환선의 출입 통제는 한 번 쓰는 함정: 상대 하나를 세우고 걷힌다
  if (inc?.once && m.owned[n] !== p.id) {
    m.incidents = m.incidents.filter((i) => i !== inc);
    events.push({ type: 'incidentEnd', node: n, kind: inc.kind, used: true });
  }
  if (inc && INCIDENTS[inc.kind].again) {
    p.again = true;
    m.incidents = m.incidents.filter((i) => i !== inc);
    events.push({ type: 'incidentEnd', node: n, kind: inc.kind, used: true });
  }
  if (isChance(n)) events.push(...drawChance(m, p));
  const owner = m.owned[n];
  if (owner && owner !== p.id) {
    const amount = tollFor(m, n, p);
    if (amount > 0) {
      if (p.coupon) {
        p.coupon = false;
        events.push({ type: 'tollFree', player: p.id, node: n, amount });
      } else {
        events.push(...pay(m, p, amount, owner, { node: n, why: 'toll' }));
      }
    }
  }
  return events;
}

/** 멈춘 역에서 할 수 있는 거래 하나: 사기 · 증축 · 인수 */
function offerFor(m, p) {
  const n = p.node;
  if (!buyable(n, m)) return null;
  const owner = m.owned[n];
  if (!owner) {
    const price = priceFor(m, n);
    return p.money >= price ? { kind: 'buy', node: n, price } : null;
  }
  if (owner === p.id) {
    const lv = m.levels[n];
    if (lv >= MAX_LEVEL) return null;
    const price = upgradeFor(m, n, p);
    return p.money >= price ? { kind: 'upgrade', node: n, price, level: nextLevel(n, lv) } : null;
  }
  if (m.levels[n] >= MAX_LEVEL) return null; // 랜드마크는 인수할 수 없다
  const price = takeoverFor(m, n, p);
  return p.money >= price ? { kind: 'takeover', node: n, price, from: owner } : null;
}

/** 증축하면 오를 단계 — 잠실(초고층 타워)은 한 번에 랜드마크 */
const nextLevel = (n, lv) => (n === '잠실' ? MAX_LEVEL : lv + 1);

/** 제안에 답한다(true 면 거래). 그다음 차례로 넘어간다 */
export function decide(m, yes) {
  if (m.phase !== 'decide' || !m.offer) throw new Error('고를 거래가 없습니다');
  const p = current(m);
  const o = m.offer;
  const events = [];
  m.offer = null;
  if (yes && p.money >= o.price) {
    const before = links(m.owned, p.id).at[o.node]?.len || 0;
    const monoBefore = monopolyOf(m, p);
    p.money -= o.price;
    if (o.kind === 'buy') { m.owned[o.node] = p.id; m.levels[o.node] = 1; }
    if (o.kind === 'upgrade') m.levels[o.node] = o.level;
    if (o.kind === 'takeover') {
      const seller = playerById(m, o.from);
      seller.money += o.price;
      m.owned[o.node] = p.id;
      events.push(...dropBuild(m, o.node));
    }
    const chain = links(m.owned, p.id).at[o.node]?.len || 1;
    events.push({ type: o.kind, player: p.id, node: o.node, price: o.price, level: m.levels[o.node], from: o.from, chain, linked: chain > before && chain > 1 });
    if (o.kind !== 'upgrade' && gained(m, p, monoBefore, events)) return events;
  } else {
    events.push({ type: 'pass', player: p.id, node: o.node, kind: o.kind });
  }
  return events.concat(endTurn(m));
}

/** 역을 새로 가진 뒤: 중개 수수료 · 독점 검사(독점이면 판이 끝나고 true) */
function gained(m, p, monoBefore, events) {
  // 부동산 중개인: 남의 거래마다 수수료
  for (const q of alive(m)) { const fee = q !== p && perkOf(m, q).commission; if (fee) { q.money += fee; events.push({ type: 'cash', player: q.id, amount: fee, why: 'commission' }); } }
  const mono = monopolyOf(m, p);
  if (monoWin(m, mono)) {
    const kind = mono.hot >= m.hotWin ? 'hot' : 'line';
    events.push({ type: 'monopoly', player: p.id, kind, line: mono.lineId });
    m.mono = { kind, line: mono.lineId };
    events.push(...finish(m, 'monopoly', p));
    return true;
  }
  if (mono.hot === m.hotWin - 1 && monoBefore.hot < mono.hot) events.push({ type: 'monoWarn', player: p.id, kind: 'hot', have: mono.hot, need: m.hotWin });
  if (mono.line === m.lineWin - 1 && monoBefore.line < mono.line) events.push({ type: 'monoWarn', player: p.id, kind: 'line', line: mono.lineId, have: mono.line, need: m.lineWin });
  return false;
}

/**
 * 돈을 낸다. 모자라면 가진 역을 싼 것부터 팔고(값의 절반), 그래도 모자라면 있는 돈을 다 내고 파산.
 * to 가 없으면 은행(누구에게도 가지 않는다).
 */
function pay(m, p, amount, to, info = {}) {
  const events = [];
  if (p.money < amount) {
    const mine = stationsOf(m, p).sort((a, b) => sellValue(a, m.levels[a]) - sellValue(b, m.levels[b]));
    while (p.money < amount && mine.length) {
      const n = mine.shift();
      const v = sellValue(n, m.levels[n]);
      p.money += v;
      delete m.owned[n]; delete m.levels[n];
      events.push({ type: 'sell', player: p.id, node: n, amount: v }, ...dropBuild(m, n));
    }
  }
  const paid = Math.min(amount, p.money);
  p.money -= paid;
  const recv = to ? playerById(m, to) : null;
  if (recv) recv.money += paid;
  events.push({ type: 'pay', player: p.id, to: to || null, amount: paid, ...info });
  if (paid < amount) {
    const rescue = perkOf(m, p).rescue;
    if (rescue && !p.rescued) {
      // 간호사: 한 번은 남은 빚을 털고 버틴다
      p.rescued = true;
      p.money = rescue;
      events.push({ type: 'rescue', player: p.id, amount: rescue, debt: amount - paid });
    } else events.push(...bankrupt(m, p));
  }
  return events;
}

function bankrupt(m, p) {
  p.out = true;
  p.place = alive(m).length + 1;
  const events = [{ type: 'bankrupt', player: p.id, place: p.place }];
  for (const n of stationsOf(m, p)) { delete m.owned[n]; delete m.levels[n]; events.push(...dropBuild(m, n)); }
  return events;
}

// ── 노선 투자(굴리기 전 증축) ─────────────────────────────────

/** 지금 어디서든 증축할 수 있는 내 역: 이어진 묶음(2역 이상)에 든 역, 랜드마크 전, 돈이 되는 것 */
export function investable(m, p = current(m)) {
  if (m.phase !== 'roll' || current(m) !== p) return [];
  const at = links(m.owned, p.id).at;
  return stationsOf(m, p).filter((n) => (at[n]?.len || 1) >= 2 && m.levels[n] < MAX_LEVEL && p.money >= upgradeFor(m, n, p));
}

export function invest(m, n) {
  const p = current(m);
  if (!investable(m, p).includes(n)) throw new Error('지금 증축할 수 없는 역입니다: ' + n);
  const price = upgradeFor(m, n, p);
  p.money -= price;
  m.levels[n] = nextLevel(n, m.levels[n]);
  return [{ type: 'upgrade', player: p.id, node: n, price, level: m.levels[n], invest: true, chain: links(m.owned, p.id).at[n]?.len || 1 }];
}

// ── 찬스 카드 · 뉴스 ─────────────────────────────────────────

function drawChance(m, p) {
  return applyChance(m, p, pickWeighted(m.rng, CHANCE_CARDS));
}

/** 찬스 카드 한 장의 일. picked = 명동에서 골라 가진 카드 */
function applyChance(m, p, card, picked = false) {
  const events = [{ type: 'chance', player: p.id, id: card.id, name: card.name, short: card.short, good: card.good, picked }];
  if (card.id === 'bonus') { p.money += 150; events.push({ type: 'cash', player: p.id, amount: 150, why: 'chance' }); }
  else if (card.id === 'refund') { p.money += 80; events.push({ type: 'cash', player: p.id, amount: 80, why: 'chance' }); }
  else if (card.id === 'express') p.dash += 3;
  else if (card.id === 'coupon') p.coupon = true;
  else if (card.id === 'build') {
    const mine = stationsOf(m, p).filter((n) => m.levels[n] < MAX_LEVEL).sort((a, b) => stationPrice(b) - stationPrice(a));
    if (mine.length) { m.levels[mine[0]]++; events.push({ type: 'upgrade', player: p.id, node: mine[0], price: 0, level: m.levels[mine[0]], free: true }); }
    else { p.money += 100; events.push({ type: 'cash', player: p.id, amount: 100, why: 'chance' }); }
  } else if (card.id === 'fine') events.push(...pay(m, p, 100, null, { why: 'fine' }));
  else if (card.id === 'repair') { const k = stationsOf(m, p).length; if (k) events.push(...pay(m, p, 20 * k, null, { why: 'repair' })); }
  else if (card.id === 'rest') p.rest = 1;
  return events;
}

// ── 역 사건 ────────────────────────────────────────────────

/** 사건 하나. 길이는 바퀴 수로 맞춘다(순환선은 한 바퀴가 짧다). extra 는 그 사건만의 값(tollX 등) */
function spawnIncident(m, kind, at = null, extra = {}) {
  const k = kind;
  const taken = new Set([...m.players.map((p) => p.node), ...m.incidents.map((i) => i.node)]);
  const spots = at ? [at] : areaOf(m).stations.filter((n) => !taken.has(n) && !isChance(n) && !cornerAt(m, n));
  if (!spots.length) return [];
  const node = spots[Math.floor(m.rng.next() * spots.length)];
  const info = INCIDENTS[k];
  const until = m.clock + Math.round((info.minutes * m.roundMin) / CLOCK.round);
  m.incidents = m.incidents.filter((i) => i.node !== node);
  const inc = { node, kind: k, until, ...extra };
  m.incidents.push(inc);
  return [{ type: 'incident', node, kind: k, until: inc.until, name: info.name, short: info.short }];
}

function tickIncidents(m) {
  const events = [];
  const done = m.incidents.filter((x) => m.clock >= x.until);
  m.incidents = m.incidents.filter((x) => m.clock < x.until);
  for (const i of done) {
    events.push({ type: 'incidentEnd', node: i.node, kind: i.kind });
    if (i.kind === 'build') events.push(...openBuild(m, i));
  }
  return events;
}

// ── 차례 넘기기 · 바퀴 · 끝 ────────────────────────────────────

function endTurn(m) {
  const events = [];
  m.phase = 'roll';
  if (alive(m).length <= 1) return events.concat(finish(m, 'bankrupt'));
  const p = current(m);
  if (p.again && !p.out) {
    p.again = false;
    events.push({ type: 'again', player: p.id });
    return events;
  }
  p.again = false;
  const before = m.turn;
  do { m.turn = (m.turn + 1) % m.players.length; } while (m.players[m.turn].out);
  if (m.turn <= before) {
    // 한 바퀴: 시계가 흐르고, 사건·뉴스
    const was = timeOf(m);
    m.round++;
    m.clock += m.roundMin;
    events.push({ type: 'clock', clock: m.clock, round: m.round });
    // 간호사: 교대 근무 수당
    for (const q of alive(m)) { const pay = perkOf(m, q).shiftPay; if (pay) { q.money += pay; events.push({ type: 'cash', player: q.id, amount: pay, why: 'shift' }); } }
    if (timeOf(m) !== was) events.push({ type: 'timeShift', time: timeOf(m), clock: m.clock });
    if (m.clock >= m.end) return events.concat(finish(m, 'lastTrain'));
    events.push(...tickIncidents(m));
    if (alive(m).length <= 1) return events.concat(finish(m, 'bankrupt'));
  }
  events.push({ type: 'turn', player: current(m).id });
  return events;
}

function finish(m, reason, winner = null) {
  m.phase = 'over';
  m.reason = reason;
  m.winner = winner?.id || null;
  m.offer = null; m.choice = null;
  const live = alive(m).sort((a, b) => (b === winner) - (a === winner) || assets(m, b) - assets(m, a));
  live.forEach((p, i) => { p.place = i + 1; });
  m.ranking = m.players.slice().sort((a, b) => a.place - b.place).map((p) => ({ id: p.id, hero: p.hero, place: p.place, assets: p.out ? 0 : assets(m, p), out: p.out }));
  return [{ type: 'over', reason, ranking: m.ranking }];
}

// ── 스킬 ───────────────────────────────────────────────────

/** 회식 소집 회식비(통행료 배수 · 한 명 상한) · 수혈 금액(꼴찌면 두 배) */
export const GATHER_RATE = 0.25;
export const GATHER_MAX = 80;
export const GATHER_LOOP_MAX = 40;
export const TRANSFUSE = 60;

export const CRAM_COUNT = 2;
/** 벼락치기로 올릴 수 있는 내 역(비싼 것부터) */
export const cramTargets = (m, p) => stationsOf(m, p).filter((n) => m.levels[n] < MAX_LEVEL).sort((a, b) => stationPrice(b) - stationPrice(a) || m.levels[a] - m.levels[b]);

/** 순환선의 착공은 한 바퀴가 짧아 3바퀴 걸린다(노선도는 2바퀴) */
export const BUILD_LOOP_ROUNDS = 3;
/** 착공할 수 있는 내 역: 랜드마크 전, 사건(공사·축제 …)이 없는 역 */
export const buildTargets = (m, p) => stationsOf(m, p).filter((n) => m.levels[n] < MAX_LEVEL && !incidentAt(m, n));

/** 스킬 칸 수(다 차야 쓸 수 있다) */
export const skillCost = (p) => p.cost ?? heroById(p.hero).active.charge;

/** 역을 골라야 하는 스킬이면 고를 수 있는 역들, 아니면 null */
export function skillTargets(m, p = current(m)) {
  const id = heroById(p.hero).active.id, R = areaOf(m), fire = fires(m);
  if (id === 'direct') {
    if (isLoop(m)) return reachAhead(m, p.node, DIRECT_REACH);
    return [...new Set((STATION_LINES[p.node] || []).flatMap((l) => LINE_STATIONS[l]))].filter((n) => n !== p.node && R.set.has(n) && !fire.has(n));
  }
  if (id === 'gate' || id === 'gather' || id === 'hype') return stationsOf(m, p).filter((n) => !fire.has(n));
  if (id === 'build') return buildTargets(m, p);
  if (id === 'buyout') return Object.keys(m.owned).filter((n) => m.owned[n] !== p.id && !isHot(n) && m.levels[n] < MAX_LEVEL && p.money >= buyoutFor(m, n));
  return null;
}

export function skillBlocked(m, p = current(m)) {
  const h = heroById(p.hero), id = h.active.id;
  if (m.phase !== 'roll' || current(m) !== p) return '주사위 전에만 사용 가능';
  if (p.charge < skillCost(p)) return `충전 중 ${p.charge}/${skillCost(p)}`;
  const t = skillTargets(m, p);
  if (t && !t.length) return id === 'buyout' ? '살 수 있는 역 없음' : id === 'direct' ? '갈 수 있는 역 없음' : id === 'build' && stationsOf(m, p).length ? '공사할 역 없음' : '보유 역 없음';
  if (id === 'cram' && !cramTargets(m, p).length) return '증축할 역 없음';
  if (id === 'combo' && p.combo) return '이미 적용 중';
  return null;
}

/** 스킬을 쓴다. 역을 고르는 스킬이면 target 이 skillTargets 중 하나여야 한다 */
export function useSkill(m, target = null) {
  const p = current(m);
  const why = skillBlocked(m, p);
  if (why) throw new Error(why);
  const h = heroById(p.hero), id = h.active.id;
  const targets = skillTargets(m, p);
  if (targets && !targets.includes(target)) throw new Error('고를 수 없는 역입니다: ' + target);
  p.charge = 0;
  const events = [{ type: 'skill', player: p.id, hero: h.id, skill: id, name: h.active.name, desc: activeDesc(h, isLoop(m)), node: targets ? target : null }];
  const rivals = alive(m).filter((q) => q !== p);
  if (id === 'cram') {
    // 벼락치기: 비싼 내 역부터 CRAM_COUNT 곳 무료 증축
    for (const n of cramTargets(m, p).slice(0, CRAM_COUNT)) {
      m.levels[n] = nextLevel(n, m.levels[n]);
      events.push({ type: 'upgrade', player: p.id, node: n, price: 0, level: m.levels[n], free: true, chain: links(m.owned, p.id).at[n]?.len || 1 });
    }
  }
  else if (id === 'combo') p.combo = true;
  else if (id === 'direct') {
    // 직통 열차: 굴리지 않고 그 역으로 — 그 역에 선 것과 같다
    const from = p.node;
    p.prev = null;
    p.node = target;
    events.push({ type: 'warp', player: p.id, from, to: target, by: 'direct' });
    if (target === p.goal) events.push(...reachGoal(m, p));
    events.push(...crossStart(m, p, from, target));
    events.push(...land(m, p));
    if (p.out) return events.concat(endTurn(m));
    return afterLand(m, p, events);
  } else if (id === 'build') events.push(...spawnIncident(m, 'build', target, { by: p.id, ...(isLoop(m) ? { until: m.clock + BUILD_LOOP_ROUNDS * m.roundMin } : {}) }));
  else if (id === 'gate') events.push(...spawnIncident(m, 'gate', target, isLoop(m) ? { once: true } : {}));
  else if (id === 'hype') {
    events.push(...spawnIncident(m, 'hype', target, isLoop(m) ? { tollX: HYPE_LOOP_X } : {}));
    if (!isLoop(m)) for (const q of rivals) if (q.node !== target && q.goal !== target) {
      const from = q.goal;
      q.goal = target;
      events.push({ type: 'newGoal', player: q.id, from, goal: target, by: 'hype' });
    }
  } else if (id === 'gather') {
    // 회식 소집: 모두 그 역으로 불려 와서 회식비(통행료 × GATHER_RATE, 한 명 GATHER_MAX 까지)를 낸다
    for (const q of rivals) {
      const from = q.node;
      q.prev = null;
      q.node = target;
      events.push({ type: 'warp', player: q.id, from, to: target, by: 'gather' });
      const amount = Math.min(isLoop(m) ? GATHER_LOOP_MAX : GATHER_MAX, Math.round(tollFor(m, target, q) * GATHER_RATE));
      if (!amount) continue;
      if (q.coupon) { q.coupon = false; events.push({ type: 'tollFree', player: q.id, node: target, amount }); }
      else events.push(...pay(m, q, amount, p.id, { node: target, why: 'toll' }));
    }
  } else if (id === 'transfuse') {
    const rank = (q) => assets(m, q);
    const top = rivals.slice().sort((a, b) => rank(b) - rank(a))[0];
    const last = rivals.every((q) => rank(q) >= rank(p));
    events.push(...pay(m, top, last ? TRANSFUSE * 2 : TRANSFUSE, p.id, { why: 'transfuse' }));
  } else if (id === 'buyout') {
    const price = buyoutFor(m, target), from = m.owned[target], seller = playerById(m, from);
    const before = links(m.owned, p.id).at[target]?.len || 0;
    const monoBefore = monopolyOf(m, p);
    p.money -= price;
    seller.money += price;
    m.owned[target] = p.id;
    const chain = links(m.owned, p.id).at[target]?.len || 1;
    events.push({ type: 'takeover', player: p.id, node: target, price, level: m.levels[target], from, chain, linked: chain > before && chain > 1, buyout: true }, ...dropBuild(m, target));
    if (gained(m, p, monoBefore, events)) return events;
  }
  if (alive(m).length <= 1) return events.concat(endTurn(m));
  return events;
}

export { isTransfer };
