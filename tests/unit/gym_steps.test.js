// 사용자 헬스장의 무게 눈금 (10/22 · 10/23 메모), 강도 가볍게 문구, 워밍업 이어받기 (10/21 메모), 카탈로그로 옮기기.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, normalizeState } from '../../app/js/core/schema.js';
import { LADDERS } from '../../app/js/core/catalog.js';
import * as T from '../../app/js/core/session.js';
import { profileFor, prescribeForOrder, easyRx, learnedWarmups } from '../../app/js/core/coach.js';
import { snapW, stepW } from '../../app/js/core/util.js';

const set = (weight, reps, extra = {}) => ({ type: 'main', weight, reps, rir: null, split: false, done: true, ...extra });
const warm = (weight, reps, touched = true) => ({ type: 'warmup', weight, reps, rir: null, split: false, done: true, touched });
const rec = (date, exerciseId, sets, extra = {}) => ({ sessionId: `s${date}`, date, part: 'lower', exerciseId, name: exerciseId, primary: [], secondary: [], sets, effort: 'ok', ...extra });

test('눈금: 덤벨은 20 다음이 26, 어브덕션 스택은 25 다음이 32', () => {
  const db = { inc: 2, ladder: LADDERS.dumbbell };
  assert.equal(stepW(20, 1, db), 26);
  assert.equal(stepW(26, -1, db), 20);
  assert.equal(snapW(23, db), 20);
  assert.equal(snapW(23, db, 'ceil'), 26);
  assert.equal(stepW(40, 1, db), 40);
  const ab = { inc: 5, ladder: LADDERS.abduction };
  assert.equal(stepW(25, 1, ab), 32);
  assert.equal(stepW(70, 1, ab), 78);
  assert.equal(snapW(70 * 0.9, ab, 'floor'), 62);
  assert.equal(stepW(50, 1, { inc: 7.5, start: 5 }), 57.5);
});

test('덤벨 1개당 운동은 덤벨 눈금, 어브덕션 · 어덕션은 스택 눈금을 쓴다', () => {
  const s = freshState();
  assert.deepEqual(profileFor(s, 'bulgarian').ladder, LADDERS.dumbbell);
  assert.deepEqual(profileFor(s, 'abduction').ladder, LADDERS.abduction);
  assert.deepEqual(profileFor(s, 'adduction').ladder, LADDERS.abduction);
  assert.equal(profileFor(s, 'legcurl').ladder, null);
});

test('어브덕션 상한 달성: 70 다음 칸인 78로 올린다', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-23', 'abduction', [set(70, 20), set(70, 20)]));
  const rx = prescribeForOrder(profileFor(s, 'abduction'), s, 0);
  assert.equal(rx.kind, 'increase');
  assert.equal(rx.weight, 78);
});

test('다음 덤벨이 30% 무거우면 바로 올리지 않고 반복을 상한 + 5회까지 늘린다 (불가리안 20kg)', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-17', 'bulgarian', [set(20, 10), set(20, 10)]));
  let rx = prescribeForOrder(profileFor(s, 'bulgarian'), s, 0);
  assert.equal(rx.kind, 'hold');
  assert.equal(rx.weight, 20);
  assert.equal(rx.reps, 11);
  assert.match(rx.note, /26kg/);
  s.performance.push(rec('2026-10-24', 'bulgarian', [set(20, 15), set(20, 15)]));
  rx = prescribeForOrder(profileFor(s, 'bulgarian'), s, 0);
  assert.equal(rx.kind, 'increase');
  assert.equal(rx.weight, 26);
});

test('덤벨 6 → 8 처럼 평소 증량 한 칸이면 반복을 늘리지 않고 그대로 올린다', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-21', 'hammer', [set(6, 15), set(6, 15)]));
  const rx = prescribeForOrder(profileFor(s, 'hammer'), s, 0);
  assert.equal(rx.kind, 'increase');
  assert.equal(rx.weight, 8);
});

test('강도 가볍게 문구는 낮춘 무게와 엇갈리는 "30kg 유지"를 덧붙이지 않는다 (10/23 레그컬 메모)', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-01', 'legcurl', [set(30, 12), set(30, 12)]));
  const p = profileFor(s, 'legcurl');
  const rx = easyRx(p, prescribeForOrder(p, s, 0));
  assert.equal(rx.weight, 25);
  assert.doesNotMatch(rx.note, /유지/);
  assert.match(rx.note, /30kg × 13회/);
  assert.match(rx.note, /25kg로 13회/);
});

test('워밍업 이어받기: 지난번 직접 고친 워밍업을 같은 비율로, 가장 가벼운 칸은 그 무게 그대로 (10/21 메모)', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-19', 'bench', [warm(20, 8), warm(40, 5), set(60, 6)]));
  assert.equal(learnedWarmups(s, 'bench').length, 2);
  const e = T.makeEntry(s, 'bench', { part: 'push', minutes: 60 });
  const w = e.sets.filter((z) => z.type === 'warmup').map((z) => [z.weight, z.reps]);
  assert.equal(e.warmupLevel, 'learned');
  assert.deepEqual(w, [[20, 8], [40, 5]]);
});

