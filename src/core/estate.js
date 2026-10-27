// 역 인수와 통행료 — 부루마불처럼 역을 사 두면 도깨비 열차가 설 때마다 통행료가 들어온다.
//   값은 점수로 낸다(목표에서 빠진다). 산 역은 기기에 남아 다음 원정에서도 내 역이다(저장은 ui/stations.js).
//   연결: 같은 호선에서 이어진 내 역이 많을수록 배수가 오른다 — 2역 ×2 · 3역 ×3 · 4역 이상 ×4.
//         도깨비가 내는 통행료에도, 내 말이 내 역에 섰을 때의 점수 배수에도 붙는다.
//   도깨비 역: 보스 날(수·금) 도깨비 차장이 역 몇 곳을 차지한다. 내 말이 서면 내가 통행료를 낸다.

import { LINE_STATIONS, STATION_LINES } from './boards/seoul.js';

/** 지나는 호선 수로 값을 매긴다: 일반역 · 환승역 · 세 호선 환승역 */
export const PRICE = { 1: 50, 2: 100, 3: 160 };
export const stationPrice = (n) => PRICE[Math.min(3, STATION_LINES[n]?.length || 1)];
// 통행료 기본값은 값의 4분의 1 — 연결 배수(최대 ×4)가 곱해지므로 노선망이 커져도 하루가 너무 쉬워지지 않게
export const stationToll = (n) => Math.round(stationPrice(n) / 4);
/** 연결 배수 상한 */
export const CHAIN_MAX = 4;
/** 내 역에 내 말이 서면 붙는 칩, 연결된 내 역이면 붙는 배수의 상한(2역 +1 · 3역 이상 +2) */
export const OWN_STOP_CHIPS = 10;
export const OWN_STOP_MULT_MAX = 2;
/** 보스 날 도깨비 역 수 */
export const GOBLIN_STATIONS = 2;

/**
 * 연결 구간: 같은 호선에서 이어진 내 역 묶음.
 *   at[역]  = { len, line } 그 역이 든 가장 긴 묶음(여러 호선이 지나면 긴 쪽)
 *   edges   = 2역 이상 묶음의 선(화면이 금빛 띠로 그린다)
 *   runs    = 2역 이상 묶음 [{ line, stations }]
 * 2호선은 순환선이라 끝과 처음에 걸친 묶음도 하나로 센다.
 */
export function links(owned) {
  const at = {}, edges = [], runs = [];
  for (const [id, list] of Object.entries(LINE_STATIONS)) {
    const line = Number(id);
    const loop = list[0] === list[list.length - 1];
    let seq = loop ? list.slice(0, -1) : list.slice();
    if (loop) {
      const cut = seq.findIndex((n) => !owned[n]);
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
    for (const n of seq) { if (owned[n]) run.push(n); else flush(); }
    flush();
  }
  return { at, edges, runs };
}

/** 이 역의 연결 배수(1 = 혼자) */
export const chainOf = (owned, n) => (owned[n] ? Math.min(CHAIN_MAX, links(owned).at[n]?.len || 1) : 0);

/** 지금 몇 곳·얼마어치·연결 구간 몇 개·가장 긴 연결 */
export function holdings(owned) {
  const names = Object.keys(owned).filter((n) => owned[n]);
  const { runs } = links(owned);
  return {
    count: names.length,
    value: names.reduce((s, n) => s + stationPrice(n), 0),
    links: runs.length,
    best: runs.reduce((m, r) => Math.max(m, r.stations.length), names.length ? 1 : 0)
  };
}
