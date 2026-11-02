// 오늘 설정 바꾸기 (2026-11-02 사용자 요청): 세션을 버리지 않고 그 자리에서 시간과 컨디션, 부위를 바꿔 다시 짠다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';

const now = new Date(2026, 8, 30, 18, 0);
const mainSets = (s) => s.session.exercises.reduce((a, e) => a + e.sets.filter((z) => z.type !== 'warmup').length, 0);

// 시작 시트를 거친 것처럼 오늘 컨디션을 고르고 세션을 만든다.
function started(part, check = {}, opts = {}) {
  const s = freshState();
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'normal', ...check }, { now });
  T.createSession(s, { part, now, ...opts });
  return s;
}

test('시간을 줄여 다시 짜면 계획이 짧아지고, 날짜와 집 설정, 직접 고른 강조는 그대로다', () => {
  const s = started('push', {}, { date: '2026-09-29' });
  T.setEmphasis(s, 'shoulder', { now });
  const before = s.session;
  T.setCheck(s, { minutes: 30 }, { now });
  T.replanSession(s, { part: 'push', now });
  assert.equal(s.session.minutes, 30);
  assert.ok(s.session.estimatedMinutes < before.estimatedMinutes, `${s.session.estimatedMinutes} < ${before.estimatedMinutes}`);
  assert.ok(s.session.exercises.length < before.exercises.length);
  assert.equal(s.session.date, '2026-09-29');
  assert.equal(s.session.emphasis, 'shoulder');
  assert.equal(s.session.ready, true, '다시 짠 계획도 시작 전 미리보기로 보여 준다');
  assert.notEqual(s.session.id, before.id);
});

test('피곤하다고 고치면 같은 운동이라도 세트가 줄어든다', () => {
  const s = started('pull');
  const before = mainSets(s);
  T.setCheck(s, { energy: 'tired' }, { now });
  T.replanSession(s, { part: 'pull', now });
  assert.ok(mainSets(s) < before, `${mainSets(s)} < ${before}`);
});

test('부위를 바꾸면 그 부위로 짜고, 출처는 직접 고름이 되며 집 설정을 넘겨받는다', () => {
  const s = started('core', {}, { source: 'recommended', home: true });
  T.replanSession(s, { part: 'push', source: 'manual', home: true, now });
  assert.equal(s.session.part, 'push');
  assert.equal(s.session.source, 'manual');
  assert.equal(s.session.home, true);
  assert.ok(s.session.exercises.every((e) => e.equipment === 'none'), '집에서 하는 Push');
});

test('같은 부위면 추천 출처를 잇고, 자동으로 고른 강조는 새로 고른다', () => {
  const s = freshState();
  s.history.push({ id: 'h1', date: '2026-09-28', part: 'push', source: 'recommended', workSets: 12, durationSec: 2400, note: '', overrideReason: '', performanceScore: 1, volumeUnknown: false, emphasis: 'chest' });
  T.setCheck(s, { energy: 'normal', minutes: 60, intensity: 'normal' }, { now });
  T.createSession(s, { part: 'push', source: 'recommended', now });
  assert.equal(s.session.emphasis, 'shoulder');
  T.setCheck(s, { minutes: 45 }, { now });
  T.replanSession(s, { part: 'push', source: 'manual', now });
  assert.equal(s.session.source, 'recommended');
  assert.equal(s.session.emphasis, 'shoulder');
  assert.match(s.session.emphasisWhy, /가슴.*어깨를/);
});

test('기록한 세트가 있으면 확인(discard) 없이는 다시 짜지 않는다', () => {
  const s = started('pull');
  const e = s.session.exercises[0];
  T.toggleSetDone(s, e.uid, e.sets.findIndex((z) => z.type === 'main'), { now });
  T.setCheck(s, { minutes: 30 }, { now });
  assert.throws(() => T.replanSession(s, { part: 'pull', now }), (err) => err.code === 'has_data');
  T.replanSession(s, { part: 'pull', discard: true, now });
  assert.equal(s.session.minutes, 30);
  assert.ok(s.session.exercises.every((x) => x.sets.every((z) => !z.done)));
});
