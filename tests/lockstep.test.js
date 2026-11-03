import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatch, current } from '../src/core/match.js';
import { createRng } from '../src/core/rng.js';
import { aiSteps, applyAct, actOk, fastForward, sig, isBot, AUTO_LIMIT } from '../src/core/lockstep.js';
import { choosePath, chooseDie, decideOffer, wantsSkill, chooseInvest, chooseOption } from '../src/core/ai.js';

const HEROES = ['driver', 'staff', 'worker', 'student'];
const OWNERS = { p0: 'uidA', p1: 'uidB' };
const fresh = (board) => createMatch({ seed: 4242, heroes: HEROES, humans: 2, region: board });

/**
 * 사람 자리도 AI 판단으로 두되, 그 판단을 행동으로 적어 가며 한 판을 끝까지.
 * meta(m, k) 가 행동을 돌려주면(k = 지금까지 사람 행동 수) 그것을 대신 넣는다 — 시간 초과 · 나가기 흉내
 */
function playRecording(board, meta = () => null) {
  const m = fresh(board);
  const acts = [];
  // 사람의 판단은 판의 난수를 건드리지 않는다(화면에서 고르는 것처럼) — AI 판단 함수를 빌려 쓰는 동안만 다른 난수로
  const side = createRng(99);
  const think = (f) => { const real = m.rng; m.rng = side; try { return f(); } finally { m.rng = real; } };
  const put = (a, v, by = OWNERS[current(m).id]) => {
    const act = { n: acts.length, by, seat: current(m).id, a, v, h: sig(m) };
    assert.ok(actOk(m, act, OWNERS), `${a} 받을 수 있어야`);
    acts.push(act);
    assert.ok(applyAct(m, act));
  };
  for (let guard = 0; m.phase !== 'over' && guard < 20000; guard++) {
    if (isBot(current(m))) { for (const _ of aiSteps(m)); continue; }
    const extra = meta(m, acts.length);
    if (extra) { put(extra.a, null, extra.by); continue; }
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

/** 행동을 클라우드로 오간 것처럼(JSON) 다른 기기의 새 판에 넣어 본다 */
function replay(board, acts) {
  const other = fresh(board);
  const used = fastForward(other, JSON.parse(JSON.stringify(acts)), OWNERS);
  return { other, used };
}

for (const board of ['loop', null]) {
  test(`온라인: 같은 시드 + 같은 사람 행동이면 다른 기기에서도 같은 판 (${board || '노선도'})`, () => {
    const { m, acts } = playRecording(board);
    assert.equal(m.phase, 'over');
    assert.ok(acts.length > 10);
    const { other, used } = replay(board, acts);
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
  const other = fresh('loop');
  fastForward(other, acts.slice(0, half), OWNERS);
  assert.equal(sig(other), acts[half].h);
});

test('온라인: 남의 자리 · 맞지 않는 단계 · 방 밖 사람의 행동은 받지 않는다', () => {
  const m = fresh('loop');
  const seat = current(m).id;
  assert.equal(actOk(m, { a: 'roll', seat, by: 'someone' }, OWNERS), false);
  assert.equal(actOk(m, { a: 'pick', seat, by: OWNERS[seat], v: 0 }, OWNERS), false);
  assert.equal(actOk(m, { a: 'roll', seat: 'p1', by: 'uidB' }, OWNERS), seat === 'p1');
  assert.equal(actOk(m, { a: 'hack', seat, by: OWNERS[seat] }, OWNERS), false);
  // 대신 두기는 방 사람 누구나 — 방 밖 사람은 안 된다
  const other = Object.values(OWNERS).find((u) => u !== OWNERS[seat]);
  assert.equal(actOk(m, { a: 'auto', seat, by: other }, OWNERS), true);
  assert.equal(actOk(m, { a: 'bot', seat, by: 'stranger' }, OWNERS), false);
});

test('온라인 시간 초과(auto): 그 단계는 AI 가 두고, 모든 기기에서 같은 판 · 이어서 AUTO_LIMIT 번이면 끝까지 AI', () => {
  // p1 은 처음 몇 단계를 늘 시간 초과 — 심판(p0)이 대신 두기를 올린다
  const { m, acts } = playRecording('loop', (mm) => (current(mm).id === 'p1' && !mm.players[1].bot ? { a: 'auto', by: 'uidA' } : null));
  assert.equal(m.players[1].bot, true);
  assert.equal(acts.filter((a) => a.a === 'auto').length, AUTO_LIMIT);
  assert.equal(m.phase, 'over');
  const { other } = replay('loop', acts);
  assert.equal(sig(other), sig(m));
  assert.equal(other.players[1].bot, true);
});

test('온라인 시간 초과 뒤 직접 두면 횟수가 처음부터 — 한 번씩 넘겨도 AI 로 넘어가지 않는다', () => {
  let flip = false;
  const { m, acts } = playRecording('loop', (mm) => {
    if (current(mm).id !== 'p1' || mm.phase !== 'roll') return null;
    flip = !flip;
    return flip ? { a: 'auto', by: 'uidB' } : null;
  });
  assert.ok(acts.filter((a) => a.a === 'auto').length > AUTO_LIMIT);
  assert.equal(!!m.players[1].bot, false);
  assert.equal(sig(replay('loop', acts).other), sig(m));
});

test('온라인 나가기(bot): 그 자리는 바로 AI 가 이어받아 끝까지 · 다른 기기도 같은 판', () => {
  let left = false;
  const { m, acts } = playRecording('loop', (mm, k) => {
    if (left || k < 6 || current(mm).id !== 'p0') return null;
    left = true;
    return { a: 'bot', by: 'uidB' };
  });
  assert.ok(left);
  assert.equal(m.players[0].bot, true);
  // 나간 뒤 그 자리 이름으로 온 행동은 받지 않는다
  assert.equal(acts.some((a, i) => a.seat === 'p0' && i > acts.findIndex((x) => x.a === 'bot')), false);
  const { other } = replay('loop', acts);
  assert.equal(sig(other), sig(m));
  assert.equal(other.winner, m.winner);
});
