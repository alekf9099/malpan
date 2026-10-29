// 스킬 아이콘 — 역 사건·명소역 그림과 같은 굵은 먹선 + 납작한 색. viewBox 40×40.

const K = 'stroke="#22201D" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"';

const ART = {
  // 직통 열차: 열차 앞모습 + 번개 화살표
  direct: `<rect x="9" y="6" width="22" height="25" rx="7" fill="#2F6FD0" ${K}/><rect x="13" y="10" width="14" height="8" rx="2.5" fill="#BFE3F5" ${K}/>
    <circle cx="14.5" cy="24" r="2" fill="#F7C94A" ${K}/><circle cx="25.5" cy="24" r="2" fill="#F7C94A" ${K}/>
    <path d="M12 31l-3 5M28 31l3 5" fill="none" ${K}/><path d="M24 1l-6 8h5l-3 6" fill="none" stroke="#F2B33D" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 출입 통제: 줄무늬 차단기
  gate: `<rect x="5" y="14" width="6" height="22" rx="2" fill="#6E6A5E" ${K}/><rect x="9" y="12" width="28" height="8" rx="3" fill="#FFFDF7" ${K}/>
    <path d="M15 12l-4 8M23 12l-4 8M31 12l-4 8" stroke="#E0533D" stroke-width="3.4"/><rect x="9" y="12" width="28" height="8" rx="3" fill="none" ${K}/>
    <circle cx="8" cy="10" r="3.5" fill="#E0533D" ${K}/>`,
  // 회식 소집: 부딪히는 두 잔
  gather: `<path d="M5 13h12l-1.5 20a2 2 0 0 1-2 2H8.5a2 2 0 0 1-2-2z" fill="#F2B33D" ${K} transform="rotate(-12 11 24)"/>
    <path d="M23 13h12l-1.5 20a2 2 0 0 1-2 2h-5a2 2 0 0 1-2-2z" fill="#F2B33D" ${K} transform="rotate(12 29 24)"/>
    <path d="M4.5 13c1-3 4-4 6.5-3 2-2 5-1 6 1" fill="#FFFDF7" ${K} transform="rotate(-12 11 24)"/>
    <path d="M22.5 13c1-3 4-4 6.5-3 2-2 5-1 6 1" fill="#FFFDF7" ${K} transform="rotate(12 29 24)"/>
    <path d="M20 3v4M14 5l2 3M26 5l-2 3" stroke="#E0533D" stroke-width="2.6" stroke-linecap="round"/>`,
  // 벼락치기: 펼친 책 + 번개
  cram: `<path d="M4 11c5-2 11-2 16 2v22c-5-4-11-4-16-2z" fill="#FFFDF7" ${K}/><path d="M36 11c-5-2-11-2-16 2v22c5-4 11-4 16-2z" fill="#E7DCF5" ${K}/>
    <path d="M23 3l-6 11h5l-4 10 9-13h-5l3-8z" fill="#F2B33D" ${K}/>`,
  // 떡상: 치솟는 화살표 그래프 + 별
  hype: `<path d="M4 35h32" fill="none" ${K}/><path d="M6 30l8-8 6 4 12-14" fill="none" stroke="#22201D" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M6 30l8-8 6 4 12-14" fill="none" stroke="#E2588F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M25 9h9v9z" fill="#E2588F" ${K}/><path d="M10 6l1.5 3 3.2.5-2.3 2.2.6 3.2L10 13.4 7 15l.6-3.2-2.3-2.2 3.2-.5z" fill="#F7C94A" ${K}/>`,
  // 동시 배달: 겹친 상자 둘 + 속도선
  combo: `<path d="M2 17h7M4 23h6M2 29h7" stroke="#22201D" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="13" y="17" width="15" height="15" rx="2" fill="#C98A4B" ${K}/><rect x="21" y="8" width="15" height="15" rx="2" fill="#E3AD6F" ${K}/>
    <path d="M28.5 8v6M20.5 17v6" stroke="#22201D" stroke-width="2.2"/><path d="M24 36h12" stroke="#4C9A3A" stroke-width="3.4" stroke-linecap="round"/>`,
  // 수혈: 물방울 + 십자
  transfuse: `<path d="M20 3c5 8 12 14 12 22a12 12 0 0 1-24 0c0-8 7-14 12-22z" fill="#E0533D" ${K}/>
    <path d="M20 19v12M14 25h12" stroke="#FFFDF7" stroke-width="4" stroke-linecap="round"/><path d="M13 14c-1 2-2 4-2 6" stroke="#FFFDF7" stroke-width="2.4" stroke-linecap="round" opacity=".7"/>`,
  // 강제 매수: 경매 망치 + 받침
  buyout: `<rect x="5" y="31" width="20" height="5" rx="2" fill="#8A5A3B" ${K}/><path d="M17 20L32 35" stroke="#22201D" stroke-width="5.5" stroke-linecap="round"/>
    <path d="M17 20L32 35" stroke="#C98A4B" stroke-width="2.6" stroke-linecap="round"/>
    <rect x="8" y="5" width="12" height="20" rx="3" fill="#B97A47" ${K} transform="rotate(-45 14 15)"/><path d="M24 8h10M29 3v10" stroke="#F2B33D" stroke-width="2.6" stroke-linecap="round"/>`
};

/** 스킬 아이콘 svg 문자열 */
export const skillArt = (id, size = 28) =>
  `<svg class="sk-art" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${ART[id] || ''}</svg>`;
