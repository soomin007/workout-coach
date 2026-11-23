// 11/23 하체 메모: 목표를 근지구력으로 바꾼 날의 처방 안내, 설정 저장이 바꾸지 않은 칸까지 묶던 일,
// 앞 피로 조건이 같은 오래된 기록을 고르던 일 (정책 11절, 14절).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { profileFor, prescribe, prescribeForOrder, lighterThanUsual } from '../../app/js/core/coach.js';

const rec = (exerciseId, date, sets, extra = {}) => ({
  sessionId: `s_${date}`, date, part: 'lower', exerciseId, name: exerciseId,
  sets: sets.map(([weight, reps, rir = null]) => ({ type: 'main', weight, reps, rir, split: false, done: true })), effort: null, ...extra,
});
const endurance = () => { const s = freshState(); s.settings.goal = 'endurance'; return s; };

test('목표를 바꿔 범위가 올라가면 실패로 읽지 않고 힘을 추정해 낮춘다: 스쿼트 60kg × 7회(5~8회)에서 12~15회 (11/23 세션 메모)', () => {
  const s = endurance();
  const p = profileFor(s, 'squat');
  const r = prescribe(p, rec('squat', '2026-11-09', [[60, 7], [60, 7, 2]], { range: [5, 8], effort: 'ok' }));
  assert.deepEqual([r.kind, r.weight, r.reps], ['range_change', 50, 12]);
  assert.match(r.note, /설정한 목표\(근지구력\)에 맞춰 반복 범위가 5~8회에서 12~15회로 바뀌었습니다/);
  assert.match(r.note, /지난번 60kg × 7회로 힘을 추정해, 12회를 2회쯤 남기고 할 수 있는 50kg로 낮춥니다/);
  assert.doesNotMatch(r.note, /못 미쳐/);
});

test('덤벨 운동은 덤벨 눈금으로 내린다: 불가리안 20kg × 10회(8~10회)는 18kg × 12회', () => {
  const s = endurance();
  const r = prescribe(profileFor(s, 'bulgarian'), rec('bulgarian', '2026-11-09', [[20, 10], [20, 10]], { range: [8, 10], effort: 'ok' }));
  assert.deepEqual([r.kind, r.weight, r.reps], ['range_change', 18, 12]);
});

test('지난 반복이 새 범위 안이면 평소 더블 프로그레션: 레그컬 30kg × 13회는 12~15회 안이라 30kg × 14회', () => {
  const s = endurance();
  const r = prescribe(profileFor(s, 'legcurl'), rec('legcurl', '2026-11-09', [[30, 13], [30, 13]], { range: [10, 15], effort: 'ok' }));
  assert.deepEqual([r.kind, r.weight, r.reps], ['hold', 30, 14]);
});

test('범위가 그대로인데 하한에 못 미쳤으면 예전처럼 감량 안내', () => {
  const s = freshState();
  const r = prescribe(profileFor(s, 'smith_squat'), rec('smith_squat', '2026-11-09', [[30, 6], [30, 6]], { range: [8, 10] }));
  assert.equal(r.kind, 'decrease');
  assert.match(r.note, /목표 최소 8회에 못 미쳐/);
});

test('운동별로 범위를 직접 바꾼 경우의 안내', () => {
  const s = freshState();
  s.prefs.smith_squat = { range: [12, 15] };
  const r = prescribe(profileFor(s, 'smith_squat'), rec('smith_squat', '2026-11-09', [[25, 8, 0]], { range: [8, 10], effort: 'hard' }));
  assert.equal(r.kind, 'range_change');
  assert.match(r.note, /^반복 범위를 8~10회에서 12~15회로 바꿨습니다/);
});

test('범위가 바뀐 뒤 첫 처방에는 순서 보정을 얹지 않는다: 지친 뒤 기록의 첫 세트 60kg로 되돌아가지 않는다', () => {
  const s = endurance();
  s.performance = [rec('squat', '2026-11-09', [[60, 7], [60, 7, 2]], { range: [5, 8], effort: 'ok', prefatigue: 4 })];
  const r = prescribeForOrder(profileFor(s, 'squat'), s, 0);
  assert.deepEqual([r.kind, r.weight, r.reps], ['range_change', 50, 12]);
});

test('같은 조건 기록이 가장 최근 기록보다 4주 넘게 오래됐으면 쓰지 않는다: 스미스 10/1 30kg 대신 11/9 25kg (11/9, 11/23 메모)', () => {
  const s = freshState();
  const old = rec('smith_squat', '2026-10-01', [[30, 9], [30, 9, 0]], { range: [8, 10], effort: 'hard', prefatigue: 4 });
  const latest = rec('smith_squat', '2026-11-09', [[30, 6], [25, 8, 0]], { range: [8, 10], effort: 'hard', prefatigue: 2 });
  s.performance = [old, latest];
  const r = prescribeForOrder(profileFor(s, 'smith_squat'), s, 3);
  assert.equal(r.weight, 25);
  assert.equal(r.kind, 'order_cut', '가장 최근(먼저 한) 기록에서 지친 뒤로 옮겨 반복만 낮춘다');
  // 4주 안이면 같은 조건 기록을 쓴다
  s.performance = [{ ...old, date: '2026-10-20' }, latest];
  assert.equal(prescribeForOrder(profileFor(s, 'smith_squat'), s, 3).weight, 30);
});

test('범위가 바뀐 날 무게가 내려간 것은 가벼운 날로 묻지 않는다', () => {
  const s = endurance();
  s.performance = [rec('squat', '2026-11-09', [[60, 7], [60, 7, 2]], { range: [5, 8], effort: 'ok' })];
  const session = { date: '2026-11-23', exercises: [{ exerciseId: 'squat', name: '프리 스쿼트', loadMode: 'total', range: [12, 15],
    sets: [{ type: 'main', weight: 50, reps: 12, done: true }] }] };
  assert.deepEqual([lighterThanUsual(s, session).suggest, lighterThanUsual(s, session).compared], [false, 0]);
  session.exercises[0].range = [5, 8];
  assert.equal(lighterThanUsual(s, session).suggest, true, '같은 범위에서 60kg가 50kg가 되면 가벼운 날로 묻는다');
});

test('설정 저장은 바꾼 칸만 남긴다: 그대로 저장하면 선호가 생기지 않고, 목표를 바꾸면 따라간다 (11/23 스미스 메모)', () => {
  const s = freshState();
  const form = { loadMode: 'per_side', increment: 5, rest: 180, unilateral: false, range: [8, 10] };
  T.setPref(s, 'smith_squat', form);
  assert.equal(s.prefs.smith_squat, undefined);
  s.settings.goal = 'endurance';
  assert.deepEqual([profileFor(s, 'smith_squat').range, profileFor(s, 'smith_squat').rest], [[12, 15], 75]);
  T.setPref(s, 'smith_squat', { ...form, range: [12, 15], rest: 120 });
  assert.deepEqual(s.prefs.smith_squat, { rest: 120 }, '바꾼 휴식만');
  T.setPref(s, 'smith_squat', { ...form, range: [12, 15], rest: 75 });
  assert.equal(s.prefs.smith_squat, undefined, '기본값으로 되돌리면 지운다');
  s.prefs.squat = { since: '2026-10-29' };
  T.setPref(s, 'squat', { loadMode: 'total', increment: 5, rest: 75, unilateral: false, range: [10, 12] });
  assert.deepEqual(s.prefs.squat, { since: '2026-10-29', range: [10, 12] }, '기준일은 남고 바꾼 범위만 더해진다');
});
