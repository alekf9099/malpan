// 그림은 전부 SVG 문자열로 만든다. 먹선 3px, 둥근 이음 — 손으로 오린 스티커 느낌을 통일한다.

import { COORDS, EDGES, BIG_NODES } from '../core/board.js';

const INK = '#22201D';
const S = `stroke="${INK}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"`;

function eyes(lx, rx, y, r = 2.6) {
  return `<circle cx="${lx}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${rx}" cy="${y}" r="${r}" fill="${INK}"/>` +
    `<circle cx="${lx + 0.9}" cy="${y - 0.9}" r="0.9" fill="#fff"/><circle cx="${rx + 0.9}" cy="${y - 0.9}" r="0.9" fill="#fff"/>`;
}
const blush = (lx, rx, y) => `<ellipse cx="${lx}" cy="${y}" rx="3.4" ry="2.2" fill="#E0533D" opacity=".35"/><ellipse cx="${rx}" cy="${y}" rx="3.4" ry="2.2" fill="#E0533D" opacity=".35"/>`;

/** 내 말 4종 — 민화 동물. 순서대로 m0~m3. */
export const HEROES = ['tiger', 'rabbit', 'magpie', 'turtle'];

const CHARACTERS = {
  tiger: () => `
    <circle cx="17" cy="17" r="7.5" fill="#F08A2B" ${S}/><circle cx="47" cy="17" r="7.5" fill="#F08A2B" ${S}/>
    <circle cx="17" cy="17" r="3.2" fill="#F6C9A0"/><circle cx="47" cy="17" r="3.2" fill="#F6C9A0"/>
    <ellipse cx="32" cy="36" rx="23" ry="20" fill="#F08A2B" ${S}/>
    <path d="M32 17v7M25.5 18.5l2 5.5M38.5 18.5l-2 5.5M10 33h6M10.5 39.5h5M54 33h-6M53.5 39.5h-5" ${S} fill="none"/>
    <ellipse cx="32" cy="44" rx="11" ry="8" fill="#FFF6E8" ${S}/>
    ${eyes(24, 40, 32)}
    <path d="M29 39.5h6l-3 3.2z" fill="${INK}" stroke="${INK}" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M28.5 45.5q3.5 3 7 0" ${S} stroke-width="2.2" fill="none"/>
    ${blush(18, 46, 41)}`,
  rabbit: () => `
    <ellipse cx="23" cy="15" rx="6.5" ry="14" transform="rotate(-12 23 15)" fill="#FFFDF7" ${S}/>
    <ellipse cx="41" cy="15" rx="6.5" ry="14" transform="rotate(12 41 15)" fill="#FFFDF7" ${S}/>
    <ellipse cx="23" cy="16" rx="2.6" ry="9" transform="rotate(-12 23 16)" fill="#F4A7A0"/>
    <ellipse cx="41" cy="16" rx="2.6" ry="9" transform="rotate(12 41 16)" fill="#F4A7A0"/>
    <ellipse cx="32" cy="40" rx="21" ry="18" fill="#FFFDF7" ${S}/>
    ${eyes(24, 40, 38)}
    <ellipse cx="32" cy="44" rx="2.4" ry="1.7" fill="#E0533D"/>
    <path d="M28.5 47q1.8 2.2 3.5 0q1.7 2.2 3.5 0" ${S} stroke-width="2" fill="none"/>
    ${blush(18, 46, 45)}`,
  magpie: () => `
    <path d="M20 40L3 55l4 3 18-12z" fill="#2F4A8A" ${S}/>
    <path d="M22 43L7 61l4 2 16-14z" fill="#26262E" ${S}/>
    <path d="M17 38q2-14 16-18q14-3 20 8q4 9-2 17q-8 9-22 6q-11-3-12-13z" fill="#26262E" ${S}/>
    <path d="M26 44q8 6 20 1q3-3 3-7q-11 6-23 6z" fill="#FFFDF7" ${S} stroke-width="2.4"/>
    <path d="M21 33q9-5 17 1q-4 7-14 7q-4-3-3-8z" fill="#2F4A8A" ${S} stroke-width="2.4"/>
    <path d="M24 34q6-2 11 1" stroke="#FFFDF7" stroke-width="3" stroke-linecap="round" fill="none"/>
    <circle cx="44" cy="27" r="3.4" fill="#FFFDF7" stroke="${INK}" stroke-width="2"/>
    <circle cx="45" cy="27" r="1.9" fill="${INK}"/><circle cx="45.7" cy="26.3" r=".7" fill="#fff"/>
    <path d="M52 27l9 2.5-8.5 3.5z" fill="#F2B33D" ${S} stroke-width="2.2"/>
    <path d="M33 54l-1 5M39 54l1 5" stroke="${INK}" stroke-width="2.4" stroke-linecap="round"/>
    <ellipse cx="47" cy="34" rx="3" ry="1.8" fill="#E0533D" opacity=".4"/>`,
  turtle: () => `
    <ellipse cx="17" cy="51" rx="6" ry="4" fill="#8CCB7E" ${S}/><ellipse cx="41" cy="52" rx="6" ry="4" fill="#8CCB7E" ${S}/>
    <circle cx="51" cy="29" r="10" fill="#8CCB7E" ${S}/>
    <path d="M7 44q2-22 24-22q22 0 24 22z" fill="#3E9B6A" ${S}/>
    <path d="M18 28l6 8h14l6-8M24 36l-3 8M38 36l3 8" stroke="#2A6D4A" stroke-width="2.4" stroke-linecap="round" fill="none"/>
    <path d="M7 44h48" ${S}/>
    ${eyes(48, 55, 27, 2.2)}
    <path d="M48 33q3 2 6 0" ${S} stroke-width="2" fill="none"/>`,
  dokkaebiRed: () => dokkaebi('#E0533D', '#A93524'),
  dokkaebiBlue: () => dokkaebi('#2F6BD8', '#1F4A9A')
};

