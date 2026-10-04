import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importAny } from '../../app/js/core/migrate.js';
import { freshState } from '../../app/js/core/schema.js';
import { createStore, memoryLocal } from '../../app/js/core/store.js';
import * as T from '../../app/js/core/session.js';
import { adjustedSetCount } from '../../app/js/core/plan.js';
import { profileFor } from '../../app/js/core/coach.js';

const v7 = () => importAny(JSON.parse(readFileSync(new URL('../fixtures/v7_synthetic.json', import.meta.url), 'utf8'))).state;
const now = new Date(2026, 8, 28, 18, 0);

// part 세션을 만든 뒤 운동 목록을 ids 로 고정한다 (계획 알고리즘과 무관하게 전이만 검사).
function sessionWith(state, part, ids, levels = {}) {
  T.createSession(state, { part, now });
  state.session.exercises = ids.map((id) => T.makeEntry(state, id, { part, minutes: state.session.minutes, warmupLevel: levels[id] }));
  T.recalcEstimate(state);
  return state;
}
const entryOf = (s, id) => s.session.exercises.find((e) => e.exerciseId === id);
const mains = (e) => e.sets.filter((z) => z.type === 'main');
// k번째 본세트의 현재 인덱스 (중량 입력으로 워밍업 행이 생기면 인덱스가 밀리므로 매번 다시 찾는다)
const mi = (s, id, k = 0) => entryOf(s, id).sets.map((z, i) => [z, i]).filter(([z]) => z.type === 'main')[k][1];

test('교체: 머신 → 덤벨이면 프로필 전체가 새 운동 값이 된다', () => {
  const s = sessionWith(freshState(), 'pull', ['pullup', 'rear_cable']);
  const old = entryOf(s, 'rear_cable');
  const ne = T.replaceExercise(s, old.uid, 'db_rear', { now });
  const p = profileFor(s, 'db_rear');
  assert.equal(ne.exerciseId, 'db_rear');
  assert.equal(ne.name, '덤벨 리버스 플라이');
  assert.equal(ne.loadMode, 'per_dumbbell');
  assert.equal(ne.increment, 1);
  assert.deepEqual(ne.range, p.range);
  assert.equal(ne.rest, p.rest);
  assert.equal(ne.restToday, null);
  assert.equal(ne.equipment, 'dumbbell');
  assert.equal(ne.unilateral, false);
  assert.equal(ne.compound, false);
  assert.equal(ne.slot, 'rear_delt');
  assert.equal(ne.warmupLevel, 'none');
  assert.equal(s.session.exercises[1].uid, ne.uid, '같은 자리에 교체');
  assert.equal(s.session.exercises.length, 2);
});

test('교체: 2세트 운동을 3세트 기본 운동으로 바꾸면 세트 수를 새로 계산한다 (이전 수로 제한하지 않음)', () => {
  const s = sessionWith(freshState(), 'pull', ['tbar']);
  assert.equal(mains(entryOf(s, 'tbar')).length, 2);
  const ne = T.replaceExercise(s, entryOf(s, 'tbar').uid, 'row', { now });
  assert.equal(mains(ne).length, adjustedSetCount(s, profileFor(s, 'row'), 'pull', s.session.minutes, ne.slot));
  assert.equal(mains(ne).length, 3);
});

test('교체: 보조운동 → 복합운동이면 워밍업 수준과 행을 새 운동 기준으로 만든다', () => {
  const s = sessionWith(v7(), 'push', ['pushup']);
  const ne = T.replaceExercise(s, entryOf(s, 'pushup').uid, 'bench', { now });
  assert.equal(ne.warmupLevel, 'full');
  assert.equal(ne.loadMode, 'total');
  const warm = ne.sets.filter((z) => z.type === 'warmup');
  assert.equal(warm.length, 3);
  assert.ok(warm.every((z) => z.weight < 52.5));
  assert.ok(mains(ne).every((z) => z.weight === 52.5 && z.reps === 6), '지난 기록 기반 처방으로 미리 채움');
});

test('교체: 편측 → 양측이면 좌우 입력 흔적이 새 운동에 남지 않는다', () => {
  const s = sessionWith(freshState(), 'lower', ['bulgarian']);
  const e = entryOf(s, 'bulgarian');
  T.setSplit(s, e.uid, 0, true);
  const ne = T.replaceExercise(s, e.uid, 'smith_squat', { now });
  assert.equal(ne.unilateral, false);
  assert.ok(ne.sets.every((z) => !z.split && z.leftReps === null && z.rightReps === null && !z.touched));
});

