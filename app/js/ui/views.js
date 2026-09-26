// 상태 → HTML. 이벤트는 data-action 속성으로만 연결한다 (actions.js 가 위임 처리).
import { esc } from './dom.js';
import { PART_LABEL, LOAD_MODES, EQUIPMENT, MUSCLE_LABEL, MUSCLE_BUDGET, ALL_CATALOG, catalogById, slotName } from '../core/catalog.js';
import { recommendPart, daysSince, weeklySets, muscleSets, missingCoreSlots, POLICY } from '../core/plan.js';
import { countWorkSets, timerSeconds } from '../core/session.js';
import { setReps, EFFORT_LABEL, EFFORTS } from '../core/schema.js';
import { EVIDENCE, POLICY_NOTE } from '../core/evidence.js';
import { fmtClock, localISODate, parseDateLocal } from '../core/util.js';

const MODE_LABEL = Object.fromEntries(LOAD_MODES);
const PART_OPTS = ['push', 'pull', 'lower', 'core'];
const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
const slotLabel = slotName;

// ---------- 오늘 (세션 없음) ----------

export function renderToday(state, ui, now = new Date()) {
  if (state.session) return renderSession(state, ui, now);
  const c = state.check;
  const r = recommendPart(state, now);
  const map = { push: 'Push', pull: 'Pull', lower: 'Lower', core: 'Core', rest: '휴식', pt: 'PT 예정' };
  const conf = r.confidence === '높음' ? 'good' : r.confidence === '보통' ? 'warn' : '';
  const energy = [['good', '좋음'], ['normal', '보통'], ['tired', '피곤'], ['very_tired', '매우 피곤']];
  const doms = [[0, '없음'], [1, '약간'], [2, '꽤 있음'], [3, '심함']];
  return `
  <section class="card hero">
    <div class="kicker">오늘 추천</div>
    <div class="title" data-testid="rec-title">${esc(map[r.part])}</div>
    <div class="small">${esc(r.why)} <span class="badge ${conf}">신뢰도 ${esc(r.confidence)}</span></div>
    <div class="decision">${(r.detail || []).slice(0, 6).map((x) => `<b>·</b><span>${esc(x)}</span>`).join('')}</div>
    <div class="row" style="margin-top:12px">
      ${['push', 'pull', 'lower', 'core'].includes(r.part) ? `<button class="btn primary" data-action="start" data-part="${r.part}" data-source="recommended">${esc(map[r.part])} 시작</button>` : ''}
      ${r.part === 'pt' ? '<button class="btn primary" data-action="pt">PT 기록</button>' : ''}
      <button class="btn" data-action="start-manual">부위 직접 선택</button>
      <button class="btn ghost" data-action="evidence">추천 근거</button>
    </div>
  </section>
  <section class="card">
    <h3>컨디션</h3>
    <div class="row">${energy.map(([v, l]) => `<button class="chip${c.energy === v ? ' on' : ''}" data-action="energy" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="grid2" style="margin-top:10px">
      <label class="field">상체 근육통<select data-action="check" data-k="upperDoms">${doms.map(([v, l]) => opt(v, l, c.upperDoms)).join('')}</select></label>
      <label class="field">하체 근육통<select data-action="check" data-k="lowerDoms">${doms.map(([v, l]) => opt(v, l, c.lowerDoms)).join('')}</select></label>
      <label class="field">통증/불편<select data-action="check" data-k="pain">${[['none', '없음'], ['shoulder', '어깨'], ['back', '허리'], ['knee', '무릎'], ['ankle', '발목'], ['other', '기타']].map(([v, l]) => opt(v, l, c.pain)).join('')}</select></label>
      <label class="field">가능 시간<select data-action="check" data-k="minutes">${[30, 45, 60, 75, 90].map((m) => opt(m, `${m}분`, c.minutes)).join('')}</select></label>
      <label class="field">오늘 강도<select data-action="check" data-k="intensity">${[['light', '가볍게'], ['normal', '일반'], ['strength', '근력 중심']].map(([v, l]) => opt(v, l, c.intensity)).join('')}</select></label>
      <label class="field">운동 날짜<input type="date" data-action="new-date" value="${esc(ui.newDate || localISODate(now))}"></label>
    </div>
  </section>
  ${renderDashboard(state, now)}
  <section class="card">
    <div class="row"><button class="btn" data-action="pt">PT 기록</button><button class="btn" data-action="tab" data-tab="records">지난 기록</button></div>
  </section>`;
}

function renderDashboard(state, now) {
  const recent = PART_OPTS.map((p) => { const d = daysSince(state, p, now); return `<b>${PART_LABEL[p]}</b><span>${d >= 99 ? '기록 없음' : d === 0 ? '오늘' : `${d}일 전`}</span>`; }).join('');
  const muscles = Object.keys(MUSCLE_LABEL).map((m) => {
    const v = muscleSets(state, m, now), b = MUSCLE_BUDGET[m];
    return `<div class="bar-row"><span>${MUSCLE_LABEL[m]}</span><div class="bar"><i style="width:${Math.min(100, (v / b) * 100)}%"></i></div><span class="tiny">${v}/${b}</span></div>`;
  }).join('');
  const parts = ['push', 'pull', 'lower'].map((p) => { const v = weeklySets(state, p, now), b = POLICY.initialWeeklyBudget[p]; return `<div class="bar-row"><span>${PART_LABEL[p]}</span><div class="bar"><i style="width:${Math.min(100, (v / b) * 100)}%"></i></div><span class="tiny">${v}세트</span></div>`; }).join('');
  return `<section class="card">
    <h3>최근 부위</h3><div class="decision" style="margin-top:0">${recent}</div>
    <div class="sep"></div><h3>최근 7일 세션 세트</h3><div class="bars">${parts}</div>
    <div class="sep"></div><h3>근육별 7일 유효세트 <span class="tiny">직접 1 · 간접 0.5</span></h3><div class="bars">${muscles}</div>
  </section>`;
}

// ---------- 세션 ----------

function unitOf(e) { return e.measure === 'seconds' ? '초' : '회'; }

function weightLabel(e, w) {
  if (w === null || w === undefined) return e.loadMode === 'bodyweight' ? '체중' : '<small>kg 입력</small>';
  if (e.loadMode === 'bodyweight') return `+${w}<small>kg</small>`;
  if (e.loadMode === 'assist') return `${w}<small>보조</small>`;
  return `${w}<small>kg</small>`;
}

function stepper(action, uid, i, field, label, testid) {
  return `<div class="stepper" data-testid="${testid}"><button data-action="${action}" data-uid="${uid}" data-i="${i}" data-f="${field}" data-d="-1" aria-label="줄이기">−</button><button class="val" data-action="num" data-uid="${uid}" data-i="${i}" data-f="${field}">${label}</button><button data-action="${action}" data-uid="${uid}" data-i="${i}" data-f="${field}" data-d="1" aria-label="늘리기">+</button></div>`;
}

function renderSetRow(e, z, i, mainNo) {
  const warm = z.type === 'warmup';
  const no = warm ? 'W' : z.type === 'backoff' ? 'B' : String(mainNo);
  const u = unitOf(e);
  const repsBlock = z.split
    ? `<div class="lr">${stepper('step', e.uid, i, 'leftReps', `L ${z.leftReps ?? '-'}`, `left-${i}`)}${stepper('step', e.uid, i, 'rightReps', `R ${z.rightReps ?? '-'}`, `right-${i}`)}</div>`
    : stepper('step', e.uid, i, 'reps', `${z.reps ?? '-'}<small>${u}</small>`, `reps-${i}`);
  const w = stepper('step', e.uid, i, 'weight', weightLabel(e, z.weight), `weight-${i}`);
  const toggle = e.unilateral && !warm ? `<span></span><button class="split-toggle" data-action="split" data-uid="${e.uid}" data-i="${i}" data-on="${z.split ? 0 : 1}">${z.split ? '좌우 같게' : '좌우 다르게 입력'}</button>` : '';
  if (z.split) {
    return `<div class="set ${z.type}${z.done ? ' done' : ''}" data-set="${i}"><button class="no" data-action="set-menu" data-uid="${e.uid}" data-i="${i}" aria-label="세트 ${no} 메뉴">${no}${z.rir !== null && !warm ? `<small>R${z.rir}</small>` : ''}</button>${w}<span></span><button class="done-btn" data-action="done" data-uid="${e.uid}" data-i="${i}" aria-label="세트 완료">✓</button><span></span>${repsBlock}${toggle}</div>`;
  }
  return `<div class="set ${z.type}${z.done ? ' done' : ''}" data-set="${i}"><button class="no" data-action="set-menu" data-uid="${e.uid}" data-i="${i}" aria-label="세트 ${no} 메뉴">${no}${z.rir !== null && !warm ? `<small>R${z.rir}</small>` : ''}</button>${w}${repsBlock}<button class="done-btn" data-action="done" data-uid="${e.uid}" data-i="${i}" aria-label="세트 완료">✓</button>${toggle}</div>`;
}

function renderExercise(state, e, idx) {
  const mains = e.sets.filter((z) => z.type !== 'warmup');
  const allDone = mains.length > 0 && mains.every((z) => z.done);
  const badge = e.unilateral ? '좌우' : e.compound ? '복합' : '보조';
  const restNow = e.restToday ?? e.rest;
  let mainNo = 0;
  const rows = e.sets.map((z, i) => renderSetRow(e, z, i, z.type === 'warmup' ? 0 : ++mainNo)).join('');
  const effort = allDone
    ? `<div class="effort" data-testid="effort">${EFFORTS.map((k) => `<button class="${e.effort === k ? 'on' : ''}" data-action="effort" data-uid="${e.uid}" data-v="${k}">${EFFORT_LABEL[k]}</button>`).join('')}</div><div class="tiny" style="margin-top:4px">마지막 세트 느낌: 다음 처방에 반영됩니다.</div>`
    : '';
  return `<section class="card ex${allDone ? ' complete' : ''}" data-uid="${e.uid}" data-exercise="${esc(e.exerciseId)}">
    <div class="ex-head">
      <div><div class="ex-title">${idx + 1}. ${esc(e.name)}</div>
      <div class="ex-meta">${esc(slotLabel(e.slot))} · 목표 ${e.range[0]}~${e.range[1]}${unitOf(e)} · 휴식 ${restNow}초${e.restToday !== null && e.restToday !== e.rest ? ' (오늘)' : ''} · ${esc(MODE_LABEL[e.loadMode] || e.loadMode)}</div></div>
      <div class="row" style="flex-wrap:nowrap"><span class="badge">${badge}</span><button class="btn sm ghost" data-action="ex-menu" data-uid="${e.uid}" aria-label="운동 메뉴">⋯</button></div>
    </div>
    <div class="rx">${esc(e.why)}. ${esc(e.prescription?.note || '')}</div>
    ${e.coach ? `<div class="coach" data-testid="coach">${esc(e.coach)}</div>` : ''}
    ${e.cue ? `<details class="cue"><summary>자세 큐</summary>${esc(e.cue)}</details>` : ''}
    <div class="sets">${rows}</div>
    ${effort}
    ${e.memo ? `<div class="tiny" style="margin-top:6px">메모: ${esc(e.memo)}</div>` : ''}
    <div class="ex-actions"><button class="btn sm" data-action="quick" data-uid="${e.uid}">한 줄 입력</button><button class="btn sm" data-action="set-count" data-uid="${e.uid}" data-d="1">세트 +1</button><button class="btn sm" data-action="set-count" data-uid="${e.uid}" data-d="-1">세트 −1</button></div>
  </section>`;
}

export function renderSession(state, ui, now = new Date()) {
  const s = state.session;
  const total = s.exercises.reduce((a, e) => a + e.sets.filter((z) => z.type !== 'warmup').length, 0);
  const work = countWorkSets(s);
  const missing = missingCoreSlots(state);
  return `
  <section class="card" data-testid="session-head">
    <div class="session-head">
      <div><div class="kicker">진행 중</div><h2>${esc(PART_LABEL[s.part])} · ${s.source === 'recommended' ? '추천' : '직접 선택'}</h2>
        <div class="small" data-testid="session-meta">시간 ${s.minutes}분 · 예상 ${s.estimatedMinutes}분 · 운동 ${s.exercises.length}개 · 본세트 ${total}개</div></div>
      <div style="text-align:right"><div class="clock" id="sessionClock">${fmtClock(timerSeconds(s.timer, now.getTime()))}</div><button class="btn sm ghost" style="white-space:nowrap" data-action="timer">${s.timer.running ? '일시정지' : '재개'}</button></div>
    </div>
    <div class="progress"><i style="width:${total ? (work / total) * 100 : 0}%"></i></div>
    <div class="grid2" style="margin-top:10px">
      <label class="field">운동 날짜<input type="date" data-action="session-date" value="${esc(s.date)}"></label>
      <label class="field">화면 켜짐 유지<button class="chip${ui.wakeLock ? ' on' : ''}" data-action="wakelock">${ui.wakeLock ? '켜짐' : '꺼짐'}</button></label>
    </div>
    ${missing.length ? `<div class="warnbox">빠진 핵심 동작: ${missing.map(slotLabel).join(', ')} <button class="btn sm" data-action="repair" style="margin-left:6px">자동 보완</button></div>` : ''}
    <div class="row" style="margin-top:10px"><button class="btn sm" data-action="add-ex">+ 운동 추가</button><button class="btn sm" data-action="change-part">부위 바꾸기</button><button class="btn sm ghost danger" data-action="discard">세션 버리기</button></div>
  </section>
  ${s.exercises.map((e, i) => renderExercise(state, e, i)).join('')}
  <section class="card">
    <h3>세션 마치기</h3>
    <div class="small">완료한 세트만 저장합니다. 추천과 다르게 한 내용도 다음 처방에 반영됩니다.</div>
    <textarea data-action="note" placeholder="오늘 전체 메모: 컨디션, 통증, 기구 문제, 추천이 이상했던 점" style="margin-top:8px">${esc(s.note || '')}</textarea>
    <div class="row" style="margin-top:10px"><button class="btn good" data-action="finish">저장하고 종료 (${work}세트)</button><button class="btn" data-action="export-json">JSON 백업</button></div>
  </section>`;
}

export function renderRestbar(state, now = Date.now()) {
  const rt = state.session?.restTimer;
  if (!rt) return null;
  const e = state.session.exercises.find((x) => x.uid === rt.uid);
  const left = Math.ceil((rt.startedAt + rt.seconds * 1000 - now) / 1000);
  return { over: left < 0, html: `<span class="lbl">${esc(e?.name || '휴식')}</span><span class="t" data-testid="rest-time">${left >= 0 ? fmtClock(left) : '+' + fmtClock(-left)}</span><button class="btn sm" data-action="rest-adj" data-d="-15">−15</button><button class="btn sm" data-action="rest-adj" data-d="30">+30</button><button class="btn sm" data-action="rest-stop">끝</button>` };
}

// ---------- 기록 ----------

export function renderRecords(state, ui, now = new Date()) {
  const hs = state.history.map((h) => h).sort((a, b) => b.date.localeCompare(a.date)).slice(0, ui.historyLimit || 30);
  const items = hs.map((h) => `<div class="hist-item"><div><b>${esc(h.date)} · ${esc(PART_LABEL[h.part])}</b>${h.source === 'pt' ? ' <span class="badge">PT</span>' : ''}
      <div class="tiny">${Number(h.workSets) || 0}세트${h.durationSec ? ` · ${Math.round(h.durationSec / 60)}분` : ''}${h.volumeUnknown ? ' · 볼륨 미상' : ''}${h.note ? ` · ${esc(h.note)}` : ''}</div></div>
      <button class="btn sm ghost" data-action="hist-edit" data-id="${esc(h.id)}">수정</button></div>`).join('') || '<div class="small">기록 없음</div>';
  const weeks = {};
  const cutoff = now.getTime() - 28 * 86400000;
  for (const h of state.history) {
    const d = parseDateLocal(h.date);
    if (!d || d.getTime() < cutoff || d.getTime() > now.getTime() + 86400000) continue;
    const m = new Date(d); m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const k = localISODate(m);
    weeks[k] ??= { push: 0, pull: 0, lower: 0, core: 0, sessions: 0 };
    weeks[k][h.part] += Number(h.workSets) || 0; weeks[k].sessions++;
  }
  const weekHtml = Object.keys(weeks).sort().reverse().map((k) => { const w = weeks[k]; return `<div class="source"><b>${k} 주</b><div class="small">세션 ${w.sessions}회 · Push ${w.push} · Pull ${w.pull} · Lower ${w.lower} · Core ${w.core}세트</div></div>`; }).join('') || '<div class="small">최근 4주 기록 없음</div>';
  const backupDays = state.lastBackup ? Math.floor((now.getTime() - new Date(state.lastBackup).getTime()) / 86400000) : null;
  return `
  <section class="card"><h3>최근 세션</h3>${items}
    ${state.history.length > hs.length ? '<button class="btn sm" data-action="more-history" style="margin-top:8px">더 보기</button>' : ''}</section>
  <section class="card"><h3>주간 요약</h3>${weekHtml}</section>
  <section class="card"><h3>백업 · 내보내기</h3>
    <div class="small">${backupDays === null ? '아직 파일 백업이 없습니다.' : `마지막 백업 ${backupDays}일 전.`} 폰을 바꾸거나 주소를 옮길 때 JSON 백업으로 옮깁니다.</div>
    <div class="row" style="margin-top:10px"><button class="btn" data-action="export-json">JSON</button><button class="btn" data-action="export-csv">CSV</button><button class="btn" data-action="export-txt">TXT</button><button class="btn" data-action="print">인쇄/PDF</button><button class="btn primary" data-action="import">복원</button></div>
    <input type="file" id="importFile" accept=".json,application/json" class="hidden">
  </section>`;
}

// ---------- 설정 ----------

export function renderSettings(state, ui) {
  const st = state.settings;
  const days = [['none', '고정 없음'], [1, '월'], [2, '화'], [3, '수'], [4, '목'], [5, '금'], [6, '토']];
  const equip = Object.entries(EQUIPMENT).filter(([k]) => k !== 'none').map(([k, n]) => `<label class="setting"><span>${esc(n)}</span><input type="checkbox" data-action="equip" data-k="${k}"${st.equipment[k] !== false ? ' checked' : ''}></label>`).join('');
  const unav = (st.unavailableExercises || []).map((id) => `<div class="setting"><span>${esc(catalogById(id)?.name || state.customExercises.find((c) => c.id === id)?.name || id)}</span><button class="btn sm" data-action="unavail-remove" data-id="${esc(id)}">다시 사용</button></div>`).join('') || '<div class="small">없음</div>';
  const all = [...ALL_CATALOG, ...state.customExercises];
  const prefIds = Object.keys(state.prefs || {});
  const prefs = prefIds.map((id) => { const x = all.find((y) => y.id === id); const p = state.prefs[id]; return `<div class="setting"><span>${esc(x?.name || id)}<span class="tiny" style="display:block">${[p.loadMode && MODE_LABEL[p.loadMode], p.increment !== undefined && `증량 ${p.increment}`, p.rest && `휴식 ${p.rest}초`, p.range && `${p.range[0]}~${p.range[1]}회`].filter(Boolean).join(' · ')}</span></span><button class="btn sm" data-action="pref-edit" data-id="${esc(id)}">수정</button></div>`; }).join('') || '<div class="small">기본값 그대로 사용 중</div>';
  const storage = ui.storage || {};
  return `
  <section class="card"><h3>일정 · 개인 정책</h3>
    <div class="grid2">
      <label class="field">일요일 헬스장 휴무<select data-action="setting" data-k="gymClosedSunday">${opt('true', '예', String(st.gymClosedSunday))}${opt('false', '아니오', String(st.gymClosedSunday))}</select></label>
      <label class="field">정기 PT 요일<select data-action="setting" data-k="ptDay">${days.map(([v, l]) => opt(v, l, st.ptDay ?? 'none')).join('')}</select></label>
    </div>
    <label class="setting"><span>허리 부하 큰 힙힌지 자동 추천 제외</span><input type="checkbox" data-action="setting-bool" data-k="avoidHinge"${st.avoidHinge !== false ? ' checked' : ''}></label>
    <label class="setting"><span>편측 하체: 왼쪽 먼저, 오른쪽은 왼쪽 반복 초과 금지 안내</span><input type="checkbox" data-action="setting-bool" data-k="leftFirst"${st.leftFirst !== false ? ' checked' : ''}></label>
  </section>
  <section class="card"><h3>헬스장에 없는 운동</h3>${unav}</section>
  <section class="card"><h3>운동별 설정</h3><div class="small">중량 방식 · 증량 단위 · 기본 휴식 · 반복 범위를 바꾼 운동만 보입니다.</div>${prefs}
    <button class="btn sm" data-action="pref-pick" style="margin-top:8px">운동 골라서 설정</button></section>
  <section class="card"><h3>장비</h3>${equip}</section>
  <section class="card"><h3>저장 상태</h3>
    <div class="small" data-testid="storage-status">기기 저장: ${storage.local === 'error' ? '<b style="color:var(--bad)">오류</b>' : '정상'} · 백업 저장소: ${storage.idb === 'error' ? '<b style="color:var(--bad)">오류</b>' : storage.idb === 'ok' ? '정상' : '확인 중'} · 영구 저장: ${storage.persisted === true ? '허용됨' : storage.persisted === false ? '미허용 (홈 화면에 설치하면 허용되기 쉽습니다)' : '확인 중'}</div>
    <div class="tiny" style="margin-top:4px">저장 번호 ${state.revision} · ${state.savedAt ? new Date(state.savedAt).toLocaleString('ko-KR') : '-'}</div>
  </section>
  <section class="card"><h3>추천 근거</h3><button class="btn" data-action="evidence">근거와 앱 정책 보기</button></section>
  <section class="card"><div class="tiny">Workout Coach v10 · 데이터는 이 기기에만 저장됩니다.</div></section>`;
}

export function evidenceHtml() {
  return `<h3>추천 근거와 앱 정책</h3><div class="warnbox" style="margin-top:0">${esc(POLICY_NOTE)}</div>` +
    EVIDENCE.map((s) => `<div class="source"><b>${esc(s.label)}</b><div class="small">${esc(s.text)}</div><div class="tiny">${esc(s.source)}</div><a href="${esc(s.url)}" target="_blank" rel="noopener">출처 열기</a></div>`).join('') +
    '<div class="actions"><button class="btn" data-sheet-value="__cancel">닫기</button></div>';
}

export { setReps, PART_OPTS, MODE_LABEL };
