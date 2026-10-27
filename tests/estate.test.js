import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRng } from '../src/core/rng.js';
import { createRound, legalMoves, applyMove, depart, buyStation, tollFor, priceFor, goblinTollFor } from '../src/core/round.js';
import { stationPrice, stationToll, links, chainOf, holdings, PRICE, CHAIN_MAX } from '../src/core/estate.js';

const rngAlways = (v) => ({ next: () => v });
const step = (v) => ({ value: v, face: v, tier: Math.min(4, v), label: v + '역', faces: [v], bonus: false, chips: v * 4, back: false });
const day = (extra = {}) => createRound({ number: 1, target: 1e6, rerolls: 2, myPieces: 4, oppPieces: 0, charms: [], boss: null, route: ['김포공항', '청량리'], mapSeed: 21, ...extra });
const piece = (r, id) => r.pieces.find((p) => p.id === id);
function moveTo(r, from, dest, value, rng = rngAlways(0.99)) {
  piece(r, 'm0').node = from;
  r.pending = { roll: step(value), granted: 0 }; r.phase = 'move';
  const i = legalMoves(r).findIndex((m) => m.from === from && m.preview.dest === dest);
  assert.ok(i >= 0, `${from} → ${dest}`);
  return applyMove(r, i, rng);
}

test('역 값은 지나는 호선 수로: 일반역 50 · 환승역 100 · 세 호선 160, 통행료는 4분의 1', () => {
  assert.equal(stationPrice('명동'), PRICE[1]);
  assert.equal(stationPrice('시청'), PRICE[2]);
  assert.equal(stationPrice('종로3가'), PRICE[3]);
  assert.equal(stationToll('종로3가'), 40);
});

test('연결: 같은 호선에서 이어진 내 역 수가 배수 — 2역 ×2 · 3역 ×3 · 4역 이상 ×4, 2호선은 순환선', () => {
  assert.equal(chainOf({ 명동: true }, '명동'), 1);
  assert.equal(chainOf({ 서울역: true, 용산: true }, '용산'), 2);
  assert.equal(chainOf({ 시청: true, 종각: true, 종로3가: true }, '종각'), 3);
  const five = { 시청: true, 종각: true, 종로3가: true, 동대문: true, 동묘앞: true };
  assert.equal(chainOf(five, '동묘앞'), CHAIN_MAX);
  // 순환선: 충정로 · 시청 · 을지로입구 는 2호선 끝과 처음에 걸쳐 이어진다
  const loop = { 충정로: true, 시청: true, 을지로입구: true };
  assert.equal(links(loop).at['을지로입구'].len, 3);
  assert.equal(chainOf({ 명동: true, 시청: true }, '시청'), 1);
  assert.deepEqual(holdings({ 시청: true, 명동: true }), { count: 2, value: 150, links: 0, best: 1 });
  assert.equal(holdings({ 서울역: true, 용산: true }).links, 1);
});

test('멈춘 역은 출발 전까지 점수로 살 수 있다 — 다시 출발하면 제안은 사라진다', () => {
  const r = day();
  const m = r.boardInst;
  r.score = 500;
  moveTo(r, m.main[1], m.main[2], 1);
  assert.equal(r.offer.node, m.main[2]);
  const price = priceFor(r, m.main[2]);
  const before = r.score;
  const ev = buyStation(r, m.main[2]);
  assert.equal(ev[0].type, 'buy');
  assert.ok(r.owned[m.main[2]]);
  assert.equal(r.score, before - price);
  moveTo(r, m.main[3], m.main[4], 1);
  depart(r, createRng(3));
  assert.equal(r.offer, null);
});

test('점수가 모자라면 살 수 없고, 출발역·종착역·이미 산 역은 제안이 없다', () => {
  const r = day();
  const m = r.boardInst;
  moveTo(r, m.main[1], m.main[2], 1);
  r.score = 1;
  assert.throws(() => buyStation(r, m.main[2]), /모자란다/);
  r.owned[m.main[4]] = true;
  moveTo(r, m.main[3], m.main[4], 1);
  assert.equal(r.offer, null);
});

test('도깨비 열차가 내 역에 서면 통행료 — 연결 배수, 인파 2배, 불난 역은 0', () => {
  const r = day({ oppPieces: 1 });
  const m = r.boardInst;
  const n = m.main[5];
  r.owned[n] = true;
  assert.equal(tollFor(r, n).amount, stationToll(n));
  r.incidents = [{ node: n, kind: 'crowd', until: 9999 }];
  assert.equal(tollFor(r, n).amount, stationToll(n) * 2);
  r.incidents = [{ node: n, kind: 'fire', until: 9999 }];
  assert.equal(tollFor(r, n).amount, 0);
  r.incidents = [];
  r.tollRate = 1.5;
  assert.equal(tollFor(r, n).amount, Math.round(stationToll(n) * 1.5));
  // 실제로 도깨비가 내 역에 서면 점수가 오른다
  r.tollRate = 1;
  r.owned[m.main[4]] = true;
  assert.equal(tollFor(r, n).amount, stationToll(n) * chainOf(r.owned, n));
  const q = day({ oppPieces: 1 });
  const b = q.boardInst;
  for (const s of b.nodes) if (s !== b.S && s !== b.G) q.owned[s] = true;
  piece(q, 'd0').node = b.main[8];
  let tolls = 0;
  for (let k = 0; k < 6; k++) {
    for (const e of moveTo(q, b.main[1], b.main[2], 1, rngAlways(0.2))) if (e.type === 'toll') { tolls++; assert.ok(e.amount > 0); }
    if (q.phase === 'over') break;
  }
  assert.ok(tolls > 0);
});

test('내 말이 도깨비 역에 서면 통행료를 낸다(점수가 0 아래로는 안 내려간다)', () => {
  const r = day({ goblinStations: [] });
  const m = r.boardInst;
  r.goblinStations = [m.main[3]];
  assert.equal(goblinTollFor(r, m.main[3]), stationToll(m.main[3]));
  r.score = 10;
  const ev = moveTo(r, m.main[2], m.main[3], 1);
  const paid = ev.find((e) => e.type === 'tollPaid');
  assert.ok(paid && paid.amount <= 10 + 200);
  assert.ok(r.score >= 0);
  assert.equal(r.offer, null);
});

test('내 역에 내 말이 서면 칩 +10, 이어진 내 역이면 배수도 오른다', () => {
  const r = day();
  const m = r.boardInst;
  r.owned[m.main[3]] = true;
  piece(r, 'm0').node = m.main[2];
  r.pending = { roll: step(1), granted: 0 }; r.phase = 'move';
  const opt = legalMoves(r).find((x) => x.preview.dest === m.main[3]);
  assert.ok(opt.preview.boardTile.name.includes('내 역'));
  r.owned[m.main[4]] = true;
  const k = chainOf(r.owned, m.main[3]);
  const linked = legalMoves(r).find((x) => x.preview.dest === m.main[3]);
  if (k > 1) assert.equal(linked.preview.boardTile.mult, k - 1);
});

test('이어서 사면 buy 이벤트에 연결 길이와 호선이 실린다', () => {
  const r = day();
  const m = r.boardInst;
  r.score = 5000;
  moveTo(r, m.main[1], m.main[2], 1);
  buyStation(r, m.main[2]);
  moveTo(r, m.main[2], m.main[3], 1);
  const ev = buyStation(r, m.main[3])[0];
  assert.ok(ev.chain >= 2 && ev.line != null, '구간의 이웃한 두 역은 같은 호선으로 이어져 있다');
});
