// 세션 상태 전이. 모든 함수는 전달받은 state(초안)를 직접 수정한다.
// 호출 측(store)은 structuredClone 한 초안에 적용하고 성공하면 교체하므로, 예외가 나면 아무것도 바뀌지 않는다.
// 사용자 확인(confirm)은 전이를 부르기 전에 UI 에서 끝낸다 (known-issues #5).
import { CORE_SLOTS, catalogById } from './catalog.js';
import { profileFor, lastPerformance, prescribe, prescribeForOrder, warmupPlan, heavyEligible, heavyPrescribe, backoffWeight, HEAVY } from './coach.js';
import { buildPlan, adjustedSetCount, supportsSlot, replacementCandidates, missingCoreSlots, chooseForSlot, estimateMinutes, CHECK_DEFAULTS, CHECK_KEYS, checkConfirmed } from './plan.js';
import { makeSet, setReps, EFFORT_RIR } from './schema.js';
import { newId, localISODate, roundTo, parseDateLocal } from './util.js';
import { plannedPrefatigue, actualOrder, fatigueClass } from './order.js';

export class TransitionError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

function need(cond, code, msg) { if (!cond) throw new TransitionError(code, msg); }

function sessionOf(state) {
  need(state.session, 'no_session', '진행 중인 세션이 없습니다.');
  return state.session;
}

export function findEntry(state, uid) {
  const s = sessionOf(state);
  const idx = s.exercises.findIndex((e) => e.uid === uid);
  need(idx >= 0, 'no_entry', '운동을 찾을 수 없습니다.');
  return { entry: s.exercises[idx], idx };
}

// 운동 항목 생성. 프로필 전체를 카탈로그 + prefs 에서 새로 계산한다 (이전 운동에서 계승하지 않음).
export function makeEntry(state, exerciseId, { slot = null, setCount = null, warmupLevel = null, part, minutes } = {}) {
  const p = profileFor(state, exerciseId);
  need(p, 'unknown_exercise', `알 수 없는 운동: ${exerciseId}`);
  const sl = slot || p.role;
  const n = setCount ?? adjustedSetCount(state, p, part ?? p.part, minutes ?? 60, sl);
  const rx = prescribe(p, lastPerformance(state, p.id, { heavy: false }));
  const level = warmupLevel ?? (p.compound ? 'short' : 'none');
  const entry = {
    uid: newId('x'), exerciseId: p.id, name: p.name, slot: sl, role: p.role,
    primary: [...p.primary], secondary: [...p.secondary],
    range: [...p.range], rest: p.rest, restToday: null, increment: p.inc, loadMode: p.mode,
    unilateral: p.unilateral, compound: p.compound, measure: p.measure, equipment: p.equipment,
    why: p.why, cue: p.cue, warmupLevel: level,
    prescription: rx, coach: '', effort: null, memo: '',
    sets: [],
  };
  for (const w of warmupPlan(p, rx.weight, level)) entry.sets.push(makeSet('warmup', w.weight, w.reps));
  for (let i = 0; i < n; i++) entry.sets.push(makeSet('main', rx.weight, rx.reps));
  return entry;
}

// 무거운 날로 바꾸기: 톱세트 1개(3~5회 · RIR 2) + 백오프(약 10% 가볍게, 5~6회). 세트 수는 늘리지 않는다.
// 세트 타입은 'main' 그대로 두어 주간 볼륨 계산은 같고, heavy 표시('top' | 'backoff')로 처방만 분리한다.
export function makeHeavy(state, entry) {
  const p = profileFor(state, entry.exerciseId);
  if (!heavyEligible(p)) return false;
  const rx = heavyPrescribe(p, state);
  const mains = entry.sets.filter((z) => z.type !== 'warmup').length;
  const nBack = Math.max(2, Math.min(3, mains - 1));
  const bw = backoffWeight(rx.weight, p.inc);
  entry.heavy = true;
  entry.warmupLevel = 'heavy';
  entry.prescription = { ...rx, note: `${rx.note} 이어서 백오프 ${nBack}세트${bw !== null ? ` ${bw}kg` : ''} × ${HEAVY.backoff[0]}~${HEAVY.backoff[1]}회.` };
  entry.restToday = Math.max(entry.rest, HEAVY.rest);
  const top = { ...makeSet('main', rx.weight, rx.reps), heavy: 'top' };
  const backs = Array.from({ length: nBack }, () => ({ ...makeSet('main', bw, HEAVY.backoff[1]), heavy: 'backoff' }));
  const warm = warmupPlan(p, rx.weight, 'heavy').map((w) => makeSet('warmup', w.weight, w.reps));
  entry.sets = [...warm, top, ...backs];
  entry.coach = ['squat', 'horizontal_push'].includes(entry.slot) ? '톱세트 전에 세이프티 바 높이를 확인하세요.' : '';
  return true;
}

