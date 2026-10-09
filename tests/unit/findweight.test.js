// 기록 없는 운동의 첫 무게 찾기 (정책 17절): 가벼웠던 세트는 워밍업으로, 본세트 수는 유지.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';

const now = new Date(2026, 9, 10, 18);
function pullWithoutHistory() {
  const s = freshState();
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'normal' }, { now });
  T.createSession(s, { part: 'pull', source: 'manual', now });
  const e = s.session.exercises.find((x) => x.loadMode === 'per_dumbbell' || x.loadMode === 'machine');
  return { s, e };
}
const mains = (e) => e.sets.filter((z) => z.type === 'main');

test('기록 없는 무게 운동은 찾기 모드, 워밍업 줄 없이 시작', () => {
  const { e } = pullWithoutHistory();
  assert.equal(e.findWeight, true);
  assert.equal(e.sets.filter((z) => z.type === 'warmup').length, 0);
});

test('가벼움: 그 세트는 워밍업(완료)으로, 본세트 수 유지, 남은 본세트는 20% 이상 · 한 단계 이상 올림, 다시 묻는다', () => {
  const { s, e } = pullWithoutHistory();
  const n = mains(e).length;
  const i = e.sets.findIndex((z) => z.type === 'main');
  T.editSet(s, e.uid, i, 'weight', 10);
  T.toggleSetDone(s, e.uid, i, { now });
  assert.equal(T.findWeightPending(e), i);
  T.setFindFeel(s, e.uid, i, 'light');
  assert.equal(e.sets[i].type, 'warmup');
  assert.equal(e.sets[i].done, true);
  assert.equal(mains(e).length, n);
  const inc = e.increment > 0 ? e.increment : 0.5;
  assert.ok(mains(e).every((z) => !z.done && z.weight >= Math.max(12, 10 + inc)));
  assert.equal(T.findWeightPending(e), -1, '다음 세트를 끝내기 전에는 묻지 않는다');
  assert.equal(T.countWorkSets(s.session), 0, '워밍업은 본세트로 세지 않는다');
  const j = e.sets.findIndex((z) => z.type === 'main');
  T.toggleSetDone(s, e.uid, j, { now });
  assert.equal(T.findWeightPending(e), j);
  T.setFindFeel(s, e.uid, j, 'ok');
  assert.equal(e.findWeight, false);
  assert.equal(T.findWeightPending(e), -1);
  assert.ok(mains(e).every((z) => z.weight === e.sets[j].weight));
});

test('무거움: 본세트로 남기고 남은 세트를 낮춘 뒤 찾기 끝', () => {
  const { s, e } = pullWithoutHistory();
  const i = e.sets.findIndex((z) => z.type === 'main');
  T.editSet(s, e.uid, i, 'weight', 20);
  T.toggleSetDone(s, e.uid, i, { now });
  T.setFindFeel(s, e.uid, i, 'heavy');
  assert.equal(e.sets[i].type, 'main');
  assert.equal(e.findWeight, false);
  assert.ok(mains(e).filter((z) => !z.done).every((z) => z.weight < 20));
});

test('무게를 안 적고 끝낸 세트는 묻지 않는다', () => {
  const { s, e } = pullWithoutHistory();
  const i = e.sets.findIndex((z) => z.type === 'main');
  T.toggleSetDone(s, e.uid, i, { now });
  assert.equal(T.findWeightPending(e), -1);
});
