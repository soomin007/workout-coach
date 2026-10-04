// 상태 → HTML. 이벤트는 data-action 속성으로만 연결한다 (actions.js 가 위임 처리).
import { esc } from './dom.js';
import { PART_LABEL, LOAD_MODES, EQUIPMENT, MUSCLE_LABEL, MUSCLE_BUDGET, ALL_CATALOG, catalogById, slotName } from '../core/catalog.js';
import { recommendPart, explainRecommendation, daysSince, muscleSets, missingCoreSlots, effectiveCheck, checkConfirmed, todaysHistory } from '../core/plan.js';
import { countWorkSets, timerSeconds } from '../core/session.js';
import { setReps, EFFORT_LABEL, EFFORTS } from '../core/schema.js';
import { EVIDENCE, POLICY_NOTE } from '../core/evidence.js';
import { guideFor } from '../core/guide.js';
import { gripById, gripArm } from '../core/grips.js';
import { gripArt } from './gripart.js';
import { HEAVY } from '../core/coach.js';
import { fmtClock, localISODate, parseDateLocal } from '../core/util.js';

const MODE_LABEL = Object.fromEntries(LOAD_MODES);
// 0kg 를 '빈 기구'로 읽는 방식 (원판을 하나도 안 꽂은 상태)
export const EMPTY_OK = ['machine', 'per_side', 'plates'];
const PART_OPTS = ['push', 'pull', 'lower', 'core'];
const opt = (v, label, cur) => `<option value="${esc(v)}"${String(v) === String(cur) ? ' selected' : ''}>${esc(label)}</option>`;
const slotLabel = slotName;

// ---------- 오늘 (세션 없음) ----------

const ENERGY = [['good', '좋음'], ['normal', '보통'], ['tired', '피곤'], ['very_tired', '매우 피곤']];
const DOMS = [[0, '없음'], [1, '약간'], [2, '꽤 있음'], [3, '심함']];
const PAIN = { none: '없음', shoulder: '어깨', back: '허리', knee: '무릎', ankle: '발목', other: '기타' };
const MINUTES = [30, 45, 60, 75, 90];
export const INTENSITY = { light: '가볍게', normal: '일반', strength: '근력 중심' };
const REC_LABEL = { push: 'Push', pull: 'Pull', lower: 'Lower', core: 'Core', rest: '오늘은 쉬어요', pt: 'PT 날', done: '오늘 운동 완료' };

