// 코칭 규칙: 운동 프로필 계산, 다음 처방(더블 프로그레션), 워밍업. 수치 근거는 docs/COACHING_POLICY.md.
import { catalogById } from './catalog.js';
import { setReps, EFFORT_RIR } from './schema.js';
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

// heavy: undefined → 전부, false → 평소 기록만, true → 무거운 날 기록만.
// 평소 처방(더블 프로그레션)은 무거운 날 기록을 보지 않는다: 3~5회 톱세트가 "하한 미달"로 읽혀 감량 처방이 나오지 않게.
export function lastPerformance(state, exerciseId, { heavy } = {}) {
  const xs = (state.performance || []).map((p, i) => ({ p, i }))
    .filter(({ p }) => p.exerciseId === exerciseId && (heavy === undefined || !!p.heavy === heavy));
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

// 워밍업 행 (코칭 정책 6절). level: 'heavy' | 'full' | 'short' | 'none'
// heavy: 무거운 날 톱세트 앞. full 보다 한 단계 더 올려 톱세트 무게에 몸을 맞춘다.
export function warmupPlan(profile, weight, level) {
  if (level === 'none' || !profile.compound || weight === null || weight === undefined) return [];
  if (profile.mode === 'bodyweight' || profile.mode === 'assist') return [];
  const steps = level === 'heavy' ? [[0.5, 8], [0.7, 5], [0.8, 3], [0.9, 1]] : level === 'full' ? [[0.5, 8], [0.7, 5], [0.85, 3]] : [[0.6, 6], [0.8, 3]];
  const inc = profile.inc > 0 ? profile.inc : 2.5;
  const out = [];
  for (const [pct, reps] of steps) {
    const w = roundTo(weight * pct, inc);
    if (w > 0 && w < weight && !out.some((x) => x.weight === w)) out.push({ weight: w, reps });
  }
  return out;
}

// ---------- 무거운 날 (근력 중심) ----------
// RTS식 톱세트 + 백오프 (docs/research/strength_day_proposal.md, 2026-10-01 사용자 결정 A·B·C 모두 권장안).
export const HEAVY = { top: [3, 5], target: 4, rir: 2, backoffPct: 0.9, backoff: [5, 6], rest: 240 };
const HEAVY_MODES = ['total', 'per_side', 'plates', 'per_dumbbell', 'machine'];

// 무거운 날을 적용할 수 있는 운동: 중량을 다는 복합 운동, 반복으로 세는 것.
export function heavyEligible(profile) {
  return !!profile && profile.compound && HEAVY_MODES.includes(profile.mode) && profile.measure !== 'seconds';
}

// 추정 1RM (Epley + 남은 반복). RIR 을 모르면 1 로 본다(보수적으로 낮게 잡는다).
export function estimate1RM(weight, reps, rir = null) {
  if (!(weight > 0) || !(reps > 0) || reps > 12) return null;
  return weight * (1 + (reps + (rir ?? 1)) / 30);
}

const setRir = (z, rec) => z.rir ?? (rec?.effort && z === lastMainOf(rec) ? EFFORT_RIR[rec.effort] : null);
function lastMainOf(rec) { return [...(rec.sets || [])].reverse().find((x) => x.done && x.type === 'main') || null; }

// 톱세트 처방. perfs: 이 운동의 기록 전체.
// 지난 무거운 날이 있으면 그 톱세트로 진행(쉬웠으면 한 단계 올림, 아니면 유지),
// 없으면 최근 평소 기록 3개에서 추정 1RM 을 구해 4회 · RIR 2 무게를 잡는다.
export function heavyPrescribe(profile, state) {
  const inc = profile.inc > 0 ? profile.inc : 2.5;
  const all = (state.performance || []).filter((p) => p.exerciseId === profile.id).sort((a, b) => b.date.localeCompare(a.date));
  const lastHeavy = all.find((p) => p.heavy);
  const topOf = (p) => (p.sets || []).find((z) => z.done && z.heavy === 'top' && z.weight !== null && setReps(z) !== null);
  const t = lastHeavy && topOf(lastHeavy);
  if (t) {
    const reps = setReps(t);
    const rir = setRir(t, lastHeavy) ?? HEAVY.rir;
    const up = rir >= 3 || (reps >= HEAVY.top[1] && rir >= HEAVY.rir);
    const w = up ? roundTo(t.weight + inc, inc) : t.weight;
    return { weight: w, reps: HEAVY.target, kind: up ? 'heavy_up' : 'heavy_hold',
      note: up ? `지난 무거운 날 ${t.weight}kg × ${reps}회가 여유 있었습니다. ${w}kg로 ${HEAVY.top[0]}~${HEAVY.top[1]}회, 2회 남기고 멈추세요.`
        : `지난 무거운 날 ${t.weight}kg × ${reps}회. 같은 무게로 ${HEAVY.top[0]}~${HEAVY.top[1]}회, 2회 남기고 멈추세요.` };
  }
  let best = null;
  for (const p of all.filter((x) => !x.heavy).slice(0, 3)) {
    for (const z of (p.sets || []).filter((x) => x.done && x.type === 'main')) {
      const e = estimate1RM(z.weight, setReps(z), setRir(z, p));
      if (e && (!best || e > best.e)) best = { e, z };
    }
  }
  if (!best) {
    return { weight: null, reps: HEAVY.target, kind: 'heavy_first', note: `첫 무거운 날: 워밍업으로 무게를 올려 가며 ${HEAVY.target}회를 2회 남기고 할 수 있는 무게를 찾으세요.` };
  }
  const w = roundTo(best.e / (1 + (HEAVY.target + HEAVY.rir) / 30), inc);
  return { weight: w, reps: HEAVY.target, kind: 'heavy_est',
    note: `최근 ${best.z.weight}kg × ${setReps(best.z)}회 기준 추정. ${w}kg로 ${HEAVY.top[0]}~${HEAVY.top[1]}회, 2회 남기고 멈추세요. 깊이·자세는 평소와 같게.` };
}

export function backoffWeight(topWeight, inc, pct = HEAVY.backoffPct) {
  if (topWeight === null || topWeight === undefined) return null;
  return roundTo(topWeight * pct, inc > 0 ? inc : 2.5);
}
