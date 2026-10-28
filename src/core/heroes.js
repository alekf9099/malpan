// 캐릭터 넷 — 서울 지하철에서 마주칠 법한 사람들. 하나는 내가, 나머지는 AI 가 맡는다.
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
    skill: '환승 할인', desc: '내가 내는 통행료·통과 요금 30% 할인',
    tollDiscount: 0.3,
    active: { id: 'again', name: '추가 운행', desc: '이번 차례가 끝나면 한 번 더 굴린다' },
    ai: { name: '신중형', reserve: 250, hub: 0.3, chain: 0.7, build: 0.6 }
  },
  {
    id: 'worker', name: '김대리', job: '직장인', color: '#E0533D',
    skill: '러시아워 단골', desc: '인파 몰린 역에 서면 받는 돈 2배',
    crowdBonus: 2,
    active: { id: 'call', name: '단체 회식', desc: '내 역 두 곳에 인파가 몰린다(통행료 2배)' },
    ai: { name: '환승역 수집가', reserve: 280, hub: 1, chain: 0.3, build: 0.5 }
  },
  {
    id: 'student', name: '새내기', job: '대학생', color: '#8E5BC8',
    skill: '학생 할인', desc: '증축 비용 10% 할인',
    buildDiscount: 0.1,
    active: { id: 'shield', name: '학생증', desc: '다음 통행료 한 번 면제' },
    ai: { name: '노선 건설가', reserve: 300, hub: 0.2, chain: 0.9, build: 0.6 }
  }
];

export const heroById = (id) => HEROES.find((h) => h.id === id);
