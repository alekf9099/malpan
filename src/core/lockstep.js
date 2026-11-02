// 온라인 대결의 바탕 — 같은 시드로 만든 판에 같은 '사람 행동'을 같은 순서로 넣으면 어느 기기에서나 같은 판이 된다.
// 그래서 주고받는 것은 사람의 행동(굴리기 · 주사위 고르기 · 길 · 고르기 · 거래 · 투자 · 스킬)뿐이다.
// 주사위 눈 · 찬스 카드 · AI 의 판단은 판의 난수(m.rng)로 정해져 기기마다 똑같이 계산된다 — AI 차례는 각 기기가 스스로 돌린다.
//
//   행동 하나: { n(순번), by(쓴 사람 uid), seat(차례인 자리 'p1'…), a(종류), v(값), h(쓰기 직전 판 서명) }

import { roll, pickDie, move, choose, decide, invest, useSkill, current } from './match.js';
import { choosePath, chooseDie, decideOffer, wantsSkill, chooseInvest, chooseOption } from './ai.js';

/** 행동 종류 → 판에 넣는 함수(이벤트 목록을 돌려준다) */
export const ACTS = {
  roll: (m) => roll(m),
  pick: (m, v) => pickDie(m, v),
  move: (m, v) => move(m, v),
  choose: (m, v) => choose(m, v),
  decide: (m, v) => decide(m, v),
  invest: (m, v) => invest(m, v),
  skill: (m, v) => useSkill(m, v)
};
/** 그 행동을 지금 넣을 수 있는 단계 */
const PHASE = { roll: 'roll', pick: 'pick', move: 'move', choose: 'choose', decide: 'decide', invest: 'roll', skill: 'roll' };

/** 판 서명: 차례 · 단계 · 사람마다 돈과 자리. 행동을 쓴 기기와 받은 기기의 판이 같은지 확인한다 */
export function sig(m) {
  const s = `${m.round}|${m.turn}|${m.phase}|${m.players.map((p) => `${p.money}@${p.node}`).join(',')}`;
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** 이 행동을 지금 받아도 되나: 차례인 자리 · 그 자리 주인 · 맞는 단계 */
export function actOk(m, a, ownerOf) {
  const p = current(m);
  return !!ACTS[a.a] && a.seat === p.id && ownerOf(p.id) === a.by && m.phase === PHASE[a.a];
}

/** 행동 하나를 판에 넣는다 → 이벤트 목록(엔진이 거절하면 null) */
export function applyAct(m, a) {
  try { return ACTS[a.a](m, a.v ?? undefined) || []; } catch { return null; }
}

/**
 * AI 한 차례(화면의 AI 차례와 같은 순서). 단계마다 { events } 또는 { pause(밀리초) } 를 내놓는다.
 * 판단은 단계를 꺼낼 때 하므로, 화면이 연출을 기다렸다 꺼내도 순서는 그대로다.
 */
export function* aiSteps(m) {
  const p = current(m);
  yield { events: [{ type: 'turnStart', player: p.id }] };
  const sk = wantsSkill(m);
  if (sk) yield { events: useSkill(m, sk.target) };
  for (let n = chooseInvest(m); n; n = chooseInvest(m)) yield { events: invest(m, n) };
  if (m.phase === 'roll' && current(m) === p) yield { events: roll(m) };
  if (m.phase === 'pick') yield { events: pickDie(m, chooseDie(m)) };
  if (m.phase === 'move') yield { events: move(m, choosePath(m)) };
  if (m.phase === 'choose') { yield { pause: 300 }; yield { events: choose(m, chooseOption(m)) }; }
  if (m.phase === 'decide') { yield { pause: 250 }; yield { events: decide(m, decideOffer(m)) }; }
}

/**
 * 처음부터 빨리 돌리기(연출 없이): AI 자리는 스스로, 사람 자리는 acts 를 차례로 넣는다.
 * 사람 차례인데 행동이 다 떨어지면 멈춘다 → 쓴 행동 수(받지 않은 행동도 센다)
 */
export function fastForward(m, acts, { isBot, ownerOf }) {
  let i = 0;
  for (let guard = 0; m.phase !== 'over' && guard < 100000; guard++) {
    if (isBot(current(m))) { for (const _ of aiSteps(m)); continue; }
    if (i >= acts.length) break;
    const a = acts[i++];
    if (actOk(m, a, ownerOf)) applyAct(m, a);
  }
  return i;
}
