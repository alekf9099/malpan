// 캐릭터 여덟 — 서울 지하철에서 마주칠 법한 사람들. 넷은 처음부터, 넷은 승차권으로 연다. 하나는 내가, 나머지는 AI 가 맡는다.
// 패시브(늘 켜짐)는 match.js 가 id 로 본다. 스킬은 한 판에 두 번, 내 차례에 굴리기 전에 쓴다.
// ai 는 AI 가 맡을 때의 성격(ai.js): reserve 남겨 둘 돈 · hub 환승역 선호 · chain 이어 사기 선호 · build 증축 선호
// 그림은 Kenney Mini Characters(CC0)를 찍은 스프라이트(assets/chars/<id>.webp, tools/render-chars.html)

export const SKILL_USES = 2;

export const HEROES = [
  {
    id: 'driver', name: '강철', job: '기관사', color: '#2F6FD0',
    skill: '기관사 수당', desc: '목적지에 닿으면 보너스 +60',
    goalBonus: 60,
    active: { id: 'dash', name: '급행 운행', desc: '이번 굴림에 3역 더 간다' },
    ai: { name: '돌격형', reserve: 150, hub: 0, chain: 0.5, build: 0.6 }
  },
  {
    id: 'staff', name: '한별', job: '역무원', color: '#F08A2E',
    skill: '환승 할인', desc: '내가 내는 통행료·통과 요금 반값',
    tollDiscount: 0.5,
    active: { id: 'again', name: '추가 운행', desc: '이번 차례가 끝나면 한 번 더 굴린다' },
    ai: { name: '신중형', reserve: 250, hub: 0.3, chain: 0.7, build: 0.6 }
  },
  {
    id: 'worker', name: '김대리', job: '직장인', color: '#E0533D',
    skill: '러시아워 단골', desc: '인파 몰린 역에 서면 받는 돈 3배',
    crowdBonus: 3,
    active: { id: 'call', name: '단체 회식', desc: '내 역 두 곳에 인파가 몰린다(통행료 2배)' },
    ai: { name: '환승역 수집가', reserve: 220, hub: 1, chain: 0.3, build: 0.5 }
  },
  {
    id: 'student', name: '새내기', job: '대학생', color: '#8E5BC8',
    skill: '학생 할인', desc: '증축 비용 10% 할인',
    buildDiscount: 0.1,
    active: { id: 'shield', name: '학생증', desc: '다음 통행료 한 번 면제' },
    ai: { name: '노선 건설가', reserve: 300, hub: 0.2, chain: 0.9, build: 0.6 }
  },
  // ── 승차권으로 여는 캐릭터(price). 잠겨 있어도 AI 상대로는 나온다 ──
  {
    id: 'youtuber', name: '하루', job: '여행 유튜버', color: '#E2588F', price: 100,
    skill: '명소 브이로그', desc: '명소역에 서면 +30',
    hotBonus: 30,
    active: { id: 'live', name: '생방송', desc: '다음에 서는 명소역에서 후원 +120' },
    ai: { name: '명소 사냥꾼', reserve: 220, hub: 0.5, chain: 0.3, build: 0.5 }
  },
  {
    id: 'rider', name: '번개', job: '배달 라이더', color: '#4C9A3A', price: 150,
    skill: '골목길', desc: '남의 역을 지나갈 때 통과 요금 반값',
    passDiscount: 0.5,
    active: { id: 'boost', name: '콜 몰림', desc: '이번 굴림이 2배' },
    ai: { name: '질주형', reserve: 200, hub: 0.2, chain: 0.6, build: 0.4 }
  },
  {
    id: 'nurse', name: '보람', job: '간호사', color: '#17A2A8', price: 200,
    skill: '교대 근무', desc: '한 바퀴 돌 때마다 수당 +15, 파산할 뻔하면 한 번은 빚을 털고 300으로 버틴다',
    shiftPay: 15, rescue: 300,
    active: { id: 'aid', name: '응급 처치', desc: '내 역 하나(가장 싼 역)를 들인 값 그대로 돈으로 바꾼다' },
    ai: { name: '버티기형', reserve: 120, hub: 0.3, chain: 0.6, build: 0.7 }
  },
  {
    id: 'broker', name: '오사장', job: '부동산 중개인', color: '#8A5A3B', price: 300,
    skill: '중개 수수료', desc: '다른 사람이 역을 사거나 인수할 때마다 +10, 내 인수 값 30% 할인',
    commission: 10, takeoverDiscount: 0.3,
    active: { id: 'deal', name: '급매 협상', desc: '이번 차례에 선 남의 역을 들인 값 그대로(보통 1.5배) 인수할 수 있다' },
    ai: { name: '인수 전문가', reserve: 260, hub: 0.4, chain: 0.7, build: 0.5 }
  }
];

/** 처음부터 열려 있는 캐릭터 */
export const STARTERS = HEROES.filter((h) => !h.price).map((h) => h.id);

export const heroById = (id) => HEROES.find((h) => h.id === id);
