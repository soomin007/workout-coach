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

test('시작 제안: 오늘 할 부위 근육통이 꽤 있음(2) 이상일 때만', async () => {
  const { recoverySuggested } = await import('../../app/js/core/coach.js');
  assert.equal(recoverySuggested({ upperDoms: '2', lowerDoms: 0 }, 'pull'), true);
  assert.equal(recoverySuggested({ upperDoms: 1, lowerDoms: 3 }, 'pull'), false, '다른 부위 근육통은 묻지 않는다');
  assert.equal(recoverySuggested({ lowerDoms: 3 }, 'lower'), true);
  assert.equal(recoverySuggested({ upperDoms: 3, lowerDoms: 3 }, 'core'), false);
});

test('가볍게 한 날로 시작: 평소 처방의 65% · 2세트 · 하한 반복 · 워밍업 없음 · 무거운 날 없음, 완료하면 light', () => {
  const s = withHistory({ light: true });
  const now = new Date(2026, 9, 10, 18);
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'strength', upperDoms: 2 }, { now });
  T.createSession(s, { part: 'pull', source: 'manual', now, recovery: true });
  assert.equal(s.session.recovery, true);
  assert.ok(s.session.exercises.every((e) => !e.heavy && e.sets.filter((z) => z.type === 'main').length === 2 && !e.sets.some((z) => z.type === 'warmup')));
  const lat = s.session.exercises.find((e) => e.exerciseId === 'lat');
  assert.ok(lat, "랫풀다운이 계획에 있다"); {
    const m = lat.sets.find((z) => z.type === 'main');
    assert.equal(m.weight, 30, '평소 처방 50kg 의 65% = 32.5 → 증량 단위(5)로 내림 30');
    assert.equal(m.reps, lat.range[0]);
    assert.equal(lat.prescription.kind, 'recovery');
  }
  T.regenerateSession(s, { now });
  assert.equal(s.session.recovery, true, '다시 추천해도 유지');
  for (const e of s.session.exercises) for (const z of e.sets) { z.done = true; if (z.weight === null) z.reps = z.reps ?? 10; }
  T.finishSession(s, { now });
  assert.equal(s.history.at(-1).light, true);
});
