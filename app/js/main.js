// 앱 진입점: 저장소 연결, 화면 렌더, 이벤트 위임.
import { createStore } from './core/store.js';
import * as T from './core/session.js';
import { applyQuickLine } from './core/quick.js';
import { toCSV, toTXT } from './core/export.js';
import { replacementCandidates, partPool, isAvailable } from './core/plan.js';
import { profileFor } from './core/coach.js';
import { PART_LABEL, LOAD_MODES, CORE_SLOTS, OPTIONAL_SLOTS, PART_MUSCLES, ALL_CATALOG, MUSCLE_LABEL, slotName } from './core/catalog.js';
import { localISODate } from './core/util.js';
import { esc, toast, sheet, confirmSheet, choiceSheet, numberSheet, textSheet, handleSheetBack, sheetOpen } from './ui/dom.js';
import { renderToday, renderRecords, renderSettings, renderRestbar, evidenceHtml, MODE_LABEL } from './ui/views.js';
import { recommendPart } from './core/plan.js';

// ---------- 저장소 어댑터 ----------
const local = { getItem: (k) => localStorage.getItem(k), setItem: (k, v) => localStorage.setItem(k, v) };
const IDB_NAME = 'WorkoutCoachV10';
function idbOpen() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore('kv');
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}
let idbTimer = null, idbLatest = null;
const idb = {
  get: async () => { const db = await idbOpen(); return new Promise((res) => { const g = db.transaction('kv').objectStore('kv').get('state'); g.onsuccess = () => res(g.result || null); g.onerror = () => res(null); }); },
  // 입력이 몰릴 때를 대비해 마지막 스냅샷만 400ms 뒤에 쓴다.
  set: (snap) => new Promise((res, rej) => {
    idbLatest = snap;
    clearTimeout(idbTimer);
    idbTimer = setTimeout(async () => {
      try { const db = await idbOpen(); const tx = db.transaction('kv', 'readwrite'); tx.objectStore('kv').put(idbLatest, 'state'); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); } catch (e) { rej(e); }
    }, 400);
  }),
};

const ui = { tab: 'today', newDate: null, historyLimit: 30, wakeLock: false, storage: {}, condOpen: false, expanded: new Set(), version: null };
let wakeLockHandle = null;

const store = createStore({
  local, idb,
  onChange: (_s, info = {}) => { ui.storage = { ...ui.storage, ...store.status }; if ('persisted' in info) renderStatus(); else render(); },
});
window.__store = store; // E2E 테스트용 조회 핸들

// ---------- 렌더 ----------
function render() {
  const view = document.getElementById('view');
  const now = new Date();
  if (ui.tab === 'today') view.innerHTML = renderToday(store.state, ui, now);
  else if (ui.tab === 'records') view.innerHTML = renderRecords(store.state, ui, now);
  else view.innerHTML = renderSettings(store.state, ui);
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('on', b.dataset.tab === ui.tab));
  renderRest();
  renderStatus();
  const f = document.getElementById('importFile');
  if (f) f.onchange = onImportFile;
}

function renderStatus() {
  const el = document.getElementById('status');
  const st = store.status;
  const bad = st.local === 'error' || st.idb === 'error';
  const days = store.state.lastBackup ? Math.floor((Date.now() - new Date(store.state.lastBackup).getTime()) / 86400000) : null;
  el.innerHTML = `${bad ? '<span class="badge bad">저장 오류</span>' : ''}${days === null || days >= 7 ? `<span class="badge warn">${days === null ? '백업 없음' : `백업 ${days}일 전`}</span>` : ''}${store.state.session ? '<span class="badge good">운동 중</span>' : ''}${ui.updateReady ? '<button class="badge warn" data-action="apply-update">업데이트</button>' : ''}`;
}

let restNotified = null;
function renderRest() {
  const bar = document.getElementById('restbar');
  const r = renderRestbar(store.state);
  if (!r) { bar.classList.add('hidden'); bar.innerHTML = ''; return; }
  bar.classList.remove('hidden');
  bar.classList.toggle('over', r.over);
  bar.innerHTML = r.html;
  const rt = store.state.session.restTimer;
  const key = `${rt.uid}:${rt.setIndex}:${rt.startedAt}`;
  if (r.over && restNotified !== key) { restNotified = key; navigator.vibrate?.([150, 80, 150]); }
}

setInterval(() => {
  if (!store.state.session) return;
  const c = document.getElementById('sessionClock');
  if (c) c.textContent = fmt(T.timerSeconds(store.state.session.timer));
  renderRest();
}, 500);
function fmt(sec) { const s = Math.max(0, Math.floor(sec)); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }

// 전이 실행: 실패하면 상태 불변 + 안내.
function run(fn, okMsg) {
  try { const r = store.commit(fn); if (okMsg) toast(typeof okMsg === 'function' ? okMsg(r) : okMsg); return r; }
  catch (e) { toast(e.message || '처리하지 못했습니다.'); return undefined; }
}

const entry = (uid) => store.state.session?.exercises.find((e) => e.uid === uid);