export function renderToday(state, ui, now = new Date()) {
  if (state.session) return renderSession(state, ui, now);
  const r = recommendPart(state, now);
  if (r.part === 'done') return renderDoneToday(state, now) + renderDashboard(state, now);
  const c = effectiveCheck(state, now);
  const ok = checkConfirmed(state, now);
  const domsL = (v) => DOMS.find((x) => x[0] === +v)?.[1] || '없음';
  const date = ui.newDate || localISODate(now);
  const summary = [
    c.upperDoms || c.lowerDoms ? `근육통 상체 ${domsL(c.upperDoms)} · 하체 ${domsL(c.lowerDoms)}` : '근육통 없음',
    c.pain !== 'none' ? `${PAIN[c.pain]} 불편` : null,
    ok.includes('minutes') ? `${c.minutes}분` : null, ok.includes('intensity') ? INTENSITY[c.intensity] : null,
    !ok.includes('minutes') || !ok.includes('intensity') ? '시간·강도는 시작할 때 고릅니다' : null,
    date !== localISODate(now) ? `${date} 기록` : null,
  ].filter(Boolean).join(' · ');
  const pick = (k, list) => `<option value=""${ok.includes(k) ? '' : ' selected'} disabled>고르기</option>${list.map(([v, l]) => `<option value="${esc(v)}"${ok.includes(k) && String(v) === String(c[k]) ? ' selected' : ''}>${esc(l)}</option>`).join('')}`;
  const reasons = explainRecommendation(state, r, now);
  const partCls = PART_OPTS.includes(r.part) ? ` part-${r.part}` : '';
  return `
  <section class="card">
    <div class="kicker">오늘 컨디션</div>
    <div class="row" style="margin-top:6px">${ENERGY.map(([v, l]) => `<button class="chip${ok.includes('energy') && c.energy === v ? ' on' : ''}" data-action="energy" data-v="${v}">${l}</button>`).join('')}</div>
    <button class="cond-summary" data-action="toggle-cond" aria-expanded="${ui.condOpen ? 'true' : 'false'}"><span>${esc(summary)}</span><span class="tiny">${ui.condOpen ? '접기' : '바꾸기'}</span></button>
    ${ui.condOpen ? `<div class="grid2" style="margin-top:8px">
      <label class="field">상체 근육통<select data-action="check" data-k="upperDoms">${DOMS.map(([v, l]) => opt(v, l, c.upperDoms)).join('')}</select></label>
      <label class="field">하체 근육통<select data-action="check" data-k="lowerDoms">${DOMS.map(([v, l]) => opt(v, l, c.lowerDoms)).join('')}</select></label>
      <label class="field">통증/불편<select data-action="check" data-k="pain">${Object.entries(PAIN).map(([v, l]) => opt(v, l, c.pain)).join('')}</select></label>
      <label class="field">가능 시간<select data-action="check" data-k="minutes">${pick('minutes', MINUTES.map((m) => [m, `${m}분`]))}</select></label>
      <label class="field">오늘 강도<select data-action="check" data-k="intensity">${pick('intensity', Object.entries(INTENSITY))}</select></label>
      <label class="field">운동 날짜<input type="date" data-action="new-date" value="${esc(date)}"></label>
    </div>` : ''}
  </section>
  <section class="card hero${partCls}">
    <div class="kicker">오늘 추천</div>
    <div class="title" data-testid="rec-title">${esc(REC_LABEL[r.part])}</div>
    <ul class="reasons">${reasons.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
    <div class="row" style="margin-top:12px">
      ${PART_OPTS.includes(r.part) ? `<button class="btn primary" data-action="start" data-part="${r.part}" data-home="${r.home ? 1 : 0}">${r.home ? '집에서 ' : ''}${esc(REC_LABEL[r.part])} 시작</button>` : ''}
      ${r.part === 'pt' ? '<button class="btn primary" data-action="pt">PT 기록</button>' : ''}
      <button class="btn" data-action="start-manual">부위 직접 선택</button>
    </div>
    <div class="row" style="margin-top:6px">${r.part === 'pt' || c.noPtDate === localISODate(now) ? `<button class="btn sm ${c.noPtDate === localISODate(now) ? 'lit' : 'ghost'}" data-action="no-pt" data-testid="no-pt">${c.noPtDate === localISODate(now) ? '오늘 PT 있어요' : '오늘 PT 없어요'}</button>` : ''}<button class="btn sm ${c.gymClosedDate === localISODate(now) ? 'lit' : 'ghost'}" data-action="gym-closed" data-testid="gym-closed">${c.gymClosedDate === localISODate(now) ? '헬스장 휴무 해제' : '오늘 헬스장 못 가요'}</button><button class="btn sm ghost" data-action="why">계산 자세히</button>${r.part !== 'pt' ? '<button class="btn sm ghost" data-action="pt">PT 기록</button>' : ''}</div>
  </section>
  ${renderDashboard(state, now)}`;
}

// 오늘 이미 운동을 마친 날: 추천 대신 오늘 한 것을 보여 주고, 추가 운동은 묻는다.
function renderDoneToday(state, now) {
  const hs = todaysHistory(state, now);
  const parts = [...new Set(hs.map((h) => h.part))];
  const lines = hs.map((h) => `<li>${esc(PART_LABEL[h.part])}${h.source === 'pt' ? ' (PT)' : ''} · ${Number(h.workSets) || 0}세트${h.durationSec ? ` · ${Math.round(h.durationSec / 60)}분` : ''}</li>`).join('');
  const x = recommendPart(state, now, { extra: true });
  const extraBtn = PART_OPTS.includes(x.part)
    ? `<button class="btn" data-action="start" data-part="${x.part}" data-extra="1" data-home="${x.home ? 1 : 0}">추가로 ${esc(REC_LABEL[x.part])} 하기</button>` : '';
  return `<section class="card hero done${parts.length === 1 ? ` part-${parts[0]}` : ''}" data-testid="done-today">
    <div class="kicker">오늘 운동 완료</div>
    <div class="title" data-testid="rec-title">${esc(parts.map((p) => PART_LABEL[p]).join(' · '))} 완료</div>
    <ul class="reasons">${lines}</ul>
    <div class="small" style="margin-top:10px">오늘 할 운동은 끝났습니다. 이제는 회복이 다음 운동을 만듭니다.</div>
    <div class="sep"></div>
    <div class="kicker">추가 운동을 할까요?</div>
    <div class="small" style="margin-top:4px">${x.part === 'rest' ? esc(x.why) : '한다면 오늘 안 한 부위를 짧게 권합니다.'}</div>
    <div class="row" style="margin-top:10px">${extraBtn}<button class="btn ghost" data-action="start-manual" data-extra="1">다른 부위 고르기</button><button class="btn ghost" data-action="pt">PT 기록</button></div>
  </section>`;
}

