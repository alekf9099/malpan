// 한 판의 규칙 — 역전(驛戰): 역을 차지하라.
// 화면을 모르고, 할 때마다 "무슨 일이 있었는지" 이벤트 목록을 돌려준다(화면은 그 목록을 차례로 연출).
//
// 2~4명이 서울 노선도 위에서 겨룬다. 06:00 첫차 → 24:00 막차가 한 판.
//   차례: 열차 주사위(1~5역 · 급행 7역+한 번 더)를 굴려 그만큼 달린다. 갈림길에서는 갈 방향을 고른다.
//   멈춘 역: 빈 역이면 산다 · 내 역이면 증축한다 · 남의 역이면 통행료를 내고, 돈이 되면 인수할 수 있다
//   지나가는 남의 역: 서지 않아도 통과 요금(통행료의 20%) — 이어서 가진 노선은 유료 도로가 된다
//   노선 투자: 내 차례에 굴리기 전, 이어진(2역 이상) 내 역은 어디서든 증축할 수 있다(모두의 마블의 건물 짓기)
//   목적지: 저마다 목적지 역이 있다. 지나가거나 서면 보너스를 받고 새 목적지를 받는다
//   찬스 역(?): 서면 찬스 카드를 뽑는다
//   통행료를 못 내면 역을 팔아서라도 내고, 그래도 모자라면 파산 — 마지막 한 명이 남으면 그 사람이 이긴다
//   명소역(11곳): 서면 그 역만의 일(KTX 순간이동 · 하늘길 · 쇼핑 …). 목적지는 주로 명소역으로 나온다
//   독점 승리: 명소역 5곳을 갖거나 한 호선에서 6역을 이어 가지면 그 자리에서 이긴다(하나 남으면 경고)
//   막차 시각이 되면 자산(돈 + 역에 들인 값)이 가장 많은 사람이 이긴다
// 모두 한 차례씩 돌면 한 바퀴 — 시계가 45분 흐르고, 역 사건·뉴스가 일어난다.

import { createRng } from './rng.js';
import { ADJ, ALL_STATIONS, dist, paths, rollDie, spreadStations, isTransfer } from './boards/seoul.js';
import { stationPrice, upgradeCost, takeoverPrice, sellValue, invested, baseToll, MAX_LEVEL, links, HOTSPOTS, HOT_LIST, isHot } from './estate.js';
import { INCIDENTS, INCIDENT_MAX, INCIDENT_CHANCE, pickIncident } from './incidents.js';
import { CHANCE_CARDS, chanceById, newsById, planNews, pickWeighted } from './events.js';
import { heroById, SKILL_USES } from './heroes.js';

export const START_MONEY = 1200;
export const GOAL_BONUS = 200;
export const MIN_GOAL_DIST = 10;
export const CLOCK = {
  start: 6 * 60, end: 24 * 60, round: 45,
  rush: [[7 * 60, 9 * 60], [18 * 60, 20 * 60]],
  night: 22 * 60, last: 23 * 60
};
/** 시간대별 통행료 배율: 러시아워 ×1.5 · 심야·막차 ×1.25 */
export const TIME_TOLL = { rush: 1.5, night: 1.25, last: 1.25, day: 1 };
/** 남의 역을 지나가기만 해도 내는 통과 요금 = 통행료 × PASS_RATE */
export const PASS_RATE = 0.2;
/** 인원이 적으면 서로 만날 일이 적으니 통행료를 키운다 */
export const CROWD_TOLL = { 2: 1.6, 3: 1.25, 4: 1 };
/** 독점 승리: 명소역 HOT_WIN 곳 · 한 호선에서 LINE_WIN 역 이어 갖기 */
export const HOT_WIN = 5;
export const LINE_WIN = 6;
/** 새 목적지가 명소역일 확률, 명소역 목적지의 최소 거리 */
export const HOT_GOAL_CHANCE = 0.6;
export const HOT_GOAL_DIST = 6;
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
export function createMatch({ seed = 1, heroes, humans = 1, daily = false }) {
  const rng = createRng((seed >>> 0) || 1);
  const starts = spreadStations(rng, heroes.length);
  const m = {
    seed, daily, rng,
    players: heroes.map((hero, i) => ({
      id: 'p' + i, hero, human: i < humans, money: START_MONEY,
      node: starts[i], prev: null, goal: null, out: false, place: null,
      skills: SKILL_USES, dash: 0, fly: false, again: false, rest: 0, coupon: false, goals: 0,
      live: false, deal: false, rescued: false
    })),
    owned: {},          // 역 → 주인 id
    levels: {},         // 역 → 단계(1~3)
    turn: 0, round: 1,
    clock: CLOCK.start, end: CLOCK.end,
    incidents: [],      // { node, kind, until }
    news: planNews(rng).map((n) => ({ ...n, done: false })),
    sale: 0, boom: 0,   // 뉴스 효과가 끝나는 시각
    phase: 'roll',      // roll → move → (choose) → decide → (다음 사람) roll … → over
    pending: null, offer: null, choice: null, ranking: null, reason: null, winner: null
  };
  for (const p of m.players) p.goal = pickGoal(m, p);
  return m;
}

