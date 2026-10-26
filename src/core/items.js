// 상점에서 파는 물건. 효과는 훅으로만 건다 — 라운드 규칙(round.js)은 부적 이름을 모른다.
//
// 훅
//   score(ctx)       이동 한 번의 점수 계산 중. ctx.chip(n, 출처) / ctx.mult(n, 출처) / ctx.times(k, 출처)
//   roundStart(r)    라운드 시작. r.throwsLeft / r.rerolls 를 늘릴 수 있다
//   pFlat            윷가락 평평한 면 확률 보정(더한다)
//   roundWin(run)    라운드 승리 직후. run.coins 를 늘릴 수 있다

// 결과는 판마다 다르므로 등급으로 본다: 1 도·주사위 2~3·폰 / 2 개·4~5·킹 / 3 걸·6~8·나이트 / 4 윷·9~10·비숍·룩 / 5 모·11~12·퀸 / -1 빽도

export const CHARMS = [
  {
    id: 'ox', name: '황소 부적', price: 4, art: 'ox',
    desc: '2등급(개·주사위 4~5·킹)이 나오면 칩 +30',
    score(c) { if (c.tier === 2) c.chip(30, this.name); }
  },
  {
    id: 'magpie', name: '까치 부적', price: 5, art: 'magpie',
    desc: '업힌 말 하나마다 배수 +1 더',
    score(c) { if (c.stack > 1) c.mult(c.stack - 1, this.name); }
  },
  {
    id: 'tiger', name: '호랑이 부적', price: 6, art: 'tiger',
    desc: '도깨비를 잡으면 배수 ×2',
    score(c) { if (c.captured > 0) c.times(2, this.name); }
  },
  {
    id: 'shortcut', name: '지름길 부적', price: 5, art: 'shortcut',
    desc: '대각선으로 움직이면 배수 +2 (윷판 지름길·체스 대각선)',
    score(c) { if (c.onDiagonal) c.mult(2, this.name); }
  },
  {
    id: 'backdo', name: '빽도 부적', price: 4, art: 'backdo',
    desc: '빽도가 나오면 칩 +80, 배수 +2 (윷판 전용)',
    score(c) { if (c.tier === -1) { c.chip(80, this.name); c.mult(2, this.name); } }
  },
  {
    id: 'mo', name: '모 부적', price: 6, art: 'mo', pFlat: -0.06,
    desc: '모가 잘 나온다(윷판). 5등급(모·11~12·퀸)이면 칩 +40',
    score(c) { if (c.tier === 5) c.chip(40, this.name); }
  },
  {
    id: 'reroll', name: '한 번 더 부적', price: 4, art: 'reroll',
    desc: '라운드마다 다시 던지기 +1',
    roundStart(r) { r.rerolls += 1; }
  },
  {
    id: 'turtle', name: '거북 부적', price: 3, art: 'turtle',
    desc: '아직 출발 안 한 말 하나마다 칩 +10',
    score(c) { if (c.waiting > 0) c.chip(10 * c.waiting, this.name); }
  },
  {
    id: 'goal', name: '골인 부적', price: 5, art: 'goal',
    desc: '골인하면 배수 +4',
    score(c) { if (c.homed > 0) c.mult(4, this.name); }
  },
  {
    id: 'bat', name: '도깨비방망이', price: 7, art: 'bat',
    desc: '라운드마다 던질 기회 +1',
    roundStart(r) { r.throwsLeft += 1; }
  },
  {
    id: 'gambler', name: '윷쟁이 부적', price: 6, art: 'gambler',
    desc: '4등급(윷·주사위 9~10·비숍·룩)이면 배수 ×2',
    score(c) { if (c.tier === 4) c.times(2, this.name); }
  },
  {
    id: 'pouch', name: '복주머니', price: 4, art: 'pouch',
    desc: '라운드를 이기면 엽전 +3',
    roundWin(run) { run.coins += 3; }
  }
];

export const TILES = [
  { id: 'gold', name: '황금 칸', price: 5, desc: '내 말이 멈추면 배수 +2' },
  { id: 'luck', name: '복 칸', price: 3, desc: '내 말이 멈추면 엽전 +1' },
  { id: 'trap', name: '덫 칸', price: 4, desc: '도깨비가 멈추면 출발로 돌아간다' }
];

export const STICKS = [
  { id: 'heavy', name: '무거운 윷', price: 5, pFlat: 0.08, desc: '윷판에서 걸·윷이 잦아진다' },
  { id: 'light', name: '가벼운 윷', price: 5, pFlat: -0.08, desc: '윷판에서 도·모가 잦아진다' }
];

/** 보스(도깨비 대장)가 거는 규칙. round.js 가 id 로 분기한다. */
export const BOSS_RULES = [
  { id: 'noDo', name: '약한 수 무효', desc: '1등급(도·주사위 2~3·폰)이 나오면 움직이지 못한다' },
  { id: 'noStack', name: '업기 금지', desc: '업어도 배수가 오르지 않는다' },
  { id: 'fastOpp', name: '성급한 도깨비', desc: '도깨비가 두 번씩 던진다' },
  { id: 'halfChips', name: '구두쇠', desc: '모든 칩이 절반' }
];

export const charmById = (id) => CHARMS.find((c) => c.id === id);
