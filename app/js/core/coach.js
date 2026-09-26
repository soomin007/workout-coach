// 코칭 규칙: 운동 프로필 계산, 다음 처방(더블 프로그레션), 워밍업. 수치 근거는 docs/COACHING_POLICY.md.
import { catalogById } from './catalog.js';
import { setReps } from './schema.js';
import { roundTo, clamp } from './util.js';

// 카탈로그(또는 사용자 운동) + 사용자 명시 선호 → 운동 프로필. 세션 값은 섞지 않는다.
export function profileFor(state, exerciseId) {
  const base = catalogById(exerciseId) || (state.customExercises || []).find((x) => x.id === exerciseId);
  if (!base) return null;
  const p = state.prefs?.[exerciseId] || {};
  return {
    id: base.id, name: base.name, part: base.part, role: base.role,
    primary: base.primary || [], secondary: base.secondary || [],
    sets: base.sets || 2,
    range: Array.isArray(p.range) && p.range.length === 2 ? [...p.range] : [...(base.range || [8, 12])],
    rest: Number.isFinite(+p.rest) && p.rest !== null ? +p.rest : (base.rest || 90),
    inc: Number.isFinite(+p.increment) && p.increment !== null ? +p.increment : (base.inc ?? 0),
    mode: p.loadMode || base.mode || 'machine',
    unilateral: p.unilateral ?? !!base.unilateral,
    compound: !!base.compound,
    measure: base.measure || 'reps',
    equipment: base.equipment || 'none',
    priority: base.priority || 50,
    risk: base.risk || null,
    why: base.why || '사용자 추가 운동',
    cue: base.cue || '',
    custom: !catalogById(exerciseId),
  };
}

export function lastPerformance(state, exerciseId) {
  const xs = (state.performance || []).map((p, i) => ({ p, i })).filter(({ p }) => p.exerciseId === exerciseId);
  xs.sort((a, b) => b.p.date.localeCompare(a.p.date) || b.i - a.i);
  return xs[0]?.p || null;
}

const isAssist = (mode) => mode === 'assist';
const unitWord = (profile) => (profile.measure === 'seconds' ? '초' : '회');

// 다음 처방. 반환: { weight, reps, kind, note }
export function prescribe(profile, last) {
  const [lo, hi] = profile.range;
  const u = unitWord(profile);
  const main = (last?.sets || []).filter((s) => s.done && s.type === 'main' && setReps(s) !== null);
  if (!main.length) {
    return { weight: null, reps: hi > lo ? Math.round((lo + hi) / 2) : lo, kind: 'first', note: `첫 기록: 가볍게 시작해 첫 세트로 무게를 맞추세요. 목표 ${lo}~${hi}${u}에서 2~3${u} 여유가 남는 무게.` };
  }
  const hard = last.effort === 'hard';
  const weighted = main.filter((s) => s.weight !== null);
  const noLoad = profile.mode === 'bodyweight' && !weighted.length;
  if (!weighted.length || noLoad) {
    const minR = Math.min(...main.map(setReps));
    if (minR >= hi) return { weight: null, reps: hi, kind: 'bw_top', note: `지난번 모든 세트 ${hi}${u} 달성. 세트를 하나 늘리거나 추가 중량을 고려하세요.` };
    const reps = clamp(hard ? minR : minR + 1, lo, hi);
    return { weight: null, reps, kind: 'hold', note: `지난번 최저 ${minR}${u}. 이번 목표 ${reps}${u}.` };
  }
  const qualifying = weighted.filter((s) => setReps(s) >= lo);
  const step = profile.inc > 0 ? profile.inc : 0;
  if (!qualifying.length) {
    // 목표 하한을 한 세트도 못 채움 → 약 10% 감량 (assist 는 보조 증가)
    const W = isAssist(profile.mode) ? Math.min(...weighted.map((s) => s.weight)) : Math.max(...weighted.map((s) => s.weight));
    let w;
    if (isAssist(profile.mode)) w = Math.max(roundTo(W * 1.1, step || 0.5, 'ceil'), W + step);
    else w = Math.max(0, Math.min(roundTo(W * 0.9, step || 0.5, 'floor'), W - step));
    return { weight: w, reps: lo, kind: 'decrease', note: `지난번 ${W}kg에서 목표 하한(${lo}${u})에 못 미쳤습니다. ${w}kg로 낮춰 범위 안에서 반복하세요.` };
  }
  // 작업 중량: 하한 이상을 채운 세트 중 가장 무거운(assist 는 가장 가벼운 보조) 중량
  const W = isAssist(profile.mode) ? Math.min(...qualifying.map((s) => s.weight)) : Math.max(...qualifying.map((s) => s.weight));
  const atW = weighted.filter((s) => s.weight === W);
  const minR = Math.min(...atW.map(setReps));
  if (minR >= hi && !hard && step > 0) {
    const w = isAssist(profile.mode) ? Math.max(0, roundTo(W - step, step)) : roundTo(W + step, step);
    return { weight: w, reps: lo, kind: 'increase', note: isAssist(profile.mode) ? `지난번 ${W}kg 보조로 상한 달성. 보조를 ${w}kg로 줄여 ${lo}${u}부터.` : `지난번 ${W}kg로 모든 세트 상한(${hi}${u}) 달성. ${w}kg로 올려 ${lo}${u}부터.` };
  }
  const reps = clamp(hard ? minR : minR + 1, lo, hi);
  const why = hard ? '지난번 한계였으니 같은 반복을 여유 있게.' : `반복을 ${reps}${u}로 하나씩 올리기.`;
  return { weight: W, reps, kind: 'hold', note: `${W}kg 유지. ${why}` };
}

// 워밍업 행 (코칭 정책 6절). level: 'full' | 'short' | 'none'
export function warmupPlan(profile, weight, level) {
  if (level === 'none' || !profile.compound || weight === null || weight === undefined) return [];
  if (profile.mode === 'bodyweight' || profile.mode === 'assist') return [];
  const steps = level === 'full' ? [[0.5, 8], [0.7, 5], [0.85, 3]] : [[0.6, 6], [0.8, 3]];
  const inc = profile.inc > 0 ? profile.inc : 2.5;
  const out = [];
  for (const [pct, reps] of steps) {
    const w = roundTo(weight * pct, inc);
    if (w > 0 && w < weight && !out.some((x) => x.weight === w)) out.push({ weight: w, reps });
  }
  return out;
}
