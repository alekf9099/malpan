// 원정대 캐릭터와 고유 능력. 부적처럼 훅으로만 건다 — round.js 는 캐릭터 이름을 모른다.
//
// 훅
//   score(ctx)    이동 한 번의 점수 계산 중. ctx.heroes = 이번에 움직인 말들의 캐릭터,
//                 ctx.groupHeroes = 도착 칸에서 한 묶음이 된 말들 전부의 캐릭터
//   escape        잡혔을 때 라운드에 한 번 도망친다(round.js 가 이 표시를 본다)
//   lootMultiplier 이 캐릭터가 주운 보따리의 엽전 배수

export const HEROES = [
  {
    id: 'tiger', name: '호랑이', skill: '맹공',
    desc: '호랑이가 도깨비를 잡으면 배수 ×2',
    score(c) { if (c.captured > 0 && c.heroes.includes('tiger')) c.times(2, '호랑이 맹공'); }
  },
  {
    id: 'rabbit', name: '토끼', skill: '꾀 많은 도망',
    desc: '라운드에 한 번, 잡히는 대신 그 도깨비를 출발로 쫓아낸다',
    escape: true
  },
  {
    id: 'parrot', name: '앵무새', skill: '반가운 소식',
    desc: '움직일 때마다 칩 +15, 주운 보따리는 엽전 2배',
    lootMultiplier: 2,
    score(c) { if (c.heroes.includes('parrot')) c.chip(15, '앵무새 소식'); }
  },
  {
    id: 'panda', name: '판다', skill: '든든한 등',
    desc: '판다가 낀 묶음은 업기 배수 2배',
    score(c) { if (c.stack > 1 && c.groupHeroes.includes('panda')) c.mult(c.stack - 1, '판다 등'); }
  }
];

/** 내 말 id(m0~m3) → 캐릭터. 도깨비(d…)는 null. */
export function heroOf(pieceId) {
  if (!pieceId || pieceId[0] !== 'm') return null;
  return HEROES[Number(pieceId.slice(1)) % HEROES.length];
}

export const heroById = (id) => HEROES.find((h) => h.id === id);
