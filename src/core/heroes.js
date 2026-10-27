// 원정대 캐릭터 — 노선도를 지키는 역 직원들. 정기권처럼 훅으로만 건다 — round.js 는 캐릭터 이름을 모른다.
//
// 훅
//   score(ctx)        이동 한 번의 점수 계산 중. ctx.heroes = 이번에 움직인 말들의 캐릭터,
//                     ctx.groupHeroes = 도착 역에서 한 묶음이 된 말들 전부의 캐릭터
//   escape            잡혔을 때 하루 한 번 피한다(round.js 가 이 표시를 본다)
//
// 스킬(active): 플레이어가 눌러 쓰는 고유 기술. 하루 한 번, 그 캐릭터가 노선 위에 나와 있을 때
// 출발 전에 쓸 수 있다. 효과는 round.js 의 useSkill 이 active.id 로 풀어낸다.

export const HEROES = [
  {
    id: 'tiger', name: '호랑이', job: '기관사', skill: '돌파',
    desc: '호랑이가 도깨비 열차를 잡으면 배수 ×2',
    score(c) { if (c.captured > 0 && c.heroes.includes('tiger')) c.times(2, '호랑이 돌파'); },
    active: { id: 'roar', name: '경적', desc: '가장 앞선 도깨비 열차를 차고로 돌려보낸다' }
  },
  {
    id: 'rabbit', name: '토끼', job: '역무원', skill: '안전 요원',
    desc: '하루 한 번, 잡히는 대신 그 도깨비 열차를 차고로 돌려보낸다',
    escape: true,
    active: { id: 'hop', name: '추가 운행', desc: '한 번 더 달린다 — 이 운행은 시간이 들지 않는다' }
  },
  {
    id: 'parrot', name: '앵무새', job: '안내원', skill: '안내방송',
    desc: '움직일 때마다 칩 +15, 인파 몰린 역에 서면 칩 +40 더',
    score(c) {
      if (!c.heroes.includes('parrot')) return;
      c.chip(15, '앵무새 안내방송');
      if (c.incident === 'crowd') c.chip(40, '앵무새 안내방송');
    },
    active: { id: 'chatter', name: '승객 호출', desc: '역 두 곳에 인파를 부른다 — 멈추면 칩 +40' }
  },
  {
    id: 'panda', name: '판다', job: '보안관', skill: '만원 열차',
    desc: '판다가 낀 묶음은 함께 타기 배수 2배',
    score(c) { if (c.stack > 1 && c.groupHeroes.includes('panda')) c.mult(c.stack - 1, '판다 만원 열차'); },
    active: { id: 'shield', name: '스크린도어', desc: '다음 도깨비 차례 동안 내 말은 잡히지 않는다' }
  }
];

/** 내 말 id(m0~m3) → 캐릭터. 도깨비(d…)는 null. */
export function heroOf(pieceId) {
  if (!pieceId || pieceId[0] !== 'm') return null;
  return HEROES[Number(pieceId.slice(1)) % HEROES.length];
}

export const heroById = (id) => HEROES.find((h) => h.id === id);
