// 폰에서 휴식 끝 알림이 화면을 끈 채 몇 초 늦게 울리는지 잰다 (docs/NATIVE_APP.md 실측 절).
//   node scripts/measure-notice.mjs 60 120 180          초마다 한 번씩 차례로 잰다
//   node scripts/measure-notice.mjs --idle 60           Doze(깊은 절전)를 강제로 걸고 잰다
// 준비: USB 디버깅으로 폰을 연결하고, 앱(디버그 빌드)을 화면에 띄워 둔다. 측정 중에는 폰을 건드리지 않는다.
// 방법: 앱 웹뷰의 디버깅 포트(CDP)로 window.__native.testNotice 를 불러 실제 앱과 같은 옵션으로 예약하고,
// adb 로 화면을 끈다. 충전 중이면 절전이 걸리지 않으므로 'dumpsys battery unplug' 로 배터리 상태를 흉내 내고 끝나면 되돌린다.
// 울린 시각은 안드로이드 이벤트 로그의 notification_enqueue(알림을 올린 때)와 notification_alert(진동, 소리)로 읽는다.
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const SDK = process.env.ANDROID_HOME || 'C:/Users/soomi/Android/sdk';
const ADB = path.join(SDK, 'platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb');
const PKG = 'io.github.soomin007.workoutcoach';
const PORT = 9333;
const args = process.argv.slice(2);
const idle = args.includes('--idle');
const secs = args.filter((a) => /^\d+$/.test(a)).map(Number);
if (!secs.length) secs.push(60, 120, 180);

const adb = (...a) => {
  const r = spawnSync(ADB, a, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`adb ${a.join(' ')}: ${r.stderr || r.stdout}`);
  return r.stdout.trim();
};
const wait = (ms) => new Promise((res) => setTimeout(res, ms));

async function cdp() {
  const pid = adb('shell', 'pidof', PKG).split(/\s+/)[0];
  if (!pid) throw new Error('앱이 실행 중이 아닙니다. 폰에서 앱을 먼저 띄우세요.');
  adb('forward', `tcp:${PORT}`, `localabstract:webview_devtools_remote_${pid}`);
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
  const page = list.find((t) => t.type === 'page' && t.url.includes('workout-coach'));
  if (!page) throw new Error(`앱 화면을 찾지 못했습니다: ${list.map((t) => t.url).join(', ')}`);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let n = 0;
  const pending = new Map();
  ws.onmessage = (ev) => { const m = JSON.parse(ev.data); pending.get(m.id)?.(m); pending.delete(m.id); };
  const evaluate = (expression) => new Promise((res) => {
    const id = ++n;
    pending.set(id, (m) => res(m.result?.result?.value));
    ws.send(JSON.stringify({ id, method: 'Runtime.evaluate', params: { expression, awaitPromise: true, returnByValue: true } }));
  });
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

async function main() {
  console.log(`폰: ${adb('shell', 'getprop', 'ro.product.manufacturer')} ${adb('shell', 'getprop', 'ro.product.model')}, 안드로이드 ${adb('shell', 'getprop', 'ro.build.version.release')}`);
  const c = await cdp();
  const perm = await c.evaluate('JSON.stringify(window.__native?.notice)');
  console.log(`알림 상태: ${perm}`);
  const rows = [];
  try {
    adb('shell', 'dumpsys', 'battery', 'unplug');
    for (const [k, sec] of secs.entries()) {
      const id = 7100 + k;
      // 측정 사이 화면을 켜서 앱이 다시 앞에 오게 한다 (실제 운동처럼 세트를 기록한 직후 화면을 끄는 상황)
      adb('shell', 'input', 'keyevent', 'KEYCODE_WAKEUP');
      await wait(1500);
      const at = await c.evaluate(`window.__native.testNotice(${sec}, ${id})`);
      if (!at) throw new Error('예약하지 못했습니다 (알림 권한 확인)');
      adb('shell', 'input', 'keyevent', 'KEYCODE_SLEEP');
      if (idle) { await wait(1500); adb('shell', 'dumpsys', 'deviceidle', 'force-idle'); }
      const t0 = Date.now();
      process.stdout.write(`${sec}초 예약 (id ${id}), 화면 끔${idle ? ', Doze 강제' : ''}. 기다리는 중...`);
      await wait(sec * 1000 + 20000);
      if (idle) adb('shell', 'dumpsys', 'deviceidle', 'unforce');
      const ev = readEvents(at - sec * 1000 - 5000, id);
      const row = { sec, idle, delayMs: ev.enq === null ? null : ev.enq - at, alertDelayMs: ev.alert === null ? null : ev.alert - at, alert: ev.alertText };
      rows.push(row);
      console.log(` 지연 ${row.delayMs === null ? '알림 없음' : `${(row.delayMs / 1000).toFixed(2)}초`} (alert ${row.alert || '-'}), 측정 ${Math.round((Date.now() - t0) / 1000)}초`);
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