function dokkaebi(face, dark) {
  return `
    <path d="M32 3l6 13H26z" fill="#F2B33D" ${S}/>
    <path d="M12 26q0-12 20-12t20 12v12q0 16-20 16T12 38z" fill="${face}" ${S}/>
    <path d="M16 18q-6 2-6 9M48 18q6 2 6 9" stroke="${dark}" stroke-width="4" stroke-linecap="round" fill="none"/>
    <path d="M18 24l9 3M46 24l-9 3" ${S} stroke-width="3.4"/>
    <circle cx="24" cy="32" r="5.5" fill="#FFFDF7" ${S} stroke-width="2.4"/><circle cx="40" cy="32" r="5.5" fill="#FFFDF7" ${S} stroke-width="2.4"/>
    <circle cx="25" cy="33" r="2.4" fill="${INK}"/><circle cx="39" cy="33" r="2.4" fill="${INK}"/>
    <path d="M20 42q12 9 24 0" fill="#7A2318" ${S} stroke-width="2.6"/>
    <path d="M24 43.5l2 4 2-3.2M40 43.5l-2 4-2-3.2" fill="#FFFDF7" stroke="${INK}" stroke-width="1.6" stroke-linejoin="round"/>`;
}

export function character(kind, size = 64) {
  return `<svg viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${CHARACTERS[kind]()}</svg>`;
}

/** 말 id → 그림 종류. 내 말은 m0~m3, 도깨비는 d0~d2. */
export function kindOf(pieceId) {
  if (pieceId[0] === 'm') return HEROES[Number(pieceId.slice(1)) % HEROES.length];
  return Number(pieceId.slice(1)) % 2 ? 'dokkaebiBlue' : 'dokkaebiRed';
}

/** 윷가락 하나. flat 이면 평평한 면(밝은 나무), 아니면 둥근 등(어두운 나무). marked 는 빽도 표시. */
export function stick(flat, marked) {
  const face = flat
    ? `<rect x="2" y="2" width="18" height="92" rx="9" fill="#F1D9A8" ${S}/>
       <path d="M8 20q3 30 0 60M14 14q-2 36 1 66" stroke="#D9B57A" stroke-width="1.6" fill="none"/>
       ${marked ? `<path d="M7 72l8 8M15 72l-8 8" stroke="#C8342A" stroke-width="3" stroke-linecap="round"/>` : ''}`
    : `<rect x="2" y="2" width="18" height="92" rx="9" fill="#A8652F" ${S}/>
       <rect x="6" y="8" width="4" height="78" rx="2" fill="#C98A4F" opacity=".8"/>`;
  return `<svg class="stick" viewBox="0 0 22 96" aria-hidden="true">${face}</svg>`;
}

