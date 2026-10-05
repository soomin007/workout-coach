// 부위 추천과 세션 계획. v9 규칙을 옮기되 전역 상태 대신 state · now 를 인자로 받는다.
import { DB, EMPHASIS, EMPHASIS_ALTERNATE, CORE_SLOTS, OPTIONAL_SLOTS, SESSION_ORDER, SLOT_COMPAT, MUSCLE_BUDGET, PART_MUSCLES, catalogById } from './catalog.js';
import { profileFor } from './coach.js';
import { parseDateLocal, endOfDay, localISODate } from './util.js';

export const POLICY = {
  initialWeeklyBudget: { push: 10, pull: 12, lower: 12 },
  minGapHours: 36,
  secondarySetCredit: 0.5,
  // 보조 종목 로테이션: 지난 같은 부위 세션에 했던 보조 종목은 이만큼 감점해, 비슷한 후보끼리 번갈아 나오게 한다.
  // 메인(핵심 슬롯)은 진행을 추적해야 하므로 돌리지 않는다 (Kassiano 2022: 체계적 변화는 이득, 잦은 무작위 교체는 손해).
  accessoryRepeatPenalty: 1.5,
};

const DAY = 86400000;

function inWindow(dateStr, now, days) {
  const d = parseDateLocal(dateStr);
  return !!d && d.getTime() >= now.getTime() - days * DAY && d.getTime() <= endOfDay(now);
}

export function muscleSets(state, muscle, now = new Date()) {
  let n = 0;
  for (const p of state.performance || []) {
    if (!inWindow(p.date, now, 7)) continue;
    const sets = (p.sets || []).filter((x) => x.done && x.type === 'main').length;
    const prof = catalogById(p.exerciseId);
    const primary = Array.isArray(p.primary) ? p.primary : prof?.primary || [];
    const secondary = Array.isArray(p.secondary) ? p.secondary : prof?.secondary || [];
    if (primary.includes(muscle)) n += sets;
    if (secondary.includes(muscle)) n += sets * POLICY.secondarySetCredit;
  }
  return Math.round(n * 10) / 10;
}

// extra: 오늘 계획에 이미 들어간 세트 (근육 → 세트 수). 같은 자극을 겹쳐 고르지 않게 한다.
function muscleNeed(state, m, now, extra = null) {
  const b = MUSCLE_BUDGET[m] || 8;
  return Math.max(-1, Math.min(1.5, (b - muscleSets(state, m, now) - (extra?.[m] || 0)) / Math.max(1, b)));
}

function addPlannedSets(extra, profile, sets) {
  for (const m of profile.primary || []) extra[m] = (extra[m] || 0) + sets;
  for (const m of profile.secondary || []) extra[m] = (extra[m] || 0) + sets * POLICY.secondarySetCredit;
}

// 지난 같은 부위 세션(오늘 이전)에 한 운동 id.
export function lastSessionExercises(state, part, now = new Date()) {
  const today = localISODate(now);
  const xs = (state.performance || []).filter((p) => p.part === part && p.date < today);
  if (!xs.length) return new Set();
  const last = xs.reduce((a, p) => (p.date > a.date ? p : a));
  return new Set(xs.filter((p) => p.sessionId === last.sessionId).map((p) => p.exerciseId));
}

// 이번 주(최근 6일) 같은 부위를 이미 했으면 오늘은 그 반대 강조를 미리 골라 둔다.
// 지난번에 강조가 없었으면 주간 부족분이 큰 쪽. 첫 번째 세션이면 강조 없음. 반환: { id, why } 또는 null.
export function autoEmphasis(state, part, now = new Date()) {
  const pair = EMPHASIS_ALTERNATE[part];
  if (!pair) return null;
  const today = localISODate(now);
  const prev = (state.history || []).filter((h) => h.part === part && h.date < today && inWindow(h.date, now, 6));
  if (!prev.length) return null;
  const last = prev.reduce((a, h) => (h.date >= a.date ? h : a));
  const label = (id) => EMPHASIS[part].find((x) => x.id === id).label;
  if (pair.includes(last.emphasis)) {
    const id = pair.find((x) => x !== last.emphasis);
    return { id, why: `이번 주 두 번째 세션이라 지난번(${label(last.emphasis)})과 번갈아 ${josa(label(id), "을", "를")} 강조했습니다.` };
  }
  const need = (id) => { const ms = EMPHASIS[part].find((x) => x.id === id).muscles; return ms.reduce((a, m) => a + muscleNeed(state, m, now), 0) / ms.length; };
  const id = pair.reduce((a, b) => (need(b) > need(a) ? b : a));
  return { id, why: `이번 주 두 번째 세션이라 주간 세트가 더 부족한 ${josa(label(id), "을", "를")} 강조했습니다.` };
}