// ---------- 동작 ----------
const actions = {
  'apply-update': () => location.reload(),
  tab: (d) => { ui.tab = d.tab; render(); window.scrollTo(0, 0); },
  energy: (d) => run((s) => { s.check.energy = d.v; }),
  start: (d) => startSession(d.part, d.source, '', d.home === '1'),
  'gym-closed': () => run((s) => { const t = localISODate(); s.check.gymClosedDate = s.check.gymClosedDate === t ? null : t; }),
  'complete-rest': (d) => run((s) => T.completeRemaining(s, d.uid), (n) => (n ? `${n}세트를 계획대로 완료했습니다. 다르게 한 세트만 고치세요.` : '완료할 세트가 없습니다.')),
  'start-manual': async () => {
    const homeDefault = store.state.check.gymClosedDate === localISODate() || (new Date().getDay() === 0 && store.state.settings.gymClosedSunday);
    const r = await sheet(`<h3>부위 직접 선택</h3><label class="setting"><span>집에서 (헬스장 없이)</span><input type="checkbox" name="home"${homeDefault ? ' checked' : ''}></label><textarea name="why" placeholder="추천과 다르게 고른 이유 (선택): PT 일정, 기구, 선호 등"></textarea>
      <div class="list" style="margin-top:10px">${['push', 'pull', 'lower', 'core'].map((p) => `<button data-sheet-value="${p}">${PART_LABEL[p]}</button>`).join('')}</div>
      <div class="actions"><button class="btn" data-sheet-value="__cancel">닫기</button></div>`, { collect: (b) => ({ why: b.querySelector('[name=why]').value, home: b.querySelector('[name=home]').checked }) });
    if (r) startSession(r.value, 'manual', r.data.why, r.data.home);
  },
  pt: () => logPT(),
  evidence: () => sheet(evidenceHtml()),
  timer: () => run((s) => T.toggleSessionTimer(s)),
  wakelock: () => toggleWakeLock(),
  repair: () => run((s) => T.repairSession(s), (n) => (n ? `핵심 동작 ${n}개를 채웠습니다.` : '채울 수 있는 운동이 없습니다.')),
  'add-ex': () => addExercise(),
  'change-part': async () => {
    const p = await choiceSheet('어느 부위로 바꿀까요?', ['push', 'pull', 'lower', 'core'].filter((x) => x !== store.state.session.part).map((x) => ({ value: x, label: PART_LABEL[x] })));
    if (!p) return;
    if (T.sessionHasUserData(store.state) && !(await confirmSheet('지금까지 입력한 내용을 버리고 새 부위로 다시 만들까요?', { ok: '버리고 바꾸기', danger: true }))) return;
    run((s) => { const date = s.session.date; T.createSession(s, { part: p, source: 'manual', date }); });
  },
  discard: async () => {
    if (T.sessionHasUserData(store.state) && !(await confirmSheet('입력한 기록까지 모두 버릴까요? 되돌릴 수 없습니다.', { ok: '버리기', danger: true }))) return;
    run((s) => T.discardSession(s), '세션을 버렸습니다.');
  },
  step: (d) => stepValue(d),
  num: async (d) => {
    const e = entry(d.uid); const z = e?.sets[+d.i];
    if (!z) return;
    const title = d.f === 'weight' ? `${e.name} 중량 (kg)` : `${e.name} ${d.f === 'leftReps' ? '왼쪽 ' : d.f === 'rightReps' ? '오른쪽 ' : ''}${e.measure === 'seconds' ? '시간(초)' : '반복'}`;
    const zeroLabel = d.f === 'weight' && ['machine', 'per_side'].includes(e.loadMode) ? '원판을 하나도 안 꽂았으면 0 을 입력하세요 (빈 기구).' : d.f === 'weight' && e.loadMode === 'assist' ? '보조중량: 몸무게를 덜어 주는 무게입니다. 숫자가 클수록 쉽습니다.' : '';
    const v = await numberSheet(title, z[d.f], { step: d.f === 'weight' ? 'any' : '1', zeroLabel });
    if (v === undefined) return;
    run((s) => T.editSet(s, d.uid, +d.i, d.f, v));
  },
  done: (d) => {
    const wasDone = entry(d.uid)?.sets[+d.i]?.done;
    run((s) => T.toggleSetDone(s, d.uid, +d.i));
    if (!wasDone) scrollToNext();
  },
  split: (d) => run((s) => T.setSplit(s, d.uid, +d.i, d.on === '1')),
  effort: (d) => {
    ui.expanded.delete(d.uid);
    run((s) => T.setEffort(s, d.uid, entry(d.uid)?.effort === d.v ? null : d.v));
    scrollToNext();
  },
  expand: (d) => { ui.expanded.add(d.uid); render(); },
  collapse: (d) => { ui.expanded.delete(d.uid); render(); },
  'toggle-cond': () => { ui.condOpen = !ui.condOpen; render(); },
  why: () => {
    const r = recommendPart(store.state);
    sheet(`<h3>추천 계산 자세히</h3><div class="small">${esc(r.why)} (신뢰도 ${esc(r.confidence || '-')})</div><ul class="reasons">${(r.detail || []).map((x) => `<li>${esc(x)}</li>`).join('')}</ul><div class="actions"><button class="btn" data-action="evidence-open" data-sheet-value="evidence">추천 근거</button><button class="btn primary" data-sheet-value="__cancel">닫기</button></div>`).then((v) => { if (v === 'evidence') sheet(evidenceHtml()); });
  },
  'session-menu': () => sessionMenu(),
  'check-update': () => checkUpdate(),
  quick: async (d) => {
    const e = entry(d.uid);
    const t = await textSheet(`${e.name} 한 줄 입력`, '', { placeholder: e.loadMode === 'bodyweight' ? '예: 10 10 8 한계' : '예: 50 10 10 8 한계', hint: '중량 다음 세트별 반복, 끝에 느낌(여유 · 적당 · 한계). 키보드 마이크로 말해도 됩니다. 입력한 세트는 완료로 표시됩니다.' });
    if (t === null || !t.trim()) return;
    run((s) => applyQuickLine(s, d.uid, t), (r) => `${r.count}세트를 기록했습니다.`);
  },
  'set-menu': async (d) => {
    const e = entry(d.uid); const z = e?.sets[+d.i];
    if (!z) return;
    const v = await choiceSheet(`${e.name} ${+d.i + 1}번째 줄`, [
      { value: 'warmup', label: '워밍업으로', hint: '볼륨에 넣지 않습니다', disabled: z.type === 'warmup' },
      { value: 'main', label: '본세트로', disabled: z.type === 'main' },
      { value: 'backoff', label: '백오프로', hint: '톱세트 뒤 가벼운 추가 세트', disabled: z.type === 'backoff' },
      { value: 'rir', label: `이 세트 RIR 직접 입력${z.rir !== null ? ` (지금 ${z.rir})` : ''}`, hint: '선택 사항. 보통은 운동 끝에 느낌 버튼으로 충분합니다' },
    ]);
    if (!v) return;
    if (v === 'rir') { const n = await numberSheet('남은 반복 (RIR)', z.rir, { step: '1' }); if (n !== undefined) run((s) => T.editSet(s, d.uid, +d.i, 'rir', n)); return; }
    run((s) => T.editSet(s, d.uid, +d.i, 'type', v));
  },
  'set-count': (d) => run((s) => T.changeSetCount(s, d.uid, +d.d)),
  'ex-menu': (d) => exerciseMenu(d.uid),
  'rest-adj': (d) => { const rt = store.state.session?.restTimer; if (rt) run((s) => T.adjustRest(s, rt.uid, +d.d)); },
  'rest-stop': () => run((s) => T.stopRest(s)),
  finish: () => finishSession(),
  'export-json': () => exportJSON(),
  'export-csv': () => download(`workout_coach_${localISODate()}.csv`, toCSV(store.state), 'text/csv;charset=utf-8'),
  'export-txt': () => download(`workout_coach_${localISODate()}.txt`, toTXT(store.state), 'text/plain;charset=utf-8'),
  print: () => window.print(),
  import: () => document.getElementById('importFile')?.click(),
  'more-history': () => { ui.historyLimit += 30; render(); },
  'hist-edit': (d) => editHistory(d.id),
  'unavail-remove': (d) => run((s) => { s.settings.unavailableExercises = s.settings.unavailableExercises.filter((x) => x !== d.id); }),
  'pref-edit': (d) => editPref(d.id),
  'pref-pick': async () => {
    const all = [...ALL_CATALOG, ...store.state.customExercises];
    const id = await choiceSheet('설정할 운동', all.map((x) => ({ value: x.id, label: x.name, hint: PART_LABEL[x.part] })));
    if (id) editPref(id);
  },
};

