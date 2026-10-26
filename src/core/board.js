// 전통 윷판 29칸.
//
//  o10 o9  o8  o7  o6  o5        o0 = 참먹이(출발·골인), 시계 반대 방향으로 돈다.
//  o11 b1              a1 o4     모서리 o5 에 멈추면 a 대각선, o10 에 멈추면 b 대각선(골인 지름길).
//  o12     b2      a2     o3     가운데 C(방)에 멈추면 가장 짧은 길(b3 → b4 → 골인).
//  o13         C          o2
//  o14     a3      b3     o1
//  o15 a4              b4 o0
//      o16 o17 o18 o19
//
// 위치 표기: START(아직 안 나감), 노드 id, HOME(골인).

export const START = 'start';
export const HOME = 'home';

const coords = {};
// 바깥 20칸: o0 오른쪽 아래에서 시작해 오른쪽 변을 타고 올라간다.
for (let i = 0; i < 20; i++) {
  const side = Math.floor(i / 5), k = i % 5, t = k / 5;
  if (side === 0) coords['o' + i] = [1, 1 - t];
  else if (side === 1) coords['o' + i] = [1 - t, 0];
  else if (side === 2) coords['o' + i] = [0, t];
  else coords['o' + i] = [t, 1];
}
coords.a1 = [5 / 6, 1 / 6]; coords.a2 = [4 / 6, 2 / 6];
coords.C = [0.5, 0.5];
coords.a3 = [2 / 6, 4 / 6]; coords.a4 = [1 / 6, 5 / 6];
coords.b1 = [1 / 6, 1 / 6]; coords.b2 = [2 / 6, 2 / 6];
coords.b3 = [4 / 6, 4 / 6]; coords.b4 = [5 / 6, 5 / 6];

export const NODES = Object.keys(coords);
export const COORDS = coords;

/** 큰 동그라미(모서리 4개 + 가운데). 판 그림에서 크게 그린다. */
export const BIG_NODES = new Set(['o0', 'o5', 'o10', 'o15', 'C']);

/** 대각선 위의 칸 — "지름길" 계열 부적이 본다. 가운데 포함. */
export const DIAGONAL = new Set(['a1', 'a2', 'C', 'a3', 'a4', 'b1', 'b2', 'b3', 'b4']);

/** 판을 그릴 때 잇는 선. */
export const EDGES = (() => {
  const e = [];
  for (let i = 0; i < 20; i++) e.push(['o' + i, 'o' + ((i + 1) % 20)]);
  e.push(['o5', 'a1'], ['a1', 'a2'], ['a2', 'C'], ['C', 'a3'], ['a3', 'a4'], ['a4', 'o15']);
  e.push(['o10', 'b1'], ['b1', 'b2'], ['b2', 'C'], ['C', 'b3'], ['b3', 'b4'], ['b4', 'o0']);
  return e;
})();

const DIAG_NEXT = { a1: 'a2', a2: 'C', a3: 'a4', a4: 'o15', b1: 'b2', b2: 'C', b3: 'b4', b4: HOME };

/**
 * 한 칸 앞. startedHere 는 "이번 이동을 이 칸에서 시작했는가" — 지름길은 멈춰 섰던 칸에서만 탄다.
 * cameFrom 은 가운데를 지나칠 때 어느 대각선을 이어 갈지 정한다.
 */
function forward(node, startedHere, cameFrom) {
  if (node === START) return 'o1';
  if (node === 'o0') return HOME; // 빽도로 참먹이에 물러난 말은 다음 이동에 바로 골인
  if (startedHere) {
    if (node === 'o5') return 'a1';
    if (node === 'o10') return 'b1';
    if (node === 'C') return 'b3';
  }
  if (node === 'C') return cameFrom === 'a2' ? 'a3' : 'b3';
  if (DIAG_NEXT[node]) return DIAG_NEXT[node];
  const i = Number(node.slice(1));
  return i === 19 ? HOME : 'o' + (i + 1);
}

/** 빽도로 물러날 칸을 모를 때(기록이 없을 때) 쓰는 기본 뒤 칸. */
export function defaultPrev(node) {
  const back = { a1: 'o5', a2: 'a1', C: 'b2', a3: 'C', a4: 'a3', b1: 'o10', b2: 'b1', b3: 'C', b4: 'b3' };
  if (back[node]) return back[node];
  const i = Number(node.slice(1));
  return 'o' + ((i + 19) % 20);
}

/**
 * from 에서 steps 칸 앞으로. prev 는 from 에 오기 직전 칸.
 * 지나간 칸을 순서대로 돌려준다(마지막이 도착 칸, 골인이면 HOME 으로 끝난다).
 */
export function walk(from, steps, prev) {
  const path = [];
  let node = from, came = prev;
  for (let s = 0; s < steps; s++) {
    const next = forward(node, s === 0, came);
    path.push(next);
    if (next === HOME) break;
    came = node;
    node = next;
  }
  return path;
}

/** 지금 칸에 오기 직전 칸을 path 로부터 계산한다. */
export function prevAfterWalk(from, path) {
  if (path.length === 0) return null;
  if (path.length === 1) return from === START ? 'o0' : from;
  return path[path.length - 2];
}

/** 노드가 판 위 어디쯤인지(0~1). 상대 AI 가 "가장 앞선 말"을 고를 때 쓴다. */
export function progress(node) {
  if (node === START) return 0;
  if (node === HOME) return 1;
  // 골인까지 남은 최소 칸 수로 환산
  let n = 0, cur = node, came = null;
  while (cur !== HOME && n < 30) {
    const nx = forward(cur, n === 0, came);
    came = cur; cur = nx; n++;
  }
  return 1 - n / 21;
}