function partNeed(state, part, now) {
  const ms = PART_MUSCLES[part] || [];
  return ms.length ? ms.reduce((a, m) => a + muscleNeed(state, m, now), 0) / ms.length : 0;
}

export function daysSince(state, part, now = new Date()) {
  const xs = state.history.filter((h) => h.part === part).map((h) => parseDateLocal(h.date)).filter((d) => d && d.getTime() <= endOfDay(now));
  if (!xs.length) return 99;
  const last = Math.max(...xs.map((d) => d.getTime()));
  return Math.max(0, Math.floor((now.getTime() - last) / DAY));
}

export function weeklySets(state, part, now = new Date()) {
  return state.history.filter((h) => h.part === part && inWindow(h.date, now, 7)).reduce((a, h) => a + (Number.isFinite(+h.workSets) ? +h.workSets : 0), 0);
}

function sessionsWithin(state, part, hours, now) {
  return state.history.filter((h) => { const d = parseDateLocal(h.date); return h.part === part && d && d.getTime() >= now.getTime() - hours * 3600000 && d.getTime() <= endOfDay(now); }).length;
}

function recentPT(state, part, now) {
  return state.history.some((h) => h.source === 'pt' && h.part === part && inWindow(h.date, now, 3));
}

// 오늘 컨디션. 컨디션 값은 그날 확인한 것만 믿는다: 어제 고른 근육통·피로가 오늘 추천을 움직이지 않게,
// 오늘 확인하지 않은 항목은 기본값(보통 · 근육통 없음 · 통증 없음)으로 본다.
// 시간·강도는 계획에 쓸 값으로 남기되, confirmed 에 없으면 시작할 때 다시 고르게 한다.
export const CHECK_DEFAULTS = { energy: 'normal', upperDoms: 0, lowerDoms: 0, pain: 'none' };
export const CHECK_KEYS = ['energy', 'upperDoms', 'lowerDoms', 'pain', 'minutes', 'intensity'];

export function checkConfirmed(state, now = new Date()) {
  const c = state.check || {};
  return c.day === localISODate(now) && Array.isArray(c.confirmed) ? c.confirmed : [];
}

export function effectiveCheck(state, now = new Date()) {
  const c = state.check || {};
  const ok = checkConfirmed(state, now);
  const out = { ...c };
  for (const [k, v] of Object.entries(CHECK_DEFAULTS)) if (!ok.includes(k)) out[k] = v;
  return out;
}

// 오늘 날짜로 저장된 기록 (직접 한 세션 + PT).
export function todaysHistory(state, now = new Date()) {
  const today = localISODate(now);
  return state.history.filter((h) => h.date === today);
}