/** 부적 — 노란 부적 종이에 붉은 글자 하나. */
export const CHARM_GLYPH = {
  ox: '소', magpie: '까', tiger: '범', shortcut: '길', backdo: '빽', mo: '모',
  reroll: '또', turtle: '거', goal: '끝', bat: '방', gambler: '윷', pouch: '복'
};

export function charmCard(id) {
  const g = CHARM_GLYPH[id] || '?';
  return `<svg viewBox="0 0 58 78" aria-hidden="true">
    <rect x="2" y="2" width="54" height="74" rx="6" fill="#F5D35E" ${S}/>
    <rect x="7" y="7" width="44" height="64" rx="3" fill="none" stroke="#C8342A" stroke-width="2"/>
    <path d="M12 16h34M12 62h34" stroke="#C8342A" stroke-width="1.6" stroke-dasharray="3 3"/>
    <text x="29" y="50" text-anchor="middle" font-family="Gasoek One, sans-serif" font-size="30" fill="#C8342A">${g}</text>
  </svg>`;
}

export function tileArt(id) {
  const box = (fill, inner) => `<svg viewBox="0 0 58 78" aria-hidden="true"><rect x="2" y="2" width="54" height="74" rx="10" fill="#FFFDF7" ${S}/><circle cx="29" cy="39" r="17" fill="${fill}" ${S}/>${inner}</svg>`;
  if (id === 'gold') return box('#F2B33D', `<path d="M29 28l3.3 6.8 7.4 1-5.4 5.2 1.3 7.4L29 44.9l-6.6 3.5 1.3-7.4-5.4-5.2 7.4-1z" fill="#FFFDF7" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/>`);
  if (id === 'luck') return box('#3E9B6A', `<circle cx="29" cy="39" r="9" fill="#E9B949" stroke="${INK}" stroke-width="2"/><rect x="26" y="36" width="6" height="6" fill="${INK}"/>`);
  return box('#E0533D', `<path d="M22 32l14 14M36 32L22 46" stroke="#FFFDF7" stroke-width="4" stroke-linecap="round"/>`);
}

export function stickArt(id) {
  const heavy = id === 'heavy';
  return `<svg viewBox="0 0 58 78" aria-hidden="true"><rect x="2" y="2" width="54" height="74" rx="10" fill="#FFFDF7" ${S}/>
    <g transform="translate(12 10) rotate(${heavy ? -8 : 8} 17 29)">
      <rect x="0" y="0" width="10" height="56" rx="5" fill="${heavy ? '#7A4A22' : '#F1D9A8'}" ${S} stroke-width="2.4"/>
      <rect x="12" y="0" width="10" height="56" rx="5" fill="${heavy ? '#7A4A22' : '#F1D9A8'}" ${S} stroke-width="2.4"/>
      <rect x="24" y="0" width="10" height="56" rx="5" fill="${heavy ? '#7A4A22' : '#F1D9A8'}" ${S} stroke-width="2.4"/>
    </g></svg>`;
}

export function coin(size = 18) {
  return `<svg class="coin" viewBox="0 0 20 20" width="${size}" height="${size}" aria-hidden="true"><circle cx="10" cy="10" r="8.2" fill="#E9B949" stroke="${INK}" stroke-width="2"/><rect x="7.6" y="7.6" width="4.8" height="4.8" fill="${INK}"/></svg>`;
}

// ── 윷판 ─────────────────────────────────────────────────────

export const BOARD_PAD = 28;
export const BOARD_SIZE = 328;

export function nodeXY(node) {
  const [x, y] = COORDS[node];
  const span = BOARD_SIZE - BOARD_PAD * 2;
  return [BOARD_PAD + x * span, BOARD_PAD + y * span];
}

const TILE_FILL = { gold: '#F2B33D', luck: '#3E9B6A', trap: '#E0533D' };

