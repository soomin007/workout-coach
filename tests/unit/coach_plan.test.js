import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { importAny } from '../../app/js/core/migrate.js';
import { freshState } from '../../app/js/core/schema.js';
import { profileFor, lastPerformance, prescribe, warmupPlan } from '../../app/js/core/coach.js';
import { buildPlan, recommendPart, effectiveCheck, checkConfirmed } from '../../app/js/core/plan.js';
import { setCheck } from '../../app/js/core/session.js';
import { CORE_SLOTS } from '../../app/js/core/catalog.js';

const v7 = () => importAny(JSON.parse(readFileSync(new URL('../fixtures/v7_synthetic.json', import.meta.url), 'utf8'))).state;
const rx = (state, id) => prescribe(profileFor(state, id), lastPerformance(state, id));
const perf = (exerciseId, sets, extra = {}) => ({ sessionId: 's', date: '2026-09-20', part: 'push', exerciseId, name: exerciseId, sets: sets.map(([weight, reps, rir = null]) => ({ type: 'main', weight, reps, rir, split: false, done: true })), effort: null, ...extra });

test('처방: 벤치 50kg×8 두 세트가 상한(8) 도달 → 52.5kg, 하한 6회부터', () => {
  const r = rx(v7(), 'bench');
  assert.deepEqual([r.kind, r.weight, r.reps], ['increase', 52.5, 6]);
});

test('처방: 랫풀다운 50×8, 57×5, 65×5 → 범위 안을 채운 50kg 유지, 9회', () => {
  const r = rx(v7(), 'lat');
  assert.deepEqual([r.kind, r.weight, r.reps], ['hold', 50, 9]);
});

test('처방: 풀업 체중 10·10 (범위 6~10) → 상한 도달 안내', () => {
  const r = rx(v7(), 'pullup');
  assert.deepEqual([r.kind, r.weight, r.reps], ['bw_top', null, 10]);
});

test('처방: 하한 미만만 있으면 약 10% 감량, 증량 단위로 내림', () => {
  const s = freshState();
  s.performance.push(perf('bench', [[60, 4], [60, 3]]));
  const r = rx(s, 'bench');
  assert.deepEqual([r.kind, r.weight, r.reps], ['decrease', 52.5, 6]);
});

test('처방: 느낌이 한계면 상한을 채워도 증량하지 않는다', () => {
  const s = freshState();
  s.performance.push(perf('bench', [[50, 8], [50, 8]], { effort: 'hard' }));
  assert.equal(rx(s, 'bench').kind, 'hold');
});

test('처방: assist 는 상한 도달 시 보조중량을 줄인다', () => {
  const s = freshState();
  s.prefs.pullup = { loadMode: 'assist', increment: 5 };
  s.performance.push(perf('pullup', [[30, 10], [30, 10]]));
  const r = rx(s, 'pullup');
  assert.deepEqual([r.kind, r.weight], ['increase', 25]);
});

test('처방: 기록 없음 → 중량 비움, 보정 안내', () => {
  const r = rx(freshState(), 'bench');
  assert.equal(r.kind, 'first');
  assert.equal(r.weight, null);
});

test('워밍업: 첫 복합 60kg → 30 · 42.5 · 50, 체중·고립 운동은 없음', () => {
  const s = freshState();
  assert.deepEqual(warmupPlan(profileFor(s, 'bench'), 60, 'full').map((x) => x.weight), [30, 42.5, 50]);
  assert.deepEqual(warmupPlan(profileFor(s, 'pullup'), 60, 'full'), []);
  assert.deepEqual(warmupPlan(profileFor(s, 'lateral'), 10, 'short'), []);
});

for (const part of ['push', 'pull', 'lower']) {
  for (const minutes of [30, 45, 60, 75]) {
    test(`계획: ${part} ${minutes}분은 핵심 슬롯을 모두 채우고 중복이 없다`, () => {
      const s = freshState();
      s.check.minutes = minutes;
      const p = buildPlan(s, part, minutes);
      for (const slot of CORE_SLOTS[part]) assert.ok(p.planned.some((x) => x.slot === slot), slot);
      assert.equal(new Set(p.planned.map((x) => x.id)).size, p.planned.length);
      assert.equal(p.planned.filter((x) => x.warmupLevel === 'full').length, 1, '첫 복합운동만 full 워밍업');
    });
  }
}

test('계획: Core 는 항신전 · 항회전 · 항측굴 3종 이상', () => {
  const p = buildPlan(freshState(), 'core', 30);
  assert.ok(p.planned.length >= 3);
  for (const slot of CORE_SLOTS.core) assert.ok(p.planned.some((x) => x.slot === slot), slot);
});

test('계획: 장비 끔 · 영구 사용 불가 운동은 제외', () => {
  const s = freshState();
  s.settings.equipment.bench_rack = false;
  s.settings.unavailableExercises = ['row'];
  assert.ok(!buildPlan(s, 'push', 60).planned.some((x) => x.id === 'bench'));
  assert.ok(!buildPlan(s, 'pull', 60).planned.some((x) => x.id === 'row'));
});

