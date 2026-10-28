// 티어 배지 — 방패 + 티어마다 다른 문장(브론즈 점 · 실버 갈매기 · 골드 별 · 플래티넘 육각 · 다이아 보석 · 마스터 왕관).
// 판의 다른 그림처럼 굵은 먹선 + 납작한 색. t = core/ranking.js 의 tierOf() 결과

const K = '#22201D', W = '#FFFDF7';
const line = `stroke="${K}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;
const EMBLEM = {
  bronze: `<circle cx="20" cy="21" r="5" fill="${W}" ${line}/>`,
  silver: `<path d="M13 17 L20 23 L27 17 M13 23 L20 29 L27 23" fill="none" stroke="${W}" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`,
  gold: `<path d="M20 12 L22.6 18 L29 18.6 L24.2 22.8 L25.6 29 L20 25.6 L14.4 29 L15.8 22.8 L11 18.6 L17.4 18 Z" fill="${W}" ${line}/>`,
  platinum: `<path d="M20 12 L27 16 V25 L20 29 L13 25 V16 Z" fill="${W}" ${line}/><path d="M20 12 V29 M13 16 L27 25 M27 16 L13 25" stroke="${K}" stroke-width="1.2" opacity=".4"/>`,
  diamond: `<path d="M13 17 L17 12 H23 L27 17 L20 29 Z" fill="${W}" ${line}/><path d="M13 17 H27 M17 12 L20 17 L23 12 M20 17 V29" stroke="${K}" stroke-width="1.3" fill="none" opacity=".5"/>`,
  master: `<path d="M11 27 L12 15 L16.5 20 L20 12 L23.5 20 L28 15 L29 27 Z" fill="${W}" ${line}/><circle cx="20" cy="12" r="1.8" fill="${K}"/>`
};

/** 배지 하나(svg). size 는 너비(px) */
export function tierBadge(t, size = 40) {
  return `<svg class="tier-badge" viewBox="0 0 40 44" width="${size}" height="${Math.round(size * 1.1)}" aria-label="${t.label}">
    <path d="M20 2 L36 8 V22 Q36 34 20 42 Q4 34 4 22 V8 Z" fill="${t.color}" ${line}/>
    <path d="M20 6 L32 10.5 V22 Q32 31.5 20 38 Q8 31.5 8 22 V10.5 Z" fill="none" stroke="${W}" stroke-width="1.6" opacity=".55"/>
    ${EMBLEM[t.id] || ''}</svg>`;
}
