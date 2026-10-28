import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailyMissions, dayKey, nextAttend, ATTEND_REWARDS, MISSIONS } from '../src/core/missions.js';

test('일일 미션: 날마다 3개, 첫째는 대결 1판, 같은 날이면 같은 미션', () => {
  const a = dailyMissions('2026-10-28'), b = dailyMissions('2026-10-28');
  assert.equal(a.length, 3);
  assert.equal(a[0].id, 'play');
  assert.equal(new Set(a.map((m) => m.id)).size, 3);
  assert.deepEqual(a.map((m) => m.id), b.map((m) => m.id));
  const days = new Set(Array.from({ length: 20 }, (_, i) => dailyMissions(`2026-11-${String(i + 1).padStart(2, '0')}`).map((m) => m.id).join()));
  assert.ok(days.size > 5, '날마다 미션이 바뀐다');
  for (const m of MISSIONS) assert.ok(m.goal > 0 && m.reward > 0, m.id);
  assert.equal(dayKey(new Date(2026, 0, 5)), '2026-01-05');
});

test('출석: 7일 달력을 돌고 7일째가 가장 크다', () => {
  assert.deepEqual(nextAttend(0), { index: 0, reward: ATTEND_REWARDS[0] });
  assert.equal(nextAttend(6).reward, Math.max(...ATTEND_REWARDS));
  assert.equal(nextAttend(7).index, 0);
});
