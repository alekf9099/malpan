// 원정 유물 그림(SVG) — 캐릭터 · 명소역 그림과 같은 굵은 먹선 + 납작한 색, 그 위에 밝은 면 · 그늘 한 겹. viewBox 64×64.
//   relicArt(id, size)            등급 테가 둘린 동그란 배지(칩 · 판 위 유물 띠)
//   relicArt(id, size, { bare })  그림만(유물 카드 가운데 — 카드가 배경을 그린다)

import { relicById } from '../core/expedition.js';

const K = '#22201D', W = '#FFFDF7', Y = '#F2B33D', YD = '#B9821C', YL = '#FFE08A', R = '#E0533D', RD = '#A93524',
  B = '#2EA6DA', BD = '#1F6E9A', BL = '#BFE3F5', G = '#3E9B6A', GD = '#2A6D4A', GL = '#9ED9B0', P = '#8E6CC4', PD = '#5E4594',
  PK = '#E2337A', S = '#9AA7B4', SD = '#66717C', KR = '#E3B57A', KD = '#B9844A', PA = '#EADCC4';
const L = `stroke="${K}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"`;
const hi = (d, w = 2.4) => `<path d="${d}" fill="none" stroke="${W}" stroke-width="${w}" stroke-linecap="round" opacity=".7"/>`;
const star = (x, y, r, fill = YL) => `<path d="M${x} ${y - r} L${x + r * 0.3} ${y - r * 0.3} L${x + r} ${y} L${x + r * 0.3} ${y + r * 0.3} L${x} ${y + r} L${x - r * 0.3} ${y + r * 0.3} L${x - r} ${y} L${x - r * 0.3} ${y - r * 0.3} Z" fill="${fill}" ${L}/>`;
const shadow = (w = 22) => `<ellipse cx="32" cy="57" rx="${w}" ry="3.6" fill="${K}" opacity=".14"/>`;