// 운동 시작 전 확인 시트. 부위 · 컨디션 · 가능 시간 · 강도는 오늘 고른 값이 없으면 비워 두고 반드시 고르게 한다.
export function startSheetHtml(state, { part = null, rec = null, home = false, extra = false, now = new Date() } = {}) {
  const c = effectiveCheck(state, now);
  const ok = checkConfirmed(state, now);
  const chips = (k, list, cur, { required = false } = {}) => `<div class="pick" data-k="${k}"${required ? ' data-required="1"' : ''}>${list.map(([v, l, hint]) => `<button type="button" class="chip${cur !== null && String(v) === String(cur) ? ' on' : ''}" data-v="${esc(v)}" aria-pressed="${cur !== null && String(v) === String(cur)}">${esc(l)}${hint ? `<small>${esc(hint)}</small>` : ''}</button>`).join('')}</div>`;
  const val = (k) => (ok.includes(k) ? c[k] : null);
  const doneParts = extra ? new Set(todaysHistory(state, now).map((h) => h.part)) : new Set();
  const parts = PART_OPTS.map((p) => [p, PART_LABEL[p], p === rec ? '추천' : doneParts.has(p) ? '오늘 함' : '']);
  const last = state.history.length && (!ok.includes('minutes') || !ok.includes('intensity')) ? `<div class="tiny" style="margin-top:4px">지난번: ${c.minutes}분 · ${INTENSITY[c.intensity]}</div>` : '';
  return `<div class="startform">
    <h3>${extra ? '추가 운동 설정' : '오늘 운동 설정'}</h3>
    <p class="small">오늘 상태로 운동 개수와 세트 수를 정합니다.</p>
    <div class="pick-label">부위</div>${chips('part', parts, part, { required: true })}
    <div class="pick-label">컨디션</div>${chips('energy', ENERGY, val('energy'), { required: true })}
    <div class="pick-label">가능 시간</div>${chips('minutes', MINUTES.map((m) => [m, `${m}분`]), val('minutes'), { required: true })}
    <div class="pick-label">강도</div>${chips('intensity', [['light', '가볍게', '세트 적게'], ['normal', '일반', ''], ['strength', '근력 중심', '첫 메인 운동 무겁게']], val('intensity'), { required: true })}
    ${last}
    <div class="pick-label">상체 근육통</div>${chips('upperDoms', DOMS, c.upperDoms)}
    <div class="pick-label">하체 근육통</div>${chips('lowerDoms', DOMS, c.lowerDoms)}
    <div class="pick-label">통증·불편</div>${chips('pain', Object.entries(PAIN), c.pain)}
    <div class="warnbox hidden" data-testid="start-warn"></div>
    <label class="setting"><span>집에서 (헬스장 없이)</span><input type="checkbox" name="home"${home ? ' checked' : ''}></label>
    <details class="more"><summary>날짜 · 추천과 다르게 고른 이유</summary>
      <label class="field" style="margin-top:6px">운동 날짜<input type="date" name="date" value="${esc(localISODate(now))}"></label>
      <textarea name="why" placeholder="추천과 다르게 고른 이유 (선택): PT 일정, 기구, 선호 등" style="margin-top:6px"></textarea>
    </details>
    <div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok" data-testid="start-go" disabled>시작</button></div>
  </div>`;
}

