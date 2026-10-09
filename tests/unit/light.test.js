// 가볍게 한 날 (정책 16절): 처방에서 건너뛰고, 기록 · 볼륨에는 남는다. 10/9 실기록과 같은 모양.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { profileFor, prescribeForOrder, lighterThanUsual } from '../../app/js/core/coach.js';
import { muscleSets } from '../../app/js/core/plan.js';

const set = (weight, reps, rir = null) => ({ type: 'main', weight, reps, rir, split: false, done: true });
const rec = (sessionId, date, exerciseId, sets, extra = {}) => ({ sessionId, date, part: 'pull', exerciseId, name: exerciseId, primary: ['back'], secondary: [], sets, effort: 'ok', ...extra });

function withHistory({ light }) {
  const s = freshState();
  s.performance.push(rec('s1', '2026-10-03', 'lat', [set(50, 9), set(50, 9, 2)]));
  s.performance.push(rec('s2', '2026-10-09', 'lat', [set(27.5, 12), set(27.5, 12, 2)], light ? { light: true } : {}));
  return s;
}

test('가벼운 날 기록은 다음 처방에 쓰지 않는다: 10/3 50kg × 9 에서 잇는다', () => {
  const s = withHistory({ light: true });
  const rx = prescribeForOrder(profileFor(s, 'lat'), s, 0);
  assert.equal(rx.weight, 50);
  assert.equal(rx.kind, 'hold');
});

test('표시가 없으면 지금처럼 직전 기록 기준 (27.5kg 상한 달성 → 증량)', () => {
  const s = withHistory({ light: false });
  const rx = prescribeForOrder(profileFor(s, 'lat'), s, 0);
  assert.equal(rx.kind, 'increase');
  assert.ok(rx.weight < 50);
});

test('가벼운 기록밖에 없으면 그것이라도 쓴다', () => {
  const s = freshState();
  s.performance.push(rec('s2', '2026-10-09', 'lat', [set(27.5, 10)], { light: true }));
  assert.equal(prescribeForOrder(profileFor(s, 'lat'), s, 0).weight, 27.5);
});

test('가벼운 날 세트도 주간 볼륨에는 센다', () => {
  const s = withHistory({ light: true });
  assert.equal(muscleSets(s, 'back', new Date(2026, 9, 9, 20)), 4);
});

test('감지: 평소 최고 무게의 85% 미만인 운동이 비교 가능한 운동의 절반 이상이면 묻는다', () => {
  const s = withHistory({ light: false });
  s.performance = s.performance.filter((p) => p.sessionId === 's1');
  const ses = { date: '2026-10-09', exercises: [
    { exerciseId: 'lat', name: '랫풀다운', loadMode: 'machine', sets: [set(27.5, 12)] },
    { exerciseId: 'new_one', name: '처음', loadMode: 'machine', sets: [set(10, 20)] },
  ] };
  const r = lighterThanUsual(s, ses);
  assert.equal(r.compared, 1, '이전 기록 없는 운동은 비교에서 빠진다');
  assert.equal(r.suggest, true);
  assert.deepEqual(r.lighter[0], { name: '랫풀다운', was: 50, now: 27.5 });
});

test('감지: 실패 뒤 감량 처방(약 90%)은 가벼운 날로 묻지 않는다', () => {
  const s = withHistory({ light: false });
  s.performance = s.performance.filter((p) => p.sessionId === 's1');
  const ses = { date: '2026-10-09', exercises: [{ exerciseId: 'lat', name: '랫풀다운', loadMode: 'machine', sets: [set(45, 10)] }] };
  assert.equal(lighterThanUsual(s, ses).suggest, false);
});

test('완료 시 light 로 저장하면 history · performance 에 표시, 기록 수정으로 풀 수 있다', () => {
  const s = freshState();
  T.setCheck(s, { energy: 'normal', minutes: 45, intensity: 'normal' }, { now: new Date(2026, 9, 9, 18) });
  T.createSession(s, { part: 'pull', source: 'manual', now: new Date(2026, 9, 9, 18) });
  const e = s.session.exercises[0];
  e.sets.filter((z) => z.type === 'main').forEach((z) => { z.weight = 20; z.reps = 10; z.done = true; });
  const id = s.session.id;
  T.finishSession(s, { light: true, now: new Date(2026, 9, 9, 19) });
  assert.equal(s.history.at(-1).light, true);
  assert.ok(s.performance.filter((p) => p.sessionId === id).every((p) => p.light === true));
  T.setHistoryLight(s, id, false);
  assert.equal('light' in s.history.at(-1), false);
  assert.ok(s.performance.filter((p) => p.sessionId === id).every((p) => !('light' in p)));
});
