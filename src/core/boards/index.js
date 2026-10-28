// 판 목록. 이 게임의 판은 서울 노선도 하나(역 219곳) — 한 판 내내 지도 전체가 무대다.

import { LINES } from './seoul.js';

export const BOARDS = { metro: { id: 'seoul', lines: LINES } };
export const boardOf = () => BOARDS.metro;