function renderDashboard(state, now) {
  const recent = PART_OPTS.map((p) => { const d = daysSince(state, p, now); return `<div class="recent part-${p}"><b>${PART_LABEL[p]}</b><span>${d >= 99 ? '기록 없음' : d === 0 ? '오늘' : `${d}일 전`}</span></div>`; }).join('');
  const rows = Object.keys(MUSCLE_LABEL).map((m) => ({ m, v: muscleSets(state, m, now), b: MUSCLE_BUDGET[m] }));
  const bar = ({ m, v, b }) => `<div class="bar-row"><span>${MUSCLE_LABEL[m]}</span><div class="bar"><i style="width:${Math.min(100, (v / b) * 100)}%"></i></div><span class="tiny">${v}/${b}</span></div>`;
  const lacking = rows.filter((x) => x.v < x.b * 0.5);
  const rest = rows.filter((x) => x.v >= x.b * 0.5);
  return `<section class="card">
    <h3>최근 부위</h3><div class="recent-grid">${recent}</div>
    <div class="sep"></div><h3>이번 주 부족한 근육 <span class="tiny">최근 7일 · 목표의 절반 미만</span></h3>
    <div class="bars">${lacking.map(bar).join('') || '<div class="small">모든 근육이 목표의 절반 이상입니다.</div>'}</div>
    ${rest.length ? `<details class="more"><summary>나머지 ${rest.length}개 근육</summary><div class="bars" style="margin-top:6px">${rest.map(bar).join('')}</div></details>` : ''}
  </section>`;
}

// ---------- 세션 ----------

function unitOf(e) { return e.measure === 'seconds' ? '초' : '회'; }

function weightLabel(e, w) {
  if (w === null || w === undefined) return e.loadMode === 'bodyweight' ? '체중' : '<small>kg 입력</small>';
  if (e.loadMode === 'bodyweight') return `+${w}<small>kg</small>`;
  if (e.loadMode === 'assist') return `${w}<small>보조</small>`;
  if (w === 0 && EMPTY_OK.includes(e.loadMode)) return '<small>빈 기구</small>';
  return `${w}<small>kg</small>`;
}

function stepper(action, uid, i, field, label, testid) {
  return `<div class="stepper" data-testid="${testid}"><button data-action="${action}" data-uid="${uid}" data-i="${i}" data-f="${field}" data-d="-1" aria-label="줄이기">−</button><button class="val" data-action="num" data-uid="${uid}" data-i="${i}" data-f="${field}">${label}</button><button data-action="${action}" data-uid="${uid}" data-i="${i}" data-f="${field}" data-d="1" aria-label="늘리기">+</button></div>`;
}

// 다음에 할 세트: 운동 순서대로 첫 미완료 세트.
export function nextSet(session) {
  for (const e of session?.exercises || []) {
    const i = e.sets.findIndex((z) => !z.done);
    if (i >= 0) return { e, i, z: e.sets[i] };
  }
  return null;
}

function setSummary(e, z) {
  const w = z.weight === null || z.weight === undefined ? '' : z.weight === 0 && EMPTY_OK.includes(e.loadMode) ? '빈 기구 × ' : `${z.weight}kg × `;
  const reps = z.split ? `L${z.leftReps ?? '-'}/R${z.rightReps ?? '-'}` : `${z.reps ?? '-'}`;
  return `${w}${reps}${unitOf(e)}`;
}

function renderSetRow(e, z, i, mainNo, isNext) {
  const warm = z.type === 'warmup';
  const no = warm ? 'W' : z.heavy === 'top' ? '톱' : z.type === 'backoff' || z.heavy === 'backoff' ? 'B' : String(mainNo);
  const u = unitOf(e);
  const repsBlock = z.split
    ? `<div class="lr">${stepper('step', e.uid, i, 'leftReps', `L ${z.leftReps ?? '-'}`, `left-${i}`)}${stepper('step', e.uid, i, 'rightReps', `R ${z.rightReps ?? '-'}`, `right-${i}`)}</div>`
    : stepper('step', e.uid, i, 'reps', `${z.reps ?? '-'}<small>${u}</small>`, `reps-${i}`);
  const w = stepper('step', e.uid, i, 'weight', weightLabel(e, z.weight), `weight-${i}`);
  const toggle = e.unilateral && !warm ? `<span></span><button class="split-toggle" data-action="split" data-uid="${e.uid}" data-i="${i}" data-on="${z.split ? 0 : 1}">${z.split ? '좌우 같게' : '좌우 다르게 입력'}</button>` : '';
  const cls = `set ${z.type}${z.heavy === 'top' ? ' top' : ''}${z.done ? ' done' : ''}${isNext ? ' next' : ''}`;
  const noBtn = `<button class="no" data-action="set-menu" data-uid="${e.uid}" data-i="${i}" aria-label="세트 ${no} 메뉴">${no}${z.rir !== null && !warm ? `<small>R${z.rir}</small>` : ''}</button>`;
  const doneBtn = `<button class="done-btn" data-action="done" data-uid="${e.uid}" data-i="${i}" aria-label="세트 완료" aria-pressed="${z.done}">${z.done ? '✓' : ''}</button>`;
  if (z.split) return `<div class="${cls}" data-set="${i}">${noBtn}${w}<span></span>${doneBtn}<span></span>${repsBlock}${toggle}</div>`;
  return `<div class="${cls}" data-set="${i}">${noBtn}${w}${repsBlock}${doneBtn}${toggle}</div>`;
}

