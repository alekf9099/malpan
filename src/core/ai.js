// AI 상대. 캐릭터마다 성격이 다르다(heroes.js 의 ai):
//   reserve 남겨 둘 돈(적을수록 과감) · hub 환승역 선호 · chain 이어 사기 선호 · build 증축 선호
// 길 고르기: 목적지 보너스 · 살 만한 빈 역 · 남의 역 통행료(무섭다) · 인파·찬스 · 신호 장애 · 명소역 힘을 따져 가장 좋은 길
// 독점: 명소역·이어진 노선을 노리고, 남이 독점 하나 앞이면 그 역을 먼저 사거나 인수해서 막는다

import { dist, isTransfer } from './boards/seoul.js';
import { links, stationPrice, isHot, baseToll } from './estate.js';
import { current, legalPaths, tollFor, priceFor, isChance, incidentAt, stationsOf, skillBlocked, passFares, investable, upgradeFor, GOAL_BONUS, alive, monopolyOf, LINE_WIN, takeoverFor, dieOptions, dieChoices, skillTargets, buyoutFor, assets, cramTargets } from './match.js';
import { chanceById } from './events.js';
import { heroById } from './heroes.js';

const persona = (p) => heroById(p.hero).ai;

/** 명소역에 서면 생기는 일의 값어치(대충) */
function hotValue(m, p, n) {
  switch (n) {
    case '서울역': return 120;
    case '김포공항': return 60;
    case '고속터미널': return 90;
    case '홍대입구': return 90;
    case '명동': return 100;
    case '여의도': return Math.min(150, p.money * 0.1);
    case '동대문역사문화공원': return 30 * (alive(m).length - 1);
    case '이태원': return stationsOf(m, p).length ? 70 : 80;
    case '성수': return p.coupon ? 80 : 70;
    default: return 0;
  }
}

/** 남(rival)이 이 역을 가지면 독점이 되나 — 막아야 할 역 */
function threatAt(m, p, n) {
  for (const q of alive(m)) {
    if (q === p) continue;
    const s = monopolyOf(m, q);
    if (isHot(n) && s.hot >= m.hotWin - 1) return q;
    if (s.line >= LINE_WIN - 1) {
      const next = { ...m.owned, [n]: q.id };
      if ((links(next, q.id).at[n]?.len || 1) >= LINE_WIN) return q;
    }
  }
  return null;
}

/** 내가 이 역을 가지면 독점에 얼마나 다가가나(0~) */
function monoGain(m, p, n) {
  const s = monopolyOf(m, p);
  let v = 0;
  if (isHot(n)) v += 60 + s.hot * 70 + (s.hot >= m.hotWin - 1 ? 2000 : 0);
  const next = { ...m.owned, [n]: p.id };
  const len = links(next, p.id).at[n]?.len || 1;
  if (len >= LINE_WIN) v += 2000;
  else if (len === LINE_WIN - 1) v += 150;
  return v;
}

/** 이 길로 가면 얼마나 좋은가(클수록 좋다) */
function pathValue(m, p, path, rng) {
  const end = path[path.length - 1];
  const ai = persona(p);
  let v = (rng.next() - 0.5) * 20;
  if (path.includes(p.goal)) v += GOAL_BONUS + 100;
  else v += (dist(p.node, p.goal) - dist(end, p.goal)) * 12;
  for (const [, f] of passFares(m, p, path)) v -= f.amount;
  const owner = m.owned[end];
  if (owner && owner !== p.id) {
    const toll = p.coupon ? 0 : tollFor(m, end, p);
    v -= toll * 0.7;
    if (toll >= p.money) v -= 2000; // 파산은 피한다
    // 중개인: 인수할 수 있는 남의 역이면 오히려 반갑다
    else if (heroById(p.hero).takeoverDiscount && m.levels[end] < 3 && p.money - toll - takeoverFor(m, end, p) >= 100) v += 60 + stationPrice(end) * 0.5;
  } else if (!owner && !isChance(end)) {
    const price = priceFor(m, end);
    if (p.money - price >= ai.reserve) {
      v += 40 + stationPrice(end) * 0.25;
      if (isTransfer(end)) v += 60 * ai.hub;
      const next = { ...m.owned, [end]: p.id };
      v += ((links(next, p.id).at[end]?.len || 1) - 1) * 70 * ai.chain;
      v += monoGain(m, p, end) * 0.5;
      if (threatAt(m, p, end)) v += 300;
    }
  } else if (owner === p.id) v += 30 + 50 * ai.build;
  if (isChance(end)) v += 25;
  if (isHot(end)) v += hotValue(m, p, end);
  const inc = incidentAt(m, end);
  if (inc?.kind === 'crowd') v += 90;
  if (inc?.kind === 'busk') v += 50;
  if (inc?.kind === 'delay') v -= 10;
  return v;
}

/** 갈 길 하나 고르기 */
/** 주사위 둘 중 하나 고르기: 각 눈으로 갈 수 있는 가장 좋은 길을 비교한다(급행은 한 번 더라 덤) */
export function chooseDie(m, rng = m.rng) {
  const p = current(m);
  let best = 0, bestV = -Infinity;
  for (const i of dieChoices(m)) {
    let v = -Infinity;
    for (const path of dieOptions(m, i)) v = Math.max(v, pathValue(m, p, path, rng));
    if (i < 2 ? m.pending.rolls[i].bonus : m.pending.rolls.some((r) => r.bonus)) v += 60;
    if (v > bestV) { bestV = v; best = i; }
  }
  return best;
}

