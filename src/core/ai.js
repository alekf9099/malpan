// AI 상대. 캐릭터마다 성격이 다르다(heroes.js 의 ai):
//   reserve 남겨 둘 돈(적을수록 과감) · hub 환승역 선호 · chain 이어 사기 선호 · build 증축 선호
// 길 고르기: 목적지 보너스 · 살 만한 빈 역 · 남의 역 통행료(무섭다) · 인파·찬스 · 신호 장애를 따져 가장 좋은 길

import { dist, isTransfer } from './boards/seoul.js';
import { links, stationPrice } from './estate.js';
import { current, legalPaths, tollFor, priceFor, isChance, incidentAt, stationsOf, skillBlocked, passFares, investable, upgradeFor, GOAL_BONUS } from './match.js';
import { heroById } from './heroes.js';

const persona = (p) => heroById(p.hero).ai;

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
  } else if (!owner && !isChance(end)) {
    const price = priceFor(m, end);
    if (p.money - price >= ai.reserve) {
      v += 40 + stationPrice(end) * 0.25;
      if (isTransfer(end)) v += 60 * ai.hub;
      const next = { ...m.owned, [end]: p.id };
      v += ((links(next, p.id).at[end]?.len || 1) - 1) * 70 * ai.chain;
    }
  } else if (owner === p.id) v += 30 + 50 * ai.build;
  if (isChance(end)) v += 25;
  const inc = incidentAt(m, end);
  if (inc?.kind === 'crowd') v += 90;
  if (inc?.kind === 'busk') v += 50;
  if (inc?.kind === 'delay') v -= 10;
  return v;
}

/** 갈 길 하나 고르기 */
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
  if (o.kind === 'buy') {
    let reserve = ai.reserve;
    if (isTransfer(o.node)) reserve -= 120 * ai.hub;
    const next = { ...m.owned, [o.node]: p.id };
    if ((links(next, p.id).at[o.node]?.len || 1) > 1) reserve -= 150 * ai.chain;
    return left >= Math.max(0, reserve);
  }
  if (o.kind === 'upgrade') return left >= ai.reserve + 120 - 200 * ai.build;
  return left >= ai.reserve + 250 - 100 * ai.chain; // 인수는 비싸다
}

/** 굴리기 전에 증축할 역(없으면 null). 남겨 둘 돈을 지키며 값진 역부터 */
export function chooseInvest(m) {
  const p = current(m), ai = persona(p);
  const can = investable(m, p).filter((n) => p.money - upgradeFor(m, n, p) >= ai.reserve + 150 - 150 * ai.build);
  if (!can.length) return null;
  return can.sort((a, b) => stationPrice(b) - stationPrice(a) || m.levels[a] - m.levels[b])[0];
}

/** 굴리기 전에 스킬을 쓸까 */
export function wantsSkill(m) {
  const p = current(m);
  if (skillBlocked(m, p)) return false;
  const id = heroById(p.hero).active.id;
  if (id === 'dash') return dist(p.node, p.goal) <= 9;
  if (id === 'again') return p.money >= 500 && m.clock > m.end - 6 * 60;
  if (id === 'call') return stationsOf(m, p).length >= 3;
  if (id === 'shield') {
    const rivals = Object.entries(m.owned).filter(([n, o]) => o !== p.id && dist(p.node, n) <= 7).length;
    return rivals >= 4;
  }
  return false;
}
