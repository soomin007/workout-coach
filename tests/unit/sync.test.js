import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore, memoryLocal } from '../../app/js/core/store.js';
import * as T from '../../app/js/core/session.js';
import { syncOnce, decide, b64encode, b64decode, loadSyncConfig, saveSyncConfig, SyncError } from '../../app/js/core/sync.js';

const now = new Date(2026, 8, 28, 18);

// Contents API 만 흉내 내는 메모리 GitHub. sha 가 다르면 409.
function fakeGitHub({ repo = 'me/log', token = 'tok' } = {}) {
  const gh = { file: null, n: 0, puts: 0 };
  gh.fetch = async (url, init = {}) => {
    const u = new URL(url);
    const reply = (status, body) => ({ status, ok: status < 300, json: async () => body, text: async () => JSON.stringify(body) });
    if (init.headers?.Authorization !== `Bearer ${token}`) return reply(401, {});
    if (u.pathname === `/repos/${repo}`) return reply(200, {});
    if (!u.pathname.startsWith(`/repos/${repo}/contents/`)) return reply(404, {});
    if ((init.method || 'GET') === 'GET') return gh.file ? reply(200, { sha: gh.file.sha, content: b64encode(gh.file.text), encoding: 'base64' }) : reply(404, {});
    const body = JSON.parse(init.body);
    if ((gh.file?.sha ?? undefined) !== body.sha) return reply(409, {});
    gh.puts++;
    gh.file = { sha: `sha${++gh.n}`, text: b64decode(body.content) };
    return reply(200, { content: { sha: gh.file.sha } });
  };
  // PC 에서 파일을 직접 고친 것처럼 바꾼다
  gh.edit = (fn) => { const s = JSON.parse(gh.file.text); fn(s); gh.file = { sha: `sha${++gh.n}`, text: JSON.stringify(s, null, 2) }; };
  return gh;
}

function phone() {
  const store = createStore({ local: memoryLocal(), clock: () => now });
  return store;
}

const cfg0 = { repo: 'me/log', token: 'tok', path: 'data.json', sha: null, revision: null, at: null };

function logPush(store) { store.commit((s) => T.logPT(s, { date: '2026-09-28', parts: ['push'], note: '벤치' })); }

test('base64 는 한글을 그대로 왕복한다', () => {
  const t = '{"note":"벤치 60x12 · 보조 받음"}';
  assert.equal(b64decode(b64encode(t)), t);
});

test('설정은 별도 키에 저장되고, 토큰이 없으면 연결 안 됨', () => {
  const local = memoryLocal();
  assert.equal(loadSyncConfig(local), null);
  saveSyncConfig(local, { repo: 'me/log', token: 'tok' });
  assert.equal(loadSyncConfig(local).path, 'data.json');
  saveSyncConfig(local, null);
  assert.equal(loadSyncConfig(local), null);
});

test('토큰이 JSON 백업에 섞이지 않는다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  logPush(store);
  await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  assert.ok(!store.exportJSON().includes('tok'));
  assert.ok(!gh.file.text.includes('"tok"'));
});

test('첫 연결: 원격이 비어 있으면 폰 기록을 올린다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  logPush(store);
  const r = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  assert.equal(r.action, 'push');
  assert.equal(JSON.parse(gh.file.text).history.length, 1);
  assert.equal(r.cfg.sha, gh.file.sha);
  assert.equal(r.cfg.revision, store.state.revision);
});

test('바뀐 게 없으면 아무것도 쓰지 않는다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  logPush(store);
  let { cfg } = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  const r = await syncOnce({ cfg, store, fetchImpl: gh.fetch });
  assert.equal(r.action, 'none');
  assert.equal(gh.puts, 1);
});

test('폰에서 기록하면 다음 동기화에 올린다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  let { cfg } = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  logPush(store);
  const r = await syncOnce({ cfg, store, fetchImpl: gh.fetch });
  assert.equal(r.action, 'push');
  assert.equal(JSON.parse(gh.file.text).history.length, 1);
});