function renderExercise(state, e, idx, ui, next) {
  const mains = e.sets.filter((z) => z.type !== 'warmup');
  const allDone = mains.length > 0 && mains.every((z) => z.done);
  // 다 끝났고 느낌까지 받았으면 한 줄로 접는다 (눌러서 다시 펼침).
  if (allDone && e.effort && !ui.expanded?.has(e.uid)) {
    return `<section class="card ex collapsed" data-uid="${e.uid}" data-exercise="${esc(e.exerciseId)}">
      <button class="ex-fold" data-action="expand" data-uid="${e.uid}"><span class="ex-title"><span class="ok">✓</span> ${idx + 1}. ${esc(e.name)}</span>
      <span class="small" data-testid="ex-summary">${mains.map((z) => setSummary(e, z)).join(' · ')} · ${EFFORT_LABEL[e.effort]}</span></button></section>`;
  }
  const badge = e.unilateral ? '좌우' : e.compound ? '복합' : '보조';
  const restNow = e.restToday ?? e.rest;
  let mainNo = 0;
  const rows = e.sets.map((z, i) => renderSetRow(e, z, i, z.type === 'warmup' ? 0 : ++mainNo, !!next && next.e.uid === e.uid && next.i === i)).join('');
  const effort = allDone
    ? `<div class="effort-ask">마지막 세트 어땠나요? <span class="tiny">다음 처방에 반영됩니다</span></div><div class="effort" data-testid="effort">${EFFORTS.map((k) => `<button class="${e.effort === k ? 'on' : ''}" data-action="effort" data-uid="${e.uid}" data-v="${k}">${EFFORT_LABEL[k]}</button>`).join('')}</div>`
    : '';
  const top = e.heavy ? e.sets.find((z) => z.heavy === 'top') : null;
  const topRir = top && top.done && top.rir === null
    ? `<div class="effort-ask">톱세트에서 몇 회 더 할 수 있었나요? <span class="tiny">다음 무거운 날 무게에 반영됩니다</span></div><div class="effort" data-testid="top-rir">${[[0, '0 (한계)'], [1, '1'], [2, '2'], [3, '3 이상']].map(([v, l]) => `<button data-action="top-rir" data-uid="${e.uid}" data-i="${e.sets.indexOf(top)}" data-v="${v}">${l}</button>`).join('')}</div>` : '';
  const fold = allDone && e.effort ? `<button class="btn sm ghost" data-action="collapse" data-uid="${e.uid}">접기</button>` : '';
  return `<section class="card ex${allDone ? ' complete' : ''}${next && next.e.uid === e.uid ? ' current' : ''}" data-uid="${e.uid}" data-exercise="${esc(e.exerciseId)}">
    <div class="ex-head">
      <div><div class="ex-title">${idx + 1}. ${esc(e.name)}</div>
      <div class="ex-meta">${e.heavy ? `<b class="heavy-tag">무거운 날</b> 톱세트 ${HEAVY.top[0]}~${HEAVY.top[1]}회 → 백오프 ${HEAVY.backoff[0]}~${HEAVY.backoff[1]}회` : `목표 ${e.range[0]}~${e.range[1]}${unitOf(e)}`} · 휴식 ${restNow}초${e.restToday !== null && e.restToday !== e.rest ? ' (오늘)' : ''} · ${esc(MODE_LABEL[e.loadMode] || e.loadMode)}</div></div>
      <div class="row" style="flex-wrap:nowrap"><span class="badge">${badge}</span><button class="btn sm ghost" data-action="ex-menu" data-uid="${e.uid}" aria-label="운동 메뉴">⋯</button></div>
    </div>
    ${gripChip(e)}
    ${holdButton(e, allDone)}
    <div class="rx">${esc(e.prescription?.note || '')}</div>
    ${e.coach ? `<div class="coach" data-testid="coach">${esc(e.coach)}</div>` : ''}
    ${guideHtml(e)}
    <div class="sets">${rows}</div>
    ${topRir}
    ${effort}
    ${e.memo ? `<div class="tiny" style="margin-top:6px">메모: ${esc(e.memo)}</div>` : ''}
    <div class="ex-actions">${allDone ? '' : `<button class="btn sm" data-action="complete-rest" data-uid="${e.uid}">계획대로 완료</button>`}<button class="btn sm" data-action="quick" data-uid="${e.uid}">한 줄 기록</button><button class="btn sm" data-action="memo" data-uid="${e.uid}">${e.memo ? '메모 수정' : '메모'}</button><button class="btn sm" data-action="set-count" data-uid="${e.uid}" data-d="1">세트 +1</button><button class="btn sm" data-action="set-count" data-uid="${e.uid}" data-d="-1">세트 −1</button>${fold}</div>
  </section>`;
}

