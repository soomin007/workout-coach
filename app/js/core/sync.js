// GitHub 비공개 저장소의 파일 하나(data.json)로 기록을 동기화한다. 기록을 쓰는 기기는 폰 하나라고 가정한다.
// 마지막으로 맞춘 원격 sha 와 저장 번호(revision)를 기억해 두고 비교한다:
//   원격 그대로 + 로컬 바뀜 → 올리기 · 원격 바뀜(PC 에서 수정) + 로컬 그대로 → 받기 · 둘 다 바뀜 → 사용자에게 묻기.
// 설정(토큰 포함)은 상태 밖의 별도 키에 둔다. JSON 백업이나 원격 파일에 토큰이 섞여 나가지 않게.
export const SYNC_KEY = 'workoutCoach.sync';
export const DEFAULT_PATH = 'data.json';
const API = 'https://api.github.com';

export class SyncError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export function loadSyncConfig(local) {
  try {
    const x = JSON.parse(local.getItem(SYNC_KEY) || 'null');
    if (x && typeof x === 'object' && x.repo && x.token) return { path: DEFAULT_PATH, sha: null, revision: null, at: null, ...x };
  } catch { /* 손상된 값은 연결 안 됨으로 본다 */ }
  return null;
}

export function saveSyncConfig(local, cfg) {
  local.setItem(SYNC_KEY, cfg ? JSON.stringify(cfg) : '');
}

export function validRepo(repo) {
  return /^[\w.-]+\/[\w.-]+$/.test(String(repo || '').trim());
}

// UTF-8 문자열 ↔ base64 (한글이 들어 있어 btoa 를 바로 쓸 수 없다)
export function b64encode(text) {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

export function b64decode(b64) {
  const bin = atob(String(b64).replace(/\s/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function headers(cfg, accept = 'application/vnd.github+json') {
  return { Authorization: `Bearer ${cfg.token}`, Accept: accept, 'X-GitHub-Api-Version': '2022-11-28' };
}

async function call(fetchImpl, url, init) {
  let res;
  // 브라우저 HTTP 캐시가 옛 sha 를 돌려주면 올리기가 매번 충돌하므로 캐시를 쓰지 않는다.
  try { res = await fetchImpl(url, { cache: 'no-store', ...init }); }
  catch { throw new SyncError('offline', '인터넷에 연결되지 않았습니다. 연결되면 다시 동기화합니다.'); }
  if (res.status === 401) throw new SyncError('auth', '토큰이 올바르지 않거나 만료됐습니다. 설정에서 다시 연결하세요.');
  if (res.status === 403) throw new SyncError('forbidden', '토큰에 이 저장소의 쓰기 권한(Contents)이 없습니다.');
  return res;
}

function fileUrl(cfg) {
  return `${API}/repos/${cfg.repo}/contents/${encodeURIComponent(cfg.path || DEFAULT_PATH)}`;
}

// 원격 파일을 읽는다. 파일이 없으면 null. 저장소 자체가 없거나 권한이 없으면 SyncError.
export async function fetchRemote(cfg, fetchImpl = fetch) {
  const res = await call(fetchImpl, fileUrl(cfg), { headers: headers(cfg) });
  if (res.status === 404) {
    const repo = await call(fetchImpl, `${API}/repos/${cfg.repo}`, { headers: headers(cfg) });
    if (repo.status === 404) throw new SyncError('no_repo', `저장소 ${cfg.repo} 를 찾을 수 없습니다. 이름과 토큰의 저장소 권한을 확인하세요.`);
    return null;
  }
  if (!res.ok) throw new SyncError('http', `동기화 서버 오류 (${res.status})`);
  const j = await res.json();
  // 1MB 를 넘는 파일은 content 가 비어 오므로 원본 형식으로 다시 받는다.
  if (!j.content && j.encoding === 'none') {
    const raw = await call(fetchImpl, fileUrl(cfg), { headers: headers(cfg, 'application/vnd.github.raw+json') });
    if (!raw.ok) throw new SyncError('http', `동기화 서버 오류 (${raw.status})`);
    return { sha: j.sha, text: await raw.text() };
  }
  return { sha: j.sha, text: b64decode(j.content) };
}

// 원격 파일을 쓴다. sha 가 원격과 다르면 conflict. 새 sha 를 돌려준다.
export async function putRemote(cfg, text, sha, message, fetchImpl = fetch) {
  const body = { message, content: b64encode(text) };
  if (sha) body.sha = sha;
  const res = await call(fetchImpl, fileUrl(cfg), { method: 'PUT', headers: { ...headers(cfg), 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  if (res.status === 409 || res.status === 422) throw new SyncError('conflict', '그 사이 원격 기록이 바뀌었습니다.');
  if (res.status === 404) throw new SyncError('no_repo', `저장소 ${cfg.repo} 를 찾을 수 없거나 쓰기 권한이 없습니다.`);
  if (!res.ok) throw new SyncError('http', `동기화 서버 오류 (${res.status})`);
  const j = await res.json();
  return j.content.sha;
}

function hasRecords(state) {
  return !!(state.history?.length || state.performance?.length || state.session);
}

// 무엇을 할지 정한다: 'none' | 'push' | 'pull' | 'conflict'
export function decide(cfg, state, remote) {
  const localDirty = cfg.sha ? state.revision !== cfg.revision : hasRecords(state);
  if (!remote) return 'push';
  if (remote.sha === cfg.sha) return localDirty ? 'push' : 'none';
  if (!localDirty) return 'pull';
  // 원격에 기록이 하나도 없으면(빈 기기에서 먼저 연결한 경우) 물을 것 없이 올린다. 잘못 고르면 폰 기록이 빈 파일로 덮인다.
  if (!hasRecords(remoteState(remote))) return 'push';
  return 'conflict';
}

function remoteState(remote) {
  try { return JSON.parse(remote.text) || {}; } catch { return { history: [1] }; } // 읽을 수 없는 파일은 기록이 있다고 보고 묻는다
}

// 한 번 동기화한다. resolve(kind) 는 충돌 시 'push' | 'pull' | null(보류) 를 돌려주는 콜백.
// store: { state, exportJSON(), importJSON(text) }. 바뀐 설정(cfg)과 한 일(action)을 돌려준다.
export async function syncOnce({ cfg, store, fetchImpl = fetch, resolve = async () => null, clock = () => new Date() }) {
  const next = { ...cfg };
  const remote = await fetchRemote(next, fetchImpl);
  let action = decide(next, store.state, remote);
  // 내용이 같으면(다른 기기에서 같은 백업을 올린 경우 등) 기준점만 맞춘다.
  if (remote && (action === 'conflict' || action === 'pull') && remote.text === store.exportJSON()) action = 'same';
  if (action === 'conflict') action = (await resolve('conflict')) || 'hold';
  if (action === 'push') {
    next.sha = await putRemote(next, store.exportJSON(), remote?.sha ?? null, `기록 동기화 · 저장 번호 ${store.state.revision}`, fetchImpl);
    next.revision = store.state.revision;
  } else if (action === 'pull') {
    store.importJSON(remote.text);
    next.sha = remote.sha;
    next.revision = store.state.revision;
  } else if (action === 'same' || action === 'none') {
    next.sha = remote.sha;
    next.revision = store.state.revision;
  }
  if (action !== 'hold') next.at = clock().toISOString();
  return { cfg: next, action };
}
