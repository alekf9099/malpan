import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, current } from '../src/core/match.js';
import { createRng } from '../src/core/rng.js';
import { aiSteps, applyAct, actOk, fastForward, sig } from '../src/core/lockstep.js';
import { choosePath, chooseDie, decideOffer, wantsSkill, chooseInvest, chooseOption } from '../src/core/ai.js';

const HEROES = ['driver', 'staff', 'worker', 'student'];
const OWNER = { p0: 'uidA', p1: 'uidB', p2: null, p3: null };
const ownerOf = (id) => OWNER[id];
const isBot = (p) => !p.human;

/** 사람 자리도 AI 판단으로 두되, 그 판단을 행동으로 적어 가며 한 판을 끝까지 */
function playRecording(board) {
  const m = createMatch({ seed: 4242, heroes: HEROES, humans: 2, region: board });
  const acts = [];
  // 사람의 판단은 판의 난수를 건드리지 않는다(화면에서 고르는 것처럼) — AI 판단 함수를 빌려 쓰는 동안만 다른 난수로
  const side = createRng(99);
  const think = (f) => { const real = m.rng; m.rng = side; try { return f(); } finally { m.rng = real; } };
  const put = (a, v) => {
    const act = { n: acts.length, by: ownerOf(current(m).id), seat: current(m).id, a, v, h: sig(m) };
    assert.ok(actOk(m, act, ownerOf), `${a} 받을 수 있어야`);
    acts.push(act);
    assert.ok(applyAct(m, act));
  };
  for (let guard = 0; m.phase !== 'over' && guard < 20000; guard++) {
    const p = current(m);
    if (isBot(p)) { for (const _ of aiSteps(m)); continue; }
    const sk = m.phase === 'roll' && think(() => wantsSkill(m));
    if (sk) { put('skill', sk.target); continue; }
    const n = m.phase === 'roll' && think(() => chooseInvest(m));
    if (n) { put('invest', n); continue; }
    if (m.phase === 'roll') put('roll');
    else if (m.phase === 'pick') put('pick', think(() => chooseDie(m, side)));
    else if (m.phase === 'move') put('move', think(() => choosePath(m, side)));
    else if (m.phase === 'choose') put('choose', think(() => chooseOption(m)));
    else if (m.phase === 'decide') put('decide', think(() => decideOffer(m)));
  }
  return { m, acts };
}

for (const board of ['loop', null]) {
  test(`온라인: 같은 시드 + 같은 사람 행동이면 다른 기기에서도 같은 판 (${board || '노선도'})`, () => {
    const { m, acts } = playRecording(board);
    assert.equal(m.phase, 'over');
    assert.ok(acts.length > 10);
    // 행동을 JSON 으로 오간 것처럼(클라우드를 거친 값)
    const wire = JSON.parse(JSON.stringify(acts));
    const other = createMatch({ seed: 4242, heroes: HEROES, humans: 2, region: board });
    const used = fastForward(other, wire, { isBot, ownerOf });
    assert.equal(used, acts.length);
    assert.equal(other.phase, 'over');
    assert.equal(sig(other), sig(m));
    assert.equal(other.winner, m.winner);
    assert.deepEqual(other.owned, m.owned);
  });
}

test('온라인: 반쯤 받은 행동으로 따라잡으면 그 자리의 판 서명이 쓴 쪽과 같다', () => {
  const { acts } = playRecording('loop');
  const half = Math.floor(acts.length / 2);
  const other = createMatch({ seed: 4242, heroes: HEROES, humans: 2, region: 'loop' });
  fastForward(other, acts.slice(0, half), { isBot, ownerOf });
  assert.equal(sig(other), acts[half].h);
});

test('온라인: 남의 자리 · 맞지 않는 단계의 행동은 받지 않는다', () => {
  const m = createMatch({ seed: 4242, heroes: HEROES, humans: 2, region: 'loop' });
  const seat = current(m).id;
  assert.equal(actOk(m, { a: 'roll', seat, by: 'someone' }, ownerOf), false);
  assert.equal(actOk(m, { a: 'pick', seat, by: ownerOf(seat), v: 0 }, ownerOf), false);
  assert.equal(actOk(m, { a: 'roll', seat: 'p1', by: 'uidB' }, ownerOf), seat === 'p1');
  assert.equal(actOk(m, { a: 'hack', seat, by: ownerOf(seat) }, ownerOf), false);
});