test('PC 에서 원격을 고치면 폰이 받는다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  logPush(store);
  let { cfg } = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  gh.edit((s) => { s.history[0].workSets = 20; });
  const r = await syncOnce({ cfg, store, fetchImpl: gh.fetch });
  assert.equal(r.action, 'pull');
  assert.equal(store.state.history[0].workSets, 20);
  // 받은 뒤에는 다시 올리지 않는다
  const r2 = await syncOnce({ cfg: r.cfg, store, fetchImpl: gh.fetch });
  assert.equal(r2.action, 'none');
});

test('새 폰(빈 상태)에서 연결하면 원격을 받는다', async () => {
  const gh = fakeGitHub();
  const a = phone();
  logPush(a);
  await syncOnce({ cfg: cfg0, store: a, fetchImpl: gh.fetch });
  const b = phone();
  const r = await syncOnce({ cfg: cfg0, store: b, fetchImpl: gh.fetch });
  assert.equal(r.action, 'pull');
  assert.equal(b.state.history.length, 1);
});

test('둘 다 바뀌면 묻고, 답이 없으면 아무것도 바꾸지 않는다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  logPush(store);
  let { cfg } = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  gh.edit((s) => { s.history[0].workSets = 20; });
  logPush(store);
  const asked = [];
  const hold = await syncOnce({ cfg, store, fetchImpl: gh.fetch, resolve: async (k) => { asked.push(k); return null; } });
  assert.deepEqual(asked, ['conflict']);
  assert.equal(hold.action, 'hold');
  assert.equal(store.state.history.length, 2);
  assert.equal(JSON.parse(gh.file.text).history[0].workSets, 20);
  // 폰 것을 고르면 원격을 덮어쓴다
  const push = await syncOnce({ cfg: hold.cfg, store, fetchImpl: gh.fetch, resolve: async () => 'push' });
  assert.equal(push.action, 'push');
  assert.equal(JSON.parse(gh.file.text).history.length, 2);
});

test('충돌에서 원격을 고르면 원격으로 바뀐다', async () => {
  const gh = fakeGitHub();
  const store = phone();
  logPush(store);
  let { cfg } = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch });
  gh.edit((s) => { s.history[0].workSets = 20; });
  logPush(store);
  const r = await syncOnce({ cfg, store, fetchImpl: gh.fetch, resolve: async () => 'pull' });
  assert.equal(r.action, 'pull');
  assert.equal(store.state.history.length, 1);
  assert.equal(store.state.history[0].workSets, 20);
});

test('빈 기기가 먼저 올린 빈 파일은 묻지 않고 폰 기록으로 덮는다', async () => {
  const gh = fakeGitHub();
  await syncOnce({ cfg: cfg0, store: phone(), fetchImpl: gh.fetch });
  assert.equal(JSON.parse(gh.file.text).history.length, 0);
  const store = phone();
  logPush(store);
  const asked = [];
  const r = await syncOnce({ cfg: cfg0, store, fetchImpl: gh.fetch, resolve: async (k) => { asked.push(k); return 'pull'; } });
  assert.deepEqual(asked, []);
  assert.equal(r.action, 'push');
  assert.equal(JSON.parse(gh.file.text).history.length, 1);
  assert.equal(store.state.history.length, 1);
});

test('decide: 원격이 없으면 항상 올린다', () => {
  assert.equal(decide(cfg0, { revision: 0, history: [], performance: [], session: null }, null), 'push');
});

test('오류: 잘못된 토큰 · 없는 저장소 · 오프라인', async () => {
  const gh = fakeGitHub();
  const store = phone();
  await assert.rejects(syncOnce({ cfg: { ...cfg0, token: 'bad' }, store, fetchImpl: gh.fetch }), (e) => e instanceof SyncError && e.code === 'auth');
  await assert.rejects(syncOnce({ cfg: { ...cfg0, repo: 'me/nope' }, store, fetchImpl: gh.fetch }), (e) => e.code === 'no_repo');
  await assert.rejects(syncOnce({ cfg: cfg0, store, fetchImpl: async () => { throw new TypeError('Failed to fetch'); } }), (e) => e.code === 'offline');
});
