import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalizeState } from '../../app/js/core/schema.js';
import { makeSet } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { profileFor, prescribeForOrder } from '../../app/js/core/coach.js';
import { fatigueClass } from '../../app/js/core/order.js';

const now = new Date(2026, 9, 10, 18, 0);
const done = (weight, reps, t) => ({ ...makeSet('main', weight, reps), done: true, doneAt: t });
const rec = (date, id, primary, secondary, sets, extra = {}) => ({ sessionId: `s_${date}`, date, part: 'pull', exerciseId: id, primary, secondary, range: id === 'pullup' ? [6, 10] : [8, 12], sets, ...extra });

// 10/3 과 같은 모양: 랫풀 → 로우 → 풀업 순으로 했고 풀업 마지막 세트가 7회.
function octThird() {
  const t0 = new Date(2026, 9, 3, 18).getTime(), m = 60000;
  return normalizeState({ ...freshState(), performance: [
    rec('2026-10-03', 'lat', ['back'], ['biceps'], [done(50, 9, t0), done(50, 9, t0 + 3 * m)]),
    rec('2026-10-03', 'row', ['back'], ['biceps'], [done(42.5, 10, t0 + 8 * m), done(42.5, 10, t0 + 11 * m), done(42.5, 10, t0 + 14 * m)]),
    rec('2026-10-03', 'pullup', ['back'], ['biceps'], [done(null, 10, t0 + 18 * m), done(null, 10, t0 + 21 * m), done(null, 7, t0 + 24 * m)]),
  ] });
}

test('소급: 완료 시각이 있는 옛 기록에 순서와 선행 피로를 채운다', () => {
  const s = octThird();
  const by = Object.fromEntries(s.performance.map((p) => [p.exerciseId, p]));
  assert.deepEqual([by.lat.order, by.row.order, by.pullup.order], [0, 1, 2]);
  assert.equal(by.lat.prefatigue, 0);
  assert.equal(by.pullup.prefatigue, 5);
  assert.equal(fatigueClass(by.pullup.prefatigue), 'fatigued');
});

test('지친 뒤 미달한 풀업을, 오늘 먼저 하면 퇴보로 읽지 않는다', () => {
  const s = octThird();
  const rx = prescribeForOrder(profileFor(s, 'pullup'), s, 0);
  assert.equal(rx.reps, 10);
  assert.equal(rx.shift, 'fatigued>fresh');
});

test('먼저 했던 랫풀을 같은 근육 뒤로 옮기면 무게는 두고 목표 반복을 낮춘다', () => {
  const s = octThird();
  T.createSession(s, { part: 'pull', now });
  s.session.exercises = ['lat', 'pullup'].map((id) => T.makeEntry(s, id, { part: 'pull', minutes: 60, setCount: 3 }));
  T.recalcEstimate(s);
  const lat = () => s.session.exercises.find((e) => e.exerciseId === 'lat');
  const before = lat().sets.find((z) => z.type === 'main');
  assert.equal(before.reps, 10);
  const changed = T.moveExercise(s, lat().uid, 1);
  // 풀업은 앞으로 와서 지친 기록 대신 첫 세트 기준(10회)으로, 랫풀은 뒤로 가서 낮춘 목표로
  assert.deepEqual(changed.map((e) => e.exerciseId).sort(), ['lat', 'pullup']);
  assert.equal(s.session.exercises[0].sets.find((z) => z.type === 'main').reps, 10);
  const after = lat().sets.find((z) => z.type === 'main');
  assert.equal(after.weight, 50);
  assert.equal(after.reps, 8);
  assert.equal(lat().prescription.kind, 'order_cut');
  // 다시 앞으로 옮기면 원래 처방으로
  T.moveExercise(s, lat().uid, 0);
  assert.equal(lat().sets.find((z) => z.type === 'main').reps, 10);
});

test('손댄 운동은 순서를 바꿔도 처방을 다시 쓰지 않는다', () => {
  const s = octThird();
  T.createSession(s, { part: 'pull', now });
  s.session.exercises = ['lat', 'pullup'].map((id) => T.makeEntry(s, id, { part: 'pull', minutes: 60, setCount: 3 }));
  T.recalcEstimate(s);
  const lat = s.session.exercises[0];
  const i = lat.sets.findIndex((z) => z.type === 'main');
  T.editSet(s, lat.uid, i, 'reps', 12);
  assert.ok(!T.moveExercise(s, lat.uid, 1).includes(lat));
  assert.equal(lat.sets[i].reps, 12);
});

test('종료하면 실제 수행 순서(완료 시각)로 순서와 선행 피로를 기록한다', () => {
  const s = freshState();
  T.createSession(s, { part: 'pull', now });
  s.session.exercises = ['pullup', 'lat'].map((id) => T.makeEntry(s, id, { part: 'pull', minutes: 60, setCount: 2 }));
  T.recalcEstimate(s);
  const [pu, lat] = s.session.exercises;
  // 카드는 풀업이 위지만 랫풀을 먼저 했다
  const mi = (e, k) => e.sets.map((z, j) => [z, j]).filter(([z]) => z.type === 'main')[k][1];
  let t = now.getTime();
  for (const k of [0, 1]) { T.editSet(s, lat.uid, mi(lat, k), 'weight', 40); T.toggleSetDone(s, lat.uid, mi(lat, k), { now: new Date(t += 120000) }); }
  for (const k of [0, 1]) T.toggleSetDone(s, pu.uid, mi(pu, k), { now: new Date(t += 120000) });
  T.finishSession(s, { now: new Date(t) });
  const by = Object.fromEntries(s.performance.map((p) => [p.exerciseId, p]));
  assert.equal(by.lat.order, 0);
  assert.equal(by.pullup.order, 1);
  assert.equal(by.pullup.prefatigue, 2);
});