function firstCompoundUid(s) {
  return s.exercises.find((e) => e.compound)?.uid || null;
}

// 오늘 컨디션 확인. 고른 항목을 오늘 확인한 것으로 표시한다. 날짜가 바뀌었으면 어제 확인한 값은 기본값으로 되돌린다.
const CHECK_VALUES = {
  energy: ['good', 'normal', 'tired', 'very_tired'], upperDoms: [0, 1, 2, 3], lowerDoms: [0, 1, 2, 3],
  pain: ['none', 'shoulder', 'back', 'knee', 'ankle', 'other'], minutes: [30, 45, 60, 75, 90], intensity: ['light', 'normal', 'strength'],
};
export function setCheck(state, values, { now = new Date() } = {}) {
  const c = state.check;
  const today = localISODate(now);
  if (c.day !== today) {
    Object.assign(c, CHECK_DEFAULTS);
    c.day = today; c.confirmed = [];
  }
  const ok = new Set(checkConfirmed(state, now));
  for (const [k, raw] of Object.entries(values)) {
    need(CHECK_KEYS.includes(k), 'bad_check', `알 수 없는 컨디션 항목: ${k}`);
    const v = typeof CHECK_VALUES[k][0] === 'number' ? Number(raw) : raw;
    need(CHECK_VALUES[k].includes(v), 'bad_check', '컨디션 값을 확인하세요.');
    c[k] = v; ok.add(k);
  }
  c.confirmed = [...ok];
}

export function createSession(state, { part, source = 'manual', date = null, overrideReason = '', home = false, now = new Date() }) {
  const c = state.check;
  const minutes = part === 'core' ? Math.min(30, c.minutes) : c.minutes;
  const plan = buildPlan(state, part, minutes, now, { home });
  state.session = {
    id: newId('s'), part, source, date: date || localISODate(now), minutes, intensity: c.intensity,
    startedAt: now.getTime(), estimatedMinutes: plan.estimatedMinutes, note: '', overrideReason,
    tempUnavailable: [], restTimer: null, timer: { running: true, start: now.getTime(), elapsed: 0 }, home: !!home, lastActivityAt: now.getTime(),
    exercises: [],
  };
  state.session.exercises = plan.planned.map((x) => makeEntry(state, x.id, { slot: x.slot, setCount: x.sets, warmupLevel: x.warmupLevel, part, minutes }));
  // 근력 중심: 첫 번째로 적용할 수 있는 메인 복합 운동 하나만 무거운 날로.
  if (c.intensity === 'strength') {
    for (const e of state.session.exercises) if (makeHeavy(state, e)) break;
  }
  recalcEstimate(state);
  return state.session;
}

// 순서·세트 수가 바뀌면 각 운동 앞의 같은 근육 세트 수(선행 피로)를 다시 세고,
// 피로 조건(먼저/지친 뒤)이 바뀐 운동만 처방을 다시 계산한다. 손댄 운동과 무거운 날은 그대로 둔다.
// 반환: 처방이 바뀐 항목들.
export function applyOrderContext(state) {
  const s = state.session;
  if (!s) return [];
  const changed = [];
  s.exercises.forEach((e, i) => {
    const pf = plannedPrefatigue(s.exercises, i);
    const cls = fatigueClass(pf);
    const was = e.orderClass;
    e.prefatigue = pf;
    if (was === cls) return;
    e.orderClass = cls;
    if (e.heavy || entryHasUserData(e)) return;
    const p = profileFor(state, e.exerciseId);
    if (!p) return;
    const rx = prescribeForOrder(p, state, pf);
    const prev = e.prescription;
    e.prescription = rx;
    for (const z of e.sets) if (z.type === 'main' && !z.done && !z.touched) { z.weight = rx.weight; z.reps = rx.reps; }
    recomputeWarmups(e, p);
    if (was !== undefined && (prev?.weight !== rx.weight || prev?.reps !== rx.reps)) changed.push(e);
  });
  return changed;
}

export function recalcEstimate(state) {
  const s = state.session;
  if (!s) return [];
  const changed = applyOrderContext(state);
  const f = firstCompoundUid(s);
  s.estimatedMinutes = Math.round(s.exercises.reduce((a, e) => a + estimateMinutes({ compound: e.compound, rest: e.restToday ?? e.rest }, e.sets.filter((z) => z.type !== 'warmup').length, e.uid === f), 0));
  return changed;
}

// 사용자가 손댄(또는 완료한) 흔적이 있는가. 교체·삭제 전 확인 여부 판단용.
export function entryHasUserData(entry) {
  return !!(entry.memo || '').trim() || entry.effort !== null || entry.sets.some((z) => z.done || z.touched);
}

