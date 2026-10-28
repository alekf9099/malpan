import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createMatch, roll, pickDie, move, decide, choose, useSkill, skillBlocked, invest, investable, current, assets, tollFor, passFares, legalPaths, validPath,
  nextStations, CHANCE_STATIONS, START_MONEY, CLOCK, PASS_RATE, HOT_GOAL_DIST, MIN_GOAL_DIST, areaOf, dieOptions, HOT_WIN, warpOptions, takeoverFor
} from '../src/core/match.js';
import { matchPoints } from '../src/core/ranking.js';
import { stationPrice, upgradeCost, takeoverPrice, links, chainOf, baseToll, MAX_LEVEL, isHot, HOT_LIST } from '../src/core/estate.js';
import { STATION_LINES, ALL_STATIONS, ADJ, dist } from '../src/core/boards/seoul.js';
import { choosePath, chooseDie, decideOffer, wantsSkill, chooseInvest, chooseOption } from '../src/core/ai.js';

const rngAlways = (v) => ({ next: () => v, shuffle: (a) => a });
const game = (n = 2, extra = {}) => createMatch({ seed: 7, heroes: ['driver', 'staff', 'worker', 'student'].slice(0, n), humans: 1, region: 'all', ...extra });
/** p 를 from 역에 세우고 steps 만큼 굴린 것처럼 */
function at(m, node, prev, steps = 1) {
  const p = current(m);
  p.node = node; p.prev = prev;
  m.pending = { roll: { value: steps }, steps };
  m.phase = 'move';
  return p;
}

test('새 판: 모두 1200점, 서로 다른 출발역, 저마다 멀리 떨어진 목적지', () => {
  const m = game(4);
  assert.equal(new Set(m.players.map((p) => p.node)).size, 4);
  for (const p of m.players) { assert.equal(p.money, START_MONEY); assert.ok(dist(p.node, p.goal) >= (isHot(p.goal) ? HOT_GOAL_DIST : MIN_GOAL_DIST)); }
  assert.equal(m.clock, CLOCK.start);
  for (const n of CHANCE_STATIONS) { assert.ok(ALL_STATIONS.includes(n), n); assert.equal(STATION_LINES[n].length, 1, n); }
});

test('빈 역에 서면 살 수 있고, 내 역에 다시 서면 증축', () => {
  const m = game();
  const p = at(m, '서울역', '시청', 1);
  move(m, ['숙대입구']);
  assert.equal(m.phase, 'decide');
  assert.equal(m.offer.kind, 'buy');
  decide(m, true);
  assert.equal(m.owned['숙대입구'], p.id);
  assert.equal(p.money, START_MONEY - stationPrice('숙대입구'));
  m.turn = 0;
  at(m, '서울역', '시청', 1);
  move(m, ['숙대입구']);
  assert.equal(m.offer.kind, 'upgrade');
  decide(m, true);
  assert.equal(m.levels['숙대입구'], 2);
});

test('남의 역에 서면 통행료 — 연결 배수·단계 배수, 돈이 모자라면 역을 팔고 그래도 모자라면 파산', () => {
  const m = game();
  const [me, rival] = m.players;
  m.owned['숙대입구'] = rival.id; m.levels['숙대입구'] = 1;
  const one = tollFor(m, '숙대입구', me);
  m.owned['삼각지'] = rival.id; m.levels['삼각지'] = 1;
  assert.equal(chainOf(m.owned, '숙대입구'), 2);
  assert.ok(tollFor(m, '숙대입구', me) >= one * 2 - 1);
  m.levels['숙대입구'] = 3;
  assert.ok(baseToll(m.owned, m.levels, '숙대입구') > baseToll(m.owned, { ...m.levels, 숙대입구: 1 }, '숙대입구') * 6);
  // 파산
  me.money = 5;
  at(m, '서울역', '시청', 1);
  const ev = move(m, ['숙대입구']);
  assert.ok(ev.some((e) => e.type === 'pay'));
  assert.ok(ev.some((e) => e.type === 'bankrupt'));
  assert.ok(me.out);
  assert.equal(m.phase, 'over');
  assert.equal(m.ranking[0].id, rival.id);
});

