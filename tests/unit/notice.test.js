// 운동 중 알림 (core/notice.js). 알림이 미리 보여 줄 단계가 실제 전이와 같은지, 잠긴 동안 누른 기록을 다시 적용한 결과가
// 그 시각에 앱에서 '다음 세트 기록'을 누른 것과 같은지 본다 (docs/research/notification_controls.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { noticePlan, applyNoticeEvents, nextOpenSet } from '../../app/js/core/notice.js';
import { holdSeconds } from '../../app/js/core/hold.js';

const now = new Date(2026, 10, 21, 18, 0);
const describe = (e, z, kind) => `${kind}:${e.name}:${z.type}:${z.weight ?? '-'}x${z.reps ?? '-'}`;

function started(part = 'pull') {
  const s = freshState();
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'normal' }, { now });
  T.createSession(s, { part, source: 'manual', now });
  T.beginSession(s, { now });
  return s;
}

// 운동마다 무게를 하나 정해 무게 찾기(정책 17절)를 끝낸 상태로 만든다. 찾기 중인 운동은 따로 시험한다.
// 첫 본세트 무게를 고치면 그 무게에서 워밍업이 다시 계산된다.
function settled(s) {
  for (const e of s.session.exercises) {
    if (!e.findWeight) continue;
    e.findWeight = false;
    const i = e.sets.findIndex((z) => z.type === 'main');
    if (e.loadMode !== 'bodyweight') T.editSet(s, e.uid, i, 'weight', 40);
  }
  return s;
}

test('세션이 없거나 시작 전이면 계획이 없다', () => {
  const s = freshState();
  assert.equal(noticePlan(s), null);
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'normal' }, { now });
  T.createSession(s, { part: 'pull', source: 'manual', now });
  assert.equal(noticePlan(s), null, '시작 전 화면에서는 알림을 띄우지 않는다');
});

// 같은 세션을 하나씩 실제로 완료해 보며, 단계의 세트, 글(무게와 반복), 휴식이 그때그때의 실제 상태와 같은지 본다
function sameAsLive(s) {
  const plan = noticePlan(s, { describe });
  const live = structuredClone(s);
  let k = 0;
  for (let n = nextOpenSet(live.session); n; n = nextOpenSet(live.session), k += 1) {
    const st = plan.steps[k];
    assert.deepEqual([st.uid, st.i], [n.e.uid, n.i], `${k}번째 단계`);
    assert.equal(st.text, describe(n.e, n.z, st.kind), `${k}번째 단계의 글`);
    if (st.kind === 'hold') T.recordHold(live, n.e.uid, n.i, { secs: st.secs }, { now });
    else T.toggleSetDone(live, n.e.uid, n.i, { now });
    assert.equal(st.rest, live.session.restTimer.seconds, `${k}번째 단계의 휴식`);
  }
  assert.equal(plan.steps.length, k, '남은 세트를 모두 담는다');
  assert.ok(plan.steps.every((st) => st.rest > 0), '단계마다 휴식이 있다');
  return plan;
}

test('단계는 화면의 다음 세트 순서이고, 단계마다의 휴식은 그 세트를 실제로 완료했을 때의 휴식과 같다', () => {
  const s = settled(started('pull'));
  const plan = sameAsLive(s);
  assert.equal(plan.sid, s.session.id);
  assert.equal(plan.ack, 0);
});

test('무거운 날도 톱세트를 끝낸 뒤의 백오프 무게와 휴식이 실제 전이와 같다', () => {
  const s = freshState();
  const set = (weight, reps, rir = null) => ({ type: 'main', weight, reps, rir, split: false, done: true });
  s.performance.push({ sessionId: 's1', date: '2026-10-01', part: 'lower', exerciseId: 'squat', name: '프리 스쿼트', sets: [set(80, 6), set(90, 5), set(100, 3, 2), set(100, 3, 2)], effort: 'ok' });
  T.setCheck(s, { energy: 'good', minutes: 60, intensity: 'strength' }, { now });
  T.createSession(s, { part: 'lower', source: 'manual', now });
  T.beginSession(s, { now });
  settled(s);
  assert.ok(s.session.exercises[0].heavy, '첫 운동이 무거운 날 운동이다');
  const plan = sameAsLive(s);
  assert.ok(plan.steps.some((st) => s.session.exercises[0].sets[st.i]?.heavy === 'backoff' && st.uid === s.session.exercises[0].uid));
});