// change/input 이벤트용
const changeActions = {
  check: (d, el) => run((s) => { s.check[d.k] = ['upperDoms', 'lowerDoms', 'minutes'].includes(d.k) ? +el.value : el.value; }),
  'new-date': (d, el) => { ui.newDate = el.value || null; },
  'session-date': (d, el) => run((s) => T.setSessionDate(s, el.value), '운동 날짜를 바꿨습니다.'),
  setting: (d, el) => run((s) => { s.settings[d.k] = d.k === 'ptDay' ? (el.value === 'none' ? null : +el.value) : el.value === 'true'; }),
  'setting-bool': (d, el) => run((s) => { s.settings[d.k] = el.checked; }),
  equip: (d, el) => run((s) => { s.settings.equipment[d.k] = el.checked; }),
  'home-equip': (d, el) => run((s) => { const xs = new Set(s.settings.homeEquipment || []); if (el.checked) xs.add(d.k); else xs.delete(d.k); s.settings.homeEquipment = [...xs]; }),
};
// 타이핑 중 다시 그리면 포커스를 잃으므로 조용히 저장만 한다.
const inputActions = {
  note: (d, el) => { try { store.commit((s) => T.setSessionNote(s, el.value), { silent: true }); } catch { /* 세션 없음 */ } },
};