test('지나가기만 해도 남의 역마다 통과 요금(통행료의 20%)', () => {
  const m = game();
  const [me, rival] = m.players;
  m.owned['숙대입구'] = rival.id; m.levels['숙대입구'] = 1;
  at(m, '서울역', '시청', 2);
  const fares = passFares(m, me, ['숙대입구', '삼각지']);
  assert.equal(fares.get(rival.id).amount, Math.round(tollFor(m, '숙대입구', me) * PASS_RATE));
  const before = rival.money;
  move(m, ['숙대입구', '삼각지']);
  assert.ok(rival.money > before);
});

test('남의 역은 통행료를 낸 뒤 1.5배 값에 인수할 수 있다 — 랜드마크는 못 한다', () => {
  const m = game();
  const [me, rival] = m.players;
  m.owned['숙대입구'] = rival.id; m.levels['숙대입구'] = 1;
  me.money = 5000;
  at(m, '서울역', '시청', 1);
  move(m, ['숙대입구']);
  assert.equal(m.offer.kind, 'takeover');
  assert.equal(m.offer.price, takeoverPrice('숙대입구', 1));
  decide(m, true);
  assert.equal(m.owned['숙대입구'], me.id);
  const m2 = game();
  m2.owned['숙대입구'] = m2.players[1].id; m2.levels['숙대입구'] = MAX_LEVEL;
  m2.players[0].money = 99999;
  at(m2, '서울역', '시청', 1);
  move(m2, ['숙대입구']);
  assert.notEqual(m2.offer?.kind, 'takeover');
});

test('목적지를 지나가거나 서면 보너스와 새 목적지', () => {
  const m = game();
  const p = current(m);
  p.goal = '숙대입구';
  at(m, '서울역', '시청', 2);
  const before = p.money;
  const ev = move(m, ['숙대입구', '삼각지']);
  const g = ev.find((e) => e.type === 'goal');
  assert.ok(g && p.money >= before + g.bonus - 1);
  assert.notEqual(p.goal, '숙대입구');
});

test('노선 투자: 이어진 내 역은 굴리기 전에 어디서든 증축할 수 있다', () => {
  const m = game();
  const p = current(m);
  m.owned['숙대입구'] = p.id; m.levels['숙대입구'] = 1;
  assert.deepEqual(investable(m), []);
  m.owned['삼각지'] = p.id; m.levels['삼각지'] = 1;
  assert.ok(investable(m).includes('숙대입구'));
  invest(m, '숙대입구');
  assert.equal(m.levels['숙대입구'], 2);
  assert.equal(p.money, START_MONEY - Math.round(upgradeCost('숙대입구') * 1));
});

test('길 검사: 되돌아가기·건너뛰기·불난 역은 안 된다', () => {
  const m = game();
  at(m, '서울역', '시청', 2);
  assert.ok(validPath(m, ['숙대입구', '삼각지']));
  assert.ok(!validPath(m, ['시청', '종각']));
  assert.ok(!validPath(m, ['삼각지', '노량진']));
  m.incidents = [{ node: '숙대입구', kind: 'fire', until: 9999 }];
  assert.ok(!validPath(m, ['숙대입구', '삼각지']));
  assert.ok(legalPaths(m).every((x) => !x.includes('숙대입구')));
});

test('스킬은 한 판에 두 번, 굴리기 전에', () => {
  const m = game();
  const p = current(m);
  useSkill(m); assert.equal(p.dash, 3);
  useSkill(m); assert.equal(p.dash, 6);
  assert.match(skillBlocked(m), /사용 완료/);
});

test('한 바퀴마다 시계가 45분 흐르고, 막차가 되면 자산 순위로 끝난다', () => {
  const m = game(3);
  for (let g = 0; g < 4000 && m.phase !== 'over'; g++) {
    if (m.phase === 'roll') { for (let n = chooseInvest(m); n; n = chooseInvest(m)) invest(m, n); if (wantsSkill(m)) useSkill(m); roll(m); }
    else if (m.phase === 'pick') pickDie(m, chooseDie(m));
    else if (m.phase === 'move') move(m, choosePath(m));
    else if (m.phase === 'choose') choose(m, chooseOption(m));
    else decide(m, decideOffer(m));
  }
  assert.equal(m.phase, 'over');
  assert.equal(m.ranking.length, 3);
  for (let i = m.reason === 'monopoly' ? 2 : 1; i < m.ranking.length; i++) if (!m.ranking[i].out && !m.ranking[i - 1].out) assert.ok(m.ranking[i - 1].assets >= m.ranking[i].assets);
});