test('추천: 매우 피곤 → 휴식, PT 요일 → PT, 일요일 휴무 → Core, 무릎 통증 → Lower 제외', () => {
  const s = freshState();
  const thu = new Date(2026, 8, 24, 10), sun = new Date(2026, 8, 27, 10), mon = new Date(2026, 8, 28, 10);
  setCheck(s, { energy: 'very_tired' }, { now: mon });
  assert.equal(recommendPart(s, mon).part, 'rest');
  setCheck(s, { energy: 'normal' }, { now: thu });
  assert.equal(recommendPart(s, thu).part, 'pt');
  assert.equal(recommendPart(s, sun).part, 'core');
  setCheck(s, { pain: 'knee' }, { now: mon });
  assert.notEqual(recommendPart(s, mon).part, 'lower');
  setCheck(s, { pain: 'none' }, { now: thu });
  s.history.push({ id: 'pt', date: '2026-09-24', part: 'push', source: 'pt', workSets: 0 });
  assert.equal(recommendPart(s, thu).part, 'done', 'PT 기록 후에는 오늘 완료로 본다');
});

test('추천: 오늘 운동을 마쳤으면 PT 요일이어도 완료 표시, 추가 운동은 오늘 한 부위를 뺀다', () => {
  const s = freshState();
  const thu = new Date(2026, 9, 1, 20);
  s.settings.ptDay = 4;
  assert.equal(recommendPart(s, thu).part, 'pt');
  s.history.push({ id: 'x', date: '2026-10-01', part: 'lower', source: 'manual', workSets: 13 });
  assert.equal(recommendPart(s, thu).part, 'done');
  const extra = recommendPart(s, thu, { extra: true });
  assert.ok(['push', 'pull', 'core'].includes(extra.part), extra.part);
  s.history.push({ id: 'y', date: '2026-10-01', part: 'push', source: 'manual', workSets: 10 }, { id: 'z', date: '2026-10-01', part: 'pull', source: 'manual', workSets: 10 });
  assert.equal(recommendPart(s, thu, { extra: true }).part, 'core', '큰 부위를 다 했으면 짧은 Core');
});

test('컨디션: 어제 고른 피로·근육통은 오늘 추천에 쓰지 않고, 시간·강도는 오늘 다시 골라야 확인된다', () => {
  const s = freshState();
  const d1 = new Date(2026, 8, 29, 10), d2 = new Date(2026, 8, 30, 10);
  setCheck(s, { energy: 'very_tired', lowerDoms: 3, minutes: 30, intensity: 'normal' }, { now: d1 });
  assert.equal(recommendPart(s, d1).part, 'rest');
  assert.deepEqual([...checkConfirmed(s, d1)].sort(), ['energy', 'intensity', 'lowerDoms', 'minutes']);
  assert.equal(effectiveCheck(s, d2).energy, 'normal');
  assert.equal(effectiveCheck(s, d2).lowerDoms, 0);
  assert.notEqual(recommendPart(s, d2).part, 'rest');
  assert.deepEqual(checkConfirmed(s, d2), []);
  setCheck(s, { intensity: 'strength' }, { now: d2 });
  assert.deepEqual(checkConfirmed(s, d2), ['intensity']);
  assert.equal(s.check.lowerDoms, 0, '날짜가 바뀌면 어제 근육통 값은 기본값으로');
  assert.throws(() => setCheck(s, { minutes: 33 }, { now: d2 }));
});

test('추천 설명: 쉰 기간 · 부족한 근육 · 채운 근육을 문장으로', async () => {
  const { explainRecommendation } = await import('../../app/js/core/plan.js');
  const s = v7();
  const now = new Date(2026, 8, 25, 10);
  const rec = recommendPart(s, now);
  assert.equal(rec.part, 'lower');
  const lines = explainRecommendation(s, rec, now);
  assert.match(lines[0], /하체 운동 기록이 아직 없어요/);
  assert.ok(lines.some((l) => /대퇴사두·햄스트링·둔근·종아리 세트가 목표의 절반도/.test(l)));
  assert.ok(!lines.some((l) => /채웠어요/.test(l)), '합성 데이터는 가슴 6세트라 아직 미달');
  s.performance.push(perf('cable_fly', [[10, 12], [10, 12], [10, 12], [10, 12]], { date: '2026-09-24' }));
  assert.ok(explainRecommendation(s, rec, now).some((l) => /가슴은 이번 주 목표 세트를 채웠어요/.test(l)));
  const { josa } = await import('../../app/js/core/plan.js');
  assert.deepEqual([josa('이두', '은', '는'), josa('하체', '을', '를'), josa('가슴·삼두', '은', '는'), josa('등·이두', '을', '를')], ['이두는', '하체를', '가슴·삼두는', '등·이두를']);
});