// 시간형 운동: 다음 세트를 타이머로 (좌우면 한쪽씩 + 자세 바꾸는 시간).
function holdButton(e, allDone) {
  if (e.measure !== 'seconds' || allDone) return '';
  const z = e.sets.find((x) => x.type !== 'warmup' && !x.done);
  const secs = z?.reps ?? e.prescription?.reps ?? e.range[0];
  return `<button class="btn hold-btn" data-action="hold" data-uid="${e.uid}" data-testid="hold-start">타이머로 하기 · ${secs}초${e.unilateral ? ' × 좌우' : ''}</button>`;
}

const muscleNames = (xs) => xs.map((m) => MUSCLE_LABEL[m] || m).join(', ');

// 그립을 고를 수 있는 운동: 작은 그림 + 지금 그립 이름. 누르면 그립 시트(그림 · 자극 부위 · 잡는 법).
function gripChip(e) {
  const g = e.grip ? gripById(e.exerciseId, e.grip) : null;
  if (!g) return '';
  return `<button class="grip-chip" data-action="grip" data-uid="${e.uid}" data-testid="grip-chip"><span class="grip-thumb" aria-hidden="true">${gripArt(g, { arm: gripArm(e.exerciseId) })}</span>
    <span class="grip-txt"><b>그립 · ${esc(g.name)}</b><span class="tiny">주로 ${esc(muscleNames(e.primary))} · 눌러서 그림 보기 · 바꾸기</span></span></button>`;
}

// 그립 시트 본문. done: 이미 완료한 세트가 있으면 보기만 한다.
export function gripSheetHtml(e, grips, done) {
  const opts = grips.map((g) => {
    const cur = g.id === e.grip;
    const prim = g.primary || (cur ? e.primary : null);
    return `<div class="grip-opt${cur ? ' on' : ''}" data-grip="${esc(g.id)}">
      ${gripArt(g, { arm: gripArm(e.exerciseId) })}
      <div class="grip-name">${esc(g.name)}${cur ? ' <span class="tag">지금</span>' : ''}</div>
      ${prim ? `<div class="tiny">주로 ${esc(muscleNames(prim))}</div>` : ''}
      <p class="small">${esc(g.emphasis)}</p>
      <ol>${g.how.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>
      ${cur || done ? '' : `<button class="btn primary" data-sheet-value="${esc(g.id)}">이 그립으로</button>`}
    </div>`;
  }).join('');
  return `<h3>${esc(e.name)} 그립</h3>
    <p class="small">그림은 내 눈으로 내려다본 손입니다. 점선은 내 어깨 위치. 그립마다 다룰 수 있는 무게가 달라서, 처방은 같은 그립 기록끼리 비교합니다.${done ? ' 이미 완료한 세트가 있어 이번에는 보기만 할 수 있습니다.' : ''}</p>
    <div class="grip-list">${opts}</div>
    <div class="actions"><button class="btn" data-sheet-value="__cancel">닫기</button></div>`;
}

