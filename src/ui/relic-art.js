// 원정 유물 그림(SVG). 동그란 배지 + 굵은 선 그림 하나 — 캐릭터 그림과 같은 먹선.

const INK = '#22201D';
const ART = {
  cash: ['#F2B33D', '<rect x="9" y="15" width="30" height="20" rx="3" fill="#FFFDF7"/><path d="M9 17 L24 28 L39 17"/><circle cx="24" cy="30" r="3.5" fill="#F2B33D"/>'],
  toll: ['#F7C94A', '<path d="M12 36 V16 M36 36 V16" stroke-width="4"/><rect x="10" y="12" width="28" height="6" rx="2" fill="#FFFDF7"/><path d="M15 26 H33" stroke-width="4" stroke="#E0533D"/>'],
  shield: ['#2EA6DA', '<rect x="10" y="14" width="28" height="20" rx="4" fill="#FFFDF7"/><path d="M10 21 H38" stroke-width="4" stroke="#2EA6DA"/><path d="M15 28 H25"/>'],
  build: ['#F2733D', '<path d="M14 34 L28 20" stroke-width="5"/><path d="M26 14 Q34 10 36 18 L31 19 L29 23 L33 25 Q28 32 22 24 Z" fill="#FFFDF7"/>'],
  deal: ['#8A63D2', '<rect x="13" y="11" width="22" height="27" rx="3" fill="#FFFDF7"/><path d="M18 19 H30 M18 25 H30 M18 31 H25"/><path d="M13 15 H10 M13 23 H10 M13 31 H10" stroke-width="3"/>'],
  buy: ['#2FA84F', '<circle cx="18" cy="24" r="7" fill="#FFFDF7"/><path d="M25 24 H38 M33 24 V30 M37 24 V28" stroke-width="3.5"/><circle cx="18" cy="24" r="2.5" fill="' + INK + '"/>'],
  salary: ['#F2B33D', '<ellipse cx="24" cy="32" rx="12" ry="4" fill="#FFFDF7"/><ellipse cx="24" cy="26" rx="12" ry="4" fill="#FFFDF7"/><ellipse cx="24" cy="20" rx="12" ry="4" fill="#F7C94A"/><path d="M24 17 V23"/>'],
  fee: ['#E2337A', '<circle cx="17" cy="17" r="4.5" fill="#FFFDF7"/><circle cx="31" cy="31" r="4.5" fill="#FFFDF7"/><path d="M33 13 L15 35" stroke-width="4"/>'],
  rescue: ['#E0533D', '<rect x="11" y="11" width="26" height="26" rx="6" fill="#FFFDF7"/><path d="M24 16 V32 M16 24 H32" stroke-width="5" stroke="#E0533D"/>'],
  coupon: ['#2FA84F', '<path d="M9 16 H39 V21 Q35 24 39 27 V32 H9 V27 Q13 24 9 21 Z" fill="#FFFDF7"/><path d="M20 16 V32" stroke-dasharray="2 3"/><path d="M25 24 H34"/>'],
  battery: ['#2EA6DA', '<rect x="10" y="15" width="25" height="18" rx="3" fill="#FFFDF7"/><rect x="35" y="20" width="4" height="8" rx="1" fill="' + INK + '"/><rect x="14" y="19" width="6" height="10" fill="#2FA84F" stroke="none"/><rect x="21.5" y="19" width="6" height="10" fill="#2FA84F" stroke="none"/>'],
  spark: ['#F7C94A', '<path d="M27 9 L14 27 H23 L20 39 L34 20 H25 Z" fill="#FFFDF7" stroke-linejoin="round"/>']
};

/** 유물 배지 그림 */
export function relicArt(id, size = 40) {
  const [bg, body] = ART[id] || ['#C9C0B2', '<circle cx="24" cy="24" r="6" fill="#FFFDF7"/>'];
  return `<svg viewBox="0 0 48 48" width="${size}" height="${size}" aria-hidden="true"><circle cx="24" cy="24" r="21" fill="${bg}" stroke="${INK}" stroke-width="3"/>
    <g fill="none" stroke="${INK}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`;
}

/** 목숨 하트 */
export function heartArt(on, size = 22) {
  return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="M12 20 C4 14 3 10 4.5 7.5 C6 5 9.5 5 12 8.2 C14.5 5 18 5 19.5 7.5 C21 10 20 14 12 20 Z" fill="${on ? '#E0533D' : '#EADCC4'}" stroke="${INK}" stroke-width="2" stroke-linejoin="round"/></svg>`;
}