test('워밍업 뒤에는 짧은 휴식, 본세트 뒤에는 운동의 휴식이 계획에 들어간다', () => {
  const s = settled(started('pull'));
  const e = s.session.exercises.find((x) => x.sets.some((z) => z.type === 'warmup'));
  assert.ok(e, '워밍업이 있는 운동이 있어야 한다');
  const plan = noticePlan(s, { describe });
  const warm = plan.steps.find((st) => st.uid === e.uid && e.sets[st.i].type === 'warmup');
  const main = plan.steps.find((st) => st.uid === e.uid && e.sets[st.i].type === 'main');
  assert.ok(warm.rest <= main.rest);
  assert.equal(main.rest, e.restToday ?? e.rest);
});

test('계획을 만들어도 원래 상태는 바뀌지 않는다', () => {
  const s = settled(started('push'));
  const before = JSON.stringify(s);
  noticePlan(s, { describe });
  assert.equal(JSON.stringify(s), before);
});

test('지금 휴식과 이미 적용한 기록 번호를 함께 넘긴다', () => {
  const s = settled(started('pull'));
  const n = nextOpenSet(s.session);
  T.toggleSetDone(s, n.e.uid, n.i, { now });
  s.session.noticeSeq = 7;
  const plan = noticePlan(s, { describe });
  assert.deepEqual(plan.rest, { startedAt: now.getTime(), seconds: s.session.restTimer.seconds });
  assert.equal(plan.ack, 7);
  assert.notDeepEqual([plan.steps[0].uid, plan.steps[0].i], [n.e.uid, n.i], '완료한 세트는 단계에서 빠진다');
});

test('무게 찾기 중인 운동은 세트 하나를 끝낸 뒤 느낌을 물어야 해서 계획이 거기서 멈춘다', () => {
  const s = started('pull');
  const e = s.session.exercises.find((x) => x.findWeight);
  assert.ok(e, '기록이 없으니 무게 찾기 운동이 있다');
  // 그 운동을 맨 앞으로 옮겨 첫 단계가 되게 한다
  T.moveExercise(s, e.uid, 0);
  const i = e.sets.findIndex((z) => z.type === 'main');
  T.editSet(s, e.uid, i, 'weight', 10);
  const plan = noticePlan(s, { describe });
  assert.equal(plan.steps[0].kind, 'set');
  assert.equal(plan.steps[1].kind, 'ask');
  assert.equal(plan.steps[1].uid, e.uid);
  assert.equal(plan.steps.length, 2);
  // 앱에서 이미 세트를 끝내고 느낌을 아직 고르지 않았으면 첫 단계부터 묻는다
  T.toggleSetDone(s, e.uid, i, { now });
  assert.equal(noticePlan(s, { describe }).steps[0].kind, 'ask');
  T.setFindFeel(s, e.uid, i, 'ok');
  assert.equal(noticePlan(s, { describe }).steps[0].kind, 'set', '느낌을 고르면 이어 간다');
});

test('버티기 세트는 hold 단계로, 목표 초와 앱 타이머와 같은 단계를 함께 넘긴다', () => {
  const s = settled(started('core'));
  const plan = noticePlan(s, { describe });
  const hold = plan.steps.find((st) => st.kind === 'hold');
  assert.ok(hold, '코어 세션에는 버티기 운동이 있다');
  const e = s.session.exercises.find((x) => x.uid === hold.uid);
  assert.equal(hold.secs, holdSeconds(e, e.sets[hold.i]));
  assert.deepEqual(hold.phases.map((p) => p.kind), e.unilateral ? ['prep', 'hold', 'switch', 'hold'] : ['prep', 'hold']);
  assert.equal(hold.phases[0].side, e.unilateral ? 'left' : null);
  s.settings.leftFirst = false;
  const right = noticePlan(s, { describe }).steps.find((st) => st.uid === hold.uid && st.i === hold.i);
  if (e.unilateral) assert.equal(right.phases[0].side, 'right', '설정의 시작 쪽을 따른다');
});

