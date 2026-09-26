// v10 상태 구조. 네 계층: 카탈로그(catalog.js) / prefs / session / history+performance.
import { EQUIPMENT, PARTS } from './catalog.js';
import { parseDateLocal, toNum } from './util.js';

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
    check: { energy: 'normal', upperDoms: 0, lowerDoms: 0, pain: 'none', minutes: 60, intensity: 'normal' },
    settings: { gymClosedSunday: true, ptDay: 4, avoidHinge: true, leftFirst: true, equipment, unavailableExercises: [] },
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
  n.prefs = x.prefs && typeof x.prefs === 'object' ? x.prefs : {};
  n.customExercises = Array.isArray(x.customExercises) ? x.customExercises : [];
  n.history = Array.isArray(x.history) ? x.history.filter((h) => h && PARTS.includes(h.part) && parseDateLocal(h.date)) : [];
  n.performance = Array.isArray(x.performance)
    ? x.performance.filter((p) => p && parseDateLocal(p.date) && Array.isArray(p.sets)).map((p) => ({ ...p, sets: p.sets.map(normalizeSet) }))
    : [];
  if (x.session && typeof x.session === 'object') {
    const s = x.session;
    n.session = {
      tempUnavailable: [], restTimer: null, note: '', overrideReason: '', timer: { running: false, start: null, elapsed: 0 },
      ...s,
      exercises: Array.isArray(s.exercises) ? s.exercises.map((e) => ({ ...e, sets: Array.isArray(e.sets) ? e.sets.map(normalizeSet) : [] })) : [],
    };
  } else n.session = null;
  return n;
}

export function looksLikeV10(x) {
  return !!x && typeof x === 'object' && x.schemaVersion === SCHEMA_VERSION;
}
