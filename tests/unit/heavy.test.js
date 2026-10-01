// 무거운 날(근력 중심): 톱세트 + 백오프, 처방 분리, 공중량 표시.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { profileFor, prescribe, lastPerformance, heavyPrescribe, estimate1RM } from '../../app/js/core/coach.js';

const now = new Date(2026, 9, 5, 18, 0);
const set = (weight, reps, rir = null, extra = {}) => ({ type: 'main', weight, reps, rir, split: false, done: true, ...extra });
// 2026-10-01 실기록과 같은 스쿼트
const squat101 = { sessionId: 's1', date: '2026-10-01', part: 'lower', exerciseId: 'squat', name: '프리 스쿼트', sets: [set(80, 6), set(90, 5), set(100, 3, 2), set(100, 3, 2)], effort: 'ok' };

function strengthSession(state) {
  T.setCheck(state, { energy: 'good', minutes: 60, intensity: 'strength' }, { now });
  T.createSession(state, { part: 'lower', source: 'manual', now });
  return state.session.exercises;
}

test('추정 1RM: 100kg × 3회 RIR 2 → 약 116.7kg', () => {
  assert.equal(Math.round(estimate1RM(100, 3, 2) * 10) / 10, 116.7);
  assert.equal(estimate1RM(100, 15, 0), null, '12회 넘으면 추정하지 않음');
});

test('근력 중심: 첫 메인 운동만 톱세트 1 + 백오프, 10/1 기록 기준 97.5kg · 87.5kg, 휴식 240초', () => {
  const s = freshState();
  s.performance.push(squat101);
  const ex = strengthSession(s);
  const sq = ex[0];
  assert.equal(sq.exerciseId, 'squat');
  assert.equal(sq.heavy, true);
  const mains = sq.sets.filter((z) => z.type === 'main');
  assert.equal(mains[0].heavy, 'top');
  assert.deepEqual([mains[0].weight, mains[0].reps], [97.5, 4]);
  assert.ok(mains.slice(1).every((z) => z.heavy === 'backoff' && z.weight === 87.5 && z.reps === 6));
  assert.ok(mains.length - 1 >= 2 && mains.length - 1 <= 3);
  assert.equal(sq.restToday, 240);
  assert.ok(sq.sets.filter((z) => z.type === 'warmup').length >= 3, '워밍업을 더 올린다');
  assert.equal(ex.filter((e) => e.heavy).length, 1, '무거운 날은 한 운동만');
});

test('근력 중심이어도 세트 수를 늘리지 않는다', () => {
  const total = (st) => st.session.exercises.reduce((x, e) => x + e.sets.filter((z) => z.type === 'main').length, 0);
  const c = freshState();
  T.setCheck(c, { energy: 'good', minutes: 60, intensity: 'normal' }, { now });
  T.createSession(c, { part: 'lower', source: 'manual', now });
  const d = freshState();
  strengthSession(d);
  assert.equal(total(d), total(c));
});

test('톱세트 무게를 고치면 백오프는 90%로, 톱세트 결과가 3회 미만이면 85%로', () => {
  const s = freshState();
  s.performance.push(squat101);
  const sq = strengthSession(s)[0];
  const ti = sq.sets.findIndex((z) => z.heavy === 'top');
  T.editSet(s, sq.uid, ti, 'weight', 100);
  const e = s.session.exercises[0];
  assert.ok(e.sets.filter((z) => z.heavy === 'backoff').every((z) => z.weight === 90));
  assert.equal(e.sets[ti].reps, 4, '톱세트 반복은 그대로');
  T.editSet(s, sq.uid, ti, 'reps', 2);
  T.toggleSetDone(s, sq.uid, ti, { now });
  assert.ok(s.session.exercises[0].sets.filter((z) => z.heavy === 'backoff').every((z) => z.weight === 85));
  assert.match(s.session.exercises[0].coach, /무거웠습니다/);
});

test('무거운 날 기록은 평소 처방을 오염시키지 않고, 다음 무거운 날은 톱세트로 진행', () => {
  const s = freshState();
  s.performance.push({ sessionId: 'n', date: '2026-09-20', part: 'lower', exerciseId: 'squat', sets: [set(80, 8), set(80, 8), set(80, 8)], effort: 'ok' });
  s.performance.push({ sessionId: 'h', date: '2026-10-01', part: 'lower', exerciseId: 'squat', heavy: true, sets: [set(97.5, 5, 2, { heavy: 'top' }), set(87.5, 6, null, { heavy: 'backoff' }), set(87.5, 4, null, { heavy: 'backoff' })], effort: 'hard' });
  const p = profileFor(s, 'squat');
  const rx = prescribe(p, lastPerformance(s, 'squat', { heavy: false }));
  assert.equal(rx.kind, 'increase', '평소 처방은 9/20 기록 기준 (80×8 상한 → 증량)');
  assert.equal(rx.weight, 82.5);
  assert.equal(heavyPrescribe(p, s).weight, 100, '톱세트 5회 RIR 2 → 한 단계 올림');
  s.performance.at(-1).sets[0] = set(97.5, 4, 1, { heavy: 'top' });
  assert.equal(heavyPrescribe(p, s).weight, 97.5, '여유 없었으면 유지');
});

test('세션을 마치면 무거운 날 표시가 기록에 남는다', () => {
  const s = freshState();
  s.performance.push(squat101);
  const sq = strengthSession(s)[0];
  sq.sets.forEach((z, i) => { if (z.type === 'main') T.toggleSetDone(s, sq.uid, i, { now }); });
  T.finishSession(s, { now });
  const rec = s.performance.find((x) => x.sessionId === s.history.at(-1).id && x.exerciseId === 'squat');
  assert.equal(rec.heavy, true);
  assert.equal(rec.sets.find((z) => z.heavy === 'top').weight, 97.5);
});

test('레그프레스: 양쪽 원판 합계로 적고 5kg씩 올린다', () => {
  const s = freshState();
  const p = profileFor(s, 'legpress');
  assert.deepEqual([p.mode, p.inc], ['plates', 5]);
  assert.throws(() => T.setPref(s, 'legpress', { base: 50 }), '공중량 설정은 없다');
});