// extra: 오늘 이미 운동을 마친 뒤 추가로 할 때. 오늘 한 부위는 빼고, PT 요일 규칙은 건너뛴다.
export function recommendPart(state, now = new Date(), { extra = false } = {}) {
  const c = effectiveCheck(state, now);
  const detail = [];
  const today = localISODate(now);
  const doneToday = todaysHistory(state, now);
  const ptToday = doneToday.some((h) => h.source === 'pt');
  // 추가 운동은 오늘 한 부위를 어느 경로에서도 다시 권하지 않는다 (2026-10-04: 일요일 Core 를 마쳐도 "추가로 Core"가 떴다).
  const doneParts = new Set(doneToday.map((h) => h.part));
  const noRepeat = (r) => (extra && doneParts.has(r.part)
    ? { part: 'rest', confidence: '높음', why: `오늘 ${r.part.toUpperCase()}는 이미 했습니다. ${r.home ? '집에서 더 할 운동은 없습니다.' : '추가로 할 부위가 없습니다.'}`, detail: [...(r.detail || []), `${r.part.toUpperCase()}: 오늘 이미 함`] }
    : r);
  if (doneToday.length && !extra) return { part: 'done', confidence: '높음', why: '오늘 운동을 이미 마쳤습니다. 추가 운동은 선택입니다.', detail: ['오늘 기록 있음'] };
  if (c.energy === 'very_tired') return { part: 'rest', confidence: '높음', why: '전신 피로가 매우 높아 회복을 우선합니다.', detail: ['매우 피곤 → 휴식'] };
  const dow = now.getDay();
  // 헬스장을 못 가는 날은 PT 도 없으므로 휴무 규칙이 PT 요일보다 먼저다.
  if (c.gymClosedDate === today) return noRepeat({ part: 'core', home: true, confidence: '높음', why: '오늘은 헬스장에 못 가서 집에서 할 수 있는 Core를 추천합니다.', detail: ['헬스장 휴무 → 홈 운동'] });
  // PT 요일은 "보통 그날"일 뿐 확정이 아니다(선생님 사정으로 바뀜). 오늘 PT 가 없다고 하면 일반 추천으로.
  if (!extra && state.settings.ptDay === dow && !ptToday && c.noPtDate !== today) return { part: 'pt', confidence: '보통', why: '보통 PT가 있는 요일입니다. PT를 마친 뒤 기록하면 다음 추천에 반영합니다. 오늘 PT가 없으면 아래 "오늘 PT 없어요"를 누르세요.', detail: ['PT 예정 요일'] };
  if (ptToday && !extra) return { part: 'rest', confidence: '높음', why: '오늘 PT 기록이 있어 추가 웨이트보다 회복을 우선합니다.', detail: ['오늘 PT 기록 있음'] };
  if (dow === 0 && state.settings.gymClosedSunday) return noRepeat({ part: 'core', home: true, confidence: '높음', why: '일요일 헬스장 휴무라 집에서 할 수 있는 Core를 추천합니다.', detail: ['일요일 휴무 → 홈 Core'] });
  const score = {};
  for (const p of ['push', 'pull', 'lower']) {
    const d = daysSince(state, p, now), sets = weeklySets(state, p, now), need = partNeed(state, p, now);
    let v = Math.min(d, 7) * 1.15 + (POLICY.initialWeeklyBudget[p] - sets) * 0.18 + need * 2.2;
    if (sessionsWithin(state, p, POLICY.minGapHours, now)) v -= 6;
    if (recentPT(state, p, now)) v -= 3.5;
    score[p] = v;
    detail.push(`${p.toUpperCase()}: ${d >= 99 ? '최근 기록 없음' : d + '일 전'} · 7일 ${sets}세트 · 볼륨 필요도 ${need.toFixed(2)}`);
  }
  if (c.upperDoms >= 2) { score.push -= 2.5; score.pull -= 2; }
  if (c.lowerDoms >= 2) score.lower -= 4;
  if (c.upperDoms >= 3) { score.push = -999; score.pull = -999; }
  if (c.lowerDoms >= 3) score.lower = -999;
  if (c.pain === 'shoulder') { score.push = -999; score.pull -= 2; detail.push('어깨 통증: Push 제외'); }
  if (c.pain === 'back') { score.lower -= 4; score.pull -= 2; detail.push('허리 통증: Lower/Pull 우선순위 감소'); }
  if (c.pain === 'knee') { score.lower = -999; detail.push('무릎 통증: Lower 제외'); }
  if (c.energy === 'tired') { score.lower -= 1.5; detail.push('피곤: 하체 우선순위 감소'); }
  if (extra) {
    for (const p of doneParts) if (p in score) { score[p] = -999; detail.push(`${p.toUpperCase()}: 오늘 이미 함`); }
    // 다른 큰 부위가 모두 막혀 있으면 짧은 Core 를 권한다.
    if (Object.values(score).every((v) => v <= -900)) return noRepeat({ part: 'core', confidence: '보통', why: '오늘 다른 부위를 이미 했거나 쉬어야 해서, 추가로 한다면 짧은 Core 를 권합니다.', detail });
  }
  const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]);
  if (ranked[0][1] <= -900) return { part: 'rest', confidence: '높음', why: '지금 근육통/통증 조건에서는 웨이트 세션을 추천하지 않습니다.', detail };
  const part = ranked[0][0], gap = ranked[0][1] - ranked[1][1], n = state.history.filter((h) => h.part === part).length;
  return { part, score, detail, confidence: n >= 3 && gap > 1.5 ? '높음' : n >= 1 ? '보통' : '낮음', why: `회복 조건을 먼저 보고, 최근 간격·PT·주간 세트·근육별 부족분을 합쳐 ${part.toUpperCase()}를 골랐습니다.` };
}

