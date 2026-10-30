// 캐릭터 아홉 — 서울 지하철에서 마주칠 법한 사람들. 넷은 처음부터, 다섯은 승차권으로 연다. 하나는 내가, 나머지는 AI 가 맡는다.
// 고유 능력(늘 켜짐)은 match.js 가 id 로 본다. 스킬은 주사위를 던질 때마다 1칸씩 차고(charge 칸 — 센 스킬일수록 길다),
// 다 차면 내 차례 굴리기 전에 쓴다. 쓰면 다시 0칸부터. target 이 있으면 역을 하나 고른다.
// loopDesc 는 고리 판(순환선 · 관광 맵)에서 달라지는 설명(목적지·통과 요금이 없는 판), tourDesc · tour 는 관광 맵에서 한 번 더 덮는 값.
// ai 는 AI 가 맡을 때의 성격(ai.js): reserve 남겨 둘 돈 · hub 환승역 선호 · chain 이어 사기 선호 · build 증축 선호(ai.loop 는 고리 판에서 덮는 값)
// 그림은 Kenney Mini Characters(CC0)를 찍은 스프라이트(assets/chars/<id>.webp, tools/render-chars.html)

export const HEROES = [
  {
    id: 'driver', name: '강철', job: '기관사', color: '#2F6FD0',
    skill: '기관사 수당', desc: '목적지 보너스 +60', loopDesc: '시청 월급 +130', tourDesc: '출발 칸 여비 +130',
    loop: { goalBonus: 130 },
    goalBonus: 60,
    active: { id: 'direct', name: '직통 열차', desc: '주사위 대신 지금 호선의 아무 역으로 바로', loopDesc: '주사위 대신 앞 8칸 중 원하는 칸으로 바로', charge: 4, loopCharge: 3, target: '갈 역' },
    ai: { name: '돌격형', reserve: 150, hub: 0, chain: 0.5, build: 0.6 }
  },
  {
    id: 'staff', name: '한별', job: '역무원', color: '#F08A2E',
    skill: '환승 할인', desc: '통행료·통과 요금 50% 할인', loopDesc: '통행료 10% 할인',
    loop: { tollDiscount: 0.1 },
    tollDiscount: 0.5,
    active: { id: 'gate', name: '출입 통제', desc: '내 역 1곳 · 3바퀴 동안 지나가는 상대를 세운다', loopDesc: '내 역 1곳 · 다음에 지나가는 상대 1명을 세운다(3바퀴)', charge: 3, loopCharge: 5, tourCharge: 6, target: '통제할 내 역' },
    ai: { name: '신중형', reserve: 250, hub: 0.3, chain: 0.7, build: 0.6 }
  },
  {
    id: 'worker', name: '김대리', job: '직장인', color: '#E0533D',
    skill: '러시아워 단골', desc: '인파 역 보너스 3배',
    crowdBonus: 3,
    active: { id: 'gather', name: '회식 소집', desc: '상대 전원을 내 역 1곳으로 · 모두 회식비', loopDesc: '상대 전원을 내 역 1곳으로 · 모두 회식비(한 명 50까지)', charge: 5, target: '회식 장소(내 역)' },
    ai: { name: '환승역 수집가', reserve: 220, hub: 1, chain: 0.3, build: 0.5 }
  },
  {
    id: 'student', name: '새내기', job: '대학생', color: '#8E5BC8',
    skill: '학생 할인', desc: '증축 비용 10% 할인', loopDesc: '증축 비용 15% 할인',
    loop: { buildDiscount: 0.15 },
    buildDiscount: 0.1,
    active: { id: 'cram', name: '벼락치기', desc: '비싼 내 역 2곳 무료 증축', charge: 4, loopCharge: 5 },
    ai: { name: '노선 건설가', reserve: 300, hub: 0.2, chain: 0.9, build: 0.6 }
  },
  // ── 승차권으로 여는 캐릭터(price). 잠겨 있어도 AI 상대로는 나온다 ──
  {
    id: 'youtuber', name: '하루', job: '여행 유튜버', color: '#E2588F', price: 100,
    skill: '명소 브이로그', desc: '명소역 도착 시 +30', loopDesc: '내 역 통행료 +25% · 명소역 도착 시 +80',
    loop: { hotBonus: 80, tollBonus: 0.25 },
    hotBonus: 30,
    active: { id: 'hype', name: '떡상', desc: '내 역 1곳 · 3바퀴 통행료 2배 · 모두의 목적지로', loopDesc: '내 역 1곳 · 다음에 지나가는 상대 1명을 끌어와 통행료를 받는다', charge: 4, loopCharge: 6, target: '떡상시킬 내 역' },
    ai: { name: '명소 사냥꾼', reserve: 220, hub: 0.5, chain: 0.3, build: 0.5, loop: { chain: 0.7, build: 0.7 } }
  },
  {
    id: 'rider', name: '번개', job: '배달 라이더', color: '#4C9A3A', price: 150,
    skill: '골목길', desc: '통과 요금 50% 할인', loopDesc: '지름길 탈 때마다 +60',
    passDiscount: 0.5,
    active: { id: 'combo', name: '동시 배달', desc: '주사위 하나 또는 둘의 합으로 · 통과 요금 없이', loopDesc: '주사위 하나 또는 둘의 합으로', charge: 3 },
    ai: { name: '질주형', reserve: 200, hub: 0.2, chain: 0.6, build: 0.4 }
  },
  {
    id: 'nurse', name: '보람', job: '간호사', color: '#17A2A8', price: 200,
    skill: '교대 근무', desc: '바퀴마다 +30 · 파산 시 1회 구조(300)', loopDesc: '바퀴마다 +10 · 파산 시 1회 구조(150)',
    loop: { shiftPay: 10, rescue: 150 },
    shiftPay: 30, rescue: 300,
    active: { id: 'transfuse', name: '수혈', desc: '자산 1등에게서 60 · 내가 꼴찌면 120', charge: 4, loopCharge: 5 },
    ai: { name: '버티기형', reserve: 120, hub: 0.3, chain: 0.6, build: 0.7 }
  },
  {
    id: 'foreman', name: '박소장', job: '현장소장', color: '#E39A1E', price: 250,
    skill: '환승센터', desc: '내 랜드마크에 서면 다른 내 랜드마크로 환승할 수 있다',
    transfer: true,
    active: { id: 'build', name: '착공', desc: '내 역 1곳 공사 · 2바퀴 뒤 랜드마크로 개통(공사 중엔 통행료 없음)', loopDesc: '내 역 1곳 공사 · 3바퀴 뒤 랜드마크로 개통(공사 중엔 통행료 없음)', charge: 3, loopCharge: 5, target: '공사할 내 역' },
    ai: { name: '개발형', reserve: 220, hub: 0.3, chain: 0.6, build: 0.8 }
  },
  {
    id: 'broker', name: '오사장', job: '부동산 중개인', color: '#8A5A3B', price: 300,
    skill: '중개 수수료', desc: '남의 거래마다 +6 · 인수 30% 할인', loopDesc: '남의 거래마다 +10 · 인수 30% 할인',
    loop: { commission: 10 },
    tour: { commission: 6 },
    commission: 6, takeoverDiscount: 0.3,
    active: { id: 'buyout', name: '강제 매수', desc: '남의 역 1곳을 30% 싸게 바로 인수(명소·랜드마크 빼고)', charge: 5, target: '사들일 역' },
    ai: { name: '인수 전문가', reserve: 260, hub: 0.4, chain: 0.7, build: 0.5 }
  }
];

/** 처음부터 열려 있는 캐릭터 */
export const STARTERS = HEROES.filter((h) => !h.price).map((h) => h.id);

export const heroById = (id) => HEROES.find((h) => h.id === id);

/** 관광 맵(고리 판 중 순환선이 아닌 것) */
export const isTour = (mode) => mode === 'korea' || mode === 'world';
/** 판에 맞는 설명. mode: false(노선도) · true/'loop'(순환선) · 'korea'/'world'(관광 맵 — tourDesc, 없으면 loopDesc) */
export const skillDesc = (h, mode = false) => (isTour(mode) && h.tourDesc) || (mode && h.loopDesc) || h.desc;
export const activeDesc = (h, mode = false) => (mode && h.active.loopDesc) || h.active.desc;
export const chargeOf = (h, mode = false) => (isTour(mode) && h.active.tourCharge) || (mode && h.active.loopCharge) || h.active.charge;