test('워밍업 이어받기: 고립 운동에 사용자가 넣은 워밍업도 다음에 만든다, 손대지 않은 자동 워밍업은 기본 그대로', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-21', 'curl', [warm(6, 8), set(8, 12)]));
  const e = T.makeEntry(s, 'curl', { part: 'pull', minutes: 60 });
  assert.deepEqual(e.sets.filter((z) => z.type === 'warmup').map((z) => [z.weight, z.reps]), [[6, 8]]);
  s.performance.push(rec('2026-10-22', 'chest_row', [warm(10, 6, false), set(15, 10)]));
  assert.equal(learnedWarmups(s, 'chest_row'), null);
});

test('가볍게 한 날로 시작하면 이어받은 워밍업도 만들지 않는다', () => {
  const s = freshState();
  s.performance.push(rec('2026-10-21', 'curl', [warm(6, 8), set(8, 12)]));
  s.session = { recovery: true, exercises: [] };
  const e = T.makeEntry(s, 'curl', { part: 'pull', minutes: 60 });
  assert.equal(e.sets.filter((z) => z.type === 'warmup').length, 0);
});

test('직접 만든 운동과 같은 이름이 카탈로그에 생기면 기록을 카탈로그 운동으로 옮긴다 (레그 익스텐션)', () => {
  const s = freshState();
  const cid = 'custom:레그_익스텐션:x';
  s.customExercises.push({ id: cid, name: '레그 익스텐션', part: 'lower', role: 'secondary_lower', mode: 'machine', inc: 5, range: [10, 15] });
  s.performance.push(rec('2026-10-23', cid, [set(30, 15), set(30, 15)]));
  s.prefs[cid] = { rest: 60 };
  const n = normalizeState(s);
  assert.equal(n.customExercises.length, 0);
  assert.equal(n.performance[0].exerciseId, 'leg_extension');
  assert.equal(n.prefs.leg_extension.rest, 60);
  const rx = prescribeForOrder(profileFor(n, 'leg_extension'), n, 0);
  assert.equal(rx.kind, 'increase');
  assert.equal(rx.weight, 35);
});

test('T바/플레이트 로우 기록은 체스트 서포티드 T바 로우로 이어진다 (같은 기구, 10/24 사용자 확인)', () => {
  const s = freshState();
  s.performance.push(rec('2026-09-23', 'tbar', [set(20, 12), set(20, 12)]));
  s.prefs.tbar = { rest: 90 };
  s.settings.unavailableExercises = ['tbar'];
  const n = normalizeState(s);
  assert.equal(n.performance[0].exerciseId, 'chest_row');
  assert.equal(n.prefs.chest_row.rest, 90);
  assert.equal(n.prefs.tbar, undefined);
  assert.deepEqual(n.settings.unavailableExercises, ['chest_row']);
  assert.equal(profileFor(n, 'chest_row').mode, 'plates');
  assert.equal(profileFor(n, 'tbar'), null);
});

test('아이소레터럴 로우는 한쪽당 원판, 증량은 원판 한 장(2.5kg)', () => {
  const p = profileFor(freshState(), 'iso_row');
  assert.equal(p.mode, 'per_side');
  assert.equal(p.inc, 2.5);
});

test('시티드 로우 스택도 랫풀다운처럼 5에서 시작해 7.5씩: 가볍게 · 무게 찾기 · 감량이 35 · 42.5 · 50 에 떨어진다 (10/26 메모)', () => {
  const s = freshState();
  s.performance.push({ ...rec('2026-10-26', 'row', [set(42.5, 12), set(42.5, 12)]), part: 'pull' });
  const p = profileFor(s, 'row');
  const onStack = (w) => Math.abs(((w - 5) / 7.5) - Math.round((w - 5) / 7.5)) < 1e-9;
  const rx = prescribeForOrder(p, s, 0);
  assert.ok(onStack(rx.weight), `평소 처방 ${rx.weight}`);
  assert.equal(easyRx(p, rx).weight, stepW(rx.weight, -1, p));
  assert.ok(onStack(easyRx(p, rx).weight));
  assert.equal(stepW(42.5, 1, p), 50);
  assert.equal(snapW(42.5 * 1.2, p, 'ceil'), 57.5);
  assert.equal(snapW(42.5 * 0.9, p, 'floor'), 35);
});

test('7.5 간격 스택 기구는 모두 시작 칸(start)이 있다', async () => {
  const { ALL_CATALOG } = await import('../../app/js/core/catalog.js');
  const missing = ALL_CATALOG.filter((x) => x.inc === 7.5 && x.mode === 'machine' && !x.start).map((x) => x.id);
  assert.deepEqual(missing, []);
});

