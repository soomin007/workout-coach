// 폰에서 휴식 끝 알림이 화면을 끈 채 몇 초 늦게 울리는지 잰다 (docs/NATIVE_APP.md 실측 절).
//   node scripts/measure-notice.mjs 60 120 180          초마다 한 번씩 차례로 잰다
//   node scripts/measure-notice.mjs --idle 60           Doze(깊은 절전)를 강제로 걸고 잰다
// 준비: USB 디버깅으로 폰을 연결하고, 앱(디버그 빌드)을 화면에 띄워 둔다. 측정 중에는 폰을 건드리지 않는다.
// 진행 줄이 바로 보이게 파이프(| tail 등) 없이 돌린다. 파이프를 걸면 끝날 때 한꺼번에 나와 멈춘 것처럼 보인다.
// 방법: 앱 웹뷰의 디버깅 포트(CDP)로 window.__native.testNotice 를 불러 실제 앱과 같은 옵션으로 예약하고,
// adb 로 화면을 끈다. 충전 중이면 절전이 걸리지 않으므로 'dumpsys battery unplug' 로 배터리 상태를 흉내 내고 끝나면 되돌린다.
// 울린 시각은 안드로이드 이벤트 로그의 notification_enqueue(알림을 올린 때)와 notification_alert(진동, 소리)로 읽는다.
// 화면 끄기 키(KEYCODE_SLEEP)를 보내도 꺼지지 않거나 곧 다시 켜질 수 있어서(2026-11-24 에는 6초 뒤 생체 인식으로 켜졌다),
// 보낸 뒤 dumpsys power 로 꺼졌는지 보고 알림 1.5초 전의 화면 상태를 줄마다 적는다.
// 그때 Awake(켜짐)였으면 그 줄은 화면을 끈 측정이 아니다(known-issues 63). 앱이 휴식 끝 소리를 직접 내는 APK 면 앱 로그의 소리 줄도 적는다.
//
// 운동 중 알림(WorkoutNotice)은 시험용 앱(--dev, scripts/android.mjs build --dev)에서 실제 흐름으로 잰다:
//   node scripts/measure-notice.mjs --dev --workout 3    다음 세트를 3번 끝내며, 휴식마다 끝 알림이 늦은 시간을 잰다
// 세트는 앱의 '다음 세트 기록'과 같은 전이로 끝내고(세션이 없으면 코어 세션을 만든다), 휴식 길이는 그 운동의 휴식을 그대로 쓴다.
// 쓰는 앱의 기록에 시험 세트가 남지 않도록 --workout 은 --dev 에서만 돈다.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SDK = process.env.ANDROID_HOME || 'C:/Users/soomi/Android/sdk';
const ADB = path.join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const args = process.argv.slice(2);
const dev = args.includes('--dev');
const workout = args.includes('--workout');
const PKG = `io.github.soomin007.workoutcoach${dev ? '.dev' : ''}`;
const PAGE = dev ? 'localhost:8080' : 'workout-coach';
const WORKOUT_ID = 7010; // WorkoutNotice.NOTICE_ID
const PORT = 9333;
const idle = args.includes('--idle');
const secs = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!secs.length) secs.push(workout ? 2 : 60, 120, 180);
if (workout && !dev) { console.error('--workout 은 시험용 앱(--dev)에서만 잽니다. 쓰는 앱의 기록에 시험 세트가 남지 않게 하려는 것입니다.'); process.exit(1); }