/** 무명 천 위에 먹선으로 그린 윷판. tiles 는 개조된 칸. */
export function boardSvg(tiles) {
  const lines = EDGES.map(([a, b]) => {
    const [x1, y1] = nodeXY(a), [x2, y2] = nodeXY(b);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
  }).join('');
  const nodes = Object.keys(COORDS).map((n) => {
    const [x, y] = nodeXY(n);
    const big = BIG_NODES.has(n);
    const tile = tiles[n];
    const fill = tile ? TILE_FILL[tile] : '#FFFDF7';
    let mark = '';
    if (tile === 'gold') mark = `<path transform="translate(${x} ${y}) scale(${big ? 0.8 : 0.55})" d="M0-9l2.6 5.4 5.9.8-4.3 4.1 1 5.9L0 4.4l-5.2 2.8 1-5.9-4.3-4.1 5.9-.8z" fill="#FFFDF7" stroke="${INK}" stroke-width="1.6"/>`;
    if (tile === 'luck') mark = `<rect x="${x - 3}" y="${y - 3}" width="6" height="6" fill="#FFFDF7" stroke="${INK}" stroke-width="1.5"/>`;
    if (tile === 'trap') mark = `<path d="M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8" stroke="#FFFDF7" stroke-width="2.6" stroke-linecap="round"/>`;
    return `<circle cx="${x}" cy="${y}" r="${big ? 15 : 9}" fill="${fill}" stroke="${INK}" stroke-width="3"/>` +
      (big && !tile ? `<circle cx="${x}" cy="${y}" r="7" fill="none" stroke="${INK}" stroke-width="2"/>` : '') + mark;
  }).join('');
  const [sx, sy] = nodeXY('o0');
  return `<svg class="mat" viewBox="0 0 ${BOARD_SIZE} ${BOARD_SIZE}" aria-hidden="true">
    <defs><pattern id="weave" width="6" height="6" patternUnits="userSpaceOnUse">
      <path d="M0 3h6M3 0v6" stroke="#D9C7A4" stroke-width=".8" opacity=".7"/></pattern></defs>
    <rect x="4" y="6" width="${BOARD_SIZE - 8}" height="${BOARD_SIZE - 8}" rx="22" fill="${INK}"/>
    <rect x="4" y="2" width="${BOARD_SIZE - 8}" height="${BOARD_SIZE - 8}" rx="22" fill="#EFE2C8" stroke="${INK}" stroke-width="3"/>
    <rect x="4" y="2" width="${BOARD_SIZE - 8}" height="${BOARD_SIZE - 8}" rx="22" fill="url(#weave)"/>
    <rect x="12" y="10" width="${BOARD_SIZE - 24}" height="${BOARD_SIZE - 24}" rx="16" fill="none" stroke="#B8A27A" stroke-width="2" stroke-dasharray="6 5"/>
    <g stroke="${INK}" stroke-width="3" stroke-linecap="round">${lines}</g>
    ${nodes}
    <text x="${sx - 26}" y="${sy - 18}" text-anchor="middle" font-family="Pretendard Variable, sans-serif" font-weight="900" font-size="11" fill="${INK}">출발</text>
  </svg>`;
}

/** 보따리 — 붉은 보자기에 노란 매듭. 판 위에 잠깐 나타나는 보상. */
export function bundle(size = 34) {
  return `<svg viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">
    <path d="M6 22q0-10 14-10t14 10q0 12-14 12T6 22z" fill="#E0533D" ${S}/>
    <path d="M10 22q4 2 6 7M30 22q-4 2-6 7" stroke="#A93524" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="14" cy="25" r="1.6" fill="#F2B33D"/><circle cx="26" cy="26" r="1.6" fill="#F2B33D"/><circle cx="20" cy="30" r="1.6" fill="#F2B33D"/>
    <path d="M13 13q-4-8 3-8q4 1 4 7q0-6 4-7q7 0 3 8" fill="#F2B33D" ${S} stroke-width="2.4"/>
    <circle cx="20" cy="13" r="3" fill="#F2B33D" ${S} stroke-width="2.4"/>
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