test('교체 취소 · 실패는 상태를 조금도 바꾸지 않는다 (store 원자성)', () => {
  const store = createStore({ local: memoryLocal() });
  store.commit((s) => sessionWith(s, 'pull', ['tbar', 'curl']));
  const e = entryOf(store.state, 'curl');
  store.commit((s) => { T.toggleSetDone(s, e.uid, 0, { now }); T.toggleSetDone(s, e.uid, 1, { now }); });
  const before = JSON.stringify(store.state);
  assert.throws(() => store.commit((s) => T.replaceExercise(s, e.uid, 'hammer', { now })), (err) => err.code === 'all_done');
  assert.throws(() => store.commit((s) => { T.createCustomExercise(s, { name: '임시', part: 'pull', role: 'biceps' }); T.replaceExercise(s, entryOf(s, 'tbar').uid, 'tbar', { now }); }));
  assert.equal(JSON.stringify(store.state), before, '사용자 운동도 남지 않는다');
});

test('교체: 3세트 중 1세트 완료 후 → 완료분은 기존 운동, 남은 2세트는 새 운동으로 분리되어 기록된다', () => {
  const s = sessionWith(freshState(), 'pull', ['row']);
  const old = entryOf(s, 'row');
  T.editSet(s, old.uid, mi(s, 'row'), 'weight', 40);
  T.toggleSetDone(s, old.uid, mi(s, 'row'), { now });
  const ne = T.replaceExercise(s, old.uid, 'chest_row', { now });
  assert.equal(s.session.exercises.length, 2);
  assert.equal(s.session.exercises[0].exerciseId, 'row');
  assert.deepEqual(s.session.exercises[0].sets.map((z) => [z.type, z.done]), [['main', true]], '안 한 워밍업 행은 남지 않는다');
  assert.equal(s.session.exercises[1].uid, ne.uid);
  assert.equal(mains(ne).length, 2);
  T.toggleSetDone(s, ne.uid, 0, { now });
  T.finishSession(s, { now });
  assert.deepEqual(s.performance.map((p) => [p.exerciseId, p.sets.length]), [['row', 1], ['chest_row', 1]]);
});

test('세션 중 휴식 자동 연장은 오늘만: 다음 세션 기본 휴식은 그대로, 설정에서 바꾼 값은 유지', () => {
  const s = sessionWith(freshState(), 'push', ['bench']);
  const e = entryOf(s, 'bench');
  const base = e.rest;
  T.editSet(s, e.uid, mi(s, 'bench'), 'weight', 60);
  T.editSet(s, e.uid, mi(s, 'bench'), 'reps', 3);
  T.toggleSetDone(s, e.uid, mi(s, 'bench'), { now });
  assert.equal(entryOf(s, 'bench').restToday, base + 30);
  T.adjustRest(s, e.uid, 30);
  assert.deepEqual(s.prefs, {}, '세션 조정은 prefs 에 쓰지 않는다');
  T.finishSession(s, { now });
  sessionWith(s, 'push', ['bench']);
  assert.equal(entryOf(s, 'bench').rest, base);
  assert.equal(entryOf(s, 'bench').restToday, null);
  T.setPref(s, 'bench', { rest: 240 });
  assert.equal(entryOf(s, 'bench').rest, 240, '명시 설정은 현재 세션에도 반영');
  T.finishSession(s, { now });
  sessionWith(s, 'push', ['bench']);
  assert.equal(entryOf(s, 'bench').rest, 240, '명시 설정은 다음 세션에도 유지');
});

test('하한 미만이면 아직 손대지 않은 남은 세트만 한 단계 감량', () => {
  const s = sessionWith(freshState(), 'push', ['bench']);
  const e = entryOf(s, 'bench');
  T.editSet(s, e.uid, mi(s, 'bench', 0), 'weight', 60);
  T.editSet(s, e.uid, mi(s, 'bench', 2), 'weight', 55);
  T.editSet(s, e.uid, mi(s, 'bench', 0), 'reps', 4);
  T.toggleSetDone(s, e.uid, mi(s, 'bench', 0), { now });
  const x = mains(entryOf(s, 'bench'));
  assert.equal(x[1].weight, 57.5);
  assert.equal(x[2].weight, 55, '사용자가 고친 세트는 건드리지 않는다');
});

