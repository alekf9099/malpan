// 윷 던지기. 윷가락 4개가 각각 확률 pFlat 로 평평한 면(배)을 보인다.
// 평평한 면 개수: 1 도, 2 개, 3 걸, 4 윷, 0 모. 표시가 있는 0번 가락 하나만 평평하면 빽도.

export const BACKDO = -1, DO = 1, GAE = 2, GEOL = 3, YUT = 4, MO = 5;

export const NAMES = { [BACKDO]: '빽도', [DO]: '도', [GAE]: '개', [GEOL]: '걸', [YUT]: '윷', [MO]: '모' };

export const DEFAULT_P_FLAT = 0.55;

export function isBonus(result) {
  return result === YUT || result === MO;
}

export function throwSticks(rng, pFlat = DEFAULT_P_FLAT) {
  const p = Math.min(0.9, Math.max(0.1, pFlat));
  const flats = [0, 1, 2, 3].map(() => rng.next() < p);
  const n = flats.filter(Boolean).length;
  let result;
  if (n === 0) result = MO;
  else if (n === 1) result = flats[0] ? BACKDO : DO;
  else result = n; // 2 개, 3 걸, 4 윷
  return { result, flats };
}

/** 결과별 확률. 상점의 윷가락 설명과 테스트에서 쓴다. */
export function distribution(pFlat = DEFAULT_P_FLAT) {
  const p = pFlat, q = 1 - p;
  return {
    [BACKDO]: p * q ** 3,
    [DO]: 3 * p * q ** 3,
    [GAE]: 6 * p ** 2 * q ** 2,
    [GEOL]: 4 * p ** 3 * q,
    [YUT]: p ** 4,
    [MO]: q ** 4
  };
}
