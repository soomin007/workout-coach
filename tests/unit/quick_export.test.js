import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseQuickLine, applyQuickLine } from '../../app/js/core/quick.js';
import { importAny } from '../../app/js/core/migrate.js';
import { freshState } from '../../app/js/core/schema.js';
import { toCSV, toTXT } from '../../app/js/core/export.js';
import * as T from '../../app/js/core/session.js';

const now = new Date(2026, 8, 28, 18);

test('한 줄 입력: 중량 + 반복 나열 + 느낌', () => {
  assert.deepEqual(parseQuickLine('50 10 10 8 한계'), { sets: [{ weight: 50, reps: 10 }, { weight: 50, reps: 10 }, { weight: 50, reps: 8 }], effort: 'hard' });
});

test('한 줄 입력: 중량x반복 쌍과 음성 받아쓰기 표현', () => {
  assert.deepEqual(parseQuickLine('50x10, 50 × 10, 45X8').sets.map((x) => [x.weight, x.reps]), [[50, 10], [50, 10], [45, 8]]);
  assert.deepEqual(parseQuickLine('52.5킬로 6개 6개 5개 적당'), { sets: [{ weight: 52.5, reps: 6 }, { weight: 52.5, reps: 6 }, { weight: 52.5, reps: 5 }], effort: 'ok' });
  assert.deepEqual(parseQuickLine('10 10 8 여유', { weighted: false }).sets.map((x) => x.reps), [10, 10, 8]);
});

test('한 줄 입력: 숫자가 없으면 거부', () => {
  assert.throws(() => parseQuickLine('좋았음'), (e) => e.code === 'quick_parse');
});

test('한 줄 입력 적용: 본세트를 앞에서부터 채우고 완료, 모자라면 세트 추가', () => {
  const s = freshState();
  T.createSession(s, { part: 'pull', now });
  s.session.exercises = [T.makeEntry(s, 'curl', { part: 'pull', minutes: 60 }), T.makeEntry(s, 'pullup', { part: 'pull', minutes: 60 })];
  const curl = s.session.exercises[0], pu = s.session.exercises[1];
  applyQuickLine(s, curl.uid, '8 12 11 10 적당');
  const c = s.session.exercises[0];
  assert.deepEqual(c.sets.map((z) => [z.weight, z.reps, z.done]), [[8, 12, true], [8, 11, true], [8, 10, true]]);
  assert.equal(c.effort, 'ok');
  applyQuickLine(s, pu.uid, '10 9 8');
  assert.deepEqual(s.session.exercises[1].sets.filter((z) => z.done).map((z) => [z.weight, z.reps]), [[null, 10], [null, 9], [null, 8]]);
});

test('CSV · TXT 에 일반 기록과 편측 좌우 기록이 모두 들어간다', () => {
  const st = importAny(JSON.parse(readFileSync(new URL('../fixtures/v9_synthetic.json', import.meta.url), 'utf8'))).state;
  const csv = toCSV(st);
  assert.ok(csv.startsWith('﻿'));
  assert.ok(csv.includes('"bulgarian"'));
  assert.ok(/"8","10"/.test(csv), '좌우 반복');
  const txt = toTXT(st);
  assert.ok(txt.includes('L8/R10'));
  assert.ok(txt.includes('힙쓰러스트'));
  assert.ok(txt.includes('60kg×10'));
});
