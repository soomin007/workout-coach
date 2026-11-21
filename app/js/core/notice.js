// 운동 중 알림(안드로이드 앱)의 순수 로직 (docs/research/notification_controls.md, docs/NATIVE_APP.md).
// 폰 잠금 화면의 알림에서 남은 휴식을 보고 '세트 완료'로 다음 세트를 기록한다. 폰이 잠긴 동안에는 앱 웹뷰가
// 자바스크립트를 처리하지 않으므로(known-issues 50) 네이티브가 알림을 그리고 버튼 기록을 적어 두며, 이 파일은 두 가지를 맡는다.
//
// noticePlan: 남은 세트를 처방대로 했을 때 알림에 차례로 보일 단계. 세트를 끝내야 바뀌는 값(무거운 날 톱세트 뒤 백오프 무게,
//   워밍업 뒤의 짧은 휴식, 무게 찾기)이 있어서, 세션 사본에 같은 전이 함수를 차례로 적용해 얻는다.
//   네이티브는 이 목록을 계산하지 않고 버튼이 눌릴 때마다 한 칸씩 넘긴다.
// applyNoticeEvents: 네이티브 기록장의 버튼 기록을 누른 시각 그대로 전이 함수에 넣는다. 결과는 그 시각에 앱에서
//   '다음 세트 기록'을 누른 것과 같다. 세션의 noticeSeq 에 마지막으로 본 기록 번호를 적어 같은 기록을 두 번 넣지 않는다.
import { toggleSetDone, recordHold, findWeightPending } from './session.js';
import { holdPhases, holdSeconds } from './hold.js';

export const MAX_STEPS = 60;
// 미리 계산할 때 쓰는 시각. 휴식 길이와 처방은 시각과 무관해서 고정값으로 두어 결과가 늘 같게 한다.
const SIM_NOW = new Date(0);

// 운동 순서대로 첫 미완료 세트. 화면 하단의 '다음 세트 기록'이 고르는 세트와 같은 규칙이다 (ui/views.js nextSet).
export function nextOpenSet(session) {
  for (const e of session?.exercises || []) {
    const i = e.sets.findIndex((z) => !z.done);
    if (i >= 0) return { e, i, z: e.sets[i] };
  }
  return null;
}

// 버티기(시간) 세트인지. 화면 하단 버튼이 '타이머로 다음 세트'가 되는 조건과 같다 (ui/views.js renderRestbar).
const isTimed = (e, z) => e.measure === 'seconds' && z.type !== 'warmup' && Number.isFinite(holdSeconds(e, z));

// describe(e, z, kind): 단계 글. 문구는 화면 계층이 정해 넘긴다.
// 반환: null (세션이 없거나 시작 전) 또는 { sid, ack, rest, steps }
//   ack: 이미 적용한 기록 번호. 네이티브는 이 번호까지의 기록을 지운다.
//   rest: 지금 휴식 { startedAt, seconds } 또는 null
//   steps[k]: { uid, i, kind, text, rest, secs?, phases? }
//     kind 'set' 은 처방대로 완료, 'hold' 는 버티기 세트(secs 와 단계 phases 를 함께 준다),
//     'ask' 는 무게 찾기 느낌이 필요해 앱을 열어야 하는 단계(버튼 없음, 목록은 여기서 끝난다).
//     rest 는 이 단계를 끝내면 시작되는 휴식(초)이다.
export function noticePlan(state, { describe = () => '', max = MAX_STEPS } = {}) {
  const s0 = state?.session;
  if (!s0 || s0.ready) return null;
  const draft = { session: structuredClone(s0) };
  const leftFirst = state.settings?.leftFirst !== false;
  const steps = [];
  while (steps.length < max) {
    const n = nextOpenSet(draft.session);
    if (!n) break;
    // 무게 찾기 중이면 방금 세트의 느낌(가벼움, 적당, 무거움)으로 이 운동의 다음 무게가 정해진다. 알림은 거기서 멈추고 앱을 열게 한다.
    const asked = findWeightPending(n.e);
    if (asked >= 0) {
      steps.push({ uid: n.e.uid, i: asked, kind: 'ask', text: describe(n.e, n.e.sets[asked], 'ask'), rest: 0 });
      break;
    }
    const timed = isTimed(n.e, n.z);
    const step = { uid: n.e.uid, i: n.i, kind: timed ? 'hold' : 'set', text: describe(n.e, n.z, timed ? 'hold' : 'set') };
    if (timed) {
      step.secs = holdSeconds(n.e, n.z);
      step.phases = holdPhases(step.secs, { unilateral: !!n.e.unilateral, leftFirst });
      recordHold(draft, n.e.uid, n.i, { secs: step.secs }, { now: SIM_NOW });
    } else toggleSetDone(draft, n.e.uid, n.i, { now: SIM_NOW });
    step.rest = draft.session.restTimer?.seconds ?? 0;
    steps.push(step);
  }
  const rt = s0.restTimer;
  return { sid: s0.id, ack: s0.noticeSeq || 0, rest: rt ? { startedAt: rt.startedAt, seconds: rt.seconds } : null, steps };
}

// events: 네이티브 기록장 [{ seq, sid, uid, i, at, kind: 'set' | 'hold', secs?, left?, right? }]
// 상태 전이다: store.commit 안에서 부른다. 반환 { applied, missing, stale }
//   missing: 이 세션의 기록인데 세트를 찾지 못한 수(그사이 운동을 빼거나 바꾼 경우). stale: 다른 세션의 기록 수.
//   이미 완료된 세트는 앱에서 먼저 체크한 것이므로 조용히 건너뛴다.
export function applyNoticeEvents(state, events = []) {
  const out = { applied: 0, missing: 0, stale: 0 };
  const s = state.session;
  if (!s) { out.stale = events.length; return out; }
  let last = s.noticeSeq || 0;
  for (const ev of [...events].sort((a, b) => a.seq - b.seq)) {
    if (!(ev.seq > last)) continue; // 이미 적용한 기록 (앱이 적용 직후 꺼졌다 다시 켜진 경우)
    last = ev.seq;
    if (ev.sid !== s.id) { out.stale += 1; continue; }
    const z = s.exercises.find((x) => x.uid === ev.uid)?.sets[ev.i];
    if (!z) { out.missing += 1; continue; }
    if (z.done) continue;
    const now = new Date(ev.at);
    const sides = Number.isFinite(ev.left) || Number.isFinite(ev.right);
    if (ev.kind === 'hold' && z.type !== 'warmup' && (sides || Number.isFinite(ev.secs))) {
      recordHold(state, ev.uid, ev.i, sides ? { left: ev.left, right: ev.right } : { secs: ev.secs }, { now });
    } else toggleSetDone(state, ev.uid, ev.i, { now });
    out.applied += 1;
  }
  s.noticeSeq = last;
  return out;
}
