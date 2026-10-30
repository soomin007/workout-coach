// 기준일 (정책 21절): 깊이나 자세를 바꾼 운동은 prefs[id].since 부터 다시 잰다. 10/29 PT 에서 스쿼트를 깊게 바꾼 일.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { profileFor, prescribeForOrder, heavyPrescribe, lighterThanUsual, learnedWarmups, lastPerformance } from '../../app/js/core/coach.js';

const now = new Date(2026, 10, 2, 18);
const set = (weight, reps, extra = {}) => ({ type: 'main', weight, reps, rir: null, split: false, done: true, ...extra });
// 얕은 깊이로 든 실기록 (10/17)
const shallow = { sessionId: 'old', date: '2026-10-17', part: 'lower', exerciseId: 'squat', name: '프리 스쿼트',
  sets: [set(40, 8, { type: 'warmup', touched: true }), set(90, 5), set(90, 5)], effort: 'ok' };
const deep = { sessionId: 'new', date: '2026-11-05', part: 'lower', exerciseId: 'squat', name: '프리 스쿼트', sets: [set(50, 8), set(50, 7)], effort: 'ok' };

function withBaseline(...perfs) {
  const s = freshState();
  s.performance.push(...perfs);
  s.prefs.squat = { since: '2026-10-29' };
  return s;
}

test('기준일 전 기록만 있으면 첫 기록 처방, 이유를 안내에 붙인다', () => {
  const s = withBaseline(shallow);
  const rx = prescribeForOrder(profileFor(s, 'squat'), s, null);
  assert.equal(rx.kind, 'first');
  assert.equal(rx.weight, null);
  assert.match(rx.note, /^10\/29부터 깊이나 자세를 바꿔/);
  assert.equal(lastPerformance(s, 'squat'), null);
});

test('기준일이 없으면 예전대로 직전 기록에서 잇는다', () => {
  const s = freshState();
  s.performance.push(shallow);
  const rx = prescribeForOrder(profileFor(s, 'squat'), s, null);
  assert.equal(rx.weight, 90);
});

test('기준일 뒤 기록이 생기면 그 기록에서 잇고, 안내는 붙이지 않는다', () => {
  const s = withBaseline(shallow, deep);
  const rx = prescribeForOrder(profileFor(s, 'squat'), s, null);
  assert.equal(rx.weight, 50);
  assert.doesNotMatch(rx.note, /다시 재는/);
});

test('세션을 만들면 스쿼트는 무게 찾기로 시작한다', () => {
  const s = withBaseline(shallow);
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'normal' }, { now });
  T.createSession(s, { part: 'lower', source: 'manual', now });
  const sq = s.session.exercises.find((e) => e.exerciseId === 'squat');
  assert.ok(sq, '스쿼트가 처방에 있다');
  assert.equal(sq.findWeight, true);
  assert.ok(sq.sets.filter((z) => z.type === 'main').every((z) => z.weight === null));
});

test('무거운 날 추정도 기준일 전 기록을 쓰지 않는다', () => {
  const s = withBaseline(shallow);
  const rx = heavyPrescribe(profileFor(s, 'squat'), s);
  assert.equal(rx.kind, 'heavy_first');
  assert.match(rx.note, /다시 재는/);
  const s2 = withBaseline(shallow, deep);
  assert.ok(heavyPrescribe(profileFor(s2, 'squat'), s2).weight < 70, '새 깊이 50kg 기록 기준, 90kg 기록이 아니다');
});

test('워밍업 학습과 가벼운 날 감지도 기준일 전 기록을 보지 않는다', () => {
  const s = withBaseline(shallow);
  assert.equal(learnedWarmups(s, 'squat'), null);
  s.session = { date: '2026-11-05', exercises: [{ exerciseId: 'squat', name: '프리 스쿼트', loadMode: 'total', sets: [set(50, 8)] }] };
  const r = lighterThanUsual(s);
  assert.equal(r.compared, 0, '90kg 기록과 비교해 가벼운 날로 잡지 않는다');
});

test('설정에서 다른 값을 바꿔도 기준일은 남는다', () => {
  const s = withBaseline(shallow);
  T.setPref(s, 'squat', { rest: 120 });
  assert.equal(s.prefs.squat.since, '2026-10-29', 'setPref 는 기준일을 지우지 않는다');
});
