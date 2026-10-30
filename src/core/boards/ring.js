// 고리 판 만들기 — 2호선 순환선 · 국내 여행 · 세계 일주가 같은 틀(32칸 고리, 한 방향)을 쓴다.
//   tiles   : 칸 id 32개(시계 방향, 0 = 출발). 칸 id 는 모든 판에서 겹치지 않아야 한다(값·찬스를 id 로 찾는다)
//   corners : { id: { kind: start|festival|express|maze, name, short, icon? } }
//   chance  : 찬스 칸 id 목록 · chanceName : 찬스 칸에 쓰는 이름
//   shortcuts : [[a, b, 색, 이름]] — 양쪽으로 탈 수 있는 지름길
//   groups  : { 이름: 색 } · groupOf : { 칸: 구역 이름 } — 칸 띠 색
//   prices  : { 칸: 값 } — 없으면 노선도 역 값(estate.stationPrice)
//   names   : { 칸: 판에 쓰는 이름 } · icons : { 칸: 그림 id }(ui/tour-art.js)
// 노선도 판의 지역(regionOf)과 같은 꼴({ stations, set, adj, dist })이라 규칙(match.js)이 거의 그대로 돈다.

export const RING_SIZE = 32;

export function makeRing(def) {
  const tiles = def.tiles, size = tiles.length;
  if (size !== RING_SIZE) throw new Error(`${def.id}: 칸이 ${size}개 — 32개여야 합니다`);
  const index = (n) => tiles.indexOf(n);
  const next = (n, k = 1) => tiles[(index(n) + k) % size];
  const adj = {};
  for (const n of tiles) adj[n] = [next(n)];
  for (const [a, b] of def.shortcuts) { adj[a].push(b); adj[b].push(a); }
  const D = {};
  const dist = (a, b) => {
    if (!D[a]) {
      const d = { [a]: 0 }, q = [a];
      while (q.length) { const n = q.shift(); for (const x of adj[n] || []) if (d[x] == null) { d[x] = d[n] + 1; q.push(x); } }
      D[a] = d;
    }
    return D[a][b] ?? Infinity;
  };
  return {
    ...def,
    loop: true,
    start: tiles[0],
    stations: tiles, set: new Set(tiles), adj, dist,
    chanceSet: new Set(def.chance),
    index, next,
    /** a 에서 앞으로 몇 칸 가야 b 인가(고리 방향) */
    ahead: (a, b) => (index(b) - index(a) + size) % size,
    /** 앞으로 1~k 칸 */
    forward: (n, k) => Array.from({ length: k }, (_, i) => next(n, i + 1)),
    shortcutOf: (a, b) => def.shortcuts.find(([x, y]) => (x === a && y === b) || (x === b && y === a)) || null,
    /** 연결(통행료 배수 · 노선 독점)을 셀 줄: 고리 하나 */
    chain: { [def.chainLine ?? 0]: [...tiles, tiles[0]] },
    nameOf: (n) => def.names?.[n] || n,
    colorOf: (n) => def.groups[def.groupOf?.[n]] || null
  };
}