export const current = (m) => m.players[m.turn];
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

/** 목적지: 주로(60%) 6역 넘게 떨어진 명소역, 아니면 10역 넘게 떨어진 아무 역 — 모두 명소 쪽으로 몰리게 */
function pickGoal(m, p) {
  const hot = HOT_LIST.filter((n) => n !== p.goal && n !== p.node && dist(p.node, n) >= HOT_GOAL_DIST);
  if (hot.length && m.rng.next() < HOT_GOAL_CHANCE) return hot[Math.floor(m.rng.next() * hot.length)];
  const far = ALL_STATIONS.filter((n) => dist(p.node, n) >= MIN_GOAL_DIST && n !== p.goal);
  return far[Math.floor(m.rng.next() * far.length)];
}

// ── 값 ─────────────────────────────────────────────────────

export const incidentAt = (m, n) => m.incidents.find((i) => i.node === n);
const fires = (m) => new Set(m.incidents.filter((i) => INCIDENTS[i.kind].block).map((i) => i.node));
const delays = (m) => new Set(m.incidents.filter((i) => INCIDENTS[i.kind].stop).map((i) => i.node));
export const buyable = (n) => !isChance(n);
export const priceFor = (m, n) => Math.round(stationPrice(n) * (m.clock < m.sale ? 0.5 : 1));
export const upgradeFor = (m, n, p) => Math.round(upgradeCost(n) * (1 - (heroById(p.hero).buildDiscount || 0)) * (m.clock < m.sale ? 0.5 : 1));
/** 인수 값: 들인 값 × 1.5 — 중개인은 30% 싸게, 급매 협상 중이면 들인 값 그대로 */
export const takeoverFor = (m, n, p = current(m)) => {
  const lv = m.levels[n] || 1;
  const base = p.deal ? invested(n, lv) : takeoverPrice(n, lv);
  return Math.round(base * (1 - (heroById(p.hero).takeoverDiscount || 0)));
};

/** payer 가 이 역에 서면 낼 통행료(면제권은 따로) */
export function tollFor(m, n, payer) {
  const owner = m.owned[n];
  if (!owner || owner === payer.id || fires(m).has(n)) return 0;
  const inc = INCIDENTS[incidentAt(m, n)?.kind];
  const x = (inc?.tollX || 1) * (m.clock < m.boom ? 2 : 1) * TIME_TOLL[timeOf(m)] * (CROWD_TOLL[m.players.length] || 1) * (1 - (heroById(payer.hero).tollDiscount || 0));
  return Math.round(baseToll(m.owned, m.levels, n) * x);
}

// ── 차례 ───────────────────────────────────────────────────

