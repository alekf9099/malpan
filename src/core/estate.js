// 역 값·증축·통행료 — 모두의 마블처럼.
//   역을 사면(1단계) 다시 서서 증축할 수 있다(2단계 · 3단계 = 랜드마크). 랜드마크는 남이 인수할 수 없다.
//   통행료 = 기본(값의 30%) × 단계 배수(1 · 3 · 7) × 연결 배수. 같은 호선에서 이어서 가진 역이 많을수록 연결 배수가 오른다.
//   남의 역에 서면 통행료를 내고, 돈이 되면 그 역을 1.5배 값에 인수할 수 있다.

import { LINE_STATIONS, STATION_LINES } from './boards/seoul.js';

/** 지나는 호선 수로 값을 매긴다: 일반역 · 환승역 · 세 호선 이상 환승역 */
export const PRICE = { 1: 100, 2: 180, 3: 260 };
export const stationPrice = (n) => PRICE[Math.min(3, STATION_LINES[n]?.length || 1)];
export const TOLL_RATE = 0.3;
/** 단계별 통행료 배수(1 · 2 · 3=랜드마크) */
export const LEVEL_MULT = [0, 1, 3, 7];
export const MAX_LEVEL = 3;
export const LEVEL_NAME = ['', '역', '역사 증축', '랜드마크'];
/** 증축 한 번 값 = 역 값의 60% */
export const upgradeCost = (n) => Math.round(stationPrice(n) * 0.6);
/** 지금까지 들인 값(역 값 + 증축) */
export const invested = (n, level) => stationPrice(n) + upgradeCost(n) * (level - 1);
/** 인수 값 = 들인 값 × 1.5 */
export const takeoverPrice = (n, level) => Math.round(invested(n, level) * 1.5);
/** 팔 때 받는 값 = 들인 값의 절반 */
export const sellValue = (n, level) => Math.round(invested(n, level) / 2);
/** 연결 배수 상한 */
export const CHAIN_MAX = 4;

/**
 * 연결: 같은 호선에서 이어진 같은 주인의 역 묶음.
 *   owned  = { 역: 주인 } 처럼 누가 가졌는지. owner 의 묶음만 본다
 *   at[역] = { len, line } 그 역이 든 가장 긴 묶음
 *   edges  = 2역 이상 묶음의 선(화면이 그 주인 색 띠로 그린다)
 * 2호선은 순환선이라 끝과 처음에 걸친 묶음도 하나로 센다.
 */
export function links(owned, owner) {
  const mine = (n) => owned[n] === owner;
  const at = {}, edges = [], runs = [];
  for (const [id, list] of Object.entries(LINE_STATIONS)) {
    const line = Number(id);
    const loop = list[0] === list[list.length - 1];
    let seq = loop ? list.slice(0, -1) : list.slice();
    if (loop) {
      const cut = seq.findIndex((n) => !mine(n));
      seq = cut < 0 ? seq.concat(seq[0]) : seq.slice(cut).concat(seq.slice(0, cut));
    }
    let run = [];
    const flush = () => {
      const len = new Set(run).size;
      for (const n of run) if (!at[n] || at[n].len < len) at[n] = { len, line };
      if (len >= 2) {
        runs.push({ line, stations: [...new Set(run)] });
        for (let i = 0; i < run.length - 1; i++) edges.push({ a: run[i], b: run[i + 1], line });
      }
      run = [];
    };
    for (const n of seq) { if (mine(n)) run.push(n); else flush(); }
    flush();
  }
  return { at, edges, runs };
}

/** 이 역의 연결 배수(주인 기준, 1 = 혼자) */
export const chainOf = (owned, n) => (owned[n] ? Math.min(CHAIN_MAX, links(owned, owned[n]).at[n]?.len || 1) : 0);

/** 통행료 기본값(시간대·사건 배율 전) */
export const baseToll = (owned, levels, n) => Math.round(stationPrice(n) * TOLL_RATE * LEVEL_MULT[levels[n] || 1] * Math.max(1, chainOf(owned, n)));
