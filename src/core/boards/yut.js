// 윷놀이판 — 전통 29칸, 윷가락 4개. 모서리·가운데 지름길, 빽도.

import { START, HOME, NODES, COORDS, EDGES, BIG_NODES, DIAGONAL, walk, prevAfterWalk, defaultPrev, progress } from '../board.js';
import { throwSticks, distribution, isBonus, NAMES, BACKDO } from '../sticks.js';

const CHIPS = { [BACKDO]: 15, 1: 10, 2: 20, 3: 30, 4: 40, 5: 50 };

function make(value, faces) {
  return {
    value,
    tier: value === BACKDO ? -1 : value,
    label: NAMES[value],
    faces,
    bonus: isBonus(value),
    chips: CHIPS[value],
    back: value === BACKDO
  };
}

/** 테스트·시뮬레이터용: 결과 값으로 윷 결과 객체를 만든다. */
export const yutRoll = (value) => make(value, []);

export const yutBoard = {
  id: 'yut',
  name: '윷놀이판',
  roller: 'sticks',
  rollName: '윷 던지기',
  blurb: '윷가락 4개. 모서리와 가운데에 멈추면 지름길, 빽도는 한 칸 뒤로.',
  nodes: NODES,
  coords: COORDS,
  edges: EDGES,
  big: BIG_NODES,
  entry: 'o0',

  roll(rng, r) {
    const t = throwSticks(rng, r.pFlat);
    return make(t.result, t.flats);
  },

  /** 도깨비 위험도 계산용 — 도깨비는 보통 윷을 쓴다. */
  rollsFor() {
    const d = distribution();
    return Object.keys(d).map((k) => ({ roll: make(Number(k), []), p: d[k] }));
  },

  options(pieces, owner, roll) {
    const own = pieces.filter((p) => p.owner === owner);
    const opts = [];
    const seen = new Set();
    for (const p of own) {
      if (p.node === START || p.node === HOME || seen.has(p.node)) continue;
      seen.add(p.node);
      const ids = own.filter((q) => q.node === p.node).map((q) => q.id);
      const path = roll.back ? [p.prev || defaultPrev(p.node)] : walk(p.node, roll.value, p.prev);
      opts.push({ kind: 'stack', from: p.node, pieceIds: ids, path, diagonal: DIAGONAL.has(p.node) || path.some((n) => DIAGONAL.has(n)) });
    }
    const waiting = own.find((p) => p.node === START);
    if (waiting && !roll.back) {
      const path = walk(START, roll.value, null);
      opts.push({ kind: 'new', from: START, pieceIds: [waiting.id], path, diagonal: path.some((n) => DIAGONAL.has(n)) });
    }
    return opts;
  },

  afterMove(piece, opt, roll) {
    const dest = opt.path[opt.path.length - 1];
    piece.prev = roll.back ? defaultPrev(dest === HOME ? 'o0' : dest) : prevAfterWalk(opt.from, opt.path);
  },

  progress(node) { return progress(node); },

  tile() { return null; }
};
