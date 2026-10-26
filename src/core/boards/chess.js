// 체스판 — 가로 8 × 세로 10. 기물 주사위(폰·킹·나이트·비숍·룩·퀸)를 굴려, 나온 기물처럼 말 하나를 움직인다.
// 반대편 끝 줄에 닿으면 골인. 뒤로는 못 가고, 앞·옆·대각선 앞으로만 간다.
// 미끄러지는 기물(비숍·룩·퀸)은 다른 말을 넘지 못한다 — 도깨비가 있으면 잡고 멈춘다.

import { START, HOME } from '../board.js';

export const COLS = 8, ROWS = 10;
export const CHESS_NODES = [];
const coords = {};
// 칸 한 변을 1/8 로 두고 세로로 길게(1 × 1.25) 깐다
for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
  const id = `k${c}${r}`;
  CHESS_NODES.push(id);
  coords[id] = [(c + 0.5) / COLS, (r + 0.5) / COLS];
}
const cr = (node) => [Number(node[1]), Number(node[2])];
const at = (c, r) => (c >= 0 && c < COLS && r >= 0 && r < ROWS ? `k${c}${r}` : null);

// 내 말은 아래(9번 줄)에서 위(0번 줄)로, 도깨비는 반대로 간다.
const DIR = { me: -1, opp: 1 };
const GOAL = { me: 0, opp: ROWS - 1 };
const ENTRY = { me: ROWS - 1, opp: 0 };
const ENTRY_COLS = [3, 4, 2, 5, 1, 6, 0, 7];

/** [dx, dy(앞쪽이 +), 최대 칸, 미끄러짐] */
const MOVES = {
  pawn: [[0, 1, 1], [1, 1, 1], [-1, 1, 1]],
  king: [[0, 1, 1], [1, 1, 1], [-1, 1, 1], [1, 0, 1], [-1, 0, 1]],
  knight: [[1, 2, 1, 'jump'], [-1, 2, 1, 'jump'], [2, 1, 1, 'jump'], [-2, 1, 1, 'jump']],
  bishop: [[1, 1, 3], [-1, 1, 3]],
  rook: [[0, 1, 3], [1, 0, 2], [-1, 0, 2]],
  queen: [[0, 1, 3], [1, 1, 3], [-1, 1, 3], [1, 0, 2], [-1, 0, 2]]
};
export const FACES = ['pawn', 'king', 'knight', 'bishop', 'rook', 'queen'];
const LABEL = { pawn: '폰', king: '킹', knight: '나이트', bishop: '비숍', rook: '룩', queen: '퀸' };
const TIER = { pawn: 1, king: 2, knight: 3, bishop: 4, rook: 4, queen: 5 };
const CHIPS = { pawn: 10, king: 15, knight: 30, bishop: 25, rook: 25, queen: 40 };

function make(face) {
  return { value: face, tier: TIER[face], label: LABEL[face], faces: [face], bonus: face === 'queen', chips: CHIPS[face], back: false };
}

export const chessBoard = {
  id: 'chess',
  name: '체스판',
  roller: 'chess',
  rollName: '기물 굴리기',
  blurb: '기물 주사위. 나온 기물처럼 말 하나를 움직여 맨 윗줄에 닿으면 골인. 퀸이면 한 번 더.',
  nodes: CHESS_NODES,
  coords,
  dims: [1, ROWS / COLS],
  edges: [],
  big: new Set(),
  entry: null,

  roll(rng) { return make(FACES[Math.floor(rng.next() * FACES.length)]); },

  rollsFor() { return FACES.map((f) => ({ roll: make(f), p: 1 / FACES.length })); },

  options(pieces, owner, roll) {
    const own = pieces.filter((p) => p.owner === owner);
    const occupant = (node) => pieces.find((p) => p.node === node);
    const dir = DIR[owner], goal = GOAL[owner];
    const opts = [];
    const seen = new Set();
    for (const p of own) {
      if (p.node === START || p.node === HOME || seen.has(p.node)) continue;
      seen.add(p.node);
      const ids = own.filter((q) => q.node === p.node).map((q) => q.id);
      const [c0, r0] = cr(p.node);
      const dests = new Set();
      const add = (path, diagonal) => {
        const last = path[path.length - 1];
        if (dests.has(last)) return;
        dests.add(last);
        const homed = Number(last[2]) === goal;
        opts.push({ kind: 'stack', from: p.node, pieceIds: ids, path: homed ? path.concat(HOME) : path, diagonal });
      };
      for (const [dx, dyF, max, jump] of MOVES[roll.value]) {
        const diagonal = dx !== 0 && dyF !== 0;
        if (jump) {
          const node = at(c0 + dx, r0 + dyF * dir);
          if (node) add([node], diagonal);
          continue;
        }
        // 한 칸씩 미끄러진다. 거친 칸마다 멈출 수 있고, 말(누구든)을 만나면 그 칸에서 멈춘다.
        const path = [];
        for (let k = 1; k <= max; k++) {
          const node = at(c0 + dx * k, r0 + dyF * dir * k);
          if (!node) break;
          path.push(node);
          add(path.slice(), diagonal);
          if (occupant(node) || Number(node[2]) === goal) break;
        }
      }
    }
    const waiting = own.find((p) => p.node === START);
    if (waiting) {
      const col = ENTRY_COLS.find((c) => occupant(at(c, ENTRY[owner]))?.owner !== owner);
      if (col != null) opts.push({ kind: 'new', from: START, pieceIds: [waiting.id], path: [at(col, ENTRY[owner])], diagonal: false });
    }
    return opts;
  },

  afterMove(piece) { piece.prev = null; },

  progress(node, owner = 'me') {
    if (node === START) return 0;
    if (node === HOME) return 1;
    const r = cr(node)[1];
    return owner === 'me' ? (ROWS - 1 - r) / (ROWS - 1) : r / (ROWS - 1);
  },

  tile() { return null; },

  /** 화면용: 이 칸이 누구의 골인 줄인가 */
  goalRow(owner) { return GOAL[owner]; }
};