test('누른 기록을 다시 적용한 결과는 그 시각에 앱에서 다음 세트를 기록한 것과 같다', () => {
  const s = settled(started('push'));
  const plan = noticePlan(s, { describe });
  const direct = structuredClone(s);
  const events = [];
  let at = now.getTime();
  plan.steps.slice(0, 4).forEach((st, k) => {
    at += 95000 + k * 1000;
    events.push({ seq: 11 + k, sid: plan.sid, uid: st.uid, i: st.i, at, kind: st.kind, secs: st.secs });
    const n = nextOpenSet(direct.session);
    assert.deepEqual([n.e.uid, n.i], [st.uid, st.i]);
    T.toggleSetDone(direct, st.uid, st.i, { now: new Date(at) });
  });
  const r = applyNoticeEvents(s, events);
  assert.deepEqual(r, { applied: 4, missing: 0, stale: 0 });
  assert.equal(s.session.noticeSeq, 14);
  delete s.session.noticeSeq;
  assert.deepEqual(s.session, direct.session, '세트 간격, 휴식 타이머, 코칭 문구까지 같다');
  assert.equal(s.session.restTimer.startedAt, at, '휴식은 마지막으로 누른 시각에 시작한다');
});

test('같은 기록을 두 번 적용하지 않고, 앱에서 먼저 체크한 세트는 조용히 건너뛴다', () => {
  const s = settled(started('pull'));
  const [a, b] = noticePlan(s, { describe }).steps;
  const ev = [{ seq: 1, sid: s.session.id, uid: a.uid, i: a.i, at: now.getTime() + 60000, kind: 'set' }];
  assert.equal(applyNoticeEvents(s, ev).applied, 1);
  const once = JSON.stringify(s);
  assert.deepEqual(applyNoticeEvents(s, ev), { applied: 0, missing: 0, stale: 0 }, '앱이 적용 직후 꺼졌다 켜져도 다시 넣지 않는다');
  assert.equal(JSON.stringify(s), once);
  T.toggleSetDone(s, b.uid, b.i, { now });
  const r = applyNoticeEvents(s, [{ seq: 2, sid: s.session.id, uid: b.uid, i: b.i, at: now.getTime() + 120000, kind: 'set' }]);
  assert.deepEqual(r, { applied: 0, missing: 0, stale: 0 });
  assert.equal(s.session.exercises.find((e) => e.uid === b.uid).sets[b.i].done, true, '토글로 되돌리지 않는다');
  assert.equal(s.session.noticeSeq, 2);
});

test('다른 세션의 기록과 사라진 세트는 적용하지 않고 수만 센다', () => {
  const s = settled(started('pull'));
  const [a] = noticePlan(s, { describe }).steps;
  const r = applyNoticeEvents(s, [
    { seq: 3, sid: 'old-session', uid: a.uid, i: a.i, at: now.getTime(), kind: 'set' },
    { seq: 4, sid: s.session.id, uid: 'gone', i: 0, at: now.getTime(), kind: 'set' },
    { seq: 5, sid: s.session.id, uid: a.uid, i: 99, at: now.getTime(), kind: 'set' },
  ]);
  assert.deepEqual(r, { applied: 0, missing: 2, stale: 1 });
  assert.equal(s.session.noticeSeq, 5, '본 번호는 넘겨서 네이티브가 지우게 한다');
  assert.equal(nextOpenSet(s.session).e.uid, a.uid);
});

test('버티기 기록은 버틴 초로 적고(좌우면 좌우 따로) 그 시각에 휴식을 시작한다', () => {
  const s = settled(started('core'));
  const plan = noticePlan(s, { describe });
  const hold = plan.steps.find((st) => st.kind === 'hold');
  const e = s.session.exercises.find((x) => x.uid === hold.uid);
  // 앞 단계는 모두 처방대로 끝낸 것으로 하고, 버티기 하나는 덜 버텼다
  const until = plan.steps.indexOf(hold);
  const events = plan.steps.slice(0, until).map((st, k) => ({ seq: k + 1, sid: plan.sid, uid: st.uid, i: st.i, at: now.getTime() + k * 1000, kind: st.kind, secs: st.secs }));
  const end = now.getTime() + 600000;
  events.push(e.unilateral
    ? { seq: until + 1, sid: plan.sid, uid: hold.uid, i: hold.i, at: end, kind: 'hold', left: hold.secs, right: hold.secs - 4 }
    : { seq: until + 1, sid: plan.sid, uid: hold.uid, i: hold.i, at: end, kind: 'hold', secs: hold.secs - 4 });
  assert.equal(applyNoticeEvents(s, events).applied, events.length);
  const z = e.sets[hold.i];
  assert.equal(z.done, true);
  assert.equal(z.touched, true, '앱 타이머처럼 버틴 값을 직접 적은 것으로 본다');
  if (e.unilateral) assert.deepEqual([z.split, z.leftReps, z.rightReps], [true, hold.secs, hold.secs - 4]);
  else assert.equal(z.reps, hold.secs - 4);
  assert.equal(s.session.restTimer.startedAt, end);
});