document.addEventListener('click', (ev) => {
  const b = ev.target.closest('[data-action]');
  if (!b || b.closest('#sheet')) return;
  if (b.tagName === 'SELECT' || b.tagName === 'INPUT' || b.tagName === 'TEXTAREA') return;
  const fn = actions[b.dataset.action];
  if (fn) { ev.preventDefault(); fn({ ...b.dataset }); }
});
document.getElementById('tabs').addEventListener('click', (ev) => { const b = ev.target.closest('[data-tab]'); if (b) actions.tab({ tab: b.dataset.tab }); });
document.addEventListener('change', (ev) => { const el = ev.target.closest('[data-action]'); const fn = el && changeActions[el.dataset.action]; if (fn) fn({ ...el.dataset }, el); });
document.addEventListener('input', (ev) => { const el = ev.target.closest('[data-action]'); const fn = el && inputActions[el.dataset.action]; if (fn) fn({ ...el.dataset }, el); });

// 다음 세트가 화면 밖이면 가운데로 부드럽게 옮긴다.
function scrollToNext() {
  requestAnimationFrame(() => {
    const el = document.querySelector('.set.next');
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 90 || r.bottom > window.innerHeight - 150) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  });
}

async function sessionMenu() {
  const s = store.state.session;
  if (!s) return;
  const v = await choiceSheet('세션', [
    { value: 'add', label: '+ 운동 추가' },
    { value: 'complete-all', label: '남은 세트 전부 계획대로 완료', hint: '운동이 끝난 뒤 몰아서 기록할 때. 다르게 한 세트만 고치면 됩니다' },
    { value: 'date', label: '운동 날짜 바꾸기', hint: s.date },
    { value: 'part', label: '부위 바꾸기', hint: '입력한 기록은 버려집니다' },
    { value: 'discard', label: '세션 버리기' },
  ]);
  if (v === 'add') return addExercise();
  if (v === 'complete-all') {
    if (await confirmSheet('아직 안 한 세트를 모두 지금 적힌 값대로 완료 처리할까요?', { ok: '완료 처리' })) run((st) => T.completeRemaining(st), (n) => `${n}세트를 완료 처리했습니다.`);
    return;
  }
  if (v === 'part') return actions['change-part']();
  if (v === 'discard') return actions.discard();
  if (v === 'date') {
    const r = await sheet(`<h3>운동 날짜</h3><p class="small">실제로 운동한 날짜로 저장됩니다.</p><input type="date" name="date" value="${esc(s.date)}"><div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok">확인</button></div>`, { collect: (b) => b.querySelector('[name=date]').value });
    if (r) run((st) => T.setSessionDate(st, r.data), '운동 날짜를 바꿨습니다.');
  }
}

let swReg = null;
async function checkUpdate() {
  if (!swReg) { toast('이 환경에서는 업데이트 확인을 쓸 수 없습니다.'); return; }
  toast('업데이트 확인 중...');
  try {
    await swReg.update();
    if (swReg.installing || swReg.waiting) toast('새 버전을 받는 중입니다. 곧 자동으로 적용됩니다.', 4000);
    else toast('최신 버전입니다.');
  } catch { toast('업데이트를 확인하지 못했습니다. 인터넷 연결을 확인하세요.'); }
}

async function readVersion() {
  try { const ks = await caches.keys(); ui.version = ks.find((k) => k.startsWith('wc-') && k !== 'wc-fonts') || null; } catch { ui.version = null; }
}

// ---------- 흐름 ----------
async function startSession(part, source, overrideReason = '', home = false) {
  if (store.state.session && T.sessionHasUserData(store.state) && !(await confirmSheet('진행 중인 세션 기록이 있습니다. 버리고 새로 시작할까요?', { ok: '버리고 시작', danger: true }))) return;
  const date = ui.newDate || localISODate();
  run((s) => T.createSession(s, { part, source, date, overrideReason, home }));
  ui.newDate = null;
  window.scrollTo(0, 0);
}

function stepValue(d) {
  const e = entry(d.uid); const z = e?.sets[+d.i];
  if (!z) return;
  const dir = +d.d;
  let v;
  if (d.f === 'weight') {
    const step = e.increment > 0 ? e.increment : e.loadMode === 'bodyweight' ? 2.5 : 1;
    // 처음 하는 운동처럼 중량이 비어 있으면 0부터 누르게 하지 않고 바로 숫자 입력을 연다.
    if (z.weight === null && e.loadMode !== 'bodyweight') return actions.num(d);
    const cur = z.weight ?? 0;
    v = Math.max(0, Math.round((cur + dir * step) * 100) / 100);
    if (e.loadMode === 'bodyweight' && v === 0) v = null;
  } else {
    const step = e.measure === 'seconds' ? 5 : 1;
    const cur = z[d.f] ?? (d.f === 'reps' ? e.prescription?.reps ?? e.range[0] : z.reps ?? e.range[0]);
    v = Math.max(0, cur + dir * step);
  }
  run((s) => T.editSet(s, d.uid, +d.i, d.f, v));
}

