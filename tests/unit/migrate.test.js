import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { importAny, ImportError } from '../../app/js/core/migrate.js';
import { createStore, memoryLocal, LS_KEY } from '../../app/js/core/store.js';

const fx = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

test('v7: 교체 버그로 오염된 기록의 운동 id 를 이름 기준으로 바로잡는다', () => {
  const { state, notes } = importAny(fx('v7_synthetic.json'));
  const chest = state.performance.find((p) => p.name === '체스트프레스 머신');
  assert.equal(chest.exerciseId, 'chest_press');
  const rear = state.performance.find((p) => p.name === '덤벨 리버스 플라이');
  assert.equal(rear.exerciseId, 'db_rear');
  assert.equal(state.performance.find((p) => p.name === '시티드 랫풀다운').exerciseId, 'lat', '별칭은 id 유지');
  assert.ok(notes.some((n) => n.includes('바로잡았습니다')));
});

test('v7: 영구 사용 불가 운동과 PT 요일을 복원한다', () => {
  const { state } = importAny(fx('v7_synthetic.json'));
  assert.deepEqual(state.settings.unavailableExercises.sort(), ['chest_row', 'row']);
  assert.equal(state.settings.ptDay, 4);
});

test('v7: 비정상적으로 짧은 세션 시간은 시간 불명(null)으로, 정상 시간은 유지', () => {
  const { state } = importAny(fx('v7_synthetic.json'));
  assert.equal(state.history.find((h) => h.date === '2026-09-21').durationSec, null);
  assert.equal(state.history.find((h) => h.date === '2026-09-23').durationSec, 4516);
  assert.equal(state.history.length, 2, '날짜가 깨진 이력은 제외');
});

test('v7: 이력과 운동 기록이 sessionId 로 연결된다', () => {
  const { state } = importAny(fx('v7_synthetic.json'));
  for (const p of state.performance) {
    assert.ok(state.history.some((h) => h.id === p.sessionId), `${p.name} 연결`);
  }
});

test('v7: 숫자 문자열은 숫자로, 빈 RIR 은 null, RIR 0 은 0', () => {
  const { state } = importAny(fx('v7_synthetic.json'));
  const bench = state.performance.find((p) => p.exerciseId === 'bench');
  assert.equal(bench.sets[0].weight, 40);
  assert.equal(bench.sets[3].rir, 0);
  const lat = state.performance.find((p) => p.exerciseId === 'lat');
  assert.equal(lat.sets[1].rir, null);
  assert.deepEqual(lat.sets.map((s) => s.type), ['warmup', 'main', 'main', 'main', 'backoff']);
});

test('v9: 휴식 선호는 버리고 중량 방식·증량 단위는 유지', () => {
  const { state, notes } = importAny(fx('v9_synthetic.json'));
  assert.equal(state.prefs.row.increment, 7.5);
  assert.equal(state.prefs.row.rest, undefined);
  assert.equal(state.prefs.bench.rest, undefined);
  assert.ok(notes.some((n) => n.includes('휴식 선호')));
});

test('v9: 편측 좌우가 다르면 split, 같으면 하나로 합친다. 미완료 세트는 버린다', () => {
  const { state } = importAny(fx('v9_synthetic.json'));
  const b = state.performance.find((p) => p.exerciseId === 'bulgarian');
  assert.equal(b.sets.length, 2);
  assert.deepEqual([b.sets[0].split, b.sets[0].leftReps, b.sets[0].rightReps], [true, 8, 10]);
  assert.deepEqual([b.sets[1].split, b.sets[1].reps], [false, 9]);
  assert.equal(b.sets[0].rir, 1, '좌우 RIR 중 낮은 값');
});

