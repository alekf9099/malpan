// 판 목록. 이 게임의 판은 서울 노선도 하나 — 날마다 구간만 바뀐다(run.js). 여기 것은 미리보기·이름용 표본.

import { makeSeoul } from './seoul.js';

export const BOARDS = { metro: makeSeoul() };
export const boardOf = () => BOARDS.metro;