export function sessionHasUserData(state) {
  return !!state.session && state.session.exercises.some(entryHasUserData);
}

function stopRestFor(s, uid) {
  if (s.restTimer?.uid === uid) s.restTimer = null;
}

// 운동 교체 (단일 전이). 정책:
// - 완료 세트 없음: 새 운동 프로필 전체로 교체. 세트 수는 새 운동 기준으로 다시 계산.
// - 일부 완료: 기존 항목은 완료 세트만 남기고, 남은 본세트 수만큼 새 운동 항목을 바로 뒤에 추가.
// - 전부 완료: 교체하지 않는다 (all_done).
export function replaceExercise(state, uid, newExerciseId, { now = new Date() } = {}) {
  const s = sessionOf(state);
  const { entry: old, idx } = findEntry(state, uid);
  const p = profileFor(state, newExerciseId);
  need(p, 'unknown_exercise', '알 수 없는 운동입니다.');
  need(newExerciseId !== old.exerciseId, 'same_exercise', '같은 운동입니다.');
  need(!s.exercises.some((e) => e.uid !== uid && e.exerciseId === newExerciseId), 'duplicate', '이미 오늘 세션에 있는 운동입니다.');
  const slot = supportsSlot(p, old.slot) ? old.slot : p.role;
  const doneCount = old.sets.filter((z) => z.done).length;
  const remainingMain = old.sets.filter((z) => !z.done && z.type !== 'warmup').length;
  need(!(doneCount && remainingMain === 0), 'all_done', '이미 모든 세트를 완료한 운동입니다.');
  stopRestFor(s, uid);
  if (doneCount) {
    old.sets = old.sets.filter((z) => z.done);
    const ne = makeEntry(state, newExerciseId, { slot, setCount: remainingMain, warmupLevel: p.compound ? 'short' : 'none', part: s.part, minutes: s.minutes });
    ne.coach = `${old.name} 대신 남은 ${remainingMain}세트를 이어서 합니다.`;
    s.exercises.splice(idx + 1, 0, ne);
    recalcEstimate(state);
    return ne;
  }
  const isFirst = firstCompoundUid(s) === uid || (p.compound && !s.exercises.slice(0, idx).some((e) => e.compound));
  const level = p.compound ? (isFirst ? 'full' : 'short') : 'none';
  const ne = makeEntry(state, newExerciseId, { slot, warmupLevel: level, part: s.part, minutes: s.minutes });
  if (old.heavy) makeHeavy(state, ne); // 무거운 날 운동을 바꾸면 새 운동도 무거운 날로 (적용 못 하는 운동이면 평소대로)
  s.exercises[idx] = ne;
  recalcEstimate(state);
  return ne;
}

// 기구 사용 불가: 오늘만(또는 persistent 면 설정에 영구 기록) 제외하고 같은 슬롯 후보로 교체.
// 반환: 교체된 새 항목 또는 null (후보 없음 / 이미 모두 완료).
export function markUnavailable(state, uid, { persistent = false, now = new Date() } = {}) {
  const s = sessionOf(state);
  const { entry } = findEntry(state, uid);
  if (persistent) {
    state.settings.unavailableExercises = [...new Set([...(state.settings.unavailableExercises || []), entry.exerciseId])];
  } else if (!s.tempUnavailable.includes(entry.exerciseId)) s.tempUnavailable.push(entry.exerciseId);
  const remaining = entry.sets.filter((z) => !z.done && z.type !== 'warmup').length;
  if (remaining === 0) return null;
  const cand = replacementCandidates(state, entry, now).find((x) => x.sameSlot);
  if (!cand) return null;
  return replaceExercise(state, uid, cand.id, { now });
}

function recomputeWarmups(entry, p) {
  const firstMain = entry.sets.find((z) => z.type === 'main');
  const untouched = entry.sets.filter((z) => z.type === 'warmup').every((z) => !z.done && !z.touched);
  if (!untouched || !firstMain) return;
  const rows = warmupPlan(p, firstMain.weight, entry.warmupLevel).map((w) => makeSet('warmup', w.weight, w.reps));
  entry.sets = [...rows, ...entry.sets.filter((z) => z.type !== 'warmup')];
}