export function supportsSlot(profile, slot) {
  return (SLOT_COMPAT[slot] || [slot]).includes(profile.role);
}

// 집에서 할 때(home)는 장비 불필요 운동과 설정의 '집에 있는 장비'만 쓴다.
export function isAvailable(state, profile, { home = state.session?.home ?? false } = {}) {
  if (!profile) return false;
  if (home && profile.equipment !== 'none' && !(state.settings.homeEquipment || []).includes(profile.equipment)) return false;
  if (profile.risk === 'hinge' && state.settings.avoidHinge !== false) return false;
  if (profile.kneeling && effectiveCheck(state).pain === 'knee') return false;
  if (profile.equipment !== 'none' && state.settings.equipment[profile.equipment] === false) return false;
  if ((state.settings.unavailableExercises || []).includes(profile.id)) return false;
  if ((state.session?.tempUnavailable || []).includes(profile.id)) return false;
  return true;
}

export function partPool(state, part) {
  const ids = [...(DB[part] || []).map((x) => x.id), ...(state.customExercises || []).filter((x) => x.part === part).map((x) => x.id)];
  return ids.map((id) => profileFor(state, id)).filter(Boolean);
}

function optionNeedScore(state, profile, now, extra = null) {
  const prim = profile.primary || [];
  const deficit = prim.length ? prim.reduce((a, m) => a + muscleNeed(state, m, now, extra), 0) / prim.length : 0;
  return deficit * 10 + (profile.priority || 0) / 20;
}

export function chooseForSlot(state, part, slot, used, now = new Date(), opts = {}) {
  return partPool(state, part)
    .filter((e) => supportsSlot(e, slot) && isAvailable(state, e, opts) && !used.has(e.id))
    .sort((a, b) => (roleScore(b, slot, opts) - roleScore(a, slot, opts)) || (slotScore(state, b, now, opts) - slotScore(state, a, now, opts)) || (b.priority - a.priority))[0] || null;
}

// avoid: "다시 추천"에서 직전 구성. 같은 역할의 다른 운동이 있으면 그쪽으로 바뀌고, 없으면 그대로 남는다.
function roleScore(p, slot, opts) {
  return (p.role === slot ? 20 : 0) - (opts.avoid?.has(p.id) ? 15 : 0);
}

function slotScore(state, p, now, opts) {
  return optionNeedScore(state, p, now, opts.extra) - (opts.recent?.has(p.id) ? POLICY.accessoryRepeatPenalty : 0) - (opts.avoid?.has(p.id) ? 3 : 0);
}

export function estimateMinutes(profile, sets, withFullWarmup = false) {
  const setup = profile.compound ? 2.5 : 1.2;
  const warm = withFullWarmup && profile.compound ? 5 : profile.compound ? 1.5 : 0.5;
  return setup + warm + 0.75 * sets + Math.max(0, sets - 1) * (profile.rest / 60);
}