async function exerciseMenu(uid) {
  const e = entry(uid);
  if (!e) return;
  const idx = store.state.session.exercises.findIndex((x) => x.uid === uid);
  const v = await choiceSheet(e.name, [
    { value: 'swap', label: '운동 변경', hint: '같은 동작 대체 후보가 먼저 나옵니다' },
    { value: 'unavail', label: '오늘 기구 사용 불가', hint: '같은 동작의 다른 운동으로 자동 교체' },
    { value: 'unavail-perm', label: '이 헬스장에 없음 (항상 제외)' },
    { value: 'custom', label: '실제로 한 운동 이름 입력', hint: '목록에 없는 운동으로 바꾸기' },
    { value: 'up', label: '위로 이동', disabled: idx === 0 },
    { value: 'down', label: '아래로 이동', disabled: idx === store.state.session.exercises.length - 1 },
    { value: 'memo', label: e.memo ? '메모 수정' : '메모 남기기' },
    { value: 'pref', label: '이 운동 기본값 설정', hint: '중량 방식 · 증량 · 기본 휴식 · 반복 범위 (다음 세션에도 적용)' },
    { value: 'remove', label: '오늘 세션에서 삭제' },
  ]);
  if (!v) return;
  if (v === 'swap') return swapExercise(uid);
  if (v === 'unavail' || v === 'unavail-perm') {
    if (T.entryHasUserData(e) && e.sets.some((z) => !z.done && z.touched) && !(await confirmSheet('아직 완료하지 않은 입력값은 버리고 교체합니다. 계속할까요?'))) return;
    const name = e.name;
    return run((s) => T.markUnavailable(s, uid, { persistent: v === 'unavail-perm' }), (ne) => (ne ? `${name} → ${ne.name}` : '같은 동작의 대체 운동이 없습니다. 운동 변경이나 자동 보완을 써 보세요.'));
  }
  if (v === 'custom') return customExercise(uid);
  if (v === 'up' || v === 'down') return run((s) => T.moveExercise(s, uid, idx + (v === 'up' ? -1 : 1)));
  if (v === 'memo') { const t = await textSheet('운동 메모', e.memo, { placeholder: '자극, 통증, 자세, 좌우 차이, 추천이 이상했던 점', multiline: true }); if (t !== null) run((s) => T.setMemo(s, uid, t)); return; }
  if (v === 'pref') return editPref(e.exerciseId);
  if (v === 'remove') {
    if (T.entryHasUserData(e) && !(await confirmSheet('이 운동에 기록이 있습니다. 그래도 삭제할까요?', { ok: '삭제', danger: true }))) return;
    run((s) => T.removeExercise(s, uid));
  }
}

async function confirmReplace(e) {
  const done = e.sets.some((z) => z.done);
  if (done) return confirmSheet('완료한 세트는 지금 운동 기록으로 남기고, 남은 세트를 새 운동으로 이어서 할까요?', { ok: '이어서 하기' });
  if (e.sets.some((z) => z.touched) || (e.memo || '').trim()) return confirmSheet('아직 완료하지 않은 입력값을 버리고 교체할까요?', { ok: '교체', danger: true });
  return true;
}

async function swapExercise(uid) {
  const e = entry(uid);
  const cands = replacementCandidates(store.state, e);
  if (!cands.length) { toast('오늘 세션과 겹치지 않는 대체 후보가 없습니다.'); return; }
  const id = await choiceSheet(`${e.name} 대신`, cands.map((x) => ({ value: x.id, label: x.name, hint: `${x.sameSlot ? '같은 동작' : '다른 역할'} · ${MODE_LABEL[x.mode]} · ${x.range[0]}~${x.range[1]}${x.measure === 'seconds' ? '초' : '회'}` })));
  if (!id || !(await confirmReplace(e))) return;
  run((s) => T.replaceExercise(s, uid, id), (ne) => `${ne.name}(으)로 바꿨습니다.`);
}

