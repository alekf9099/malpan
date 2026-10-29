// 그림은 전부 SVG 문자열로 만든다. 먹선 3px, 둥근 이음 — 손으로 오린 스티커 느낌을 통일한다.

const INK = '#22201D';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

/** 내 말 4종. 순서대로 m0~m3. 능력은 core/heroes.js */
export const HEROES = ['driver', 'staff', 'worker', 'student', 'youtuber', 'rider', 'nurse', 'foreman', 'broker'];

// 캐릭터는 Kenney Mini Characters(CC0) 3D 모델을 판과 같은 시점으로 찍은 스프라이트 시트다(tools/render-chars.html).
// 시트 한 장 = 동작 5줄 × 8프레임. 줄 순서는 ACTS 와 같다.
// 예전 기록에 남은 동물 캐릭터 id 는 같은 자리의 사람으로 보여 준다
const SHEET = {
  driver: 'driver', staff: 'staff', worker: 'worker', student: 'student',
  youtuber: 'youtuber', rider: 'rider', nurse: 'nurse', foreman: 'foreman', broker: 'broker',
  tiger: 'driver', rabbit: 'staff', parrot: 'worker', panda: 'student'
};
export const ACTS = ['idle', 'walk', 'cheer', 'sad', 'dance'];

export function character(kind, size = 64, start = 'idle') {
  const delay = -(Math.random() * 1.2).toFixed(2);
  return `<span class="char" data-act="${start}" style="--sz:${size}px;background-image:url(assets/chars/${SHEET[kind] || 'driver'}.webp);animation-delay:${delay}s" aria-hidden="true"></span>`;
}

/** 캐릭터 동작 바꾸기. ms 가 있으면 그만큼 뒤에 대기 동작으로 돌아간다. */
export function act(el, name, ms = 0) {
  const c = el?.querySelector('.char');
  if (!c) return;
  clearTimeout(c._back);
  c.dataset.act = name;
  if (ms) c._back = setTimeout(() => { c.dataset.act = 'idle'; }, ms);
}

/** 바라보는 쪽. 그림은 왼쪽 아래를 본다 — 오른쪽으로 갈 때 뒤집는다. */
export function face(el, dx) {
  const c = el?.querySelector('.char');
  if (c && Math.abs(dx) > 0.5) c.style.setProperty('--flip', dx > 0 ? -1 : 1);
}

/** 말 id → 그림 종류. 내 말은 m0~m3, 도깨비 열차는 d0~d2. */
export function kindOf(pieceId) {
  if (pieceId[0] === 'm') return HEROES[Number(pieceId.slice(1)) % HEROES.length];
  return Number(pieceId.slice(1)) % 2 ? 'dokkaebiBlue' : 'dokkaebiRed';
}

/** 정기권 — 파란 승차권에 흰 글자 하나와 개찰 구멍. */
export const CHARM_GLYPH = {
  ox: '출', magpie: '단', tiger: '검', shortcut: '환', backdo: '완', mo: '급',
  reroll: '시', turtle: '대', goal: '종', bat: '연', gambler: '쾌', pouch: '적', tape: '봉'
};
const CHARM_COLOR = { tiger: '#E0533D', gambler: '#E0533D', mo: '#F2A13D', bat: '#3E9B6A', tape: '#22201D' };

export function charmCard(id) {
  const g = CHARM_GLYPH[id] || '?';
  const c = CHARM_COLOR[id] || '#2F6BD8';
  return `<svg viewBox="0 0 58 78" aria-hidden="true">
    <rect x="2" y="2" width="54" height="74" rx="8" fill="${c}" ${S}/>
    <rect x="8" y="10" width="42" height="12" rx="3" fill="#FFFDF7" opacity=".9"/>
    <path d="M12 16h18" stroke="${c}" stroke-width="3" stroke-linecap="round"/>
    <circle cx="44" cy="16" r="3" fill="${c}"/>
    <text x="29" y="56" text-anchor="middle" font-family="Gasoek One, sans-serif" font-size="27" fill="#FFFDF7">${g}</text>
    <path d="M10 66h38" stroke="#FFFDF7" stroke-width="2" stroke-dasharray="3 3" opacity=".8"/>
  </svg>`;
}

/** 역 개조: 역 표지판 모양 */
export function tileArt(id) {
  const box = (fill, inner) => `<svg viewBox="0 0 58 78" aria-hidden="true"><rect x="2" y="2" width="54" height="74" rx="10" fill="#FFFDF7" ${S}/><circle cx="29" cy="39" r="17" fill="${fill}" ${S}/>${inner}</svg>`;
  if (id === 'gold') return box('#F2B33D', `<path d="M29 28l3.3 6.8 7.4 1-5.4 5.2 1.3 7.4L29 44.9l-6.6 3.5 1.3-7.4-5.4-5.2 7.4-1z" fill="#FFFDF7" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`);
  if (id === 'luck') return box('#3E9B6A', `<circle cx="29" cy="39" r="9" fill="#E9B949" stroke="${INK}" stroke-width="2"/><text x="29" y="43.5" text-anchor="middle" font-family="Gasoek One, sans-serif" font-size="12" fill="${INK}">T</text>`);
  return box('#E0533D', `<rect x="20" y="33" width="18" height="12" rx="3" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/><path d="M24 39h10" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`);
}

