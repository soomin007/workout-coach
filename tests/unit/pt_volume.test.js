// PT 볼륨 (정책 18절): 세트 수를 묻지 않고, 그 부위를 직접 한 최근 세션의 중앙값으로 친다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { freshState } from '../../app/js/core/schema.js';
import * as T from '../../app/js/core/session.js';
import { typicalSets, weeklySets } from '../../app/js/core/plan.js';

const now = new Date('2026-10-15T20:00:00');
const own = (id, date, workSets, extra = {}) => ({ id, date, part: 'lower', source: 'recommended', workSets, durationSec: 3000, note: '', overrideReason: '', performanceScore: null, volumeUnknown: false, ...extra });

test('세트 수 없이 기록한 PT 는 직접 한 세션 세트 수의 중앙값으로 주간 볼륨에 들어간다', () => {
  const s = freshState();
  s.history.push(own('a', '2026-09-20', 10), own('b', '2026-09-27', 14), own('c', '2026-10-04', 12), own('d', '2026-10-10', 4, { light: true }));
  T.logPT(s, { date: '2026-10-15', parts: ['lower'], note: '스쿼트' });
  assert.equal(s.history.at(-1).volumeUnknown, true);
  assert.equal(typicalSets(s, 'lower'), 12);
  assert.equal(weeklySets(s, 'lower', now), 4 + 12);
});

test('직접 한 기록이 없으면 PT 볼륨은 0으로 남는다', () => {
  const s = freshState();
  T.logPT(s, { date: '2026-10-15', parts: ['pull'] });
  assert.equal(weeklySets(s, 'pull', now), 0);
});
