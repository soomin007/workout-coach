// 휴식 끝 알림 계획 (core/restalarm.js). 실제 세션 전이를 거쳐 restTimer 를 만들고, 바뀔 때만 다시 예약하는지 본다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planRestAlarm, restAlarmKey, restEndAt, MIN_LEAD_MS } from '../../app/js/core/restalarm.js';
import { createStore, memoryLocal } from '../../app/js/core/store.js';
import * as T from '../../app/js/core/session.js';

const now = new Date(2026, 8, 30, 18);

function sessionWithTimer() {
  const store = createStore({ local: memoryLocal() });
  store.commit((s) => T.createSession(s, { part: 'pull', now }));
  store.commit((s) => T.beginSession(s, { now }));
  const e = store.state.session.exercises[0];
  store.commit((s) => T.toggleSetDone(s, e.uid, 0, { now }));
  return { store, e };
}

test('세트를 체크하면 끝 시각(시작 + 휴식 초)으로 예약한다', () => {
  const { store } = sessionWithTimer();
  const rt = store.state.session.restTimer;
  assert.ok(rt && rt.seconds > 0);
  const p = planRestAlarm(undefined, rt, { now: now.getTime(), body: '다음' });
  assert.equal(p.at, now.getTime() + rt.seconds * 1000);
  assert.equal(p.key, restAlarmKey(rt, '다음'));
});

test('같은 restTimer 면 시간이 흘러도, 끝 시각이 지나도 아무것도 하지 않는다 (끝나는 순간 알림을 지우지 않게)', () => {
  const { store } = sessionWithTimer();
  const rt = store.state.session.restTimer;
  const key = restAlarmKey(rt, 'x');
  assert.equal(planRestAlarm(key, rt, { now: now.getTime() + 5000, body: 'x' }), null);
  assert.equal(planRestAlarm(key, rt, { now: restEndAt(rt) + 60000, body: 'x' }), null);
});

test('+30 과 -15 는 키를 바꿔 새 끝 시각으로 다시 예약한다', () => {
  const { store, e } = sessionWithTimer();
  const before = restAlarmKey(store.state.session.restTimer, 'x');
  store.commit((s) => T.adjustRest(s, e.uid, 30));
  const rt = store.state.session.restTimer;
  const p = planRestAlarm(before, rt, { now: now.getTime(), body: 'x' });
  assert.equal(p.at, now.getTime() + rt.seconds * 1000);
  store.commit((s) => T.adjustRest(s, e.uid, -15));
  const p2 = planRestAlarm(p.key, store.state.session.restTimer, { now: now.getTime(), body: 'x' });
  assert.equal(p2.at, p.at - 15000);
});

test('건너뛰기와 세션 종료는 예약을 지운다 (at 이 null)', () => {
  const { store } = sessionWithTimer();
  const key = restAlarmKey(store.state.session.restTimer, 'x');
  store.commit((s) => T.stopRest(s));
  assert.deepEqual(planRestAlarm(key, store.state.session.restTimer, { now: now.getTime() }), { key: null, at: null });
  const { store: s2 } = sessionWithTimer();
  const k2 = restAlarmKey(s2.state.session.restTimer, 'x');
  s2.commit((s) => T.discardSession(s));
  assert.deepEqual(planRestAlarm(k2, s2.state.session?.restTimer || null, { now: now.getTime() }), { key: null, at: null });
});

test('다음 세트를 체크하면 새 restTimer 로 다시 예약한다', () => {
  const { store, e } = sessionWithTimer();
  const key = restAlarmKey(store.state.session.restTimer, 'x');
  const later = new Date(now.getTime() + 90000);
  store.commit((s) => T.toggleSetDone(s, e.uid, 1, { now: later }));
  const rt = store.state.session.restTimer;
  assert.equal(rt.setIndex, 1);
  const p = planRestAlarm(key, rt, { now: later.getTime(), body: 'x' });
  assert.equal(p.at, later.getTime() + rt.seconds * 1000);
});

test('휴식 중 다음 세트 글이 바뀌면 다시 예약하고, 이미 끝났거나 곧 끝나면 예약하지 않고 지운다', () => {
  const { store } = sessionWithTimer();
  const rt = store.state.session.restTimer;
  const p = planRestAlarm(restAlarmKey(rt, '60kg'), rt, { now: now.getTime(), body: '62.5kg' });
  assert.ok(p && p.at);
  const end = restEndAt(rt);
  assert.equal(planRestAlarm(undefined, rt, { now: end - MIN_LEAD_MS + 1 }).at, null);
  assert.equal(planRestAlarm(undefined, rt, { now: end + 1 }).at, null);
});

test('앱을 새로 띄운 직후(prevKey undefined)에는 휴식이 없어도 한 번 지운다 (지난 실행에서 남은 예약)', () => {
  assert.deepEqual(planRestAlarm(undefined, null), { key: null, at: null });
  assert.equal(planRestAlarm(null, null), null);
});