// 세트 값 수정. 본세트의 중량/반복을 고치면 뒤따르는 미완료·미수정 본세트에도 같은 값을 채운다.
export function editSet(state, uid, setIndex, field, value) {
  const { entry } = findEntry(state, uid);
  const set = entry.sets[setIndex];
  need(set, 'no_set', '세트를 찾을 수 없습니다.');
  need(['weight', 'reps', 'rir', 'leftReps', 'rightReps', 'type'].includes(field), 'bad_field', field);
  if (field === 'type') {
    need(['warmup', 'main', 'backoff'].includes(value), 'bad_type', value);
    set.type = value; set.touched = true;
    return;
  }
  const v = value === null || value === '' ? null : Number(value);
  need(v === null || (Number.isFinite(v) && v >= 0), 'bad_value', '숫자를 확인하세요.');
  set[field] = v;
  set.touched = true;
  if (set.heavy === 'top' && field === 'weight') {
    // 톱세트 무게를 고치면 손대지 않은 백오프는 그 무게의 약 90%로. 반복은 따로 둔다.
    const bw = backoffWeight(v, entry.increment);
    entry.sets.forEach((z) => { if (z.heavy === 'backoff' && !z.done && !z.touched) z.weight = bw; });
    const p = profileFor(state, entry.exerciseId) || entry;
    recomputeWarmups(entry, { ...p, compound: entry.compound, mode: entry.loadMode, inc: entry.increment });
    return;
  }
  if (set.heavy === 'top') return;
  if ((field === 'weight' || field === 'reps') && set.type === 'main') {
    for (let j = setIndex + 1; j < entry.sets.length; j++) {
      const z = entry.sets[j];
      if (z.type === 'main' && !z.done && !z.touched && (z.heavy || null) === (set.heavy || null)) z[field] = v;
    }
    if (field === 'weight' && entry.sets.findIndex((z) => z.type === 'main') === setIndex) {
      const p = profileFor(state, entry.exerciseId) || entry;
      recomputeWarmups(entry, { ...p, compound: entry.compound, mode: entry.loadMode, inc: entry.increment });
    }
  }
}

// 편측 좌우 나누기 토글. 나눌 때는 현재 반복을 양쪽에 복사한다.
export function setSplit(state, uid, setIndex, split) {
  const { entry } = findEntry(state, uid);
  const z = entry.sets[setIndex];
  need(z, 'no_set', '세트를 찾을 수 없습니다.');
  if (split && !z.split) { z.leftReps = z.reps; z.rightReps = z.reps; }
  if (!split && z.split) { z.reps = setReps(z); }
  z.split = !!split;
  z.touched = true;
}

function effectiveRest(entry) {
  return entry.restToday ?? entry.rest;
}

// 세트 완료 토글. 완료 시: 세트 간격 기록, 세션 중 조정(코칭 정책 3절), 휴식 타이머 시작.
export function toggleSetDone(state, uid, setIndex, { now = new Date() } = {}) {
  const s = sessionOf(state);
  const { entry } = findEntry(state, uid);
  const z = entry.sets[setIndex];
  need(z, 'no_set', '세트를 찾을 수 없습니다.');
  const t = now.getTime();
  if (z.done) {
    z.done = false; z.doneAt = null; z.restBefore = null;
    if (s.restTimer?.uid === uid && s.restTimer.setIndex === setIndex) s.restTimer = null;
    return { done: false };
  }
  const prevDone = entry.sets.filter((x) => x.done && x.doneAt).sort((a, b) => b.doneAt - a.doneAt)[0];
  z.restBefore = prevDone ? Math.round((t - prevDone.doneAt) / 1000) : null;
  z.done = true; z.doneAt = t;
  s.lastActivityAt = t;
  // 일시정지를 잊어도 세트를 끝내면 운동 중이라는 뜻이니 상단 타이머를 다시 켠다.
  if (s.timer && !s.timer.running) { s.timer.running = true; s.timer.start = t; }
  if (z.type === 'main') coachAfterSet(entry, setIndex);
  // 워밍업 뒤에는 짧게 (최대 60초)
  s.restTimer = { uid, setIndex, startedAt: t, seconds: z.type === 'warmup' ? Math.min(60, effectiveRest(entry)) : effectiveRest(entry) };
  return { done: true };
}

