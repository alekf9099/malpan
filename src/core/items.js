// 역 매점에서 파는 물건. 효과는 훅으로만 건다 — 하루 운행 규칙(round.js)은 정기권 이름을 모른다.
//
// 훅
//   score(ctx)       이동 한 번의 점수 계산 중. ctx.chip(n, 출처) / ctx.mult(n, 출처) / ctx.times(k, 출처)
//   dayStart(r)      하루 운행 시작. r.end(막차 시각) / r.rerolls / r.blockadesLeft / r.tollRate / r.priceRate 를 바꿀 수 있다
//   dayWin(run)      하루를 목표대로 마친 직후. run.coins(토큰)를 늘릴 수 있다
//
// 열차 주사위 결과는 등급으로 본다: 1 = 1역 · 2 = 2역 · 3 = 3역 · 4 = 4~5역 · 5 = 급행

export const CHARMS = [
  {
    id: 'ox', name: '출퇴근 정기권', price: 4,
    desc: '2역이 나오면 칩 +30',
    score(c) { if (c.tier === 2) c.chip(30, this.name); }
  },
  {
    id: 'magpie', name: '단체 승차권', price: 5,
    desc: '함께 탄 말 하나마다 배수 +1 더',
    score(c) { if (c.stack > 1) c.mult(c.stack - 1, this.name); }
  },
  {
    id: 'tiger', name: '검표원 완장', price: 6,
    desc: '도깨비 열차를 잡으면 배수 ×2',
    score(c) { if (c.captured > 0) c.times(2, this.name); }
  },
  {
    id: 'shortcut', name: '환승 정기권', price: 5,
    desc: '달리는 중에 다른 호선으로 갈아타면 배수 +2',
    score(c) { if (c.onDiagonal) c.mult(2, this.name); }
  },
  {
    id: 'backdo', name: '완행 정기권', price: 4,
    desc: '1역이 나오면 칩 +40, 배수 +1',
    score(c) { if (c.tier <= 1) { c.chip(40, this.name); c.mult(1, this.name); } }
  },
  {
    id: 'mo', name: '급행 정기권', price: 6,
    desc: '급행이 나오면 칩 +40',
    score(c) { if (c.tier === 5) c.chip(40, this.name); }
  },
  {
    id: 'reroll', name: '시간표 정기권', price: 4,
    desc: '하루마다 다시 굴리기 +1',
    dayStart(r) { r.rerolls += 1; }
  },
  {
    id: 'turtle', name: '대합실 정기권', price: 3,
    desc: '아직 출발하지 않은 말 하나마다 칩 +10',
    score(c) { if (c.waiting > 0) c.chip(10 * c.waiting, this.name); }
  },
  {
    id: 'goal', name: '종착역 정기권', price: 5,
    desc: '골인하면 배수 +4',
    score(c) { if (c.homed > 0) c.mult(4, this.name); }
  },
  {
    id: 'bat', name: '연장 운행 정기권', price: 7,
    desc: '하루 운행이 1시간 늘어난다',
    dayStart(r) { r.end += 60; }
  },
  {
    id: 'gambler', name: '쾌속 정기권', price: 6,
    desc: '4~5역이 나오면 배수 ×2',
    score(c) { if (c.tier === 4) c.times(2, this.name); }
  },
  {
    id: 'pouch', name: '적립 카드', price: 4,
    desc: '하루를 목표대로 마치면 토큰 +3',
    dayWin(run) { run.coins += 3; }
  },
  {
    id: 'tape', name: '봉쇄 테이프 묶음', price: 5,
    desc: '하루마다 봉쇄 테이프 +1',
    dayStart(r) { r.blockadesLeft += 1; }
  },
  {
    id: 'lease', name: '임대 계약서', price: 6,
    desc: '내 역 통행료 +50%',
    dayStart(r) { r.tollRate *= 1.5; }
  },
  {
    id: 'deed', name: '등기 권리증', price: 5,
    desc: '역 값 25% 할인',
    dayStart(r) { r.priceRate *= 0.75; }
  }
];


/** 매점: 노선 연장권 — 다음 날 구간이 넓어진다 */
export const LINE_PASS = { id: 'linePass', name: '노선 연장권', price: 4, desc: '다음 날 구간이 넓어져 돌아가는 길이 늘어난다' };

/** 도깨비 차장이 거는 규칙(보스 날). round.js 가 id 로 분기한다. 금요일은 늘 운행 중지. */
export const CLOSURE_RULE = { id: 'closure', name: '운행 중지', desc: '호선 하나가 운행 중지 — 그 호선으로는 아무도 달릴 수 없다' };
export const BOSS_RULES = [
  { id: 'noDo', name: '서행 운전', desc: '1역이 나오면 움직이지 못한다' },
  { id: 'noStack', name: '합승 금지', desc: '함께 타도 배수가 오르지 않는다' },
  { id: 'fastOpp', name: '도깨비 급행', desc: '도깨비 열차가 두 번씩 달린다' },
  { id: 'halfChips', name: '요금 반값', desc: '모든 칩이 절반' }
];

export const charmById = (id) => CHARMS.find((c) => c.id === id);
