import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ALL_STATIONS, LINE_STATIONS, STATION_XY, STATION_LINES, ADJ, dist, paths, isTransfer, spreadStations } from '../src/core/boards/seoul.js';
import { createRng } from '../src/core/rng.js';

test('서울 노선도: 역 200곳 넘게, 모두 이어져 있고, 역끼리 넉넉히 떨어져 있다', () => {
  assert.ok(ALL_STATIONS.length >= 200);
  for (const list of Object.values(LINE_STATIONS)) for (const n of list) assert.ok(STATION_XY[n], n);
  for (const n of ALL_STATIONS) assert.ok(dist('시청', n) < Infinity, n);
  for (let i = 0; i < ALL_STATIONS.length; i++) for (let j = i + 1; j < ALL_STATIONS.length; j++) {
    const [a, b] = [STATION_XY[ALL_STATIONS[i]], STATION_XY[ALL_STATIONS[j]]];
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) >= 1.15, `${ALL_STATIONS[i]}·${ALL_STATIONS[j]}`);
  }
  assert.deepEqual(STATION_LINES['종로3가'].sort(), [1, 3, 5]);
  assert.ok(ADJ['시청'].includes('충정로') && ADJ['시청'].includes('을지로입구'), '2호선은 순환선');
});

test('길: 왔던 역으로 바로 돌아가지 않고, 막힌 역은 피하고, 신호 장애 역에서 멈춘다', () => {
  for (const p of paths('서울역', '시청', 3)) assert.notEqual(p[0], '시청');
  for (const p of paths('서울역', null, 4, { avoid: new Set(['남영']) })) assert.ok(!p.includes('남영'));
  const stop = paths('신촌', '이대', 4, { stopAt: new Set(['홍대입구']) });
  assert.ok(stop.some((p) => p.at(-1) === '홍대입구' && p.length === 1));
  // 노선 끝역에서는 되돌아 나온다
  assert.ok(paths('오금', '경찰병원', 2).every((p) => p[0] === '경찰병원'));
});

test('출발역은 서로 멀리 떨어진 환승역', () => {
  const s = spreadStations(createRng(3), 4);
  assert.equal(new Set(s).size, 4);
  for (const n of s) assert.ok(isTransfer(n));
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) assert.ok(dist(s[i], s[j]) >= 5);
});
