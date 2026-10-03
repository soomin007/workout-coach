import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState, makeSet } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { lastGrip, gripsFor, defaultGripId } from '../../app/js/core/grips.js';
import { muscleSets } from '../../app/js/core/plan.js';

const now = new Date(2026, 9, 10, 18, 0);
const done = (weight, reps) => ({ ...makeSet('main', weight, reps), done: true });
const rowRec = (date, sets, grip) => ({ sessionId: `s_${date}`, date, part: 'pull', exerciseId: 'row', primary: ['back', 'upper_back'], secondary: ['biceps'], range: [8, 12], sets, ...(grip ? { grip } : {}) });

function withRow(state) {
  T.createSession(state, { part: 'pull', now });
  state.session.exercises = [T.makeEntry(state, 'row', { part: 'pull', minutes: 60, setCount: 3 })];
  T.recalcEstimate(state);
  return state.session.exercises[0];
}

test('그립 데이터: 기본 그립은 목록 안에 있고, 모든 그립에 그림 · 잡는 법이 있다', () => {
  for (const id of ['lat', 'row', 'chest_row', 'tbar', 'pullup', 'pushdown']) {
    const gs = gripsFor(id);
    assert.ok(gs.some((g) => g.id === defaultGripId(id)), id);
    for (const g of gs) assert.ok(g.art?.attach && g.how.length && g.hold && g.emphasis, `${id}.${g.id}`);
  }
});

test('그립 기능 전 기록은 기본 그립으로 보고, 다음 세션은 지난번 그립으로 시작한다', () => {
  const s = freshState();
  s.performance.push(rowRec('2026-10-03', [done(42.5, 10)]));
  assert.equal(lastGrip(s, 'row'), 'neutral_close');
  s.performance.push(rowRec('2026-10-06', [done(30, 10)], 'overhand_wide'));
  assert.equal(lastGrip(s, 'row'), 'overhand_wide');
  const e = withRow(s);
  assert.equal(e.grip, 'overhand_wide');
  assert.deepEqual(e.primary, ['upper_back']);
  assert.equal(e.sets.find((z) => z.type === 'main').weight, 30);
});

test('그립을 바꾸면 그 그립 기록 기준으로 처방하고, 기록이 없으면 다시 맞추라고 알린다', () => {
  const s = freshState();
  s.performance.push(rowRec('2026-10-03', [done(42.5, 10), done(42.5, 10)]));
  const e = withRow(s);
  assert.equal(e.sets.find((z) => z.type === 'main').weight, 42.5);
  T.setGrip(s, e.uid, 'overhand_wide');
  assert.equal(e.prescription.kind, 'grip_change');
  assert.match(e.prescription.note, /첫 기록/);
  assert.deepEqual(e.primary, ['upper_back']);
});

test('완료한 세트가 있으면 그립을 바꿀 수 없다', () => {
  const s = freshState();
  const e = withRow(s);
  const i = e.sets.findIndex((z) => z.type === 'main');
  T.toggleSetDone(s, e.uid, i, { now });
  assert.throws(() => T.setGrip(s, e.uid, 'overhand_wide'), /기록이 섞입니다/);
  assert.equal(e.grip, 'neutral_close');
});

test('넓은 오버핸드 로우 기록은 주간 볼륨에서 상부 등 주동근으로 센다', () => {
  const s = freshState();
  const e = withRow(s);
  T.setGrip(s, e.uid, 'overhand_wide');
  // 무게를 넣으면 워밍업 행이 생겨 인덱스가 밀리므로 매번 다시 찾는다
  T.editSet(s, e.uid, e.sets.findIndex((z) => z.type === 'main'), 'weight', 30);
  for (let k = 0; k < 3; k++) T.toggleSetDone(s, e.uid, e.sets.findIndex((z) => z.type === 'main' && !z.done), { now });
  T.finishSession(s, { now });
  const p = s.performance.at(-1);
  assert.equal(p.grip, 'overhand_wide');
  assert.equal(muscleSets(s, 'upper_back', now), 3);
  assert.equal(muscleSets(s, 'back', now), 1.5);
});