async function customExercise(uid) {
  const e = entry(uid);
  const r = await sheet(`<h3>실제로 한 운동</h3>
    <label class="field">이름<input type="text" name="name" value=""></label>
    <div class="grid2" style="margin-top:8px">
      <label class="field">중량 방식<select name="mode">${LOAD_MODES.map(([v, l]) => `<option value="${v}"${v === e.loadMode ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">증량 단위 kg<input type="number" name="inc" step="0.5" min="0" value="${e.increment}"></label>
      <label class="field">목표 최소<input type="number" name="lo" min="1" value="${e.range[0]}"></label>
      <label class="field">목표 최대<input type="number" name="hi" min="1" value="${e.range[1]}"></label>
      <label class="field">기본 휴식(초)<input type="number" name="rest" min="30" step="15" value="${e.rest}"></label>
      <label class="field">좌우 따로<select name="uni"><option value="0">아니오</option><option value="1"${e.unilateral ? ' selected' : ''}>예</option></select></label>
    </div>
    <div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok">바꾸기</button></div>`,
  { collect: (b) => Object.fromEntries([...b.querySelectorAll('[name]')].map((x) => [x.name, x.value])) });
  if (!r || !r.data.name.trim() || !(await confirmReplace(e))) return;
  const f = r.data;
  // 사용자 운동 생성과 교체를 한 커밋으로: 교체가 실패하면 사용자 운동도 남지 않는다.
  run((s) => {
    const x = T.createCustomExercise(s, { name: f.name, part: s.session.part, role: e.slot, primary: [...e.primary], secondary: [...e.secondary], compound: e.compound, mode: f.mode, inc: f.inc, range: [+f.lo, +f.hi], rest: +f.rest, unilateral: f.uni === '1', measure: e.measure });
    return T.replaceExercise(s, uid, x.id);
  }, (ne) => `${ne.name}(으)로 바꿨습니다.`);
}

async function addExercise() {
  const s = store.state.session;
  const used = new Set(s.exercises.map((e) => e.exerciseId));
  const pool = partPool(store.state, s.part).filter((x) => isAvailable(store.state, x) && !used.has(x.id));
  const v = await choiceSheet('추가할 운동', [{ value: '__new', label: '+ 목록에 없는 운동 새로 만들기' }, ...pool.map((x) => ({ value: x.id, label: x.name, hint: `${slotName(x.role)} · ${MODE_LABEL[x.mode]}` }))]);
  if (!v) return;
  if (v !== '__new') { run((st) => T.addExercise(st, v), (e) => `${e.name} 추가`); return; }
  const slots = [...(CORE_SLOTS[s.part] || []), ...(OPTIONAL_SLOTS[s.part] || [])];
  const muscles = PART_MUSCLES[s.part] || ['core'];
  const r = await sheet(`<h3>새 운동 만들기</h3>
    <label class="field">이름<input type="text" name="name"></label>
    <div class="grid2" style="margin-top:8px">
      <label class="field">역할<select name="role">${slots.map((x) => `<option value="${x}">${slotName(x)}</option>`).join('')}</select></label>
      <label class="field">주동근<select name="pm"><option value="">선택 안 함</option>${muscles.map((m) => `<option value="${m}">${MUSCLE_LABEL[m] || m}</option>`).join('')}</select></label>
      <label class="field">중량 방식<select name="mode">${LOAD_MODES.map(([x, l]) => `<option value="${x}"${x === 'machine' ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">증량 단위 kg<input type="number" name="inc" step="0.5" min="0" value="2.5"></label>
      <label class="field">목표 최소<input type="number" name="lo" min="1" value="8"></label>
      <label class="field">목표 최대<input type="number" name="hi" min="1" value="12"></label>
      <label class="field">기본 휴식(초)<input type="number" name="rest" min="30" step="15" value="90"></label>
      <label class="field">좌우 따로<select name="uni"><option value="0">아니오</option><option value="1">예</option></select></label>
      <label class="field">복합운동<select name="compound"><option value="0">아니오</option><option value="1">예</option></select></label>
    </div>
    <div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok">만들고 추가</button></div>`,
  { collect: (b) => Object.fromEntries([...b.querySelectorAll('[name]')].map((x) => [x.name, x.value])) });
  if (!r) return;
  const f = r.data;
  run((st) => {
    const x = T.createCustomExercise(st, { name: f.name, part: st.session.part, role: f.role, primary: f.pm ? [f.pm] : [], mode: f.mode, inc: f.inc, range: [+f.lo, +f.hi], rest: +f.rest, unilateral: f.uni === '1', compound: f.compound === '1' });
    return T.addExercise(st, x.id);
  }, (e) => `${e.name} 추가`);
}

async function editPref(exerciseId) {
  const p = profileFor(store.state, exerciseId);
  if (!p) return;
  const r = await sheet(`<h3>${esc(p.name)} 기본값</h3><p class="small">여기서 바꾼 값만 다음 세션에도 유지됩니다. 오늘 코치가 늘린 휴식은 저장되지 않습니다.</p>
    <div class="grid2">
      <label class="field">중량 방식<select name="loadMode">${LOAD_MODES.map(([v, l]) => `<option value="${v}"${v === p.mode ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label class="field">증량 단위 kg<input type="number" name="increment" step="0.5" min="0" value="${p.inc}"></label>
      <label class="field">기본 휴식(초)<select name="rest">${[45, 60, 75, 90, 120, 150, 180, 210, 240, 300].map((x) => `<option value="${x}"${x === p.rest ? ' selected' : ''}>${x}초</option>`).join('')}</select></label>
      <label class="field">좌우 따로<select name="unilateral"><option value="0">아니오</option><option value="1"${p.unilateral ? ' selected' : ''}>예</option></select></label>
      <label class="field">목표 최소<input type="number" name="lo" min="1" value="${p.range[0]}"></label>
      <label class="field">목표 최대<input type="number" name="hi" min="1" value="${p.range[1]}"></label>
    </div>
    <div class="actions"><button class="btn" data-sheet-value="reset">기본값으로</button><button class="btn primary" data-sheet-value="ok">저장</button></div>`,
  { collect: (b) => Object.fromEntries([...b.querySelectorAll('[name]')].map((x) => [x.name, x.value])) });
  if (!r) return;
  if (r.value === 'reset') { run((s) => { delete s.prefs[exerciseId]; }, '기본값으로 되돌렸습니다. 새로 만드는 세션부터 적용됩니다.'); return; }
  const f = r.data;
  const lo = Math.max(1, +f.lo || 1), hi = Math.max(lo, +f.hi || lo);
  run((s) => T.setPref(s, exerciseId, { loadMode: f.loadMode, increment: Math.max(0, +f.increment || 0), rest: +f.rest, unilateral: f.unilateral === '1', range: [lo, hi] }), '저장했습니다.');
}

async function finishSession() {
  const s = store.state.session;
  if (T.countWorkSets(s) === 0 && !(await confirmSheet('완료한 본세트가 없습니다. 그래도 저장할까요?', { ok: '저장' }))) return;
  const sum = run((st) => T.finishSession(st));
  if (!sum) return;
  const lines = sum.exercises.map((x) => `<div class="small"><b>${esc(x.name)}</b> ${x.sets.map((z) => `${z.weight ?? ''}${z.weight !== null ? '×' : ''}${z.reps ?? '-'}`).join(' / ')}</div>`).join('');
  await sheet(`<h3>${esc(PART_LABEL[sum.part])} 완료 · ${sum.workSets}세트 · ${sum.durationSec ? `${Math.round(sum.durationSec / 60)}분` : '시간 모름'}</h3>${lines}<div class="actions"><button class="btn primary" data-sheet-value="ok">확인</button></div>`);
}

async function logPT() {
  const r = await sheet(`<h3>PT 기록</h3>
    <label class="field">날짜<input type="date" name="date" value="${localISODate()}"></label>
    <div class="small" style="margin-top:8px">주요 부위 (여러 개 가능)</div>
    <div class="row">${['push', 'pull', 'lower', 'core'].map((p) => `<label class="chip"><input type="checkbox" name="part" value="${p}"> ${PART_LABEL[p]}</label>`).join('')}</div>
    <label class="field" style="margin-top:8px">대략적 작업세트 (모르면 비움)<input type="number" name="sets" min="0" max="60" inputmode="numeric"></label>
    <label class="field" style="margin-top:8px">메모<textarea name="note" placeholder="예: 스쿼트, 스미스 스쿼트, 불가리안"></textarea></label>
    <div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok">저장</button></div>`,
  { collect: (b) => ({ date: b.querySelector('[name=date]').value, parts: [...b.querySelectorAll('[name=part]:checked')].map((x) => x.value), sets: b.querySelector('[name=sets]').value, note: b.querySelector('[name=note]').value }) });
  if (!r) return;
  run((s) => T.logPT(s, { date: r.data.date, parts: r.data.parts, sets: r.data.sets === '' ? null : +r.data.sets, note: r.data.note }), 'PT 기록을 저장했습니다.');
}

async function editHistory(id) {
  const h = store.state.history.find((x) => x.id === id);
  if (!h) return;
  const r = await sheet(`<h3>기록 수정</h3>
    <div class="grid2"><label class="field">날짜<input type="date" name="date" value="${esc(h.date)}"></label>
    <label class="field">부위<select name="part">${['push', 'pull', 'lower', 'core'].map((p) => `<option value="${p}"${p === h.part ? ' selected' : ''}>${PART_LABEL[p]}</option>`).join('')}</select></label>
    <label class="field">운동 시간(분)<input type="number" name="min" min="0" max="600" inputmode="numeric" enterkeyhint="done" placeholder="모름" value="${h.durationSec ? Math.round(h.durationSec / 60) : ''}"></label></div>
    <div class="actions"><button class="btn danger" data-sheet-value="delete">삭제</button><button class="btn primary" data-sheet-value="ok">저장</button></div>`,
  { collect: (b) => ({ date: b.querySelector('[name=date]').value, part: b.querySelector('[name=part]').value, min: b.querySelector('[name=min]').value }) });
  if (!r) return;
  if (r.value === 'delete') {
    if (await confirmSheet(`${h.date} ${PART_LABEL[h.part]} 기록과 연결된 운동 기록을 삭제할까요?`, { ok: '삭제', danger: true })) run((s) => T.deleteHistory(s, id), '삭제했습니다.');
    return;
  }
  run((s) => { if (r.data.date !== h.date) T.updateHistoryDate(s, id, r.data.date); if (r.data.part !== h.part) T.updateHistoryPart(s, id, r.data.part); T.setHistoryDuration(s, id, r.data.min === '' ? null : +r.data.min); }, '수정했습니다.');
}

function download(name, text, type) {
  const u = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = u; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(u), 1000);
}

function exportJSON() {
  store.commit((s) => { s.lastBackup = new Date().toISOString(); });
  download(`workout_coach_${localISODate()}.json`, store.exportJSON(), 'application/json;charset=utf-8');
}

async function onImportFile(ev) {
  const f = ev.target.files[0];
  ev.target.value = '';
  if (!f) return;
  if (store.state.session && T.sessionHasUserData(store.state) && !(await confirmSheet('진행 중인 세션이 있습니다. 백업으로 덮어쓸까요?', { ok: '덮어쓰기', danger: true }))) return;
  try {
    const notes = store.importJSON(await f.text());
    await sheet(`<h3>복원 완료</h3>${notes.map((n) => `<div class="small">· ${esc(n)}</div>`).join('') || '<div class="small">그대로 복원했습니다.</div>'}<div class="actions"><button class="btn primary" data-sheet-value="ok">확인</button></div>`);
  } catch (e) {
    toast(e.message || '복원하지 못했습니다.', 4000);
  }
}

async function toggleWakeLock() {
  if (ui.wakeLock) { await wakeLockHandle?.release?.(); wakeLockHandle = null; ui.wakeLock = false; render(); return; }
  try { wakeLockHandle = await navigator.wakeLock.request('screen'); ui.wakeLock = true; wakeLockHandle.addEventListener('release', () => { ui.wakeLock = false; render(); }); }
  catch { toast('이 브라우저에서는 화면 켜짐 유지를 쓸 수 없습니다.'); }
  render();
}
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState === 'visible') {
    if (ui.wakeLock && !wakeLockHandle) { try { wakeLockHandle = await navigator.wakeLock.request('screen'); } catch { ui.wakeLock = false; } }
    render();
    askStaleSession();
  }
});