export function adjustedSetCount(state, profile, part, minutes, slot, now = new Date()) {
  const core = (CORE_SLOTS[part] || []).includes(slot);
  let n = profile.sets || 2;
  if (minutes <= 30 && n > 2) n--;
  if (state.check.energy === 'tired' && n > 2) n--;
  if (state.check.intensity === 'light' && n > 2) n--;
  const prim = profile.primary || [];
  const over = prim.length && prim.every((m) => MUSCLE_BUDGET[m] && muscleSets(state, m, now) >= MUSCLE_BUDGET[m] + 2);
  if (over && !core && n > 2) n--;
  if (POLICY.initialWeeklyBudget[part] && weeklySets(state, part, now) >= POLICY.initialWeeklyBudget[part] + 5 && !core && n > 2) n--;
  return Math.max(2, Math.min(4, n));
}

// 반환: { planned: [{ id, slot, sets, warmupLevel }], estimatedMinutes }
// where.emphasis: 오늘 강조할 근육 목록. 강조 운동은 앞으로 · 세트 +1, 나머지 핵심은 2세트(유지),
// 보조 자리는 강조 근육 운동이 먼저(같은 역할의 두 번째 운동도 허용).
export function buildPlan(state, part, minutes, now = new Date(), where = {}) {
  const used = new Set(), planned = [];
  const emph = new Set(where.emphasis || []);
  const hits = (p) => emph.size > 0 && (p.primary || []).some((m) => emph.has(m));
  const maxCount = part === 'core' ? (minutes <= 20 ? 4 : 6) : minutes <= 30 ? 4 : minutes <= 45 ? 5 : minutes <= 60 ? 6 : 7;
  for (const slot of CORE_SLOTS[part] || []) {
    const e = chooseForSlot(state, part, slot, used, now, where);
    if (!e) continue;
    let sets = adjustedSetCount(state, e, part, minutes, slot, now);
    if (emph.size) sets = hits(e) ? Math.min(4, sets + 1) : Math.min(2, sets);
    planned.push({ p: e, slot, sets });
    used.add(e.id);
  }
  const order = SESSION_ORDER[part] || [];
  const sortPlan = () => planned.sort((a, b) => (hits(b.p) - hits(a.p)) || (order.indexOf(a.slot) - order.indexOf(b.slot)));
  const firstCompoundIdx = () => planned.findIndex((x) => x.p.compound);
  const total = () => { const f = firstCompoundIdx(); return planned.reduce((a, x, i) => a + estimateMinutes(x.p, x.sets, i === f), 0); };
  sortPlan();
  let est = total();
  for (let i = planned.length - 1; i >= 0 && est > minutes * 1.05; i--) {
    if (planned[i].sets > 2) { planned[i].sets--; est = total(); }
  }
  // 보조 종목: 오늘 계획된 세트까지 포함한 부족분으로 하나씩 고른다(고를 때마다 다시 계산).
  const extra = {};
  for (const x of planned) addPlannedSets(extra, x.p, x.sets);
  const sel = { ...where, extra, recent: lastSessionExercises(state, part, now) };
  const coreSlots = CORE_SLOTS[part] || [];
  let open = [...(OPTIONAL_SLOTS[part] || []), ...(emph.size ? coreSlots : [])];
  while (open.length && planned.length < maxCount) {
    const provisional = new Set(used);
    const cands = [];
    for (const slot of open) {
      const e = chooseForSlot(state, part, slot, provisional, now, sel);
      if (!e || (coreSlots.includes(slot) && !hits(e))) continue;
      cands.push({ p: e, slot, score: slotScore(state, e, now, sel) + (e.role === slot ? 5 : 0) + (hits(e) ? 20 : 0) });
      provisional.add(e.id);
    }
    if (!cands.length) break;
    cands.sort((a, b) => b.score - a.score);
    const o = cands[0];
    open = open.filter((x) => x !== o.slot);
    const sets = Math.min(hits(o.p) ? 3 : 2, adjustedSetCount(state, o.p, part, minutes, o.slot, now));
    const cost = estimateMinutes(o.p, sets, false);
    if (est + cost <= minutes * 1.06 || (minutes >= 60 && planned.length < 5)) {
      planned.push({ p: o.p, slot: o.slot, sets });
      used.add(o.p.id);
      addPlannedSets(extra, o.p, sets);
      est += cost;
    }
  }
  sortPlan();
  const f = firstCompoundIdx();
  return {
    planned: planned.map((x, i) => ({ id: x.p.id, slot: x.slot, sets: x.sets, warmupLevel: i === f ? 'full' : x.p.compound ? 'short' : 'none' })),
    estimatedMinutes: Math.round(total()),
  };
}

