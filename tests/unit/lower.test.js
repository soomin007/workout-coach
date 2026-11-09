// 11/9 하체 메모: 세트 중간에 낮춘 무게(정책 2절), 싱글 레그프레스를 계획에서 빼기, 좌우 운동의 양쪽 사이 휴식(정책 23절).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { buildPlan, replacementCandidates, estimateMinutes, SIDE_REST } from '../../app/js/core/plan.js';
import { profileFor, prescribe, prescribeForOrder, afterLowering } from '../../app/js/core/coach.js';
import { ALL_CATALOG, EMPHASIS } from '../../app/js/core/catalog.js';
import { guideFor } from '../../app/js/core/guide.js';

const now = new Date(2026, 10, 11, 18);
const rec = (exerciseId, sets, extra = {}) => ({
  sessionId: 's', date: '2026-11-09', part: 'lower', exerciseId, name: exerciseId,
  sets: sets.map(([weight, reps]) => ({ type: 'main', weight, reps, rir: null, split: false, done: true })), effort: null, ...extra,
});

test('세트 중간에 낮춘 무게: 85kg가 아파서 70kg로 낮췄으면 다음 처방은 70kg에서 잇는다 (11/9 어브덕션 메모)', () => {
  const p = profileFor(freshState(), 'abduction');
  const r = prescribe(p, rec('abduction', [[85, 16], [70, 15]], { effort: 'hard' }));
  assert.deepEqual([r.kind, r.weight, r.reps], ['hold', 70, 15]);
  assert.match(r.note, /85kg에서 70kg로 낮췄으니/);
});

test('낮추지 않았으면 그대로: 같은 무게 두 세트는 가장 무거운 작업 중량에서 잇는다', () => {
  const p = profileFor(freshState(), 'abduction');
  const r = prescribe(p, rec('abduction', [[85, 16], [85, 15]]));
  assert.deepEqual([r.weight, r.reps], [85, 16]);
  assert.doesNotMatch(r.note, /낮췄으니/);
});

test('하한에 못 미친 세트 뒤의 감량은 따지지 않는다: 앱이 남은 세트를 자동으로 낮춘 경우(정책 3절)', () => {
  const p = profileFor(freshState(), 'smith_squat'); // 8~10회
  const sets = [[30, 8], [30, 6], [25, 9]];
  assert.equal(afterLowering(p, rec('smith_squat', sets).sets).from, null);
  const r = prescribe(p, rec('smith_squat', sets));
  assert.deepEqual([r.weight, r.reps], [30, 8]);
});

test('11/9 스미스 스쿼트 30×6 뒤 25×8: 하한 미달 세트는 원래 작업 중량에 들지 않아 25kg', () => {
  const p = profileFor(freshState(), 'smith_squat');
  const r = prescribe(p, rec('smith_squat', [[30, 6], [25, 8]], { effort: 'hard' }));
  assert.deepEqual([r.weight, r.reps], [25, 8]);
});

test('보조 중량(assist)은 보조를 늘린 것이 낮춘 것이다', () => {
  const p = { ...profileFor(freshState(), 'pullup'), mode: 'assist', inc: 5, range: [6, 10] };
  const r = prescribe(p, rec('pullup', [[20, 8], [30, 8]]));
  assert.equal(r.weight, 30);
  assert.match(r.note, /보조를 20kg에서 30kg로 늘렸으니/);
});

test('지친 상태 기록을 먼저 할 때 고쳐 잡아도, 아파서 내려놓은 앞 세트 무게로 되돌아가지 않는다', () => {
  const s = freshState();
  s.performance = [rec('abduction', [[85, 16], [70, 15]], { effort: 'hard', prefatigue: 6 })];
  const r = prescribeForOrder(profileFor(s, 'abduction'), s, 0);
  assert.equal(r.shift, 'fatigued>fresh');
  assert.equal(r.weight, 70);
});

test('싱글 레그프레스는 계획에 넣지 않고(허리 부담, 11/9 메모) 교체 후보에는 남는다', () => {
  const s = freshState();
  for (const minutes of [20, 30, 45, 60, 75, 90]) {
    for (const e of [null, ...EMPHASIS.lower]) {
      const p = buildPlan(s, 'lower', minutes, now, e ? { emphasis: e.muscles } : {});
      assert.ok(!p.planned.some((x) => x.id === 'legpress'), `${minutes}분 ${e?.id || '기본'}`);
    }
  }
  T.setCheck(s, { minutes: 60 }, { now });
  T.createSession(s, { part: 'lower', now });
  const quad = s.session.exercises.find((x) => x.exerciseId === 'leg_extension');
  assert.ok(quad, '보조 자리에 레그 익스텐션');
  assert.ok(replacementCandidates(s, quad, now).some((x) => x.id === 'legpress'));
});

test('좌우를 따로 하는 반복 운동은 양쪽 시간을 세고, 복합 운동은 양쪽 사이 휴식을 더한다', () => {
  const s = freshState();
  const bul = profileFor(s, 'bulgarian');
  const both = estimateMinutes({ ...bul, unilateral: false }, 2);
  assert.equal(estimateMinutes(bul, 2) - both, 2 * (0.75 + SIDE_REST / 60));
  const lp = profileFor(s, 'legpress'); // 고립: 양쪽 시간만
  assert.equal(estimateMinutes(lp, 2) - estimateMinutes({ ...lp, unilateral: false }, 2), 2 * 0.75);
  const sp = profileFor(s, 'side_plank'); // 시간으로 재는 운동은 그대로
  assert.equal(estimateMinutes(sp, 2), estimateMinutes({ ...sp, unilateral: false }, 2));
});

test('양쪽 사이에 쉬는 시간을 셈하는 운동은 안내에도 쉬라고 적혀 있다', () => {
  const xs = ALL_CATALOG.filter((x) => x.part === 'lower' && x.compound && x.unilateral && (x.measure || 'reps') !== 'seconds' && !x.alternating);
  assert.ok(xs.some((x) => x.id === 'bulgarian'));
  for (const x of xs) assert.match((guideFor(x.id)?.how || []).join(' '), /숨이\s고를\s때까지/, x.id); // 묶음은 U+00A0 이라 \s 로 찾는다
  const row = profileFor(freshState(), 'db_row'); // 한 팔 로우는 양쪽 시간만 세고 사이 휴식은 없다
  assert.equal(estimateMinutes(row, 2) - estimateMinutes({ ...row, unilateral: false }, 2), 2 * 0.75);
});