// 운동 설명: 하는 방법 · 주의할 점이 먼저, 근육 정보와 개인 체크 포인트는 뒤에.
function guideHtml(e) {
  const g = guideFor(e.exerciseId);
  const muscles = [...e.primary.map((m) => MUSCLE_LABEL[m] || m)].join('·');
  const list = (xs, tag) => `<${tag}>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
  const gr = e.grip ? gripById(e.exerciseId, e.grip) : null;
  return `<details class="cue" data-testid="guide"><summary>운동 방법 · 주의할 점</summary>
    ${gr ? `<div class="guide-h">지금 그립: ${esc(gr.name)} (${esc(gr.hold)})</div>${list(gr.how, 'ul')}` : ''}
    ${g ? `<div class="guide-h">하는 방법</div>${list(g.how, 'ol')}<div class="guide-h">주의할 점</div>${list(g.caution, 'ul')}` : '<div class="small">직접 만든 운동이라 설명이 없습니다. 메모에 자세 포인트를 적어 두세요.</div>'}
    ${e.cue ? `<div class="guide-h">내 체크 포인트</div><div>${esc(e.cue)}</div>` : ''}
    <div class="tiny" style="margin-top:6px">${esc(slotLabel(e.slot))} · 주로 ${esc(muscles)} · ${esc(e.why)}</div></details>`;
}

export function renderSession(state, ui, now = new Date()) {
  const s = state.session;
  const total = s.exercises.reduce((a, e) => a + e.sets.filter((z) => z.type !== 'warmup').length, 0);
  const work = countWorkSets(s);
  const missing = missingCoreSlots(state);
  const next = nextSet(s);
  const today = localISODate(now);
  return `
  <section class="card session-top part-${s.part}" data-testid="session-head">
    <div class="session-head">
      <div><div class="kicker" data-testid="session-mode">진행 중${s.home ? ' · 집' : ''} · ${s.minutes}분 · ${esc(INTENSITY[s.intensity] || '일반')}${s.date !== today ? ` · ${esc(s.date)} 기록` : ''}</div><h2>${esc(PART_LABEL[s.part])}</h2>
        <div class="small" data-testid="session-meta">예상 ${s.estimatedMinutes}분 · 운동 ${s.exercises.length}개 · 본세트 ${work}/${total}</div></div>
      <div class="head-right"><div class="clock${s.timer.running ? '' : ' paused'}" id="sessionClock">${fmtClock(timerSeconds(s.timer, now.getTime()))}</div>${s.timer.running ? '' : '<div class="small paused-label" data-testid="timer-paused">일시정지됨 · 세트를 끝내면 다시 갑니다</div>'}
        <div class="row" style="flex-wrap:nowrap;justify-content:flex-end">
          <button class="btn sm ghost" data-action="timer" aria-label="${s.timer.running ? '일시정지' : '재개'}">${s.timer.running ? '❚❚' : '▶'}</button>
          <button class="btn sm ghost${ui.wakeLock ? ' lit' : ''}" data-action="wakelock" data-testid="wakelock" aria-pressed="${ui.wakeLock ? 'true' : 'false'}">${ui.wakeLock ? '화면 유지 중' : '화면 유지'}</button>
          <button class="btn sm ghost" data-action="session-menu" aria-label="세션 메뉴">⋯</button>
        </div></div>
    </div>
    <div class="progress"><i style="width:${total ? (work / total) * 100 : 0}%"></i></div>
    ${missing.length ? `<div class="warnbox">빠진 핵심 동작: ${missing.map(slotLabel).join(', ')} <button class="btn sm" data-action="repair" style="margin-left:6px">자동 보완</button></div>` : ''}
  </section>
  ${s.exercises.map((e, i) => renderExercise(state, e, i, ui, next)).join('')}
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
  const left = Math.ceil((rt.startedAt + rt.seconds * 1000 - now) / 1000);
  const n = nextSet(state.session);
  const nx = n ? `다음 · ${esc(n.e.name)} ${esc(setSummary(n.e, n.z))}` : '마지막 세트까지 끝났어요';
  return { over: left < 0, html: `<div class="rest-info"><span class="lbl" data-testid="rest-next">${nx}</span><span class="t" data-testid="rest-time">${left >= 0 ? fmtClock(left) : '+' + fmtClock(-left)}</span></div><button class="btn sm" data-action="rest-adj" data-d="-15">−15</button><button class="btn sm" data-action="rest-adj" data-d="30">+30</button><button class="btn sm" data-action="rest-stop">끝</button>` };
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
      <label class="field">PT 요일 (보통)<select data-action="setting" data-k="ptDay">${days.map(([v, l]) => opt(v, l, st.ptDay ?? 'none')).join('')}</select></label>
    </div>
    <label class="setting"><span>허리 부하 큰 힙힌지 자동 추천 제외</span><input type="checkbox" data-action="setting-bool" data-k="avoidHinge"${st.avoidHinge !== false ? ' checked' : ''}></label>
    <label class="setting"><span>편측 하체: 왼쪽 먼저, 오른쪽은 왼쪽 반복 초과 금지 안내</span><input type="checkbox" data-action="setting-bool" data-k="leftFirst"${st.leftFirst !== false ? ' checked' : ''}></label>
  </section>
  <section class="card"><h3>헬스장에 없는 운동</h3>${unav}</section>
  <section class="card"><h3>운동별 설정</h3><div class="small">중량 방식 · 증량 단위 · 기본 휴식 · 반복 범위를 바꾼 운동만 보입니다.</div>${prefs}
    <button class="btn sm" data-action="pref-pick" style="margin-top:8px">운동 골라서 설정</button></section>
  <section class="card"><h3>집에 있는 장비</h3><div class="small">헬스장 휴무일 · 일요일 홈 운동에서 쓸 수 있는 장비입니다. 없으면 맨몸 운동만 추천합니다.</div>${['dumbbell', 'dumbbell_bench', 'pullup'].map((k) => `<label class="setting"><span>${esc(EQUIPMENT[k])}</span><input type="checkbox" data-action="home-equip" data-k="${k}"${(st.homeEquipment || []).includes(k) ? ' checked' : ''}></label>`).join('')}</section>
  <section class="card"><h3>헬스장 장비</h3>${equip}</section>
  <section class="card"><h3>저장 상태</h3>
    <div class="small" data-testid="storage-status">기기 저장: ${storage.local === 'error' ? '<b style="color:var(--bad)">오류</b>' : '정상'} · 백업 저장소: ${storage.idb === 'error' ? '<b style="color:var(--bad)">오류</b>' : storage.idb === 'ok' ? '정상' : '확인 중'} · 영구 저장: ${storage.persisted === true ? '허용됨' : storage.persisted === false ? '미허용 (홈 화면에 설치하면 허용되기 쉽습니다)' : '확인 중'}</div>
    <div class="tiny" style="margin-top:4px">저장 번호 ${state.revision} · ${state.savedAt ? new Date(state.savedAt).toLocaleString('ko-KR') : '-'}</div>
  </section>
  ${syncCard(ui.sync)}
  <section class="card"><h3>추천 근거</h3><button class="btn" data-action="evidence">근거와 앱 정책 보기</button></section>
  <section class="card"><h3>앱 정보</h3><div class="small" data-testid="app-version">버전 ${esc(ui.version || '확인 중')}</div><div class="tiny">${ui.sync ? '데이터는 이 기기와 GitHub 저장소에 저장됩니다.' : '데이터는 이 기기에만 저장됩니다.'}</div>
    <button class="btn sm" data-action="check-update" style="margin-top:8px">업데이트 확인</button></section>`;
}

function syncCard(sy) {
  if (!sy) {
    return `<section class="card"><h3>기록 동기화</h3><div class="small">GitHub 비공개 저장소에 기록을 자동으로 올려 둡니다. 폰을 바꿔도 그대로 받고, PC에서 기록을 확인하거나 고칠 수 있습니다.</div>
    <button class="btn sm primary" data-action="sync-connect" style="margin-top:8px">GitHub 연결</button></section>`;
  }
  const at = sy.at ? new Date(sy.at).toLocaleString('ko-KR') : '아직 없음';
  return `<section class="card"><h3>기록 동기화</h3>
    <div class="small" data-testid="sync-status">${esc(sy.repo)} · ${sy.busy ? '동기화 중...' : `마지막 동기화 ${esc(at)}`}</div>
    ${sy.error ? `<div class="warnbox">${esc(sy.error)}</div>` : ''}
    <div class="row" style="margin-top:8px"><button class="btn sm" data-action="sync-now">지금 동기화</button><button class="btn sm" data-action="sync-transfer">다른 기기 연결 (QR)</button><button class="btn sm" data-action="sync-connect">다시 연결</button><button class="btn sm" data-action="sync-disconnect">연결 끊기</button></div></section>`;
}

export function evidenceHtml() {
  return `<h3>추천 근거와 앱 정책</h3><div class="warnbox" style="margin-top:0">${esc(POLICY_NOTE)}</div>` +
    EVIDENCE.map((s) => `<div class="source"><b>${esc(s.label)}</b><div class="small">${esc(s.text)}</div><div class="tiny">${esc(s.source)}</div><a href="${esc(s.url)}" target="_blank" rel="noopener">출처 열기</a></div>`).join('') +
    '<div class="actions"><button class="btn" data-sheet-value="__cancel">닫기</button></div>';
}

export { setReps, PART_OPTS, MODE_LABEL };
