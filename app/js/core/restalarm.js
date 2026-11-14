// 휴식 끝 알림 계획: 세션의 restTimer 를 보고 "지금 예약돼 있어야 할 알림"을 정한다 (DOM 과 네이티브 API 를 모르는 순수 로직).
// 화면 계층(ui/native.js)이 이 결과대로 네이티브 알림을 다시 예약하거나 지운다.
// 세트 체크, -15/+30, 다음 세트 기록, 건너뛰기, 세트 지우기, 세션 종료를 하나씩 잡지 않고 restTimer 가 바뀌었는지만 본다.
// 예약은 상태 전이(session.js)가 아니라 렌더 뒤에 맞춘다: 상태 변경은 전이 함수로만 한다는 원칙을 지키기 위해서다.

export const REST_NOTICE_ID = 7001; // 휴식 끝 알림은 늘 이 번호 하나만 쓴다 (새로 예약하면 앞의 것을 대신한다)
export const REST_CHANNEL = 'rest-end';
// 끝나기까지 이보다 짧게 남았으면 예약하지 않는다. 화면을 보고 있는 중이고, 플러그인은 지난 시각을 거부한다.
export const MIN_LEAD_MS = 1000;

export const restEndAt = (rt) => (rt ? rt.startedAt + rt.seconds * 1000 : null);

// restTimer 하나와 그때의 알림 글을 가리키는 키. 휴식 중에 다음 세트 무게를 고치면 글이 바뀌므로 글도 넣는다.
export function restAlarmKey(rt, body = '') {
  return rt ? `${rt.uid}:${rt.setIndex}:${rt.startedAt}:${rt.seconds}:${body}` : null;
}

// prevKey: 마지막으로 맞춘 키 (앱을 새로 띄운 직후에는 undefined).
// 반환: 할 일이 없으면 null, 있으면 { key, at }. at 이 있으면 그 시각으로 예약하고, null 이면 남은 알림을 지운다.
// 시간이 흐르기만 해서는 키가 바뀌지 않으므로, 휴식이 끝나는 순간에 알림을 지우는 일은 생기지 않는다.
export function planRestAlarm(prevKey, rt, { now = Date.now(), body = '' } = {}) {
  const key = restAlarmKey(rt, body);
  if (key === prevKey) return null;
  const end = restEndAt(rt);
  return { key, at: end !== null && end - now > MIN_LEAD_MS ? end : null };
}