// 교체 후보: 같은 슬롯 먼저, 그다음 같은 부위의 다른 역할. 현재 세션 중복 제외.
export function replacementCandidates(state, entry, now = new Date()) {
  const s = state.session;
  const used = new Set(s.exercises.filter((e) => e.uid !== entry.uid).map((e) => e.exerciseId));
  return partPool(state, s.part)
    .filter((x) => x.id !== entry.exerciseId && isAvailable(state, x) && !used.has(x.id))
    .map((x) => ({ ...x, sameSlot: supportsSlot(x, entry.slot) }))
    .sort((a, b) => (b.sameSlot - a.sameSlot) || ((b.role === entry.slot) - (a.role === entry.slot)) || (optionNeedScore(state, b, now) - optionNeedScore(state, a, now)) || (b.priority - a.priority));
}

export function missingCoreSlots(state) {
  const s = state.session;
  if (!s) return [];
  const slots = s.exercises.map((e) => e.slot);
  return (CORE_SLOTS[s.part] || []).filter((slot) => !slots.includes(slot));
}

// 추천 이유를 트레이너 말투 문장으로. 숫자 세부는 recommendPart().detail 에 남긴다.
export function explainRecommendation(state, rec, now = new Date()) {
  const out = [];
  const label = { push: '가슴·어깨·삼두', pull: '등·이두', lower: '하체', core: '코어' };
  const names = (ms) => ms.map((m) => MUSCLE_NAMES[m] || m).join('·');
  if (rec.part === 'rest' || rec.part === 'pt' || rec.part === 'done') return [rec.why];
  if (rec.part === 'core') return [rec.why, '굽히는 운동으로 복근을 직접 자극하고, 버티기 운동으로 마무리합니다.'];
  const d = daysSince(state, rec.part, now);
  out.push(d >= 99 ? `${label[rec.part]} 운동 기록이 아직 없어요.` : d === 0 ? `${josa(label[rec.part], '은', '는')} 오늘 이미 했지만 다른 부위가 더 지쳐 있어요.` : `${josa(label[rec.part], '을', '를')} ${d}일째 쉬었어요.`);
  const lack = (PART_MUSCLES[rec.part] || []).filter((m) => muscleSets(state, m, now) < (MUSCLE_BUDGET[m] || 8) * 0.5);
  if (lack.length) out.push(`이번 주 ${names(lack)} 세트가 목표의 절반도 안 됩니다.`);
  const enough = Object.keys(MUSCLE_BUDGET).filter((m) => muscleSets(state, m, now) >= MUSCLE_BUDGET[m]);
  if (enough.length) out.push(`${josa(names(enough), '은', '는')} 이번 주 목표 세트를 채웠어요.`);
  const c = effectiveCheck(state, now);
  if (c.upperDoms >= 2 || c.lowerDoms >= 2) out.push('근육통이 있는 부위는 뒤로 미뤘어요.');
  if (c.pain && c.pain !== 'none') out.push('통증이 있는 부위에 부담되는 세션은 피했어요.');
  if (state.history.some((h) => h.source === 'pt' && inWindow(h.date, now, 3))) out.push('최근 PT에서 한 부위는 우선순위를 낮췄어요.');
  return out;
}

// 받침 유무로 조사 고르기 (예: 이두는, 가슴은, 하체를)
export function josa(word, withBatchim, without) {
  const c = String(word).charCodeAt(String(word).length - 1);
  if (c < 0xac00 || c > 0xd7a3) return word + without;
  return word + ((c - 0xac00) % 28 ? withBatchim : without);
}

const MUSCLE_NAMES = { chest: '가슴', back: '광배', upper_back: '상부등', front_delt: '전면어깨', side_delt: '측면어깨', rear_delt: '후면어깨', triceps: '삼두', biceps: '이두', quads: '대퇴사두', hamstring: '햄스트링', glute: '둔근', calf: '종아리' };
