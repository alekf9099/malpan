// 주사위판 — 모두의 마블처럼 네모난 길 40칸을 주사위 2개로 돈다. 한 바퀴 돌아 출발점을 지나면 골인.
// 같은 눈(더블)이면 한 번 더. 모서리와 몇몇 칸에 이벤트가 있다.

import { START, HOME } from '../board.js';

const N = 40;      // 한 변 10칸
const SIDE = 10;
export const MARBLE_NODES = Array.from({ length: N }, (_, i) => 'm' + i);
const idx = (node) => Number(node.slice(1));

const coords = {};
for (let i = 0; i < N; i++) {
  const side = Math.floor(i / SIDE), t = (i % SIDE) / SIDE;
  if (side === 0) coords['m' + i] = [1, 1 - t];
  else if (side === 1) coords['m' + i] = [1 - t, 0];
  else if (side === 2) coords['m' + i] = [0, t];
  else coords['m' + i] = [t, 1];
}

/**
 * 칸 이벤트. 점수 미리보기에 바로 반영되는 것(chips·mult·coins)과
 * 밟아야 정해지는 것(key: 황금열쇠 카드)을 나눈다.
 */
const TILES = {
  m10: { kind: 'festival', name: '축제', mult: 3, desc: '배수 +3' },
  m20: { kind: 'plane', name: '비행기', warp: 'm30', desc: '보물섬으로 날아간다' },
  m30: { kind: 'island', name: '보물섬', chips: 30, coins: 2, desc: '칩 +30 · 엽전 +2' },
  m5: { kind: 'key', name: '황금열쇠', desc: '카드 한 장' },
  m25: { kind: 'key', name: '황금열쇠', desc: '카드 한 장' },
  m15: { kind: 'trap', name: '함정', desc: '흥이 꺼진다' },
  m35: { kind: 'trap', name: '함정', desc: '흥이 꺼진다' },
  m7: { kind: 'well', name: '우물', heung: 1, desc: '흥 +1' },
  m27: { kind: 'well', name: '우물', heung: 1, desc: '흥 +1' },
  m17: { kind: 'market', name: '장터', chips: 10, coins: 1, desc: '칩 +10 · 엽전 +1' },
  m37: { kind: 'market', name: '장터', chips: 10, coins: 1, desc: '칩 +10 · 엽전 +1' },
  m3: { kind: 'bonus', name: '보너스', chips: 25, desc: '칩 +25' },
  m13: { kind: 'bonus', name: '보너스', chips: 25, desc: '칩 +25' },
  m23: { kind: 'bonus', name: '보너스', chips: 25, desc: '칩 +25' },
  m33: { kind: 'bonus', name: '보너스', chips: 25, desc: '칩 +25' }
};

/** 황금열쇠 카드. round.js 가 밟는 순간 하나를 뽑아 적용한다. */
export const KEY_CARDS = [
  { id: 'chips', name: '잔칫상', desc: '점수 +80' },
  { id: 'coins', name: '노잣돈', desc: '엽전 +3' },
  { id: 'heung', name: '풍악', desc: '흥 +2' },
  { id: 'again', name: '바람', desc: '한 번 더 던진다' },
  { id: 'banish', name: '부적 한 장', desc: '가장 앞선 도깨비를 출발로' }
];

function tierOf(sum) {
  if (sum <= 3) return 1;
  if (sum <= 5) return 2;
  if (sum <= 8) return 3;
  if (sum <= 10) return 4;
  return 5;
}

function make(d1, d2) {
  const value = d1 + d2;
  return { value, tier: tierOf(value), label: String(value), faces: [d1, d2], bonus: d1 === d2, chips: value * 6, back: false, double: d1 === d2 };
}

function walkLoop(fromIndex, steps) {
  const path = [];
  for (let s = 1; s <= steps; s++) {
    const i = fromIndex + s;
    if (i >= N) { path.push(HOME); break; }
    path.push('m' + i);
  }
  return path;
}

export const marbleBoard = {
  id: 'marble',
  name: '주사위판',
  roller: 'dice',
  rollName: '주사위 굴리기',
  blurb: '주사위 2개. 같은 눈이면 한 번 더. 한 바퀴 돌아 출발점을 지나면 골인.',
  nodes: MARBLE_NODES,
  coords,
  edges: MARBLE_NODES.map((n, i) => [n, MARBLE_NODES[(i + 1) % N]]),
  big: new Set(['m0', 'm10', 'm20', 'm30']),
  entry: 'm0',

  roll(rng) {
    return make(1 + Math.floor(rng.next() * 6), 1 + Math.floor(rng.next() * 6));
  },

  rollsFor() {
    const out = {};
    for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) out[a + b] = (out[a + b] || 0) + 1 / 36;
    return Object.keys(out).map((k) => ({ roll: make(Math.min(6, Number(k) - 1), Number(k) - Math.min(6, Number(k) - 1)), p: out[k] }));
  },

  options(pieces, owner, roll) {
    const own = pieces.filter((p) => p.owner === owner);
    const opts = [];
    const seen = new Set();
    const withWarp = (path) => {
      const last = path[path.length - 1];
      const t = TILES[last];
      return t?.warp ? { path: path.concat(t.warp), warp: true } : { path, warp: false };
    };
    for (const p of own) {
      if (p.node === START || p.node === HOME || seen.has(p.node)) continue;
      seen.add(p.node);
      const ids = own.filter((q) => q.node === p.node).map((q) => q.id);
      opts.push({ kind: 'stack', from: p.node, pieceIds: ids, ...withWarp(walkLoop(idx(p.node), roll.value)), diagonal: false });
    }
    const waiting = own.find((p) => p.node === START);
    if (waiting) opts.push({ kind: 'new', from: START, pieceIds: [waiting.id], ...withWarp(walkLoop(0, roll.value)), diagonal: false });
    return opts;
  },

  afterMove(piece) { piece.prev = null; },

  progress(node) {
    if (node === START) return 0;
    if (node === HOME) return 1;
    return idx(node) / N;
  },

  tile(node) { return TILES[node] || null; }
};