function coachAfterSet(entry, j) {
  const z = entry.sets[j];
  const reps = setReps(z);
  if (entry.heavy && z.heavy) return coachHeavy(entry, j, reps);
  const [lo, hi] = entry.range;
  const u = entry.measure === 'seconds' ? '초' : '회';
  if (reps === null) { entry.coach = ''; return; }
  const assist = entry.loadMode === 'assist';
  const mains = entry.sets.filter((x) => x.type === 'main');
  const prev = mains.slice(0, mains.indexOf(z)).reverse().find((x) => x.done);
  const prevReps = prev ? setReps(prev) : null;
  const drop = prevReps ? (prevReps - reps) / prevReps : 0;
  const rest = effectiveRest(entry);
  if (reps < lo) {
    const next = entry.sets.slice(j + 1).filter((x) => x.type === 'main' && !x.done && !x.touched);
    let msg = `목표 하한(${lo}${u}) 미만.`;
    if (entry.increment > 0 && z.weight !== null && next.length) {
      const w = assist ? roundTo(z.weight + entry.increment, entry.increment) : Math.max(0, roundTo(z.weight - entry.increment, entry.increment));
      next.forEach((x) => { x.weight = w; });
      msg += ` 남은 세트를 ${w}kg${assist ? ' 보조' : ''}로 조정했습니다.`;
    }
    entry.restToday = Math.min(300, rest + 30);
    entry.coach = `${msg} 오늘 휴식 ${entry.restToday}초.`;
    return;
  }
  if (drop >= 0.2) {
    entry.restToday = Math.min(300, rest + 30);
    entry.coach = `반복이 ${Math.round(drop * 100)}% 줄었습니다. 무게는 그대로, 오늘 휴식만 ${entry.restToday}초로 늘립니다.`;
    return;
  }
  if (reps >= hi + 2 && entry.increment > 0 && z.weight !== null) {
    entry.coach = `상한보다 ${reps - hi}${u} 더 했습니다. 다음 세트는 ${assist ? '보조를 줄여도' : `${roundTo(z.weight + entry.increment, entry.increment)}kg로 올려도`} 좋습니다.`;
    return;
  }
  entry.coach = '좋습니다. 같은 무게로 이어가세요.';
}

// 무거운 날 코칭: 톱세트 결과로 백오프 무게를 다시 잡는다. 백오프가 5회 아래로 떨어지면 한 단계 낮춘다.
function coachHeavy(entry, j, reps) {
  const z = entry.sets[j];
  if (reps === null) { entry.coach = ''; return; }
  const inc = entry.increment > 0 ? entry.increment : 2.5;
  const rest = entry.sets.slice(j + 1).filter((x) => x.heavy === 'backoff' && !x.done && !x.touched);
  if (z.heavy === 'top') {
    const pct = reps < HEAVY.top[0] ? 0.85 : HEAVY.backoffPct;
    const bw = backoffWeight(z.weight, inc, pct);
    if (bw !== null) rest.forEach((x) => { x.weight = bw; });
    entry.coach = reps < HEAVY.top[0]
      ? `톱세트가 ${reps}회로 무거웠습니다. 백오프는 ${bw ?? '-'}kg로 낮춰 ${HEAVY.backoff[0]}~${HEAVY.backoff[1]}회. 몇 회 더 할 수 있었는지 아래에서 골라 주세요.`
      : `톱세트 ${z.weight ?? '-'}kg × ${reps}회. 몇 회 더 할 수 있었는지 아래에서 골라 주세요. 백오프는 ${bw ?? '-'}kg × ${HEAVY.backoff[0]}~${HEAVY.backoff[1]}회.`;
    return;
  }
  if (reps < HEAVY.backoff[0] && z.weight !== null && rest.length) {
    const w = Math.max(0, roundTo(z.weight - inc, inc));
    rest.forEach((x) => { x.weight = w; });
    entry.coach = `백오프가 ${HEAVY.backoff[0]}회 아래입니다. 남은 백오프를 ${w}kg로 낮췄습니다.`;
    return;
  }
  entry.coach = '좋습니다. 같은 무게로 이어가세요.';
}

// 운동 느낌 (운동당 한 번). 마지막 완료 본세트에 RIR 이 비어 있으면 대표값을 채운다.
export function setEffort(state, uid, effort) {
  const { entry } = findEntry(state, uid);
  need(effort === null || EFFORT_RIR[effort] !== undefined, 'bad_effort', effort);
  entry.effort = effort;
  const lastMain = [...entry.sets].reverse().find((z) => z.type === 'main' && z.done);
  if (lastMain && effort && lastMain.rir === null) lastMain.rir = EFFORT_RIR[effort];
}

export function changeSetCount(state, uid, delta) {
  const { entry } = findEntry(state, uid);
  const mains = entry.sets.filter((z) => z.type !== 'warmup');
  if (delta > 0) {
    need(mains.length < 8, 'too_many', '세트는 최대 8개입니다.');
    const tpl = [...entry.sets].reverse().find((z) => z.type === 'main');
    entry.sets.push(makeSet('main', tpl?.weight ?? entry.prescription?.weight ?? null, tpl?.reps ?? entry.prescription?.reps ?? null));
  } else {
    need(mains.length > 1, 'too_few', '세트는 최소 1개입니다.');
    let k = -1;
    for (let i = entry.sets.length - 1; i >= 0; i--) {
      const z = entry.sets[i];
      if (z.type !== 'warmup' && !z.done && !z.touched) { k = i; break; }
    }
    need(k >= 0, 'all_recorded', '지울 수 있는 빈 세트가 없습니다.');
    entry.sets.splice(k, 1);
  }
  recalcEstimate(state);
}