const ART = {
  // 비상금 봉투: 크라프트 봉투 + 삐져나온 지폐 + 빨간 봉인
  cash: `${shadow()}
    <g transform="rotate(-8 30 26)"><rect x="17" y="9" width="30" height="20" rx="2.5" fill="${GL}" ${L}/><rect x="21" y="13" width="22" height="12" rx="2" fill="none" stroke="${G}" stroke-width="2"/><circle cx="32" cy="19" r="3.6" fill="${G}"/></g>
    <rect x="8" y="23" width="48" height="31" rx="4.5" fill="${KR}" ${L}/>
    <path d="M10 52 L27 38 M54 52 L37 38" fill="none" stroke="${KD}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M8.5 25.5 L32 42 L55.5 25.5" fill="${KR}" ${L}/>
    ${hi('M13 30 V47')}
    <circle cx="32" cy="41" r="6.5" fill="${R}" ${L}/><path d="M29.4 41 L31.4 43 L35 39" fill="none" stroke="${W}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>`,

  // 황금 개찰구: 금빛 기둥 두 개 + 열리는 문짝 + 초록 화살표 + 반짝임
  toll: `${shadow(24)}
    <rect x="7" y="20" width="14" height="34" rx="3.5" fill="${Y}" ${L}/><rect x="43" y="20" width="14" height="34" rx="3.5" fill="${Y}" ${L}/>
    <path d="M17.5 23 V51 M53.5 23 V51" stroke="${YD}" stroke-width="3"/>
    ${hi('M10.5 24 V48')}${hi('M46.5 24 V48')}
    <rect x="9.5" y="24" width="9" height="7" rx="1.8" fill="${G}" ${L}/><path d="M12 27.5 H16 M14.5 26 L16 27.5 L14.5 29" fill="none" stroke="${W}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M21 33 H30 Q31.5 33 31.5 34.5 V43 H21 Z" fill="${W}" ${L}/><path d="M43 33 H34 Q32.5 33 32.5 34.5 V43 H43 Z" fill="${W}" ${L}/>
    <path d="M21 38 H31.5 M32.5 38 H43" stroke="${R}" stroke-width="3"/>
    <path d="M21 33 H31.5 V43 H21 Z M32.5 33 H43 V43 H32.5 Z" fill="none" ${L}/>
    ${star(32, 12, 6)}${star(52, 9, 3.6)}${star(12, 12, 3)}`,

  // 정기권: 목걸이 줄에 걸린 교통카드 + 칩 + 작은 방패
  shield: `${shadow()}
    <path d="M24 4 Q32 16 40 4" fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round"/><path d="M24 4 Q32 16 40 4" fill="none" stroke="${B}" stroke-width="3" stroke-linecap="round"/>
    <g transform="rotate(-7 32 33)">
      <rect x="10" y="15" width="44" height="30" rx="5" fill="${W}" ${L}/>
      <path d="M10 22 V20 Q10 15 15 15 H49 Q54 15 54 20 V22 Z" fill="${B}" ${L}/>
      <rect x="15.5" y="28" width="10" height="8" rx="1.8" fill="${Y}" ${L}/><path d="M19 28 V36 M15.5 32 H25.5" stroke="${YD}" stroke-width="1.4"/>
      <path d="M30 30 H44 M30 36 H39" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>
      <path d="M41 15 L48 45" stroke="#F2A7BB" stroke-width="3" opacity=".8"/>
      <rect x="10" y="15" width="44" height="30" rx="5" fill="none" ${L}/>
    </g>
    <path d="M42 40 L50 37 L58 40 V46 Q58 53 50 56 Q42 53 42 46 Z" fill="${G}" ${L}/><path d="M46.5 46.5 L49.3 49.3 L54 44" fill="none" stroke="${W}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>`,

  // 공구 상자: 빨간 상자 + 손잡이 + 비스듬히 꽂힌 스패너
  build: `${shadow(24)}
    <path d="M37 30 L49 9" stroke="${K}" stroke-width="8" stroke-linecap="round"/><path d="M37 30 L49 9" stroke="${S}" stroke-width="4" stroke-linecap="round"/>
    <path d="M45 4.5 A7.5 7.5 0 1 0 55.5 13 L51 12 L49.5 7.5 Z" fill="${S}" ${L}/>
    <path d="M23 29 V24 Q23 20.5 26.5 20.5 H37.5 Q41 20.5 41 24 V29" fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round"/><path d="M23 29 V24 Q23 20.5 26.5 20.5 H37.5 Q41 20.5 41 24 V29" fill="none" stroke="${SD}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M7 29 H57 V50 Q57 55 52 55 H12 Q7 55 7 50 Z" fill="${R}" ${L}/>
    <rect x="7" y="29" width="50" height="9" fill="${RD}" ${L}/>
    ${hi('M11 42 V50')}
    <rect x="28" y="34" width="8" height="8" rx="1.6" fill="${Y}" ${L}/>`,

  // 협상 수첩: 보라 수첩(스프링) + 노란 펜 + 체크 라벨
  deal: `${shadow()}
    <rect x="13" y="7" width="32" height="47" rx="4.5" fill="${P}" ${L}/>
    <path d="M45 11 V50" stroke="${W}" stroke-width="3.2"/><path d="M45 9.5 Q48 9.5 48 12.5 V49 Q48 52 45 52" fill="none" ${L}/>
    <path d="M18 9 V52" stroke="${PD}" stroke-width="2.4"/>
    ${[14, 22, 30, 38, 46].map((y) => `<path d="M10 ${y} H17" stroke="${K}" stroke-width="3.6" stroke-linecap="round"/><path d="M10.5 ${y} H16.5" stroke="${S}" stroke-width="1.6" stroke-linecap="round"/>`).join('')}
    <rect x="22" y="15" width="18" height="13" rx="2" fill="${W}" ${L}/><path d="M26 21.5 L29.5 25 L36 18.5" fill="none" stroke="${G}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M24 35 H38 M24 41 H34" stroke="${W}" stroke-width="2.2" stroke-linecap="round" opacity=".75"/>
    <path d="M38 57 L56 27" stroke="${K}" stroke-width="8" stroke-linecap="round"/><path d="M38 57 L56 27" stroke="${Y}" stroke-width="4.2" stroke-linecap="round"/>
    <path d="M52.5 32.8 L55.5 27.8" stroke="${R}" stroke-width="4.2" stroke-linecap="round"/>`,

  // 분양권: 집 모양 꼬리표 + 금빛 열쇠
  buy: `${shadow()}
    <path d="M19 30 Q26 34 34 28" fill="none" stroke="${K}" stroke-width="2" stroke-dasharray="0.1 3.6" stroke-linecap="round"/>
    <path d="M5 26 L16 15 L27 26 V44 H5 Z" fill="${W}" ${L}/><path d="M3 27 L16 13.5 L29 27" fill="none" stroke="${R}" stroke-width="4.6" stroke-linecap="round" stroke-linejoin="round"/><path d="M3 27 L16 13.5 L29 27" fill="none" ${L}/>
    <rect x="12" y="33" width="8" height="11" rx="1" fill="${B}" ${L}/><circle cx="16" cy="24" r="2.2" fill="${PA}" ${L}/>
    <circle cx="43" cy="21" r="11" fill="${Y}" ${L}/><circle cx="43" cy="21" r="4.2" fill="${PA}" ${L}/>${hi('M36.5 16 Q38 12.5 42 11.5', 2.2)}
    <path d="M43 32 V57" stroke="${K}" stroke-width="8" stroke-linecap="round"/><path d="M43 32 V57" stroke="${Y}" stroke-width="4" stroke-linecap="round"/>
    <path d="M43 45 H51 M43 52 H48.5" stroke="${K}" stroke-width="5" stroke-linecap="round"/><path d="M43 45 H50.5 M43 52 H48" stroke="${Y}" stroke-width="2" stroke-linecap="round"/>`,

  // 성과급: 금화 탑 + 띠지 + 치솟는 초록 화살표
  salary: `${shadow(20)}
    ${[47, 39, 31].map((y) => `<path d="M12 ${y} V${y + 6} A17 5.5 0 0 0 46 ${y + 6} V${y}" fill="${YD}" ${L}/><ellipse cx="29" cy="${y}" rx="17" ry="5.5" fill="${Y}" ${L}/>`).join('')}
    <path d="M12 42 V45.5 A17 5.5 0 0 0 46 45.5 V42" fill="none" stroke="${R}" stroke-width="3.4"/>
    <ellipse cx="29" cy="31" rx="9" ry="2.6" fill="none" stroke="${YD}" stroke-width="2"/>${hi('M17 29.5 Q22 27 28 26.6', 2)}
    <path d="M50 30 L50 9 M43 16 L50 9 L57 16" fill="none" stroke="${K}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M50 30 L50 9 M43 16 L50 9 L57 16" fill="none" stroke="${G}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/>
    ${star(14, 17, 4)}`,

  // 중개 수수료: 분홍 계산기 + 화면의 % + 노란 = 단추
  fee: `${shadow(20)}
    <rect x="13" y="6" width="38" height="50" rx="6.5" fill="${PK}" ${L}/>
    <path d="M47 10 V52" stroke="#B3205C" stroke-width="3"/>${hi('M17 12 V48')}
    <rect x="18" y="11" width="28" height="14" rx="2.5" fill="${BL}" ${L}/>
    <circle cx="35" cy="15.5" r="2.3" fill="none" stroke="${K}" stroke-width="2"/><circle cx="41.5" cy="20.5" r="2.3" fill="none" stroke="${K}" stroke-width="2"/><path d="M42.5 14 L34 22" stroke="${K}" stroke-width="2.2" stroke-linecap="round"/>
    ${[[19, 30], [28.5, 30], [38, 30], [19, 39.5], [28.5, 39.5]].map(([x, y]) => `<rect x="${x}" y="${y}" width="7.5" height="7" rx="1.8" fill="${W}" ${L}/>`).join('')}
    <rect x="38" y="39.5" width="7.5" height="12" rx="1.8" fill="${Y}" ${L}/><rect x="19" y="49" width="17" height="2.6" rx="1.3" fill="${K}" opacity=".25"/>`,

  // 구조 보험: 빨강 · 흰 구명 튜브 + 감긴 밧줄
  rescue: `${shadow(20)}
    <path fill-rule="evenodd" d="M32 10 a21 21 0 1 0 0.01 0 Z M32 22 a9 9 0 1 1 -0.01 0 Z" fill="${W}"/>
    <circle cx="32" cy="31" r="15" fill="none" stroke="${R}" stroke-width="12" stroke-dasharray="11.78 11.78" transform="rotate(-22.5 32 31)"/>
    <circle cx="32" cy="31" r="21" fill="none" ${L}/><circle cx="32" cy="31" r="9" fill="none" ${L}/>
    <path d="M14 21 Q11 31 14 41 M50 21 Q53 31 50 41" fill="none" stroke="${KR}" stroke-width="3.4" stroke-linecap="round"/>
    <path d="M14 21 Q11 31 14 41 M50 21 Q53 31 50 41" fill="none" stroke="${K}" stroke-width="1.2" stroke-dasharray="2 2.4" stroke-linecap="round"/>
    ${hi('M20 17 Q26 12.5 33 12.2', 2.2)}`,

  // 무임승차권: 비스듬한 종이 승차권 + 절취선 + 구멍 + 별
  coupon: `${shadow(24)}
    <g transform="rotate(-11 32 32)">
      <path d="M6 19 H58 V27.5 Q53 32 58 36.5 V45 H6 V36.5 Q11 32 6 27.5 Z" fill="${W}" ${L}/>
      <path d="M6 19 H20 V45 H6 V36.5 Q11 32 6 27.5 Z" fill="${G}"/>
      <path d="M6 19 H58 V27.5 Q53 32 58 36.5 V45 H6 V36.5 Q11 32 6 27.5 Z" fill="none" ${L}/>
      <path d="M20 21 V43" stroke="${K}" stroke-width="2.2" stroke-dasharray="2.6 3.2"/>
      <path d="M9.5 27 H16.5 M9.5 32 H16.5 M9.5 37 H14" stroke="${W}" stroke-width="2" stroke-linecap="round"/>
      ${star(37, 32, 8.5, Y)}
      <circle cx="52" cy="24" r="2.6" fill="${PA}" ${L}/>
      <path d="M26 40 H48" stroke="${PA}" stroke-width="2.2" stroke-linecap="round"/>
    </g>`,

  // 보조 배터리: 파란 보조 배터리 + 번개 + 충전 칸 + 꼬인 선
  battery: `${shadow(20)}
    <path d="M47 47 Q59 47 58 35 V25" fill="none" stroke="${K}" stroke-width="6" stroke-linecap="round"/><path d="M47 47 Q59 47 58 35 V25" fill="none" stroke="${W}" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="53.5" y="15" width="9" height="11" rx="2" fill="${S}" ${L}/><path d="M56 15 V11 M60 15 V11" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>
    <rect x="9" y="9" width="38" height="47" rx="7.5" fill="${B}" ${L}/><path d="M42 13 V52" stroke="${BD}" stroke-width="3.4"/>${hi('M13.5 15 V50')}
    <path d="M30.5 13 L20 30 H27.5 L24.5 41 L36 24 H28.5 Z" fill="${Y}" ${L}/>
    ${[0, 1, 2].map((i) => `<rect x="${16 + i * 8.5}" y="45" width="6.5" height="5.5" rx="1.4" fill="${i < 2 ? GL : W}" ${L}/>`).join('')}`,

  // 첫 충전: 빛나는 구슬 안의 번개 + 사방으로 뻗는 빛
  spark: `${shadow(16)}
    ${[0, 45, 90, 135, 180, 225, 270, 315].map((a) => `<path d="M32 4 V9" stroke="${YD}" stroke-width="3.2" stroke-linecap="round" transform="rotate(${a} 32 30)"/>`).join('')}
    <circle cx="32" cy="30" r="18" fill="${YL}" ${L}/><circle cx="32" cy="30" r="12.5" fill="#FFF3C4"/>
    <path d="M35.5 12.5 L22.5 33 H31 L27.5 48 L42.5 25.5 H34 Z" fill="${Y}" ${L}/>${hi('M33 17.5 L27 28', 2)}
    ${star(49, 13, 4.2, W)}${star(14, 45, 3.4, W)}`
};

