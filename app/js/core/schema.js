// v10 상태 구조. 네 계층: 카탈로그(catalog.js) / prefs / session / history+performance.
import { EQUIPMENT, PARTS, catalogByName, RETIRED_IDS } from './catalog.js';
import { parseDateLocal, toNum } from './util.js';
import { actualOrder } from './order.js';

export const SCHEMA_VERSION = 10;
export const EFFORTS = ['easy', 'ok', 'hard'];
export const EFFORT_LABEL = { easy: '여유 있음', ok: '적당', hard: '한계' };
// 느낌 → 대표 RIR (코칭 정책 1절)
export const EFFORT_RIR = { easy: 3, ok: 2, hard: 0 };

export function freshState() {
  const equipment = {};
  Object.keys(EQUIPMENT).forEach((k) => { equipment[k] = true; });
  return {
    schemaVersion: SCHEMA_VERSION,
    revision: 0,
    savedAt: null,
    lastBackup: null,
    check: { energy: 'normal', upperDoms: 0, lowerDoms: 0, pain: 'none', minutes: 60, intensity: 'normal', gymClosedDate: null, noPtDate: null, day: null, confirmed: [] },
    settings: { goal: 'hypertrophy', gymClosedSunday: true, ptDay: 4, avoidHinge: true, leftFirst: true, equipment, unavailableExercises: [], homeEquipment: [] },
    // 사용자가 설정에서 명시적으로 바꾼 운동별 기본값만. 세션 중 코치 조정은 절대 쓰지 않는다.
    prefs: {},
    customExercises: [],
    session: null,
    history: [],
    performance: [],
  };
}

// 세트 하나. 숫자 필드는 number|null. split 이면 좌우 따로(leftReps/rightReps), 아니면 reps 하나.
export function makeSet(type = 'main', weight = null, reps = null) {
  return {
    type, weight, reps, rir: null,
    split: false, leftReps: null, rightReps: null,
    done: false, doneAt: null, restBefore: null, touched: false,
  };
}

// 세트의 대표 반복수: 좌우를 나눴으면 약한 쪽(작은 값).
export function setReps(s) {
  if (s.split) {
    const xs = [s.leftReps, s.rightReps].filter((x) => x !== null && x !== undefined);
    return xs.length ? Math.min(...xs) : null;
  }
  return s.reps ?? null;
}

function normalizeSet(z) {
  const s = { ...makeSet(), ...(z && typeof z === 'object' ? z : {}) };
  for (const k of ['weight', 'reps', 'rir', 'leftReps', 'rightReps', 'doneAt', 'restBefore']) s[k] = toNum(s[k]);
  if (!['warmup', 'main', 'backoff'].includes(s.type)) s.type = 'main';
  s.done = !!s.done; s.split = !!s.split; s.touched = !!s.touched;
  return s;
}

// v10 형식 데이터를 기본값으로 보강한다. 모르는 필드는 보존한다.
export function normalizeState(src) {
  const base = freshState();
  const x = src && typeof src === 'object' ? src : {};
  const n = { ...base, ...x };
  n.schemaVersion = SCHEMA_VERSION;
  n.revision = Number.isFinite(+x.revision) ? +x.revision : 0;
  n.check = { ...base.check, ...(x.check || {}) };
  n.settings = { ...base.settings, ...(x.settings || {}) };
  n.settings.equipment = { ...base.settings.equipment, ...(x.settings?.equipment || {}) };
  n.settings.unavailableExercises = Array.isArray(x.settings?.unavailableExercises) ? [...new Set(x.settings.unavailableExercises)] : [];
  n.settings.homeEquipment = Array.isArray(x.settings?.homeEquipment) ? [...new Set(x.settings.homeEquipment)] : [];
  n.prefs = x.prefs && typeof x.prefs === 'object' ? x.prefs : {};
  n.customExercises = Array.isArray(x.customExercises) ? x.customExercises : [];
  n.history = Array.isArray(x.history) ? x.history.filter((h) => h && PARTS.includes(h.part) && parseDateLocal(h.date)) : [];
  n.performance = Array.isArray(x.performance)
    ? x.performance.filter((p) => p && parseDateLocal(p.date) && Array.isArray(p.sets)).map((p) => ({ ...p, sets: p.sets.map(normalizeSet) }))
    : [];
  backfillOrder(n.performance);
  if (x.session && typeof x.session === 'object') {
    const s = x.session;
    n.session = {
      tempUnavailable: [], restTimer: null, note: '', overrideReason: '', timer: { running: false, start: null, elapsed: 0 },
      ...s,
      exercises: Array.isArray(s.exercises) ? s.exercises.map((e) => ({ ...e, sets: Array.isArray(e.sets) ? e.sets.map(normalizeSet) : [] })) : [],
    };
  } else n.session = null;
  adoptCatalog(n);
  return n;
}

// 사용자가 직접 만든 운동과 같은 이름의 운동이 카탈로그에 생기면(10/23 레그 익스텐션), 기록 · 선호 · 진행 중 세션을
// 카탈로그 id 로 옮기고 사용자 운동은 지운다. 처방이 지난 기록에서 그대로 이어진다. 카탈로그에서 뺀 id(RETIRED_IDS)도 같이 옮긴다.
function adoptCatalog(n) {
  const moved = new Map(Object.entries(RETIRED_IDS));
  n.customExercises = n.customExercises.filter((c) => {
    const cat = catalogByName(c?.name);
    if (!cat || cat.id === c.id) return true;
    moved.set(c.id, cat.id);
    return false;
  });
  for (const p of n.performance) if (moved.has(p.exerciseId)) p.exerciseId = moved.get(p.exerciseId);
  for (const e of n.session?.exercises || []) if (moved.has(e.exerciseId)) e.exerciseId = moved.get(e.exerciseId);
  for (const [from, to] of moved) {
    if (n.prefs[from] && !n.prefs[to]) n.prefs[to] = n.prefs[from];
    delete n.prefs[from];
  }
  n.settings.unavailableExercises = [...new Set(n.settings.unavailableExercises.map((id) => moved.get(id) || id))];
}

// 순서 기록(order · prefatigue)이 없는 옛 기록에, 세트 완료 시각이 남아 있으면 소급해서 채운다.
// 시각이 없는 세션(이관 기록 등)은 비워 둔다: 조건을 모르는 기록으로 남는다.
function backfillOrder(perf) {
  const groups = new Map();
  for (const p of perf) {
    if (p.prefatigue !== undefined || !p.sessionId) continue;
    if (!groups.has(p.sessionId)) groups.set(p.sessionId, []);
    groups.get(p.sessionId).push(p);
  }
  for (const xs of groups.values()) {
    if (!xs.every((p) => p.sets.some((z) => z.done && z.type === 'main' && Number.isFinite(z.doneAt)))) continue;
    const ord = actualOrder(xs.map((p, i) => ({ key: i, primary: p.primary, secondary: p.secondary, sets: p.sets })));
    xs.forEach((p, i) => { const o = ord.get(i); if (o) { p.order = o.order; p.prefatigue = o.prefatigue; } });
  }
}

export function looksLikeV10(x) {
  return !!x && typeof x === 'object' && x.schemaVersion === SCHEMA_VERSION;
}