export function moveExercise(state, uid, toIndex) {
  const s = sessionOf(state);
  const { idx } = findEntry(state, uid);
  const to = Math.max(0, Math.min(s.exercises.length - 1, toIndex));
  const [e] = s.exercises.splice(idx, 1);
  s.exercises.splice(to, 0, e);
  return recalcEstimate(state);
}

export function removeExercise(state, uid) {
  const s = sessionOf(state);
  const { idx } = findEntry(state, uid);
  stopRestFor(s, uid);
  s.exercises.splice(idx, 1);
  recalcEstimate(state);
}

export function addExercise(state, exerciseId, { now = new Date() } = {}) {
  const s = sessionOf(state);
  need(!s.exercises.some((e) => e.exerciseId === exerciseId), 'duplicate', '이미 오늘 세션에 있는 운동입니다.');
  const p = profileFor(state, exerciseId);
  need(p, 'unknown_exercise', '알 수 없는 운동입니다.');
  const e = makeEntry(state, exerciseId, { setCount: 2, warmupLevel: p.compound && !s.exercises.some((x) => x.compound) ? 'full' : p.compound ? 'short' : 'none', part: s.part, minutes: s.minutes });
  s.exercises.push(e);
  recalcEstimate(state);
  return e;
}

// 사용자 운동 정의를 만든다 (세션과 무관). def: { name, part, role, mode, inc, range, rest, unilateral, primary, compound, measure }
export function createCustomExercise(state, def) {
  const name = String(def.name || '').trim();
  need(name, 'no_name', '운동 이름을 입력하세요.');
  const id = `custom:${name.toLowerCase().replace(/[^a-z0-9가-힣]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40)}:${Date.now().toString(36)}`;
  const lo = Math.max(1, Number(def.range?.[0]) || 8), hi = Math.max(lo, Number(def.range?.[1]) || 12);
  const x = {
    id, name, part: def.part, role: def.role, primary: def.primary || [], secondary: def.secondary || [],
    sets: 3, range: [lo, hi], rest: Math.max(30, Number(def.rest) || 90), inc: Math.max(0, Number(def.inc) || 0),
    mode: def.mode || 'machine', priority: 50, equipment: 'none', compound: !!def.compound, unilateral: !!def.unilateral,
    measure: def.measure === 'seconds' ? 'seconds' : 'reps', why: '사용자 직접 추가 운동',
  };
  state.customExercises.push(x);
  return x;
}

// 오늘 휴식 조정 (세션 한정). 타이머가 돌고 있으면 그 타이머만, 아니면 이 운동의 오늘 휴식값.
export function adjustRest(state, uid, delta) {
  const s = sessionOf(state);
  const { entry } = findEntry(state, uid);
  if (s.restTimer?.uid === uid) {
    s.restTimer.seconds = Math.max(0, s.restTimer.seconds + delta);
    return { target: 'timer', seconds: s.restTimer.seconds };
  }
  entry.restToday = Math.max(30, Math.min(600, effectiveRest(entry) + delta));
  recalcEstimate(state);
  return { target: 'today', seconds: entry.restToday };
}

export function stopRest(state) {
  if (state.session) state.session.restTimer = null;
}

// 명시적 사용자 선호 저장 (설정 화면 전용). 현재 세션의 같은 운동 항목에도 즉시 반영한다.
export function setPref(state, exerciseId, patch) {
  const allowed = ['loadMode', 'increment', 'rest', 'range', 'unilateral'];
  const cur = { ...(state.prefs[exerciseId] || {}) };
  for (const [k, v] of Object.entries(patch)) { need(allowed.includes(k), 'bad_pref', k); cur[k] = v; }
  state.prefs[exerciseId] = cur;
  for (const e of state.session?.exercises || []) {
    if (e.exerciseId !== exerciseId) continue;
    if ('loadMode' in patch) e.loadMode = patch.loadMode;
    if ('increment' in patch) e.increment = Number(patch.increment) || 0;
    if ('rest' in patch) e.rest = Number(patch.rest) || e.rest;
    if ('range' in patch) e.range = [...patch.range];
    if ('unilateral' in patch) e.unilateral = !!patch.unilateral;
  }
  recalcEstimate(state);
}

export function setSessionDate(state, date) {
  const s = sessionOf(state);
  need(parseDateLocal(date), 'bad_date', '날짜 형식이 올바르지 않습니다.');
  s.date = date;
}

export function setMemo(state, uid, memo) { findEntry(state, uid).entry.memo = String(memo ?? ''); }
export function setSessionNote(state, note) { sessionOf(state).note = String(note ?? ''); }