test('AI 만으로 200판: 늘 끝나고, 돈이 음수가 되지 않는다', () => {
  for (let s = 1; s <= 200; s++) {
    const m = createMatch({ seed: s, heroes: ['driver', 'staff', 'worker', 'student'].slice(0, 2 + (s % 3)), humans: 0 });
    let g = 0;
    while (m.phase !== 'over' && g++ < 6000) {
      if (m.phase === 'roll') { for (let n = chooseInvest(m); n; n = chooseInvest(m)) invest(m, n); if (wantsSkill(m)) useSkill(m); roll(m); }
      else if (m.phase === 'pick') pickDie(m, chooseDie(m));
    else if (m.phase === 'move') move(m, choosePath(m));
      else if (m.phase === 'choose') choose(m, chooseOption(m));
      else decide(m, decideOffer(m));
      for (const p of m.players) assert.ok(p.money >= 0, `seed ${s}`);
    }
    assert.equal(m.phase, 'over', `seed ${s}`);
    assert.ok(m.ranking[0].assets >= 0);
  }
});

test('명소역: 값 1.5배, 강남 통행료 2배, 잠실은 증축 한 번에 랜드마크', () => {
  assert.equal(HOT_LIST.length, 11);
  for (const n of HOT_LIST) { assert.ok(ALL_STATIONS.includes(n), n); assert.ok(!CHANCE_STATIONS.includes(n), n); }
  assert.equal(stationPrice('강남'), 150);
  assert.equal(baseToll({ '강남': 'p0' }, { '강남': 1 }, '강남'), Math.round(150 * 0.3 * 2));
  const m = game();
  const p = current(m);
  m.owned['잠실'] = p.id; m.levels['잠실'] = 1;
  at(m, '잠실새내', null, 1);
  move(m, ['잠실']);
  assert.equal(m.offer.kind, 'upgrade');
  assert.equal(m.offer.level, MAX_LEVEL);
});

test('서울역 KTX: 명소역·목적지 중 골라 바로 날아가고, 그 역에서 살 수 있다', () => {
  const m = game();
  const p = at(m, '시청', '종각', 1);
  move(m, ['서울역']);
  assert.equal(m.phase, 'choose');
  assert.deepEqual(m.choice.options, warpOptions(m, p));
  assert.ok(m.choice.options.includes(p.goal));
  const ev = choose(m, '여의도');
  assert.ok(ev.some((e) => e.type === 'warp' && e.to === '여의도'));
  assert.equal(p.node, '여의도');
  assert.equal(m.phase, 'decide');
  assert.equal(m.offer.kind, 'buy');
});

test('독점: 명소역 하나 앞이면 경고, 다 가지면 그 자리에서 이긴다', () => {
  const m = game(3);
  const p = current(m);
  const mine = HOT_LIST.filter((n) => n !== '잠실' && n !== '홍대입구').slice(0, HOT_WIN - 2);
  for (const n of mine) { m.owned[n] = p.id; m.levels[n] = 1; }
  at(m, '잠실새내', null, 1);
  move(m, ['잠실']);
  const warn = decide(m, true);
  assert.ok(warn.some((e) => e.type === 'monoWarn' && e.kind === 'hot'));
  m.turn = 0; m.phase = 'roll';
  at(m, '합정', '당산', 1);
  p.money = 2000;
  move(m, ['홍대입구']);
  if (m.phase === 'choose') choose(m, m.choice.options[0]);
  const ev = decide(m, true);
  assert.ok(ev.some((e) => e.type === 'monopoly'));
  assert.equal(m.phase, 'over');
  assert.equal(m.reason, 'monopoly');
  assert.equal(m.ranking[0].id, p.id);
});