/** 등급 배지 색: 테 · 안쪽 밝은 면 · 안쪽 어두운 면 */
export const TIER_COLORS = {
  common: { rim: '#C9BFAE', rimD: '#9C917E', lt: '#FFFDF7', dk: '#EADCC4' },
  rare: { rim: '#2EA6DA', rimD: '#1F6E9A', lt: '#F0FAFF', dk: '#BFE3F5' },
  legend: { rim: '#F2B33D', rimD: '#B9821C', lt: '#FFF8DC', dk: '#F7D77A' }
};

/** 유물 그림. bare: 그림만, 아니면 등급 테가 둘린 배지 */
export function relicArt(id, size = 40, { bare = false } = {}) {
  const body = ART[id] || `<circle cx="32" cy="32" r="12" fill="${PA}" ${L}/>`;
  if (bare) return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${body}</svg>`;
  const tier = relicById(id)?.tier || 'common', c = TIER_COLORS[tier], g = `rlg-${tier}`;
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">
    <defs><radialGradient id="${g}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="${c.lt}"/><stop offset="1" stop-color="${c.dk}"/></radialGradient></defs>
    <circle cx="32" cy="32" r="30" fill="${c.rim}" stroke="${K}" stroke-width="2.6"/><circle cx="32" cy="32" r="25.5" fill="url(#${g})" stroke="${c.rimD}" stroke-width="2"/>
    <g transform="translate(7.7 7.7) scale(.76)">${body}</g></svg>`;
}

