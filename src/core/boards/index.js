// 판 목록. round.js 는 판 id 만 들고 다니고, 규칙은 여기서 찾는다.

import { yutBoard } from './yut.js';
import { marbleBoard } from './marble.js';
import { chessBoard } from './chess.js';

export const BOARDS = { yut: yutBoard, marble: marbleBoard, chess: chessBoard };
export const boardOf = (id) => BOARDS[id] || yutBoard;