/** 굴리기. 쉬어야 하는 사람이면 굴리지 않고 넘어간다 */
export function roll(m, rng = m.rng) {
  if (m.phase !== 'roll') throw new Error('지금은 굴릴 차례가 아닙니다: ' + m.phase);
  const p = current(m);
  if (p.rest > 0) {
    p.rest--;
    return [{ type: 'rest', player: p.id }, ...endTurn(m)];
  }
  const r = rollDie(rng);
  const steps = r.value * (p.fly ? 2 : 1) + p.dash;
  const events = [{ type: 'roll', player: p.id, roll: r, steps, dash: p.dash, fly: p.fly }];
  p.dash = 0;
  p.fly = false;
  if (r.bonus) p.again = true;
  m.pending = { roll: r, steps };
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
  return paths(p.node, p.prev, m.pending.steps, { avoid: fires(m), stopAt: delays(m), goal: p.goal });
}

/** 갈림길에서 고를 수 있는 다음 역(사람이 한 역씩 고를 때). 막히면 빈 목록 */
export function nextStations(m, node, back) {
  const avoid = fires(m);
  let next = ADJ[node].filter((x) => x !== back && !avoid.has(x));
  if (!next.length) next = ADJ[node].filter((x) => !avoid.has(x));
  return next;
}
/** 이 역에 닿으면 남은 칸이 있어도 멈추나(신호 장애) */
export const stopsAt = (m, n) => delays(m).has(n);

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
  p.prev = path.length > 1 ? path[path.length - 2] : from;
  p.node = path[path.length - 1];
  m.pending = null;
  const events = [{ type: 'move', player: p.id, from, path }];
  if (path.includes(p.goal)) events.push(...reachGoal(m, p));
  for (const [owner, info] of passFares(m, p, path)) {
    events.push(...pay(m, p, info.amount, owner, { why: 'pass', nodes: info.nodes }));
    if (p.out) return events.concat(endTurn(m));
  }
  events.push(...land(m, p));
  if (p.out) return events.concat(endTurn(m));
  if (isHot(p.node)) events.push(...hotspotPower(m, p));
  if (p.out) return events.concat(endTurn(m));
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
  return [...new Set([p.goal, ...HOT_LIST])].filter((n) => n !== p.node && !fire.has(n));
}

