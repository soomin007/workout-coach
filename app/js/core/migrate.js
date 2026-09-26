// 가져오기와 마이그레이션. v7 · v8 · v9 (GPT 시절 형식) → v10.
// 반환 { state, notes }. notes 는 사용자에게 보여 줄 보정 내역.
import { catalogById, catalogByName, migrateRole, PARTS } from './catalog.js';
import { freshState, normalizeState, looksLikeV10, makeSet, SCHEMA_VERSION } from './schema.js';
import { toNum, parseDateLocal } from './util.js';

export class ImportError extends Error {}

function looksLegacy(x) {
  return !!x && typeof x === 'object' && !Array.isArray(x) && (Array.isArray(x.history) || Array.isArray(x.performanceHistory)) && ('settings' in x || 'version' in x);
}

export function importAny(raw) {
  if (looksLikeV10(raw)) return { state: normalizeState(raw), notes: [] };
  if (looksLegacy(raw)) return migrateLegacy(raw);
  throw new ImportError('운동 코치 백업 파일이 아닙니다. 현재 기록은 그대로 두었습니다.');
}

function legacySet(z, unilateral) {
  const s = makeSet(['warmup', 'main', 'backoff'].includes(z?.type) ? z.type : 'main', toNum(z?.weight), toNum(z?.reps));
  s.rir = toNum(z?.rir);
  const L = toNum(z?.leftReps), R = toNum(z?.rightReps);
  if (unilateral && (L !== null || R !== null)) {
    if (L !== null && R !== null && L !== R) { s.split = true; s.leftReps = L; s.rightReps = R; }
    else s.reps = s.reps ?? L ?? R;
    const lr = toNum(z?.leftRir), rr = toNum(z?.rightRir);
    if (s.rir === null && (lr !== null || rr !== null)) s.rir = Math.min(...[lr, rr].filter((x) => x !== null));
  }
  s.done = !!z?.done;
  s.restBefore = null;
  s.legacyRestActual = toNum(z?.restActual);
  return s;
}

// 기록된 이름이 다른 카탈로그 운동을 가리키면 id 를 바로잡는다 (v7~v9 교체 버그로 오염된 기록).
function resolveExercise(p, customs) {
  const byId = catalogById(p.exerciseId) || customs.find((c) => c.id === p.exerciseId) || null;
  const byName = catalogByName(p.variant) || customs.find((c) => c.name === p.variant) || null;
  if (byName && byId && byName.id !== byId.id) return { id: byName.id, fixed: true, from: byId.name };
  return { id: byName?.id || byId?.id || p.exerciseId, fixed: false };
}