/** 노선 연장권: 노선도가 그려진 파란 표 */
export function lineArt() {
  return `<svg viewBox="0 0 58 78" aria-hidden="true"><rect x="2" y="2" width="54" height="74" rx="10" fill="#FFFDF7" ${S}/>
    <path d="M12 58V30q0-8 8-8h10q8 0 8 8v4" fill="none" stroke="#E0533D" stroke-width="5" stroke-linecap="round"/>
    <path d="M38 34v24" fill="none" stroke="#2F6BD8" stroke-width="5" stroke-linecap="round" stroke-dasharray="1 9"/>
    <circle cx="12" cy="58" r="4.5" fill="#FFFDF7" ${S} stroke-width="2.4"/><circle cx="38" cy="34" r="4.5" fill="#FFFDF7" ${S} stroke-width="2.4"/>
    <text x="40" y="66" text-anchor="middle" font-family="Gasoek One, sans-serif" font-size="16" fill="#2F6BD8">+1</text></svg>`;
}

/** 토큰 — 지하철 토큰(가운데 T) */
export function coin(size = 18) {
  return `<svg class="coin" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="#E9B949" stroke="${INK}" stroke-width="2"/><path d="M6.5 7h7M10 7v7" stroke="${INK}" stroke-width="2.2" stroke-linecap="round"/></svg>`;
}

/** 분실물 — 노란 손잡이가 달린 빨간 가방. 역에 잠깐 나타나는 보상. */
export function bundle(size = 34) {
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
    <path d="M14 13v-3q0-3 3-3h6q3 0 3 3v3" fill="none" stroke="${INK}" stroke-width="3" stroke-linecap="round"/>
    <rect x="6" y="13" width="28" height="20" rx="5" fill="#E0533D" ${S}/>
    <path d="M6 21h28" stroke="#A93524" stroke-width="2"/>
    <rect x="17" y="18" width="6" height="6" rx="1.5" fill="#F2B33D" stroke="${INK}" stroke-width="2"/>
  </svg>`;
}

/** 봉쇄 테이프 — 노랑·검정 줄무늬 띠 */
export function tape(size = 34) {
  return `<svg viewBox="0 0 40 28" width="${size}" height="${size * 0.7}" aria-hidden="true">
    <defs><pattern id="tp" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="4" height="8" fill="${INK}"/><rect x="4" width="4" height="8" fill="#F2B33D"/></pattern></defs>
    <rect x="2" y="8" width="36" height="12" rx="3" fill="url(#tp)" ${S} stroke-width="2.4" transform="rotate(-8 20 14)"/>
  </svg>`;
}

/** 도깨비 성격 표식: 사냥꾼은 발톱 자국, 도망꾼은 달리는 화살표. */
export function traitBadge(trait) {
  if (trait === 'hunter') {
    return `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/>
      <path d="M6.5 13.5l3-7M9.5 14l3-7M12.5 14.5l2-5" stroke="#E0533D" stroke-width="2.2" stroke-linecap="round"/></svg>`;
  }
  return `<svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/>
    <path d="M5.5 6.5l4 3.5-4 3.5M10.5 6.5l4 3.5-4 3.5" stroke="#2F6BD8" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>`;
}

/** 내 역 깃발 — 금빛 깃발에 별. 산 역마다 꽂힌다 */
export function ownerFlag(size = 34) {
  return `<svg class="flag-art" viewBox="0 0 40 48" width="${size}" height="${size * 1.2}" aria-hidden="true">
    <path d="M9 46V5" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path class="flag-cloth" d="M10 6h24l-6 8 6 8H10z" fill="#F2B33D" ${S}/>
    <path d="M19 9.5l1.6 3.3 3.6.5-2.6 2.5.6 3.6-3.2-1.7-3.2 1.7.6-3.6-2.6-2.5 3.6-.5z" fill="#FFFDF7" stroke="${INK}" stroke-width="1.4" stroke-linejoin="round"/>
    <ellipse cx="9" cy="46" rx="6" ry="2" fill="rgba(34,32,29,.3)"/>
  </svg>`;
}

/** 도깨비 역 깃발 — 보랏빛 깃발에 뿔 두 개 */
export function goblinFlag(size = 34) {
  return `<svg class="flag-art" viewBox="0 0 40 48" width="${size}" height="${size * 1.2}" aria-hidden="true">
    <path d="M9 46V5" stroke="${INK}" stroke-width="3.4" stroke-linecap="round"/>
    <path class="flag-cloth" d="M10 6h24l-6 8 6 8H10z" fill="#6B3FA0" ${S}/>
    <path d="M15 12l2-5 2 5M23 12l2-5 2 5" fill="#F2B33D" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>
    <circle cx="18" cy="15.5" r="1.6" fill="#FFFDF7"/><circle cx="24" cy="15.5" r="1.6" fill="#FFFDF7"/>
    <ellipse cx="9" cy="46" rx="6" ry="2" fill="rgba(34,32,29,.3)"/>
  </svg>`;
}