const adb = (...a) => {
  const r = spawnSync(ADB, a, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`adb ${a.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

// 앱이 화면 앞에 있어야 웹뷰가 디버깅 명령에 답한다. 화면을 오래 끈 뒤 잠금 화면이 떠 있으면 웹뷰가 멈춰 명령이 끝나지 않는다(known-issues 50).
async function ensureForeground() {
  adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
  for (let i = 0; ; i += 1) {
    const act = adb('shell', 'dumpsys', 'activity', 'activities');
    if (act.split('\n').some((l) => /ResumedActivity/.test(l) && l.includes(PKG))) return;
    if (i === 1) console.log('\n폰 잠금을 풀어 앱 화면을 띄워 주세요. 잠금 화면에서는 앱 웹뷰가 측정 명령을 받지 못합니다.');
    if (i > 150) throw new Error('5분 동안 앱이 화면에 나오지 않아 멈춥니다.');
    await wait(2000);
  }
}

// 화면 상태: Awake 는 켜짐, Dozing 과 Asleep 은 꺼짐
const wakefulness = () => (adb('shell', 'dumpsys', 'power').split('\n').find((l) => l.includes('mWakefulness=')) || '').trim().replace('mWakefulness=', '');

// 화면을 끄고 꺼졌는지 확인한다. 끄기 키가 먹지 않으면 전원 키를 보내고, 그래도 켜져 있으면 until 까지 전원 버튼을 눌러 달라고 한다.
async function screenOff(until) {
  adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP');
  await wait(1500);
  if (wakefulness() !== 'Awake') return;
  adb('shell', 'input', 'keyevent', 'KEYCODE_POWER');
  await wait(1500);
  for (let i = 0; wakefulness() === 'Awake' && Date.now() < until; i += 1) {
    if (i === 0) console.log('\n화면이 꺼지지 않았습니다. 폰의 전원 버튼을 한 번 눌러 주세요.');
    await wait(1000);
  }
}

// 앱이 직접 내는 휴식 끝 소리(AlertSound)의 로그 줄. 'sound cue started focus=true' 면 오디오 포커스를 얻어 음악을 줄이고 냈다.
function readSound(sinceMs) {
  const out = adb('logcat', '-d', '-v', 'epoch', '-T', (sinceMs / 1000).toFixed(3), '-s', 'WorkoutNotice');
  const line = out.split('\n').find((l) => /WorkoutNotice.*: sound /.test(l));
  return line ? line.replace(/^.*?WorkoutNotice[^:]*:\s*/, '').trim() : null;
}

async function cdp() {
  const pid = adb('shell', 'pidof', PKG).split(/\s+/)[0];
  if (!pid) throw new Error('앱이 실행 중이 아닙니다. 폰에서 앱을 먼저 띄우세요.');
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes(PAGE));
  if (!page) throw new Error(`앱 화면을 찾지 못했습니다: ${list.map((t) => t.url).join(', ')}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let n = 0;
  const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); pending.get(m.id)?.(m); pending.delete(m.id); };
  const once = (expression) => new Promise((res, rej) => {
    const id = ++n;
    const t = setTimeout(() => { pending.delete(id); rej(new Error('timeout')); }, 15000);
    pending.set(id, (m) => { clearTimeout(t); res(m.result?.result?.value); });
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
  // 잠금 화면 뒤에 있으면 액티비티가 앞에 있어도 웹뷰가 멈춰 있을 수 있다(2026-11-21 관찰). 15초 안에 답이 없으면
  // 앱을 다시 앞으로 불러(am start, 이미 떠 있으면 그 화면에 전달된다) 한 번 더 묻고, 그래도 안 되면 잠금 해제를 청한다.
  const evaluate = async (expression) => {
    try { return await once(expression); } catch { /* 아래에서 한 번 더 */ }
    adb('shell', 'am', 'start', '-n', `${PKG}/io.github.soomin007.workoutcoach.MainActivity`);
    await wait(2000);
    try { return await once(expression); } catch { throw new Error('앱 웹뷰가 답하지 않습니다. 폰 잠금을 풀고 다시 돌려 주세요 (known-issues 50).'); }
  };
  return { evaluate, close: () => ws.close() };
}

// 이벤트 로그에서 이 앱, 이 번호 알림의 첫 enqueue 와 alert 시각(ms)
function readEvents(sinceMs, id) {
  const out = adb('logcat', '-b', 'events', '-d', '-v', 'epoch', '-T', (sinceMs / 1000).toFixed(3));
  const at = (re) => { const line = out.split('\n').find((l) => re.test(l)); return line ? Math.round(parseFloat(line.trim().split(/\s+/)[0]) * 1000) : null; };
  const enq = at(new RegExp(`notification_enqueue: \\[\\d+,\\d+,${PKG.replace(/\./g, '\\.')},${id},`));
  const alertLine = out.split('\n').find((l) => l.includes('notification_alert') && l.includes(`|${PKG}|${id}|`));
  return { enq, alert: alertLine ? Math.round(parseFloat(alertLine.trim().split(/\s+/)[0]) * 1000) : null, alertText: alertLine?.replace(/^.*notification_alert: /, '') || null };
}

// 운동 중 알림: 시험용 앱의 세션에서 다음 세트를 앱의 '다음 세트 기록'과 같은 전이로 끝내고, 휴식 끝 시각(ms)을 돌려받는다.
// 세션이 없으면 코어 세션을 만든다. 다 끝났으면 0.
const NEXT_SET = `(async () => {
  const T = await import('./js/core/session.js');
  const st = window.__store;
  if (!st.state.session) {
    st.commit((s) => T.setCheck(s, { energy: 'normal', minutes: 30, intensity: 'normal' }));
    st.commit((s) => T.createSession(s, { part: 'core', source: 'manual' }));
  }
  if (st.state.session.ready) st.commit((s) => T.beginSession(s));
  const n = st.state.session.exercises.map((e) => ({ e, i: e.sets.findIndex((z) => !z.done) })).find((x) => x.i >= 0);
  if (!n) return 0;
  st.commit((s) => T.toggleSetDone(s, n.e.uid, n.i));
  const rt = st.state.session.restTimer;
  return rt.startedAt + rt.seconds * 1000;
})()`;

async function main() {
  console.log(`폰: ${adb('shell', 'getprop', 'ro.product.manufacturer')} ${adb('shell', 'getprop', 'ro.product.model')}, 안드로이드 ${adb('shell', 'getprop', 'ro.build.version.release')}`);
  await ensureForeground();
  const c = await cdp();
  const perm = await c.evaluate('JSON.stringify(window.__native?.notice)');
  console.log(`알림 상태: ${perm}`);
  const rows = [];
  try {
    adb('shell', 'dumpsys', 'battery', 'unplug');
    const rounds = workout ? Array.from({ length: secs[0] }, () => null) : secs;
    for (const [k, sec] of rounds.entries()) {
      const id = workout ? WORKOUT_ID : 7100 + k;
      // 측정 사이 화면을 켜서 앱이 다시 앞에 오게 한다 (실제 운동처럼 세트를 기록한 직후 화면을 끄는 상황)
      await ensureForeground();
      const at = workout ? await c.evaluate(NEXT_SET) : await c.evaluate(`window.__native.testNotice(${sec}, ${id})`);
      if (!at) throw new Error(workout ? '끝낼 세트가 없습니다' : '예약하지 못했습니다 (알림 권한 확인)');
      const lead = at - Date.now();
      await screenOff(at - 3000);
      if (idle) adb('shell', 'dumpsys', 'deviceidle', 'force-idle');
      const t0 = Date.now();
      process.stdout.write(`${workout ? `세트 완료, 휴식 ${Math.round(lead / 1000)}초` : `${sec}초 예약`} (id ${id}), 화면 ${wakefulness()}${idle ? ', Doze 강제' : ''}. 기다리는 중...`);
      await wait(Math.max(0, at - Date.now() - 1500));
      const screen = wakefulness();
      await wait(Math.max(0, at - Date.now()) + 20000);
      if (idle) adb('shell', 'dumpsys', 'deviceidle', 'unforce');
      // 운동 중 알림은 휴식을 시작할 때도 조용히 올리므로, 끝 시각 바로 앞부터 읽는다
      const ev = readEvents(workout ? at - 1000 : at - sec * 1000 - 5000, id);
      const row = { sec: sec ?? Math.round(lead / 1000), idle, screen, delayMs: ev.enq === null ? null : ev.enq - at, alertDelayMs: ev.alert === null ? null : ev.alert - at, alert: ev.alertText, sound: readSound(at - 1000) };
      rows.push(row);
      console.log(` 지연 ${row.delayMs === null ? '알림 없음' : `${(row.delayMs / 1000).toFixed(2)}초`} (alert ${row.alert || '-'}), 알림 직전 화면 ${screen}${screen === 'Awake' ? '(켜져 있어 화면을 끈 측정이 아님)' : ''}, 소리 ${row.sound || '-'}, 측정 ${Math.round((Date.now() - t0) / 1000)}초`);
    }
  } finally {
    try { adb('shell', 'dumpsys', 'deviceidle', 'unforce'); } catch { /* 이미 풀림 */ }
    adb('shell', 'dumpsys', 'battery', 'reset');
    adb('forward', '--remove', `tcp:${PORT}`);
    c.close();
  }
  console.log(JSON.stringify(rows));
}

main().catch((e) => { console.error(e.message || e); process.exit(1); });