test('중량을 고치면 뒤따르는 미수정 세트와 워밍업이 따라 바뀐다', () => {
  const s = sessionWith(freshState(), 'push', ['bench'], { bench: 'full' });
  const e = entryOf(s, 'bench');
  assert.equal(e.sets.filter((z) => z.type === 'warmup').length, 0, '처방 중량이 없으면 워밍업 행 없음');
  const i = e.sets.findIndex((z) => z.type === 'main');
  T.editSet(s, e.uid, i, 'weight', 60);
  const x = entryOf(s, 'bench');
  assert.ok(mains(x).every((z) => z.weight === 60));
  assert.deepEqual(x.sets.filter((z) => z.type === 'warmup').map((z) => z.weight), [30, 42.5, 50]);
});

test('진행 중 세션 날짜를 바꾸면 이력과 운동 기록이 모두 그 날짜를 쓴다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  T.setSessionDate(s, '2026-09-25');
  T.toggleSetDone(s, entryOf(s, 'curl').uid, 0, { now });
  T.finishSession(s, { now });
  assert.equal(s.history.at(-1).date, '2026-09-25');
  assert.ok(s.performance.every((p) => p.date === '2026-09-25'));
  assert.throws(() => { T.createSession(s, { part: 'pull', now }); T.setSessionDate(s, '25/09'); }, (e) => e.code === 'bad_date');
});

test('직접 만든 운동을 추가하면 세트·입력 구조·예상 시간이 반영된다', () => {
  const s = sessionWith(freshState(), 'lower', ['squat']);
  const before = s.session.estimatedMinutes;
  const c = T.createCustomExercise(s, { name: '힙쓰러스트', part: 'lower', role: 'glute_med', mode: 'total', inc: 5, range: [8, 12], rest: 120, unilateral: true });
  const e = T.addExercise(s, c.id, { now });
  assert.equal(e.unilateral, true);
  assert.equal(e.loadMode, 'total');
  assert.equal(mains(e).length, 2);
  assert.ok(s.session.estimatedMinutes > before);
});

test('세트 완료: 세트 간격 자동 기록, 휴식 타이머는 오늘 휴식값으로 시작, 되돌리면 정리', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  const e = entryOf(s, 'curl');
  T.toggleSetDone(s, e.uid, 0, { now });
  T.toggleSetDone(s, e.uid, 1, { now: new Date(now.getTime() + 95000) });
  const x = entryOf(s, 'curl');
  assert.equal(x.sets[1].restBefore, 95);
  assert.equal(s.session.restTimer.seconds, x.rest);
  T.toggleSetDone(s, e.uid, 1, { now });
  assert.equal(s.session.restTimer, null);
  assert.equal(entryOf(s, 'curl').sets[1].doneAt, null);
});

test('워밍업 세트 뒤 휴식은 최대 60초', () => {
  const s = sessionWith(freshState(), 'push', ['bench']);
  T.editSet(s, entryOf(s, 'bench').uid, mi(s, 'bench'), 'weight', 60);
  T.toggleSetDone(s, entryOf(s, 'bench').uid, 0, { now });
  assert.equal(entryOf(s, 'bench').sets[0].type, 'warmup');
  assert.equal(s.session.restTimer.seconds, 60);
});

test('느낌 버튼은 마지막 완료 본세트의 빈 RIR 만 채운다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  const e = entryOf(s, 'curl');
  T.toggleSetDone(s, e.uid, 0, { now });
  T.editSet(s, e.uid, 1, 'rir', 1);
  T.toggleSetDone(s, e.uid, 1, { now });
  T.setEffort(s, e.uid, 'hard');
  const x = entryOf(s, 'curl');
  assert.equal(x.effort, 'hard');
  assert.equal(x.sets[1].rir, 1);
  assert.equal(x.sets[0].rir, null);
});

test('세트 줄이기는 빈 세트만 지운다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  const e = entryOf(s, 'curl');
  T.editSet(s, e.uid, 1, 'reps', 9);
  T.toggleSetDone(s, e.uid, 0, { now });
  assert.throws(() => T.changeSetCount(s, e.uid, -1), (err) => err.code === 'all_recorded');
  T.changeSetCount(s, e.uid, 1);
  T.changeSetCount(s, e.uid, -1);
  assert.equal(mains(entryOf(s, 'curl')).length, 2);
});

test('기구 사용 불가(영구)는 설정에 남고 같은 슬롯 운동으로 바뀐다', () => {
  const s = sessionWith(freshState(), 'pull', ['row']);
  const ne = T.markUnavailable(s, entryOf(s, 'row').uid, { persistent: true, now });
  assert.ok(s.settings.unavailableExercises.includes('row'));
  assert.equal(ne.exerciseId, 'chest_row');
});

