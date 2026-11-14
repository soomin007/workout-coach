// 안드로이드 앱(Capacitor 로 감싼 이 웹 앱)에서만 쓰는 기능. 크롬에서는 아무 일도 하지 않는다.
// 웹 코드는 빌드 없이 GitHub Pages 에서 오므로 @capacitor/core 를 들이지 않고, 앱이 페이지에 넣어 주는
// window.Capacitor 브리지의 nativePromise 로 플러그인을 직접 부른다. 플러그인은 APK 에 들어 있어 웹 코드와 버전이
// 어긋날 수 있으므로, 부르기 전에 그 APK 에 플러그인이 있는지(PluginHeaders) 확인한다 (docs/NATIVE_APP.md).
import { planRestAlarm, REST_NOTICE_ID, REST_CHANNEL } from '../core/restalarm.js';

const LN = 'LocalNotifications';
const TEST_NOTICE_ID = 7002;
const cap = () => globalThis.Capacitor;
const call = (method, opts = {}) => cap().nativePromise(LN, method, opts);

export function hasPlugin(name) {
  const c = cap();
  try { return !!(c?.isNativePlatform?.() && Array.isArray(c.PluginHeaders) && c.PluginHeaders.some((h) => h.name === name)); } catch { return false; }
}

// 설정 탭 표시용. display: 알림 권한, exact: 정확한 시각 알람 권한 ('granted', 'denied', 'prompt' …)
export const notice = { available: false, display: null, exact: null, error: null };
let ready = null;
let queue = Promise.resolve();
let appliedKey; // 마지막으로 맞춘 키. undefined 면 앱을 새로 띄운 것이라 지난 실행에서 남은 예약도 한 번 지운다.

async function readPermissions({ ask = false } = {}) {
  let p = await call('checkPermissions');
  // 안드로이드 13 이상은 알림 권한을 앱 시작 때 한 번 묻는다. 묻지 않으면 첫 세트 체크 때 플러그인이 대신 물어 운동이 끊긴다.
  if (ask && (p.display === 'prompt' || p.display === 'prompt-with-rationale')) p = await call('requestPermissions');
  const was = notice.display;
  notice.display = p.display;
  notice.exact = (await call('checkExactNotificationSetting')).exact_alarm;
  // 운동 중에 권한을 켜고 돌아왔으면 지금 휴식부터 다시 맞춘다
  if (was !== 'granted' && notice.display === 'granted') appliedKey = undefined;
}

// 앱 시작 때 한 번. 알림 채널을 만들고(이미 있으면 그대로) 권한을 확인한다.
export function initNotices(onChange) {
  if (!hasPlugin(LN)) return null;
  notice.available = true;
  ready = (async () => {
    // 채널의 중요도와 소리, 진동은 처음 만들 때만 정해진다. 바꾸려면 새 id 로 만든다 (known-issues 47).
    await call('createChannel', { id: REST_CHANNEL, name: '휴식 끝', description: '휴식 타이머가 끝나면 화면 위에 알리고 진동과 소리를 냅니다.', importance: 4, visibility: 1, vibration: true });
    await readPermissions({ ask: true });
  })().catch((e) => { notice.error = String(e?.message || e); }).finally(() => onChange?.());
  return ready;
}

// 휴대전화 설정에서 권한을 바꾸고 돌아온 경우 (화면 복귀마다)
export function refreshNotices(onChange) {
  if (!ready) return;
  queue = queue.then(() => ready).then(() => readPermissions()).then(() => onChange?.()).catch(() => {});
}

// 휴식 알림을 아는 동안(권한 허용)은 앱 안 진동을 내지 않는다. 알림이 진동과 소리를 함께 낸다.
export const restAlarmOn = () => notice.available && notice.display === 'granted';

// 렌더마다 부른다. restTimer 가 바뀐 때만 네이티브를 부른다 (시간이 흐르는 것만으로는 아무 일도 없다).
export function syncRestAlarm(rt, text) {
  if (!ready) return;
  const plan = planRestAlarm(appliedKey, rt, { body: text?.body || '' });
  if (!plan) return;
  appliedKey = plan.key;
  queue = queue.then(() => ready).then(async () => {
    if (plan.at && notice.display === 'granted') {
      // allowWhileIdle 이 없으면 플러그인이 기기를 깨우지 않는 알람(RTC)을 써서 화면이 꺼진 동안 울리지 않는다 (known-issues 47).
      // 정확한 알람 권한이 없을 때 정확한 알림을 청하면 플러그인이 운동 중에 설정 화면을 띄우므로, 그때는 부정확한 알람으로 둔다.
      await call('schedule', { notifications: [{ id: REST_NOTICE_ID, title: text.title, body: text.body, channelId: REST_CHANNEL, autoCancel: true,
        schedule: { at: new Date(plan.at), allowWhileIdle: true }, isExactNotification: notice.exact === 'granted' }] });
      console.info(`[rest-alarm] scheduled at=${plan.at} lead=${plan.at - Date.now()}ms`);
    } else {
      // 휴식이 없어졌거나(다음 세트, 건너뛰기, 종료) 이미 끝났으면 예약도, 알림 창에 남은 알림도 지운다
      await call('cancel', { notifications: [{ id: REST_NOTICE_ID }] });
    }
  }).catch((e) => console.warn('[rest-alarm]', e?.message || e));
}

// 설정 탭의 시험 알림. 운동 기록과 상관없는 번호를 써서 휴식 알림을 건드리지 않는다.
// 예약한 시각(ms)을 돌려준다. scripts/measure-notice.mjs 가 window.__native 로 불러 지연을 잰다.
export async function testNotice(seconds = 10, id = TEST_NOTICE_ID) {
  if (!ready) return false;
  await ready;
  if (notice.display !== 'granted') return false;
  const at = Date.now() + seconds * 1000;
  await call('schedule', { notifications: [{ id, title: '시험 알림', body: `${seconds}초 뒤에 울리도록 예약한 알림입니다.`, channelId: REST_CHANNEL, autoCancel: true,
    schedule: { at: new Date(at), allowWhileIdle: true }, isExactNotification: notice.exact === 'granted' }] });
  console.info(`[rest-alarm] test scheduled at=${at} lead=${at - Date.now()}ms`);
  return at;
}

// 정확한 알람이 꺼져 있을 때 설정 탭 버튼이 여는 시스템 화면
export async function openExactAlarmSetting() {
  if (!ready) return;
  const r = await call('changeExactNotificationSetting');
  notice.exact = r.exact_alarm;
}
