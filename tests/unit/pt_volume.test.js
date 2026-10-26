// PT 볼륨 (정책 18절): 세트 수를 묻지 않고, 그 부위를 직접 한 최근 세션의 중앙값으로 친다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { typicalSets, weeklySets, muscleSets, autoEmphasis, POLICY } from '../../app/js/core/plan.js';

const now = new Date('2026-10-15T20:00:00');
const own = (id, date, workSets, extra = {}) => ({ id, date, part: 'lower', source: 'recommended', workSets, durationSec: 3000, note: '', overrideReason: '', performanceScore: null, volumeUnknown: false, ...extra });

test('세트 수 없이 기록한 PT 는 직접 한 세션 세트 수의 중앙값으로 주간 볼륨에 들어간다', () => {
  const s = freshState();
  s.history.push(own('a', '2026-09-20', 10), own('b', '2026-09-27', 14), own('c', '2026-10-04', 12), own('d', '2026-10-10', 4, { light: true }));
  T.logPT(s, { date: '2026-10-15', parts: ['lower'], note: '스쿼트' });
  assert.equal(s.history.at(-1).volumeUnknown, true);
  assert.equal(typicalSets(s, 'lower'), 12);
  assert.equal(weeklySets(s, 'lower', now), 4 + 12);
});

test('직접 한 기록이 없으면 PT 볼륨은 0으로 남는다', () => {
  const s = freshState();
  T.logPT(s, { date: '2026-10-15', parts: ['pull'] });
  assert.equal(weeklySets(s, 'pull', now), 0);
});

// PT 근육별 세트 (2026-10-26, 10/22 어깨 PT 가 어깨 주간 세트에 0으로 잡혔던 일)

const perf = (sessionId, date, part, exerciseId, n) => ({ sessionId, date, part, exerciseId, name: exerciseId, sets: Array.from({ length: n }, () => ({ type: 'main', done: true, weight: 10, reps: 10 })) });
const pushState = () => {
  const s = freshState();
  s.history.push({ ...own('p1', '2026-10-01', 12), part: 'push' });
  s.performance.push(perf('p1', '2026-10-01', 'push', 'bench', 6), perf('p1', '2026-10-01', 'push', 'lateral', 3), perf('p1', '2026-10-01', 'push', 'pushdown', 3));
  return s;
};

test('강조 없이 기록한 PT 는 평소 같은 부위 세션의 근육 비율대로 근육 세트에 들어간다', () => {
  const s = pushState();
  T.logPT(s, { date: '2026-10-15', parts: ['push'] });
  // 평소 세션: 가슴 6, 측면 3, 삼두 3(+벤치 간접 3) → 합 15 중 비율, PT 세트 12
  assert.ok(muscleSets(s, 'chest', now) > 0);
  assert.ok(muscleSets(s, 'side_delt', now) > 0);
  const total = ['chest', 'front_delt', 'side_delt', 'triceps'].reduce((a, m) => a + muscleSets(s, m, now), 0);
  assert.ok(Math.abs(total - 12) < 0.3);
});

test('어깨 강조 PT 는 세트의 절반을 전면 · 측면 어깨에 나눠 준다', () => {
  const s = pushState();
  T.logPT(s, { date: '2026-10-15', parts: ['push'], emphasis: { push: 'shoulder' } });
  assert.equal(s.history.at(-1).emphasis, 'shoulder');
  assert.equal(muscleSets(s, 'front_delt', now), 12 * POLICY.ptEmphasisShare / 2);
  assert.equal(muscleSets(s, 'side_delt', now), 12 * POLICY.ptEmphasisShare / 2);
});

test('PT 강조는 그 부위에 있는 것만 저장하고, 다음 밀기는 반대 강조를 고른다', () => {
  const s = pushState();
  T.logPT(s, { date: '2026-10-15', parts: ['push', 'core'], emphasis: { push: 'shoulder', core: 'chest' } });
  assert.deepEqual(s.history.filter((h) => h.source === 'pt').map((h) => h.emphasis), ['shoulder', null]);
  assert.equal(autoEmphasis(s, 'push', new Date('2026-10-17T10:00:00')).id, 'chest');
});

test('메모에서 옮겨 적은 PT 운동은 추정 대신 그 운동의 근육으로 센다', () => {
  const s = pushState();
  T.logPT(s, { date: '2026-10-15', parts: ['push'], emphasis: { push: 'shoulder' } });
  const h = s.history.at(-1);
  h.ptExercises = [
    { name: '덤벨 오버헤드 프레스', exerciseId: null, primary: ['front_delt'], secondary: ['side_delt', 'triceps'], sets: [{}, {}, {}] },
    { name: '케이블 리어델트 플라이', exerciseId: 'rear_cable', sets: [{}, {}] },
  ];
  assert.equal(muscleSets(s, 'front_delt', now), 3);
  assert.equal(muscleSets(s, 'side_delt', now), 1.5);
  assert.equal(muscleSets(s, 'rear_delt', now), 2);
  assert.equal(muscleSets(s, 'chest', now), 0);
});

test('PT 기록 수정에서 강조를 바꾸고, 부위를 바꾸면 맞지 않는 강조는 지운다', () => {
  const s = pushState();
  T.logPT(s, { date: '2026-10-15', parts: ['push'] });
  const id = s.history.at(-1).id;
  T.setHistoryEmphasis(s, id, 'triceps');
  assert.equal(s.history.at(-1).emphasis, 'triceps');
  T.updateHistoryPart(s, id, 'pull');
  assert.equal(s.history.at(-1).emphasis, null);
});