test('직접 추가한 암 풀 다운은 스트레이트 암 풀다운(케이블, 집 운동 제외)으로 옮겨지고 40kg × 10 에서 잇는다 (10/27)', async () => {
  const { isAvailable } = await import('../../app/js/core/plan.js');
  const s = freshState();
  const cid = 'custom:암_풀_다운:mvozdd81';
  s.customExercises.push({ id: cid, name: '암 풀 다운', part: 'pull', role: 'secondary_back', primary: ['back'], secondary: [], mode: 'machine', inc: 5, range: [8, 12], equipment: 'none' });
  s.performance.push({ ...rec('2026-10-26', cid, [set(40, 10), set(40, 10)]), part: 'pull' });
  const n = normalizeState(s);
  assert.equal(n.customExercises.length, 0);
  assert.equal(n.performance[0].exerciseId, 'straight_arm_pd');
  const p = profileFor(n, 'straight_arm_pd');
  assert.equal(p.equipment, 'cable');
  assert.equal(isAvailable(n, p, { home: true }), false);
  assert.equal(prescribeForOrder(p, n, 0).weight, 40);
});

test('이지바 운동은 빈 바 10kg부터 5kg 단위 총중량, 이지바를 끄면 추천하지 않는다', async () => {
  const { isAvailable } = await import('../../app/js/core/plan.js');
  const s = freshState();
  for (const id of ['skull_crusher', 'ez_curl']) {
    const p = profileFor(s, id);
    assert.equal(p.mode, 'total');
    assert.equal(snapW(12, p), 10);
    assert.equal(stepW(10, 1, p), 15);
    assert.equal(stepW(25, -1, p), 20);
    // 가볍게 처방도 빈 바(10kg) 아래로 내려가지 않는다
    assert.equal(easyRx(p, { weight: 10, reps: 10, kind: 'hold', note: '' }).weight, 10);
    assert.equal(isAvailable(s, p), true);
  }
  s.settings.equipment.ez_bar = false;
  assert.equal(isAvailable(s, profileFor(s, 'ez_curl')), false);
});

test('Pull 60분: 지난번에 한 랫풀다운도 남고, 스트레이트 암 풀다운은 75분에 더해진다', async () => {
  const { buildPlan } = await import('../../app/js/core/plan.js');
  const s = freshState();
  s.performance.push({ ...rec('2026-10-09', 'lat', [set(27.5, 12), set(27.5, 12)]), part: 'pull' });
  const now = new Date(2026, 9, 10, 18);
  const ids = (m) => buildPlan(s, 'pull', m, now).planned.map((x) => x.id);
  assert.ok(ids(60).includes('lat'));
  assert.ok(!ids(60).includes('straight_arm_pd'));
  assert.ok(ids(75).includes('straight_arm_pd'));
});

test('직접 추가한 기구 운동은 헬스장 기구로 저장돼 집 운동에서 빠지고, 맨몸 운동만 집에서도 나온다', async () => {
  const { isAvailable } = await import('../../app/js/core/plan.js');
  const s = freshState();
  const m = T.createCustomExercise(s, { name: '케이블 무언가', part: 'pull', role: 'secondary_back', mode: 'machine', inc: 5 });
  const b = T.createCustomExercise(s, { name: '맨몸 무언가', part: 'core', role: 'core_flexion', mode: 'bodyweight' });
  assert.equal(m.equipment, 'gym');
  assert.equal(b.equipment, 'none');
  assert.equal(isAvailable(s, profileFor(s, m.id), { home: true }), false);
  assert.equal(isAvailable(s, profileFor(s, m.id)), true);
  assert.equal(isAvailable(s, profileFor(s, b.id), { home: true }), true);
  // 예전에 '장비 불필요'로 저장된 기구 운동도 바로잡는다
  s.customExercises.push({ ...m, id: 'custom:old:1', name: '옛 기구 운동', equipment: 'none' });
  assert.equal(normalizeState(s).customExercises.find((x) => x.id === 'custom:old:1').equipment, 'gym');
});

test('카탈로그 운동은 한발 힙 쓰러스트를 빼고 모두 동작 그림이 있고, 그림 파일이 실제로 있다', async () => {
  const { ALL_CATALOG } = await import('../../app/js/core/catalog.js');
  const { exerciseImages } = await import('../../app/js/core/media.js');
  const { existsSync } = await import('node:fs');
  const noImage = ALL_CATALOG.filter((x) => !exerciseImages(x.id).length).map((x) => x.id);
  assert.deepEqual(noImage, ['sl_hip_thrust']);
  const missing = ALL_CATALOG.flatMap((x) => exerciseImages(x.id)).filter((p) => !existsSync(new URL(`../../app/${p}`, import.meta.url)));
  assert.deepEqual(missing, []);
});

test('덤벨 스쿼트는 집에 덤벨이 있으면 집 운동에 나오고, 스미스 힙 쓰러스트는 나오지 않는다', async () => {
  const { isAvailable } = await import('../../app/js/core/plan.js');
  const s = freshState();
  s.settings.homeEquipment = ['dumbbell'];
  assert.equal(isAvailable(s, profileFor(s, 'db_squat'), { home: true }), true);
  assert.equal(isAvailable(s, profileFor(s, 'smith_hip_thrust'), { home: true }), false);
});