export function choosePath(m, rng = m.rng) {
  const p = current(m);
  const all = legalPaths(m);
  let best = all[0], bestV = -Infinity;
  for (const path of all) { const v = pathValue(m, p, path, rng); if (v > bestV) { bestV = v; best = path; } }
  return best;
}

/** 거래 제안에 답하기 */
export function decideOffer(m) {
  const p = current(m), o = m.offer, ai = persona(p);
  const left = p.money - o.price;
  // 독점이 되거나 남의 독점을 막는 거래는 돈만 되면 한다
  if (o.kind !== 'upgrade' && (monoGain(m, p, o.node) >= 2000 || threatAt(m, p, o.node))) return left >= 0;
  if (o.kind === 'buy') {
    let reserve = ai.reserve;
    if (isHot(o.node)) reserve -= 120 + 60 * monopolyOf(m, p).hot;
    if (isTransfer(o.node)) reserve -= 120 * ai.hub;
    const next = { ...m.owned, [o.node]: p.id };
    if ((links(next, p.id).at[o.node]?.len || 1) > 1) reserve -= 150 * ai.chain;
    return left >= Math.max(0, reserve);
  }
  if (o.kind === 'upgrade') return left >= ai.reserve + 120 - 200 * ai.build;
  // 인수는 비싸다 — 중개인은 과감하게
  const keen = heroById(p.hero).takeoverDiscount ? 150 : 0;
  return left >= ai.reserve + 250 - 100 * ai.chain - keen;
}

/** 명소역에서 고르기: KTX 로 갈 역 · 명동 찬스 카드 */
const CARD_VALUE = { bonus: 150, build: 120, coupon: 90, refund: 80, express: 60, rest: -60, fine: -100 };
export function chooseOption(m) {
  const p = current(m), c = m.choice;
  let best = c.options[0], bestV = -Infinity;
  for (const o of c.options) {
    let v;
    if (c.kind === 'card') v = o === 'repair' ? -20 * stationsOf(m, p).length : CARD_VALUE[o] ?? 0;
    else {
      v = (o === p.goal ? GOAL_BONUS + 60 : 0) + hotValue(m, p, o) * 0.3 + m.rng.next() * 10;
      const owner = m.owned[o];
      if (owner && owner !== p.id) {
        const toll = p.coupon ? 0 : tollFor(m, o, p);
        v -= toll * 0.8 + (toll >= p.money ? 2000 : 0);
        if (threatAt(m, p, o) || (m.levels[o] < 3 && p.money >= takeoverFor(m, o, p) && monoGain(m, p, o) >= 2000)) v += 400;
      } else if (!owner && p.money >= priceFor(m, o)) v += 80 + monoGain(m, p, o) * 0.5 + (threatAt(m, p, o) ? 400 : 0);
    }
    if (v > bestV) { bestV = v; best = o; }
  }
  return best;
}

/** 굴리기 전에 증축할 역(없으면 null). 남겨 둘 돈을 지키며 값진 역부터 */
export function chooseInvest(m) {
  const p = current(m), ai = persona(p);
  const can = investable(m, p).filter((n) => p.money - upgradeFor(m, n, p) >= ai.reserve + 150 - 150 * ai.build);
  if (!can.length) return null;
  return can.sort((a, b) => stationPrice(b) - stationPrice(a) || m.levels[a] - m.levels[b])[0];
}

/**
 * 굴리기 전에 스킬을 쓸까: 쓰면 { target }(역을 고르지 않는 스킬은 target null), 아니면 null.
 * 노선 투자보다 먼저 묻는다(벼락치기는 투자를 한 단계 더 올려 준다).
 */
export function wantsSkill(m) {
  const p = current(m);
  if (skillBlocked(m, p)) return null;
  const id = heroById(p.hero).active.id, ai = persona(p);
  const rivals = alive(m).filter((q) => q !== p);
  const best = (list, score) => {
    let target = null, value = -Infinity;
    for (const n of list) { const v = score(n); if (v > value) { value = v; target = n; } }
    return { target, value };
  };
  const ts = skillTargets(m, p);
  const pick = (score, min) => { const b = best(ts, score); return b.value >= min ? { target: b.target } : null; };
  switch (id) {
    case 'direct': return pick((n) => pathValue(m, p, [n], m.rng), 180);
    // 상대가 가까이 있는 비싼 내 역
    case 'gate': return pick((n) => rivals.reduce((s, q) => s + (dist(q.node, n) <= 8 ? tollFor(m, n, q) : 0), 0), 40);
    case 'gather': return pick((n) => rivals.reduce((s, q) => s + Math.min(q.money, tollFor(m, n, q)), 0), 120);
    case 'hype': return pick((n) => baseToll(m.owned, m.levels, n), 30);
    case 'buyout': {
      const b = best(ts.filter((n) => p.money - buyoutFor(m, n) >= ai.reserve * 0.5), (n) => baseToll(m.owned, m.levels, n) + monoGain(m, p, n) * 0.5 + stationPrice(n) * 0.3);
      return b.target ? { target: b.target } : null;
    }
    case 'cram': return cramTargets(m, p).length >= 2 || m.clock > m.end - 4 * 90 ? { target: null } : null;
    case 'combo': return { target: null };
    case 'transfuse': return rivals.some((q) => assets(m, q) > assets(m, p)) || p.money < 200 ? { target: null } : null;
    default: return null;
  }
}