test('새 캐릭터: 라이더 통과 요금 반값, 간호사 한 번 구제, 중개인 수수료·급매 협상', () => {
  // 라이더: 같은 길에서 통과 요금이 반
  const a = createMatch({ seed: 7, heroes: ['rider', 'driver'], humans: 1 , region: 'all' });
  const b = createMatch({ seed: 7, heroes: ['driver', 'worker'], humans: 1 , region: 'all' });
  for (const m of [a, b]) { m.owned['숙대입구'] = 'p1'; m.levels['숙대입구'] = 2; }
  const fa = [...passFares(a, a.players[0], ['숙대입구', '삼각지']).values()][0].amount;
  const fb = [...passFares(b, b.players[0], ['숙대입구', '삼각지']).values()][0].amount;
  assert.ok(fb > 0 && Math.abs(fa - fb / 2) <= 1, `${fa} vs ${fb}`);

  // 간호사: 통행료를 못 내면 한 번은 300으로 버틴다
  const n = createMatch({ seed: 7, heroes: ['nurse', 'driver'], humans: 1 , region: 'all' });
  const nu = n.players[0];
  n.owned['숙대입구'] = 'p1'; n.levels['숙대입구'] = 3;
  nu.money = 5;
  at(n, '서울역', '시청', 1);
  const ev = move(n, ['숙대입구']);
  assert.ok(ev.some((e) => e.type === 'rescue'));
  assert.equal(nu.out, false);
  assert.equal(nu.money, 300);

  // 중개인: 남이 역을 사면 +6, 급매 협상이면 들인 값 그대로(× 0.7) 인수
  const k = createMatch({ seed: 7, heroes: ['driver', 'broker'], humans: 1 , region: 'all' });
  const before = k.players[1].money;
  at(k, '서울역', '시청', 1);
  move(k, ['숙대입구']);
  decide(k, true);
  assert.equal(k.players[1].money, before + 6);
  k.turn = 1; k.phase = 'roll';
  const br = current(k);
  br.deal = true;
  assert.equal(takeoverFor(k, '숙대입구', br), Math.round(stationPrice('숙대입구') * 0.7));
});

test('승점: 판마다 기본 +10, 가진 역 +1(15까지), 1등 보너스', () => {
  assert.equal(matchPoints({ place: 4, rivals: 3, knockout: false, stations: 0 }), 10);
  assert.equal(matchPoints({ place: 3, rivals: 3, knockout: false, stations: 40 }), 10 + 15 + 5);
  assert.equal(matchPoints({ place: 1, rivals: 3, knockout: true, stations: 8 }), 10 + 8 + 30 + 15 + 10);
});

test('지역 맵: 72역 안에서만 출발·목적지·길, 지역 끝에서는 되돌아 나온다', () => {
  for (const id of ['center', 'gangnam', 'west', 'east']) {
    const m = createMatch({ seed: 3, heroes: ['driver', 'staff', 'worker', 'student'], humans: 0, region: id });
    const R = areaOf(m);
    assert.equal(R.stations.length, 72, id);
    for (const p of m.players) { assert.ok(R.set.has(p.node), id); assert.ok(R.set.has(p.goal), id); }
    assert.ok(m.hotWin >= 3 && m.hotWin <= 5, id);
    for (let g = 0; g < 300 && m.phase !== 'over'; g++) {
      if (m.phase === 'roll') roll(m);
      else if (m.phase === 'pick') pickDie(m, chooseDie(m));
      else if (m.phase === 'move') { const path = choosePath(m); for (const n of path) assert.ok(R.set.has(n), `${id} ${n}`); move(m, path); }
      else if (m.phase === 'choose') choose(m, chooseOption(m));
      else decide(m, decideOffer(m));
    }
  }
});

test('주사위 둘: 굴리면 고르기, 고른 눈만큼 간다(같은 눈이면 바로)', () => {
  const m = game();
  let ev;
  for (let s = 0; s < 50; s++) {
    m.phase = 'roll'; m.turn = 0;
    ev = roll(m);
    if (m.phase === 'pick') break;
  }
  assert.equal(m.phase, 'pick');
  assert.equal(ev[0].rolls.length, 2);
  const want = m.pending.rolls[1].value;
  assert.ok(dieOptions(m, 1).every((path) => path.length <= want));
  const e = pickDie(m, 1);
  assert.equal(e[0].type, 'die');
  assert.equal(m.pending.steps, want);
  assert.equal(m.phase, 'move');
});
