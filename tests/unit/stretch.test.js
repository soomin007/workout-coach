// 코어 날 스트레칭 (정책 22절): 남는 시간을 채우고, 세트 수 · 처방 진행 · 근육 볼륨에는 넣지 않는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { buildPlan, replacementCandidates, muscleSets, weeklySets } from '../../app/js/core/plan.js';
import { profileFor, prescribe, prescribeForOrder } from '../../app/js/core/coach.js';
import { ALL_CATALOG } from '../../app/js/core/catalog.js';
import { exerciseImages } from '../../app/js/core/media.js';
import { guideFor } from '../../app/js/core/guide.js';

const now = new Date(2026, 10, 8, 10);
const STRETCHES = ALL_CATALOG.filter((x) => x.role === 'stretch');
const plan = (minutes, part = 'core', where = {}) => buildPlan(freshState(), part, minutes, now, where);
const stretchIds = (p) => p.planned.filter((x) => x.slot === 'stretch').map((x) => x.id);

test('카탈로그: 스트레칭은 코어에만 있고, 볼륨에 안 들어가게 primary 가 비어 있으며, 그림과 안내가 있다', () => {
  assert.ok(STRETCHES.length >= 3);
  for (const x of STRETCHES) {
    assert.equal(x.part, 'core', x.id);
    assert.deepEqual(x.primary, [], x.id);
    assert.ok(x.stretches?.length, x.id);
    assert.equal(x.measure, 'seconds', x.id);
    assert.equal(x.equipment, 'none', x.id);
    assert.equal(exerciseImages(x.id).length, 1, `${x.id} 그림`);
    assert.ok(guideFor(x.id)?.how?.length, `${x.id} 안내`);
  }
});

test('코어 45분: 운동 뒤에 햄스트링 스트레칭부터 붙고, 고른 시간을 넘지 않는다', () => {
  const p = plan(45);
  const ids = stretchIds(p);
  assert.equal(ids[0], 'hamstring_stretch_lying');
  assert.ok(ids.length >= 2, ids.join());
  const slots = p.planned.map((x) => x.slot);
  assert.ok(slots.indexOf('stretch') > slots.lastIndexOf('core_lateral'), '스트레칭은 맨 뒤');
  assert.ok(slots.slice(slots.indexOf('stretch')).every((x) => x === 'stretch'));
  assert.ok(p.estimatedMinutes <= Math.ceil(45 * 1.06), String(p.estimatedMinutes));
  assert.ok(p.planned.filter((x) => x.slot !== 'stretch').length <= 8);
});

test('코어는 시간을 늘리면 실제로 길어진다 (11/1 메모: 늘 32분 언저리)', () => {
  const est = [30, 45, 60].map((m) => plan(m).estimatedMinutes);
  assert.ok(est[0] < est[1] && est[1] < est[2], est.join());
});

test('코어 20분은 남는 만큼만: 핵심 4종목은 그대로 두고 스트레칭은 시간 안에서만', () => {
  const p = plan(20);
  assert.equal(p.planned.filter((x) => x.slot !== 'stretch').length, 4);
  assert.ok(p.estimatedMinutes <= Math.ceil(20 * 1.06), String(p.estimatedMinutes));
});

test('다른 부위에는 스트레칭을 넣지 않는다', () => {
  for (const part of ['push', 'pull', 'lower']) assert.deepEqual(stretchIds(plan(90, part)), [], part);
});

test('무릎 통증을 고른 날은 무릎 꿇는 스트레칭을 뺀다', () => {
  const s = freshState();
  T.setCheck(s, { pain: 'knee' }); // 오늘 확인한 값만 쓰이므로 실제 오늘 날짜로
  const p = buildPlan(s, 'core', 90, now);
  assert.ok(buildPlan(freshState(), 'core', 90, now).planned.some((x) => x.id === 'hip_flexor_stretch'), '평소에는 들어간다');
  assert.ok(!stretchIds(p).includes('hip_flexor_stretch'));
});

test('처방: 처음 45초, 그다음은 지난번 시간을 범위(30~60초) 안에서 그대로. 늘려 가지 않는다', () => {
  const s = freshState();
  const p = profileFor(s, 'hamstring_stretch_lying');
  assert.deepEqual([prescribe(p, null).kind, prescribe(p, null).reps], ['stretch', 45]);
  const rec = (secs) => ({ sets: secs.map((reps) => ({ type: 'main', weight: null, reps, done: true })), effort: null });
  assert.equal(prescribe(p, rec([60, 60])).reps, 60);
  assert.equal(prescribe(p, rec([50, 40])).reps, 40);
  assert.equal(prescribe(p, rec([90, 90])).reps, 60);
  assert.equal(prescribeForOrder(p, s, 0).kind, 'stretch');
});

test('세트 집계: 스트레칭 세트는 완료 세트 수와 코어 주간 세트에 들어가지 않는다', () => {
  const s = freshState();
  T.setCheck(s, { minutes: 45 }, { now });
  T.createSession(s, { part: 'core', now });
  assert.equal(s.session.minutes, 45);
  const st = s.session.exercises.find((e) => e.role === 'stretch');
  const cr = s.session.exercises.find((e) => e.role !== 'stretch');
  assert.ok(st && cr);
  assert.equal(st.prescription.kind, 'stretch');
  for (const e of [st, cr]) e.sets.forEach((z, i) => { if (z.type === 'main') T.toggleSetDone(s, e.uid, i, { now }); });
  const crSets = cr.sets.filter((z) => z.type === 'main').length;
  assert.equal(T.countWorkSets(s.session), crSets);
  T.finishSession(s, { now });
  assert.equal(s.history.at(-1).workSets, crSets);
  assert.equal(weeklySets(s, 'core', now), crSets);
  assert.equal(muscleSets(s, 'hamstring', now), 0);
});

test('교체: 스트레칭은 스트레칭끼리만 바꾼다', () => {
  const s = freshState();
  T.setCheck(s, { minutes: 60 }, { now });
  T.createSession(s, { part: 'core', now });
  const st = s.session.exercises.find((e) => e.role === 'stretch');
  const cr = s.session.exercises.find((e) => e.role !== 'stretch');
  assert.ok(replacementCandidates(s, st, now).every((x) => x.role === 'stretch'));
  assert.ok(replacementCandidates(s, cr, now).every((x) => x.role !== 'stretch'));
});
