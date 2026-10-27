// 판 목록. 이 게임의 판은 노선도 하나 — 날마다 시드로 새로 만든다(round.js). 여기 것은 미리보기·이름용 표본.

import { makeMetro } from './metro.js';

export const BOARDS = { metro: makeMetro(1) };
export const boardOf = () => BOARDS.metro;