test('순서 바꾸기', () => {
  const s = sessionWith(freshState(), 'push', ['bench', 'cable_fly', 'chest_press']);
  T.moveExercise(s, entryOf(s, 'chest_press').uid, 1);
  assert.deepEqual(s.session.exercises.map((e) => e.exerciseId), ['bench', 'chest_press', 'cable_fly']);
});

test('세션을 170번 끝내도 기록이 잘리지 않는다', () => {
  const s = freshState();
  for (let i = 0; i < 170; i++) {
    sessionWith(s, 'pull', ['curl']);
    T.toggleSetDone(s, entryOf(s, 'curl').uid, 0, { now });
    T.finishSession(s, { now });
  }
  assert.equal(s.history.length, 170);
  assert.equal(s.performance.length, 170);
});

test('PT 혼합 기록은 부위별로 나눠 저장하고 잘못된 값은 거부한다', () => {
  const s = freshState();
  T.logPT(s, { date: '2026-09-24', parts: ['push', 'lower', 'bogus'], sets: 10 });
  assert.deepEqual(s.history.map((h) => [h.part, h.workSets, h.source]), [['push', 5, 'pt'], ['lower', 5, 'pt']]);
  assert.throws(() => T.logPT(s, { date: '2026-09-24', parts: [], sets: 3 }));
  assert.throws(() => T.logPT(s, { date: '2026-09-24', parts: ['push'], sets: -1 }));
});

test('이력 날짜 · 부위 수정과 삭제가 연결된 운동 기록에 반영된다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  T.toggleSetDone(s, entryOf(s, 'curl').uid, 0, { now });
  T.finishSession(s, { now });
  const id = s.history[0].id;
  T.updateHistoryDate(s, id, '2026-09-01');
  T.updateHistoryPart(s, id, 'push');
  assert.deepEqual([s.performance[0].date, s.performance[0].part], ['2026-09-01', 'push']);
  T.deleteHistory(s, id);
  assert.equal(s.performance.length, 0);
});

test('헬스장 휴무일: 집 모드 추천과 세션은 장비 불필요 운동(+집 장비)만 쓴다', async () => {
  const { recommendPart } = await import('../../app/js/core/plan.js');
  const s = freshState();
  const mon = new Date(2026, 8, 28, 10);
  s.check.gymClosedDate = '2026-09-28';
  const r = recommendPart(s, mon);
  assert.deepEqual([r.part, r.home], ['core', true]);
  T.createSession(s, { part: 'core', home: true, now: mon });
  assert.ok(s.session.home);
  assert.ok(s.session.exercises.every((e) => e.equipment === 'none'), s.session.exercises.map((e) => e.name).join(','));
  assert.ok(!s.session.exercises.some((e) => e.exerciseId === 'pallof'));
  assert.equal(s.session.exercises.length >= 3, true);
  T.createSession(s, { part: 'push', home: true, now: mon });
  assert.ok(s.session.exercises.every((e) => e.equipment === 'none'));
  s.settings.homeEquipment = ['dumbbell'];
  T.createSession(s, { part: 'pull', home: true, now: mon });
  assert.ok(s.session.exercises.some((e) => e.exerciseId === 'db_row'), '집 덤벨이 있으면 덤벨 운동');
  assert.ok(s.session.exercises.every((e) => ['none', 'dumbbell'].includes(e.equipment)));
});

test('일요일 홈 Core 는 케이블 운동(팰로프)을 넣지 않는다', async () => {
  const { recommendPart } = await import('../../app/js/core/plan.js');
  const s = freshState();
  const sun = new Date(2026, 8, 27, 10);
  const r = recommendPart(s, sun);
  assert.equal(r.home, true);
  T.createSession(s, { part: r.part, home: r.home, now: sun });
  assert.ok(s.session.exercises.every((e) => e.equipment === 'none'));
});

test('운동 시간은 ✓ 시각으로 계산: 종료를 잊어도 70시간이 찍히지 않는다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl', 'hammer']);
  const t0 = now.getTime();
  const e = entryOf(s, 'curl');
  T.toggleSetDone(s, e.uid, 0, { now: new Date(t0 + 3 * 60000) });
  T.toggleSetDone(s, e.uid, 1, { now: new Date(t0 + 45 * 60000) });
  const later = new Date(t0 + 70 * 3600000);
  assert.ok(T.staleSessionInfo(s, later));
  assert.equal(T.staleSessionInfo(s, new Date(t0 + 60 * 60000)), null, '마지막 활동 15분 뒤는 방치 아님');
  T.finishSession(s, { now: later });
  assert.equal(s.history.at(-1).durationSec, (3 + 42 + 1) * 60, '준비 3분 + 3분~45분 + 마지막 1분');
});