/** 목숨 하트 */
export function heartArt(on, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 20.5 C4 14.5 2.5 10 4.2 7.2 C5.8 4.6 9.6 4.6 12 8 C14.4 4.6 18.2 4.6 19.8 7.2 C21.5 10 20 14.5 12 20.5 Z" fill="${on ? R : PA}" stroke="${K}" stroke-width="2" stroke-linejoin="round"/>${on ? '<path d="M7.5 8.6 Q8.6 7.2 10.2 7.6" fill="none" stroke="#FFFDF7" stroke-width="1.6" stroke-linecap="round" opacity=".8"/>' : ''}</svg>`;
}

/** 카드 뒷면 무늬(노선 띠 + 물음표) */
export const RELIC_BACK = `<svg viewBox="0 0 100 140" preserveAspectRatio="none" aria-hidden="true">
  <rect width="100" height="140" fill="#2B2724"/>
  ${[['#E0533D', 30], ['#2EA6DA', 55], ['#3E9B6A', 80], ['#F2B33D', 105]].map(([c, y]) => `<path d="M-10 ${y} C 30 ${y - 22}, 70 ${y + 22}, 110 ${y}" fill="none" stroke="${c}" stroke-width="6" opacity=".55"/>`).join('')}
  <circle cx="50" cy="70" r="22" fill="#FFFDF7" stroke="${K}" stroke-width="3"/>
  <path d="M42 63 Q42 54 50 54 Q58 54 58 62 Q58 67 51 70 V75 M51 82 V83" fill="none" stroke="${K}" stroke-width="5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

/** 효과 글의 숫자(+25% · -30% · 300 …)를 굵게 */
const emph = (t) => t.replace(/([+-]?\d+%?)/g, '<em>$1</em>');

/**
 * 유물 카드(고르기 화면 · 미리보기 공용): 앞면(등급 띠 · 그림 · 이름 · 효과 · 종류)과 뒷면.
 * names: { tier: 등급 이름, tag: 종류 이름 } — 글은 부르는 쪽(core 의 TIERS · TAGS)에서
 */
export function relicCard(id, names) {
  const r = relicById(id);
  return `<button class="relic-card t-${r.tier}" data-r="${id}" aria-label="${r.name} · ${r.desc}">
    <span class="rc-flip">
      <span class="rc-face">
        <span class="rc-tier">${names.tier}</span>
        <span class="rc-art">${r.tier === 'legend' ? '<i class="rc-rays"></i>' : ''}${relicArt(id, 88, { bare: true })}</span>
        <b class="rc-name">${r.name}</b>
        <span class="rc-desc">${emph(r.desc)}</span>
        <span class="rc-tag">${names.tag}</span>
        ${r.tier === 'legend' ? '<i class="rc-shine"></i>' : ''}
      </span>
      <span class="rc-back">${RELIC_BACK}</span>
    </span>
  </button>`;
}