/** 명소역에 서면(주인이어도) 그 역만의 일이 일어난다 */
function hotspotPower(m, p) {
  const n = p.node, h = HOTSPOTS[n];
  const events = [{ type: 'hotspot', player: p.id, node: n, tag: h.tag, desc: h.desc }];
  const cash = (amount) => { p.money += amount; events.push({ type: 'cash', player: p.id, node: n, amount, why: 'hot' }); };
  const hero = heroById(p.hero);
  if (hero.hotBonus) cash(hero.hotBonus);          // 여행 유튜버: 명소 브이로그
  if (p.live) { p.live = false; cash(120); }       // 생방송 후원
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

/** 명소역에서 고르기: warp 면 갈 역, card 면 찬스 카드 id */
export function choose(m, value) {
  if (m.phase !== 'choose' || !m.choice) throw new Error('고를 것이 없습니다');
  const p = current(m), c = m.choice;
  if (!c.options.includes(value)) throw new Error('고를 수 없는 것입니다: ' + value);
  m.choice = null;
  const events = [];
  if (c.kind === 'card') events.push(...applyChance(m, p, chanceById(value), true));
  else {
    const from = p.node;
    p.prev = null;
    p.node = value;
    events.push({ type: 'warp', player: p.id, from, to: value });
    if (value === p.goal) events.push(...reachGoal(m, p));
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
const monoWin = (s) => s.hot >= HOT_WIN || s.line >= LINE_WIN;

/** 지나간 남의 역마다 통과 요금(주인별로 묶는다). 도착역은 통행료라서 빼고 센다 */
export function passFares(m, p, path) {
  const out = new Map();
  for (const n of path.slice(0, -1)) {
    const amount = Math.round(tollFor(m, n, p) * PASS_RATE * (1 - (heroById(p.hero).passDiscount || 0)));
    if (!amount) continue;
    const o = m.owned[n];
    const had = out.get(o) || { amount: 0, nodes: [] };
    had.amount += amount; had.nodes.push(n);
    out.set(o, had);
  }
  return out;
}

function reachGoal(m, p) {
  const bonus = (GOAL_BONUS + (heroById(p.hero).goalBonus || 0)) * (timeOf(m) === 'last' ? 2 : 1);
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
    const cash = INCIDENTS[inc.kind].cash * (heroById(p.hero).crowdBonus || 1);
    p.money += cash;
    events.push({ type: 'cash', player: p.id, node: n, amount: cash, why: 'crowd' });
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
  if (!buyable(n)) return null;
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
    }
    const chain = links(m.owned, p.id).at[o.node]?.len || 1;
    events.push({ type: o.kind, player: p.id, node: o.node, price: o.price, level: m.levels[o.node], from: o.from, chain, linked: chain > before && chain > 1 });
    // 부동산 중개인: 남의 거래마다 수수료
    if (o.kind !== 'upgrade') for (const q of alive(m)) { const fee = q !== p && heroById(q.hero).commission; if (fee) { q.money += fee; events.push({ type: 'cash', player: q.id, amount: fee, why: 'commission' }); } }
    if (o.kind !== 'upgrade') {
      const mono = monopolyOf(m, p);
      if (monoWin(mono)) {
        const kind = mono.hot >= HOT_WIN ? 'hot' : 'line';
        events.push({ type: 'monopoly', player: p.id, kind, line: mono.lineId });
        m.mono = { kind, line: mono.lineId };
        return events.concat(finish(m, 'monopoly', p));
      }
      if (mono.hot === HOT_WIN - 1 && monoBefore.hot < mono.hot) events.push({ type: 'monoWarn', player: p.id, kind: 'hot', have: mono.hot, need: HOT_WIN });
      if (mono.line === LINE_WIN - 1 && monoBefore.line < mono.line) events.push({ type: 'monoWarn', player: p.id, kind: 'line', line: mono.lineId, have: mono.line, need: LINE_WIN });
    }
  } else {
    events.push({ type: 'pass', player: p.id, node: o.node, kind: o.kind });
  }
  return events.concat(endTurn(m));
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
      events.push({ type: 'sell', player: p.id, node: n, amount: v });
    }
  }
  const paid = Math.min(amount, p.money);
  p.money -= paid;
  const recv = to ? playerById(m, to) : null;
  if (recv) recv.money += paid;
  events.push({ type: 'pay', player: p.id, to: to || null, amount: paid, ...info });
  if (paid < amount) {
    const rescue = heroById(p.hero).rescue;
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
  for (const n of stationsOf(m, p)) { delete m.owned[n]; delete m.levels[n]; }
  return [{ type: 'bankrupt', player: p.id, place: p.place }];
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

function fireNews(m) {
  const due = m.news.find((e) => !e.done && m.clock >= e.at);
  if (!due) return [];
  due.done = true;
  const card = newsById(due.id);
  const events = [{ type: 'news', id: card.id, name: card.name, short: card.short, good: card.good }];
  if (card.id === 'sale') m.sale = m.clock + 120;
  else if (card.id === 'boom') m.boom = m.clock + 120;
  else if (card.id === 'extend') { m.end += 60; events.push({ type: 'extend', end: m.end }); }
  else if (card.id === 'payday') for (const p of alive(m)) { p.money += 100; events.push({ type: 'cash', player: p.id, amount: 100, why: 'news' }); }
  else if (card.id === 'inspect') for (const p of alive(m)) { const k = stationsOf(m, p).length; if (k) events.push(...pay(m, p, 15 * k, null, { why: 'inspect' })); }
  return events;
}

// ── 역 사건 ────────────────────────────────────────────────

function spawnIncident(m, kind = null, at = null) {
  const k = kind || pickIncident(m.rng, timeOf(m) === 'rush').id;
  const taken = new Set([...m.players.map((p) => p.node), ...m.incidents.map((i) => i.node)]);
  const spots = at ? [at] : ALL_STATIONS.filter((n) => !taken.has(n) && !isChance(n));
  if (!spots.length) return [];
  const node = spots[Math.floor(m.rng.next() * spots.length)];
  const info = INCIDENTS[k];
  const until = m.clock + info.minutes;
  m.incidents = m.incidents.filter((i) => i.node !== node);
  m.incidents.push({ node, kind: k, until });
  return [{ type: 'incident', node, kind: k, until, name: info.name, short: info.short }];
}

function tickIncidents(m) {
  const events = [];
  for (const i of m.incidents.filter((x) => m.clock >= x.until)) events.push({ type: 'incidentEnd', node: i.node, kind: i.kind });
  m.incidents = m.incidents.filter((x) => m.clock < x.until);
  if (m.incidents.length < INCIDENT_MAX && m.rng.next() < INCIDENT_CHANCE) events.push(...spawnIncident(m));
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
  p.deal = false; // 급매 협상은 그 차례에만
  const before = m.turn;
  do { m.turn = (m.turn + 1) % m.players.length; } while (m.players[m.turn].out);
  if (m.turn <= before) {
    // 한 바퀴: 시계가 흐르고, 사건·뉴스
    const was = timeOf(m);
    m.round++;
    m.clock += CLOCK.round;
    events.push({ type: 'clock', clock: m.clock, round: m.round });
    // 간호사: 교대 근무 수당
    for (const q of alive(m)) { const pay = heroById(q.hero).shiftPay; if (pay) { q.money += pay; events.push({ type: 'cash', player: q.id, amount: pay, why: 'shift' }); } }
    if (timeOf(m) !== was) events.push({ type: 'timeShift', time: timeOf(m), clock: m.clock });
    if (m.clock >= m.end) return events.concat(finish(m, 'lastTrain'));
    events.push(...tickIncidents(m));
    events.push(...fireNews(m));
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

export function skillBlocked(m, p = current(m)) {
  const h = heroById(p.hero);
  if (m.phase !== 'roll' || current(m) !== p) return '주사위 전에만 사용 가능';
  if (p.skills <= 0) return '이번 판 사용 완료';
  if (h.active.id === 'call' && !stationsOf(m, p).length) return '보유 역 없음';
  if (h.active.id === 'shield' && p.coupon) return '이미 면제권 보유';
  if (h.active.id === 'live' && p.live) return '이미 생방송 중';
  if (h.active.id === 'boost' && p.fly) return '이미 이동 2배 적용 중';
  if (h.active.id === 'aid' && !stationsOf(m, p).length) return '보유 역 없음';
  if (h.active.id === 'deal' && p.deal) return '이미 급매 협상 중';
  return null;
}

export function useSkill(m) {
  const p = current(m);
  const why = skillBlocked(m, p);
  if (why) throw new Error(why);
  const h = heroById(p.hero);
  p.skills--;
  const events = [{ type: 'skill', player: p.id, hero: h.id, skill: h.active.id, name: h.active.name, desc: h.active.desc }];
  if (h.active.id === 'dash') p.dash += 3;
  else if (h.active.id === 'again') p.again = true;
  else if (h.active.id === 'shield') p.coupon = true;
  else if (h.active.id === 'call') {
    const mine = m.rng.shuffle(stationsOf(m, p).filter((n) => !incidentAt(m, n))).slice(0, 2);
    for (const n of mine) events.push(...spawnIncident(m, 'crowd', n));
  } else if (h.active.id === 'live') p.live = true;
  else if (h.active.id === 'boost') p.fly = true;
  else if (h.active.id === 'deal') p.deal = true;
  else if (h.active.id === 'aid') {
    const n = stationsOf(m, p).sort((a, b) => invested(a, m.levels[a]) - invested(b, m.levels[b]))[0];
    const v = invested(n, m.levels[n]);
    p.money += v;
    delete m.owned[n]; delete m.levels[n];
    events.push({ type: 'sell', player: p.id, node: n, amount: v, aid: true });
  }
  return events;
}

export { isTransfer };