test('시각 없는 기록(계획대로 완료)만 있으면 비정상적으로 긴 타이머는 시간 모름으로', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  T.completeRemaining(s, null, { now });
  T.finishSession(s, { now: new Date(now.getTime() + 70 * 3600000) });
  assert.equal(s.history.at(-1).durationSec, null);
  T.setHistoryDuration(s, s.history.at(-1).id, 55);
  assert.equal(s.history.at(-1).durationSec, 3300);
});

test('계획대로 완료: 채워진 값대로 남은 세트를 완료, 값이 빈 세트는 건너뛴다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl', 'pullup']);
  const c = entryOf(s, 'curl');
  T.editSet(s, c.uid, 0, 'weight', 8);
  T.toggleSetDone(s, c.uid, 0, { now });
  const n = T.completeRemaining(s, c.uid, { now });
  assert.equal(n, 1);
  assert.ok(entryOf(s, 'curl').sets.every((z) => z.done && z.weight === 8));
  assert.equal(s.session.restTimer, null);
  assert.ok(entryOf(s, 'pullup').sets.every((z) => !z.done), '다른 운동은 그대로');
  T.completeRemaining(s, null, { now });
  assert.ok(entryOf(s, 'pullup').sets.every((z) => z.done));
});

test('계획대로 완료로 실시간 기록 중 마지막 한 세트를 끝내면 지금 끝낸 것으로 본다', () => {
  const s = sessionWith(freshState(), 'pull', ['curl']);
  const c = entryOf(s, 'curl');
  T.editSet(s, c.uid, 0, 'weight', 8);
  const n0 = c.sets.length;
  for (let i = 0; i < n0 - 1; i++) T.toggleSetDone(s, c.uid, i, { now: new Date(now.getTime() + i * 120000) });
  const t = new Date(now.getTime() + n0 * 120000);
  assert.equal(T.completeRemaining(s, c.uid, { now: t }), 1);
  const last = entryOf(s, 'curl').sets.at(-1);
  assert.equal(last.doneAt, t.getTime());
  assert.equal(last.restBefore, 240);
});

test('타이머: 일시정지한 채 세트를 끝내면 자동으로 다시 간다', () => {
  const s = sessionWith(freshState(), 'pull', ['pullup']);
  T.toggleSessionTimer(s, { now: new Date(now.getTime() + 60000) });
  assert.equal(s.session.timer.running, false);
  const t2 = new Date(now.getTime() + 300000);
  T.toggleSetDone(s, entryOf(s, 'pullup').uid, mi(s, 'pullup'), { now: t2 });
  assert.equal(s.session.timer.running, true);
  assert.equal(T.timerSeconds(s.session.timer, t2.getTime() + 10000), 60 + 10);
});

test('버티기 타이머: 좌우 단계와 자세 바꾸는 시간, 결과는 같으면 한 값 · 다르면 좌우로', async () => {
  const { holdPhases } = await import('../../app/js/core/hold.js');
  assert.deepEqual(holdPhases(30, { unilateral: true }).map((p) => `${p.kind}:${p.side}:${p.secs}`), ['prep:left:5', 'hold:left:30', 'switch:right:10', 'hold:right:30']);
  assert.deepEqual(holdPhases(40).map((p) => p.kind), ['prep', 'hold']);
  const s = sessionWith(freshState(), 'core', ['side_plank', 'plank']);
  const sp = entryOf(s, 'side_plank');
  T.recordHold(s, sp.uid, mi(s, 'side_plank'), { left: 30, right: 30 }, { now });
  assert.deepEqual([sp.sets[mi(s, 'side_plank')].reps, sp.sets[mi(s, 'side_plank')].split, sp.sets[mi(s, 'side_plank')].done], [30, false, true]);
  T.recordHold(s, sp.uid, mi(s, 'side_plank', 1), { left: 30, right: 22 }, { now });
  const z = sp.sets[mi(s, 'side_plank', 1)];
  assert.deepEqual([z.split, z.leftReps, z.rightReps, z.done], [true, 30, 22, true]);
  assert.ok(s.session.restTimer, '완료 처리로 휴식 타이머가 시작된다');
});