test('v9: core 역할 이름과 사용자 운동, 진행 중 세션 완료 세트를 보존한다', () => {
  const { state } = importAny(fx('v9_synthetic.json'));
  assert.equal(state.performance.find((p) => p.exerciseId === 'deadbug').slot, 'core_anti_extension');
  assert.equal(state.customExercises.length, 1);
  assert.equal(state.performance.find((p) => p.name === '힙쓰러스트').exerciseId, 'custom:힙쓰러스트:abc');
  const live = state.performance.filter((p) => p.sessionId === 's_live');
  assert.equal(live.length, 1);
  assert.equal(live[0].sets.length, 1);
  assert.deepEqual(live[0].primary, ['front_delt'], 'shoulder → 카탈로그 기준 front_delt');
  assert.ok(state.history.some((h) => h.id === 's_live' && h.workSets === 1));
  assert.equal(state.session, null);
  assert.equal(state.settings.ptDay, 2);
  assert.equal(state.settings.equipment.smith, false);
});

test('백업 파일이 아닌 JSON 은 거부한다', () => {
  for (const bad of [{}, [], null, 42, { foo: 1 }, { history: 'x', settings: {} }]) {
    assert.throws(() => importAny(bad), ImportError);
  }
});

test('가져오기 실패는 현재 상태를 바꾸지 않는다', () => {
  const store = createStore({ local: memoryLocal() });
  store.importJSON(JSON.stringify(fx('v7_synthetic.json')));
  const before = JSON.stringify(store.state);
  assert.throws(() => store.importJSON('{}'));
  assert.throws(() => store.importJSON('not json'));
  assert.equal(JSON.stringify(store.state), before);
});

test('v10 내보내기 → 가져오기 왕복은 무손실', () => {
  const store = createStore({ local: memoryLocal() });
  store.importJSON(JSON.stringify(fx('v9_synthetic.json')));
  const exported = store.exportJSON();
  const store2 = createStore({ local: memoryLocal() });
  store2.importJSON(exported);
  const a = JSON.parse(exported), b = JSON.parse(store2.exportJSON());
  delete a.revision; delete b.revision; delete a.savedAt; delete b.savedAt;
  assert.deepEqual(b, a);
});

test('불러오기: localStorage 와 IndexedDB 중 revision 이 큰 쪽을 쓴다', async () => {
  const local = memoryLocal();
  const newer = { ...importAny(fx('v7_synthetic.json')).state, revision: 9, check: { energy: 'tired', upperDoms: 0, lowerDoms: 0, pain: 'none', minutes: 60, intensity: 'normal' } };
  const older = { ...importAny(fx('v7_synthetic.json')).state, revision: 3 };
  local.setItem(LS_KEY, JSON.stringify(older));
  const idb = { get: async () => structuredClone(newer), set: async () => {} };
  const store = createStore({ local, idb });
  const notes = await store.load();
  assert.equal(store.state.revision, 9);
  assert.equal(store.state.check.energy, 'tired');
  assert.ok(notes.length >= 1);
});

test('불러오기: v10 이 없으면 옛 v9 키를 마이그레이션한다', async () => {
  const local = memoryLocal();
  local.setItem('workoutCoachUnifiedV9', JSON.stringify(fx('v9_synthetic.json')));
  const store = createStore({ local });
  await store.load();
  assert.equal(store.state.schemaVersion, 10);
  assert.ok(local.getItem(LS_KEY), '마이그레이션 결과를 v10 키로 저장');
});

const privatePath = new URL('../fixtures/private/v7_2026-09-24.json', import.meta.url);
test('실데이터 v7 (있을 때만): 데이터가 사라지지 않는다', { skip: !existsSync(privatePath) }, () => {
  const raw = JSON.parse(readFileSync(privatePath, 'utf8'));
  const { state, notes } = importAny(raw);
  assert.equal(state.history.length, raw.history.length);
  assert.equal(state.performance.length, raw.performanceHistory.length);
  const doneSets = raw.performanceHistory.reduce((a, p) => a + p.sets.filter((z) => z.done).length, 0);
  assert.equal(state.performance.reduce((a, p) => a + p.sets.length, 0), doneSets);
  assert.equal(state.performance.find((p) => p.name === '체스트프레스 머신').exerciseId, 'chest_press');
  assert.deepEqual(state.settings.unavailableExercises.sort(), ['chest_row', 'row']);
  console.log('  실데이터 보정 내역:\n   - ' + notes.join('\n   - '));
});