export function repairSession(state, { now = new Date() } = {}) {
  const s = sessionOf(state);
  const used = new Set(s.exercises.map((e) => e.exerciseId));
  let added = 0;
  for (const slot of missingCoreSlots(state)) {
    const p = chooseForSlot(state, s.part, slot, used, now, { home: !!s.home });
    if (!p) continue;
    s.exercises.push(makeEntry(state, p.id, { slot, setCount: 2, warmupLevel: p.compound ? 'short' : 'none', part: s.part, minutes: s.minutes }));
    used.add(p.id);
    added++;
  }
  recalcEstimate(state);
  return added;
}

export function timerSeconds(timer, now = Date.now()) {
  if (!timer) return 0;
  return (timer.elapsed || 0) + (timer.running && timer.start ? Math.floor((now - timer.start) / 1000) : 0);
}

export function toggleSessionTimer(state, { now = new Date() } = {}) {
  const s = sessionOf(state);
  const t = s.timer;
  if (t.running) { t.elapsed = timerSeconds(t, now.getTime()); t.running = false; t.start = null; }
  else { t.running = true; t.start = now.getTime(); }
}

export function countWorkSets(session) {
  return session.exercises.reduce((a, e) => a + e.sets.filter((z) => z.done && z.type === 'main').length, 0);
}

function performanceScore(session) {
  const vals = [];
  for (const e of session.exercises) {
    for (const z of e.sets.filter((x) => x.done && x.type === 'main')) {
      const r = setReps(z);
      if (r === null) continue;
      let v = r >= e.range[0] && r <= e.range[1] ? 1 : r < e.range[0] ? 0.6 : 0.9;
      if (z.rir !== null) { if (z.rir >= 1 && z.rir <= 3) v += 0.15; else if (z.rir <= 0) v -= 0.15; }
      vals.push(v);
    }
  }
  return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
}

// 세션 종료. 완료 세트만 기록에 넣는다. 0세트 확인은 호출 전에 UI 에서 받는다.
// 운동 시간: 타이머 대신 실제 활동 흔적으로 계산한다 (종료를 잊어도 70시간이 찍히지 않게).
// 완료 시각이 있으면 첫 ✓ 앞 준비 시간(최대 5분) + 첫 ✓ ~ 마지막 ✓ + 마지막 세트 1분.
// 시각이 없으면(한 줄 입력 · 계획대로 완료) 타이머 값을 쓰되 예상 시간의 2배를 넘으면 모름(null).
export function activeDurationSec(s, now = new Date()) {
  const ts = s.exercises.flatMap((e) => e.sets.filter((z) => z.done && z.doneAt).map((z) => z.doneAt));
  if (ts.length) {
    const first = Math.min(...ts), last = Math.max(...ts);
    const prep = Math.min(5 * 60000, Math.max(0, first - (s.startedAt || first)));
    return Math.round((last - first + prep + 60000) / 1000);
  }
  const t = timerSeconds(s.timer, now.getTime());
  const cap = Math.max(30, s.estimatedMinutes || 60) * 2 * 60;
  return t > 0 && t <= cap ? t : null;
}

// 마지막 활동 후 오래 방치된 세션이면 요약을 돌려준다 (앱을 열 때 "저장할까요?"를 묻는 데 쓴다).
export const STALE_MINUTES = 90;
export function staleSessionInfo(state, now = new Date()) {
  const s = state.session;
  if (!s) return null;
  const doneTs = s.exercises.flatMap((e) => e.sets.filter((z) => z.doneAt).map((z) => z.doneAt));
  const last = Math.max(s.lastActivityAt || 0, s.startedAt || 0, ...doneTs);
  const idleMin = Math.floor((now.getTime() - last) / 60000);
  if (idleMin < STALE_MINUTES) return null;
  return { idleMin, lastAt: last, workSets: countWorkSets(s), part: s.part, date: s.date };
}

// 남은 세트를 지금 채워진 값(처방)대로 완료 처리 (운동 뒤 몰아서 기록할 때). 완료 시각은 모름(null).
export function completeRemaining(state, uid = null, { now = new Date() } = {}) {
  const s = sessionOf(state);
  const targets = uid ? [findEntry(state, uid).entry] : s.exercises;
  let n = 0;
  for (const e of targets) {
    for (const z of e.sets) {
      if (z.done) continue;
      if (z.type !== 'warmup' && setReps(z) === null) continue;
      z.done = true; z.doneAt = null; n++;
    }
  }
  // 실시간으로 기록하던 운동의 마지막 한 세트를 이 버튼으로 끝낸 경우는 지금 끝낸 것으로 본다
  // (완료 시각이 없으면 운동 시간과 세트 간 휴식 기록에서 빠진다).
  if (uid && n === 1) {
    const e = targets[0];
    const z = e.sets.find((x) => x.done && x.doneAt === null);
    const prev = e.sets.filter((x) => x.done && x.doneAt).sort((a, b) => b.doneAt - a.doneAt)[0];
    if (z && prev) { z.doneAt = now.getTime(); z.restBefore = Math.round((z.doneAt - prev.doneAt) / 1000); }
  }
  if (s.restTimer && (!uid || s.restTimer.uid === uid)) s.restTimer = null;
  s.lastActivityAt = now.getTime();
  return n;
}