// 마지막 활동 후 오래 지난 세션이 열려 있으면 먼저 묻는다 (종료를 잊은 경우).
let staleAsking = false;
async function askStaleSession() {
  const info = T.staleSessionInfo(store.state);
  if (!info || staleAsking || sheetOpen()) return;
  staleAsking = true;
  const last = new Date(info.lastAt);
  const when = `${last.getMonth() + 1}/${last.getDate()} ${String(last.getHours()).padStart(2, '0')}:${String(last.getMinutes()).padStart(2, '0')}`;
  const hours = info.idleMin >= 120 ? `${Math.floor(info.idleMin / 60)}시간` : `${info.idleMin}분`;
  const v = await sheet(`<h3>끝내지 않은 운동이 있어요</h3><p class="small">${esc(info.date)} ${esc(PART_LABEL[info.part])} · 완료 ${info.workSets}세트 · 마지막 기록 ${when} (${hours} 전)</p><p class="small">저장하면 운동 시간은 마지막 기록까지로 계산됩니다. 안 한 세트가 있으면 먼저 이어서 기록해도 됩니다.</p>
    <div class="list"><button data-sheet-value="save">${info.workSets ? '저장하고 종료' : '기록 없음 · 저장하고 종료'}</button><button data-sheet-value="continue">이어서 기록하기</button><button data-sheet-value="discard">버리기</button></div>`);
  staleAsking = false;
  if (v === 'save') return finishSession();
  if (v === 'discard') { if (await confirmSheet('이 세션의 기록을 모두 버릴까요?', { ok: '버리기', danger: true })) run((s) => T.discardSession(s), '세션을 버렸습니다.'); return; }
  if (v === 'continue') run((s) => { s.session.lastActivityAt = Date.now(); });
}