export function migrateLegacy(raw) {
  const notes = [];
  const st = freshState();
  const ver = String(raw.version || raw.appVersion || '?');
  notes.push(`v${ver} 형식에서 가져왔습니다.`);

  // 설정
  const rs = raw.settings || {};
  st.settings.gymClosedSunday = rs.gymClosedSunday ?? true;
  if ('ptDay' in rs) st.settings.ptDay = rs.ptDay === null || rs.ptDay === 'none' ? null : Number(rs.ptDay);
  else if ('ptThursday' in rs) st.settings.ptDay = rs.ptThursday ? 4 : null;
  st.settings.avoidHinge = rs.avoidHinge ?? true;
  st.settings.leftFirst = rs.leftFirst ?? true;
  st.settings.equipment = { ...st.settings.equipment, ...(rs.equipment || {}) };
  const unav = raw.unavailable && typeof raw.unavailable === 'object' ? Object.keys(raw.unavailable).filter((k) => raw.unavailable[k]) : [];
  if (unav.length) {
    st.settings.unavailableExercises = unav;
    notes.push(`헬스장에 없는 운동 ${unav.length}개를 복원했습니다: ${unav.map((id) => catalogById(id)?.name || id).join(', ')}`);
  }

  st.check = { ...st.check, ...(raw.check || {}), energy: raw.energy || raw.check?.energy || 'normal' };
  st.lastBackup = raw.lastBackup || null;
  st.customExercises = Array.isArray(raw.customExercises) ? raw.customExercises.map((c) => ({ ...c, role: migrateRole(c.role, c.id) })) : [];

  // 선호: 중량 방식 · 증량 단위 · 범위만 옮긴다. 휴식은 v9 코치 자동 조정이 섞였을 수 있어 버린다.
  let droppedRest = 0;
  for (const [id, p] of Object.entries(raw.exercisePrefs || {})) {
    if (!p || typeof p !== 'object') continue;
    const q = {};
    if (p.loadMode) q.loadMode = p.loadMode;
    if (Number.isFinite(+p.increment)) q.increment = +p.increment;
    if (Array.isArray(p.range) && p.range.length === 2) q.range = p.range.map(Number);
    if (typeof p.unilateral === 'boolean') q.unilateral = p.unilateral;
    if (p.rest !== undefined) droppedRest++;
    if (Object.keys(q).length) st.prefs[id] = q;
  }
  if (droppedRest) notes.push(`운동별 휴식 선호 ${droppedRest}개는 자동 조정이 섞였을 수 있어 기본값으로 되돌렸습니다.`);

  // 이력
  const hist = (Array.isArray(raw.history) ? raw.history : []).filter((h) => h && PARTS.includes(h.part) && parseDateLocal(h.date));
  const droppedHist = (raw.history || []).length - hist.length;
  if (droppedHist > 0) notes.push(`날짜나 부위를 알 수 없는 이력 ${droppedHist}개는 가져오지 못했습니다.`);
  hist.forEach((h, i) => {
    const workSets = Number.isFinite(+h.workSets) ? +h.workSets : 0;
    let dur = Number.isFinite(+h.duration) ? +h.duration : null;
    if (dur !== null && workSets > 0 && dur < workSets * 60) {
      notes.push(`${h.date} ${h.part.toUpperCase()} 세션 시간(${Math.round(dur / 60)}분)이 세트 수에 비해 너무 짧아 '시간 불명'으로 바꿨습니다.`);
      dur = null;
    }
    st.history.push({
      id: h.sessionId || `legacy_${h.date}_${h.part}_${i}`, date: h.date, part: h.part, source: h.source || 'manual',
      workSets, durationSec: dur, note: h.note || '', overrideReason: h.overrideReason || '',
      performanceScore: h.performanceScore ?? null, volumeUnknown: !!h.volumeUnknown,
    });
  });

  // 운동 기록
  const perf = Array.isArray(raw.performanceHistory) ? raw.performanceHistory : [];
  for (const p of perf) {
    if (!p || !parseDateLocal(p.date) || !Array.isArray(p.sets)) continue;
    const r = resolveExercise(p, st.customExercises);
    if (r.fixed) notes.push(`${p.date} "${p.variant}" 기록이 "${r.from}"(으)로 잘못 저장돼 있어 바로잡았습니다.`);
    const prof = catalogById(r.id) || st.customExercises.find((c) => c.id === r.id);
    const unilateral = !!prof?.unilateral || p.sets.some((z) => toNum(z?.leftReps) !== null);
    let sid = p.sessionId;
    if (!sid) {
      const m = st.history.filter((h) => h.date === p.date && h.part === p.part);
      sid = m.length === 1 ? m[0].id : null;
    }
    st.performance.push({
      sessionId: sid, date: p.date, part: p.part, exerciseId: r.id, name: p.variant || prof?.name || r.id,
      slot: migrateRole(p.slot || prof?.role, r.id), loadMode: p.loadMode || prof?.mode || 'machine',
      increment: toNum(p.increment) ?? prof?.inc ?? 0, measure: prof?.measure || 'reps', unilateral,
      range: prof?.range ? [...prof.range] : null,
      // 근육 매핑은 카탈로그 기준으로 다시 계산한다 (v9 의 shoulder 키 누락 보정)
      primary: prof?.primary ? [...prof.primary] : (p.primary || []), secondary: prof?.secondary ? [...prof.secondary] : (p.secondary || []),
      sets: p.sets.filter((z) => z && z.done).map((z) => legacySet(z, unilateral)), effort: null, memo: p.memo || '',
    });
  }

  // 진행 중 세션: 완료 세트가 있으면 보존하기 위해 운동 기록 초안으로 옮긴다.
  const cs = raw.currentSession;
  if (cs && typeof cs === 'object' && Array.isArray(cs.exercises) && cs.exercises.some((e) => (e.sets || []).some((z) => z.done))) {
    notes.push('이전 앱에서 진행 중이던 세션의 완료 세트를 별도 기록으로 보존했습니다.');
    const sid = cs.sessionId || `legacy_live_${cs.date}`;
    let work = 0;
    for (const e of cs.exercises) {
      const done = (e.sets || []).filter((z) => z.done);
      if (!done.length) continue;
      const r = resolveExercise({ exerciseId: e.exerciseId, variant: e.variant || e.name }, st.customExercises);
      const prof = catalogById(r.id);
      work += done.filter((z) => z.type === 'main').length;
      st.performance.push({
        sessionId: sid, date: cs.date, part: cs.part, exerciseId: r.id, name: e.variant || e.name, slot: migrateRole(e.slot || e.role, r.id),
        loadMode: e.loadMode || prof?.mode || 'machine', increment: toNum(e.increment) ?? 0, measure: prof?.measure || 'reps',
        unilateral: !!e.unilateral, range: e.range || prof?.range || null, primary: prof?.primary || e.primary || [], secondary: prof?.secondary || e.secondary || [],
        sets: done.map((z) => legacySet(z, !!e.unilateral)), effort: null, memo: e.memo || '',
      });
    }
    if (parseDateLocal(cs.date) && PARTS.includes(cs.part)) st.history.push({ id: sid, date: cs.date, part: cs.part, source: cs.source || 'manual', workSets: work, durationSec: null, note: cs.note || '', overrideReason: '', performanceScore: null, volumeUnknown: false });
  }

  st.schemaVersion = SCHEMA_VERSION;
  return { state: normalizeState(st), notes };
}