export function setHistoryDuration(state, historyId, minutes) {
  const h = state.history.find((x) => x.id === historyId);
  need(h, 'no_history', '기록을 찾을 수 없습니다.');
  const m = minutes === null || minutes === '' ? null : Number(minutes);
  need(m === null || (Number.isFinite(m) && m >= 0 && m <= 600), 'bad_duration', '운동 시간(분)을 확인하세요.');
  h.durationSec = m === null ? null : Math.round(m * 60);
}

export function finishSession(state, { now = new Date() } = {}) {
  const s = sessionOf(state);
  const duration = activeDurationSec(s, now);
  const work = countWorkSets(s);
  const ord = actualOrder(s.exercises.map((e) => ({ key: e.uid, primary: e.primary, secondary: e.secondary, sets: e.sets })));
  for (const e of s.exercises) {
    const done = e.sets.filter((z) => z.done);
    if (!done.length) continue;
    const o = ord.get(e.uid);
    state.performance.push({
      sessionId: s.id, date: s.date, part: s.part, exerciseId: e.exerciseId, name: e.name, slot: e.slot,
      loadMode: e.loadMode, increment: e.increment, measure: e.measure, unilateral: e.unilateral,
      range: [...e.range], primary: [...e.primary], secondary: [...e.secondary],
      sets: structuredClone(done), effort: e.effort, memo: e.memo,
      ...(e.heavy ? { heavy: true } : {}),
      ...(e.grip ? { grip: e.grip } : {}),
      ...(o ? { order: o.order, prefatigue: o.prefatigue } : {}),
    });
  }
  const summary = { part: s.part, date: s.date, workSets: work, durationSec: duration, exercises: s.exercises.filter((e) => e.sets.some((z) => z.done)).map((e) => ({ name: e.name, sets: e.sets.filter((z) => z.done && z.type === 'main').map((z) => ({ weight: z.weight, reps: setReps(z) })) })) };
  state.history.push({
    id: s.id, date: s.date, part: s.part, source: s.source, workSets: work, durationSec: duration,
    note: s.note, overrideReason: s.overrideReason || '', performanceScore: performanceScore(s), volumeUnknown: false,
  });
  state.session = null;
  return summary;
}

export function discardSession(state) { state.session = null; }

// ---- 이력 편집 ----

export function updateHistoryDate(state, historyId, date) {
  const h = state.history.find((x) => x.id === historyId);
  need(h, 'no_history', '기록을 찾을 수 없습니다.');
  need(parseDateLocal(date), 'bad_date', '날짜 형식이 올바르지 않습니다.');
  h.date = date;
  state.performance.forEach((p) => { if (p.sessionId === historyId) p.date = date; });
}

export function updateHistoryPart(state, historyId, part) {
  const h = state.history.find((x) => x.id === historyId);
  need(h, 'no_history', '기록을 찾을 수 없습니다.');
  need(['push', 'pull', 'lower', 'core'].includes(part), 'bad_part', part);
  h.part = part;
  state.performance.forEach((p) => { if (p.sessionId === historyId) p.part = part; });
}

export function deleteHistory(state, historyId) {
  need(state.history.some((x) => x.id === historyId), 'no_history', '기록을 찾을 수 없습니다.');
  state.history = state.history.filter((x) => x.id !== historyId);
  state.performance = state.performance.filter((p) => p.sessionId !== historyId);
}

// PT 기록. parts 가 여러 개면(혼합) 세트 수를 나눠 기록한다.
export function logPT(state, { date, parts, sets = null, note = '' }) {
  need(parseDateLocal(date), 'bad_date', '날짜 형식이 올바르지 않습니다.');
  const ps = [...new Set((parts || []).filter((x) => ['push', 'pull', 'lower', 'core'].includes(x)))];
  need(ps.length, 'no_part', '부위를 하나 이상 고르세요.');
  const n = sets === null || sets === '' ? null : Number(sets);
  need(n === null || (Number.isFinite(n) && n >= 0 && n <= 60), 'bad_sets', '세트 수를 확인하세요.');
  const base = newId('pt');
  ps.forEach((part, i) => state.history.push({
    id: ps.length > 1 ? `${base}_${i}` : base, date, part, source: 'pt',
    workSets: n === null ? 0 : Math.round(n / ps.length), durationSec: null, note, overrideReason: '', performanceScore: null, volumeUnknown: n === null,
  }));
}

export { CORE_SLOTS, catalogById };
