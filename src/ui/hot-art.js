// 명소역 그림 — 판의 다른 그림처럼 굵은 먹선 + 납작한 색. viewBox 0 0 40 40.
// 노선도 간판(board-view), 역 정보·거래 카드·명소 카드(app)에서 같이 쓴다.

const K = '#22201D', W = '#FFFDF7', Y = '#F2B33D', R = '#E0533D', B = '#2EA6DA', G = '#3E9B6A', P = '#F2A7BB', O = '#F08A2E', V = '#8E6CC4', S = '#9AA7B4';
const line = `stroke="${K}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"`;

export const HOT_ART = {
  // KTX: 흰 몸통에 파란 띠, 뾰족한 코
  '서울역': `<path d="M3 29 H37" ${line} fill="none"/>
    <path d="M4 26 V15 Q4 11 9 11 H22 Q33 11 37 22 V26 Z" fill="${W}" ${line}/>
    <path d="M4 21 H36" stroke="${B}" stroke-width="3.2"/>
    <path d="M24 13 Q31 13 34 19 H24 Z" fill="${B}" ${line}/>
    <rect x="8" y="14" width="5" height="4" rx="1" fill="${B}" ${line}/><rect x="15" y="14" width="5" height="4" rx="1" fill="${B}" ${line}/>
    <circle cx="11" cy="27" r="2.2" fill="${K}"/><circle cx="28" cy="27" r="2.2" fill="${K}"/>`,
  // 비행기: 옆모습, 파란 몸통 · 노란 날개
  '김포공항': `<path d="M14 19 L23 19 L13 33 L8 33 Z" fill="${Y}" ${line}/>
    <path d="M5 22 L4 12 L8 12 L12 17 H31 Q37 17 37 20.5 Q37 24 31 24 H9 Z" fill="${B}" ${line}/>
    <path d="M17 17 L22 17 L16 9 L12 9 Z" fill="${Y}" ${line}/>
    <circle cx="27" cy="20.5" r="1.4" fill="${W}"/><circle cx="31" cy="20.5" r="1.4" fill="${W}"/><circle cx="23" cy="20.5" r="1.4" fill="${W}"/>`,
  // 고속버스: 초록 몸통, 큰 창
  '고속터미널': `<rect x="4" y="9" width="32" height="20" rx="4" fill="${G}" ${line}/>
    <rect x="7" y="12" width="7" height="7" rx="1.5" fill="${W}" ${line}/><rect x="16" y="12" width="7" height="7" rx="1.5" fill="${W}" ${line}/><rect x="25" y="12" width="8" height="10" rx="1.5" fill="${W}" ${line}/>
    <path d="M4 22 H23" stroke="${Y}" stroke-width="3"/>
    <circle cx="11" cy="29" r="3.4" fill="${K}"/><circle cx="29" cy="29" r="3.4" fill="${K}"/><circle cx="11" cy="29" r="1.2" fill="${S}"/><circle cx="29" cy="29" r="1.2" fill="${S}"/>`,
  // 기타 + 음표
  '홍대입구': `<path d="M21 17 L33 5" stroke="${K}" stroke-width="5" stroke-linecap="round"/><path d="M21 17 L33 5" stroke="${O}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M14 15 Q19 13 21 17 Q25 19 23 24 Q27 29 22 33 Q16 37 10 33 Q4 28 9 23 Q8 17 14 15 Z" fill="${R}" ${line}/>
    <circle cx="15.5" cy="25" r="3" fill="${K}"/><path d="M11 30 L19 22" stroke="${W}" stroke-width="1.6"/>
    <path d="M6 12 V5 L11 4 V10" fill="none" ${line}/><circle cx="4.8" cy="12" r="1.8" fill="${K}"/><circle cx="9.8" cy="10.5" r="1.8" fill="${K}"/>`,
  // 쇼핑백 두 개
  '명동': `<path d="M20 15 Q20 8 25.5 8 Q31 8 31 15" fill="none" ${line}/>
    <path d="M17 15 H34 L36 34 H15 Z" fill="${Y}" ${line}/>
    <path d="M9 18 Q9 12 13.5 12 Q18 12 18 18" fill="none" ${line}/>
    <path d="M6 18 H21 L22 35 H4 Z" fill="${P}" ${line}/>
    <path d="M10 25 Q13 28 16 25" fill="none" ${line}/>`,
  // 초고층 타워: 가늘게 솟은 유리 탑
  '잠실': `<path d="M20 2 L24 14 L26 37 H14 L16 14 Z" fill="${B}" ${line}/>
    <path d="M20 2 L20 37" stroke="${W}" stroke-width="1.6" opacity=".8"/>
    <path d="M16.5 20 H23.5 M15.8 27 H24.2 M15.2 33 H24.8" stroke="${K}" stroke-width="1.6"/>
    <path d="M6 37 H34" ${line}/>
    <path d="M9 37 V29 H13 V37 M27 37 V31 H31 V37" fill="${S}" ${line}/>`,
  // 동전 탑 + 오르는 화살표
  '여의도': `<ellipse cx="14" cy="31" rx="9" ry="3.5" fill="${Y}" ${line}/>
    <path d="M5 31 V26 M23 31 V26" ${line}/><ellipse cx="14" cy="26" rx="9" ry="3.5" fill="${Y}" ${line}/>
    <path d="M5 26 V21 M23 26 V21" ${line}/><ellipse cx="14" cy="21" rx="9" ry="3.5" fill="${Y}" ${line}/>
    <path d="M23 18 L29 12 L32 15 L37 7" fill="none" stroke="${G}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M32 6 H38 V12" fill="none" stroke="${G}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`,
  // 빌딩 숲
  '강남': `<rect x="4" y="16" width="10" height="21" fill="${S}" ${line}/>
    <rect x="14" y="5" width="12" height="32" fill="${B}" ${line}/>
    <rect x="26" y="12" width="10" height="25" fill="${V}" ${line}/>
    <path d="M17 10 H23 M17 15 H23 M17 20 H23 M17 25 H23 M17 30 H23" stroke="${W}" stroke-width="2"/>
    <path d="M7 21 H11 M7 26 H11 M7 31 H11 M29 17 H33 M29 22 H33 M29 27 H33" stroke="${W}" stroke-width="2"/>`,
  // 옷걸이에 걸린 원피스
  '동대문역사문화공원': `<path d="M20 4 Q23 4 23 7 Q23 9 20 10" fill="none" ${line}/>
    <path d="M20 10 L8 16 H32 Z" fill="none" ${line}/>
    <path d="M15 14 L13 20 L16 22 L9 36 H31 L24 22 L27 20 L25 14 Q20 17 15 14 Z" fill="${V}" ${line}/>
    <path d="M16 22 H24" stroke="${Y}" stroke-width="2.4"/>
    <circle cx="14" cy="31" r="1.3" fill="${W}"/><circle cx="20" cy="29" r="1.3" fill="${W}"/><circle cx="26" cy="31" r="1.3" fill="${W}"/>`,
  // 김 나는 그릇 + 젓가락
  '이태원': `<path d="M13 4 Q10 7 13 10 Q16 13 13 16 M20 3 Q17 6 20 9 Q23 12 20 15 M27 4 Q24 7 27 10 Q30 13 27 16" fill="none" stroke="${S}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M30 6 L22 22 M35 8 L25 23" stroke="${K}" stroke-width="2.4" stroke-linecap="round"/>
    <path d="M4 20 H36 Q35 32 26 35 H14 Q5 32 4 20 Z" fill="${R}" ${line}/>
    <path d="M9 25 Q14 28 20 25 Q26 22 31 25" fill="none" stroke="${W}" stroke-width="2"/>
    <path d="M14 35 H26 V37 H14 Z" fill="${K}"/>`,
  // 커피 잔
  '성수': `<path d="M14 4 Q11 7 14 10 M20 3 Q17 6 20 9 M26 4 Q23 7 26 10" fill="none" stroke="${S}" stroke-width="2.2" stroke-linecap="round"/>
    <path d="M29 17 Q36 17 36 22 Q36 28 28 28" fill="none" stroke="${K}" stroke-width="5"/><path d="M29 17 Q36 17 36 22 Q36 28 28 28" fill="none" stroke="${W}" stroke-width="2"/>
    <path d="M6 13 H31 L29 30 Q28 34 24 34 H13 Q9 34 8 30 Z" fill="${W}" ${line}/>
    <path d="M7 17 H30 L29.4 22 H7.6 Z" fill="#8A5A3B"/>
    <path d="M4 36 H33" ${line}/>`
};

/** 독립된 <svg> 하나(화면 곳곳에 넣을 때) */
export const hotArt = (n, size = 40) => HOT_ART[n]
  ? `<svg class="hot-art" viewBox="0 0 40 40" width="${size}" height="${size}" aria-hidden="true">${HOT_ART[n]}</svg>` : '';