// ---------- 업데이트 ----------
// 새 버전 서비스 워커가 활성화되면(controllerchange) 세션 중이 아닐 때 바로 새로고침, 세션 중이면 배지만 띄운다.
// 로컬 개발 서버에서는 캐시가 방해되므로 ?sw 를 붙였을 때만 등록한다.
function registerServiceWorker() {
  const local = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (!('serviceWorker' in navigator) || (local && !location.search.includes('sw'))) return;
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then((reg) => {
    swReg = reg;
    reg.update().catch(() => {});
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') reg.update().catch(() => {}); });
  }).catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (!store.state.session) { location.reload(); return; }
    ui.updateReady = true;
    renderStatus();
  });
}

// ---------- 뒤로가기 ----------
// 시트가 열려 있으면 시트만 닫고(dom.js), 기록·설정 탭이면 오늘 탭으로, 오늘 탭이면 한 번 더 눌러야 종료.
// 크롬은 사용자 조작 없이 쌓은 기록을 뒤로가기에서 건너뛰므로, 가드는 첫 터치 때 쌓는다.
let guardArmed = false;
function armBackGuard() {
  if (guardArmed || sheetOpen()) return;
  history.pushState({ guard: true }, '');
  guardArmed = true;
}
document.addEventListener('pointerdown', armBackGuard, { capture: true });
window.addEventListener('popstate', () => {
  if (handleSheetBack()) return;
  guardArmed = false;
  if (ui.tab !== 'today') { actions.tab({ tab: 'today' }); armBackGuard(); return; }
  toast('뒤로 버튼을 한 번 더 누르면 종료됩니다.', 2000);
});

// ---------- 시작 ----------
(async () => {
  const notes = await store.load();
  if (navigator.storage?.persist) {
    try { ui.storage.persisted = (await navigator.storage.persisted()) || (await navigator.storage.persist()); } catch { ui.storage.persisted = false; }
  }
  render();
  if (notes.length) toast(notes[0], 4000);
  askStaleSession();
  registerServiceWorker();
  readVersion().then(() => { if (ui.tab === 'settings') render(); });
})();

