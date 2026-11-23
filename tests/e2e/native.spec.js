// 안드로이드 앱(Capacitor)이 페이지에 넣어 주는 브리지를 흉내 내어, 휴식 끝 알림을 언제 예약하고 지우는지 실제 화면 조작으로 검증한다.
// 브리지가 없는 크롬에서는 알림 카드가 없고 화면 안 진동만 그대로인지도 본다 (docs/NATIVE_APP.md).
import { test, expect } from '@playwright/test';

const WEEKDAY = new Date('2026-09-30T18:00:00'); // known-issues 15

// display: checkPermissions 가 처음 돌려줄 값, ask: requestPermissions 가 돌려줄 값. bridge=false 면 진동만 흉내 낸다.
// workout=true 면 운동 중 알림 플러그인(WorkoutNotice)이 든 새 APK, 아니면 휴식 끝 알림만 있는 옛 APK 를 흉내 낸다.
// alarm=true 면 그 플러그인에 test 메서드가 있는 APK(2026-11-23 이후, 무음 모드에서도 알람 소리로 울리는 채널)다.
function setup(page, { bridge = true, display = 'granted', ask = 'granted', exact = 'granted', workout = false, alarm = false } = {}) {
  return page.addInitScript(({ bridge, display, ask, exact, workout, alarm }) => {
    window.__vib = 0;
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__vib += 1; return true; } });
    if (!bridge) return;
    const calls = [];
    window.__calls = calls;
    window.__listeners = {};
    // 운동 중 알림의 네이티브 기록장. 앱을 다시 띄워도 남게 sessionStorage 에 두고, sync 의 ack 까지와 다른 세션 기록을 지운다.
    const book = () => JSON.parse(sessionStorage.getItem('__wn') || '[]');
    const keep = (evs) => sessionStorage.setItem('__wn', JSON.stringify(evs));
    window.Capacitor = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'App', methods: [] }, { name: 'LocalNotifications', methods: [] }, ...(workout ? [{ name: 'WorkoutNotice', methods: alarm ? [{ name: 'test', rtype: 'promise' }] : [] }] : [])],
      addListener: (plugin, event, cb) => { window.__listeners[`${plugin}:${event}`] = cb; return { remove: async () => {} }; },
      nativePromise: (plugin, method, opts = {}) => {
        calls.push({ plugin, method, opts: JSON.parse(JSON.stringify(opts)) });
        if (plugin === 'WorkoutNotice') {
          if (method === 'pending') return Promise.resolve({ events: book() });
          if (method === 'test') return Promise.resolve({ at: Date.now() + (opts.seconds || 10) * 1000 });
          if (method === 'sync') {
            const p = opts.plan;
            keep(p ? book().filter((e) => e.sid === p.sid && e.seq > p.ack) : []);
            return Promise.resolve({ pending: book().length });
          }
          return Promise.resolve({});
        }
        const r = { checkPermissions: { display }, requestPermissions: { display: ask }, checkExactNotificationSetting: { exact_alarm: exact } }[method];
        return Promise.resolve(r || {});
      },
    };
  }, { bridge, display, ask, exact, workout, alarm });
}

async function open(page, opts) {
  await page.clock.install({ time: WEEKDAY });
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await setup(page, opts);
  await page.goto('/');
  await expect(page.getByTestId('rec-title')).toBeVisible();
}

test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'm390', '흐름 테스트는 m390 에서만'); });
test.afterEach(async ({ page }, info) => { if (info.project.name === 'm390') expect(page.errors, '콘솔 에러 없음').toEqual([]); });

const st = (page) => page.evaluate(() => window.__store.state);
const calls = (page, method) => page.evaluate((m) => window.__calls.filter((c) => c.method === m), method);
const last = (page) => page.evaluate(() => window.__calls.filter((c) => c.method === 'schedule' || c.method === 'cancel').at(-1));
const endOf = (rt) => new Date(rt.startedAt + rt.seconds * 1000).toISOString();

async function startPull(page) {
  await page.getByRole('button', { name: /부위 직접 선택|다른 부위 고르기/ }).click();
  const sh = page.locator('#sheet');
  await sh.locator('.pick[data-k="part"] .chip[data-v="pull"]').click();
  await sh.locator('.pick[data-k="energy"] .chip[data-v="normal"]').click();
  await sh.locator('.pick[data-k="minutes"] .chip[data-v="60"]').click();
  await sh.locator('.pick[data-k="intensity"] .chip[data-v="normal"]').click();
  await sh.getByTestId('start-go').click();
  await expect(page.getByTestId('session-head')).toBeVisible();
}
const curl = (page) => page.locator('section.ex[data-exercise="curl"]');

test('앱: 세트 체크로 휴식이 시작되면 끝 시각에 알림을 예약하고, +30 은 다시 예약하고, 건너뛰기는 지운다', async ({ page }) => {
  await open(page);
  // 앱을 띄우면 채널을 만들고, 지난 실행에서 남은 휴식 알림을 한 번 지운다
  const ch = await calls(page, 'createChannel');
  expect(ch).toHaveLength(1);
  expect(ch[0].opts).toMatchObject({ id: 'rest-end', importance: 4, vibration: true });
  await expect.poll(() => calls(page, 'cancel').then((c) => c.length)).toBe(1);
  expect(await calls(page, 'requestPermissions')).toHaveLength(0); // 이미 허용이면 묻지 않는다

  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  const rt = (await st(page)).session.restTimer;
  await expect.poll(() => calls(page, 'schedule').then((c) => c.length)).toBe(1);
  const n = (await calls(page, 'schedule'))[0].opts.notifications[0];
  expect(n).toMatchObject({ id: 7001, channelId: 'rest-end', autoCancel: true, isExactNotification: true, title: '휴식이 끝났어요' });
  expect(n.schedule).toEqual({ at: endOf(rt), allowWhileIdle: true });
  expect(n.body).toMatch(/^다음 .+ (워밍업|\d세트), /);

  // 시간이 흐르기만 해서는 다시 부르지 않는다
  await page.clock.runFor(3000);
  expect(await calls(page, 'schedule')).toHaveLength(1);

  await page.locator('#restbar').getByRole('button', { name: '+30' }).click();
  await expect.poll(() => calls(page, 'schedule').then((c) => c.length)).toBe(2);
  expect((await last(page)).opts.notifications[0].schedule.at).toBe(endOf((await st(page)).session.restTimer));
  expect(new Date((await last(page)).opts.notifications[0].schedule.at) - new Date(n.schedule.at)).toBe(30000);

  await page.locator('#restbar').getByRole('button', { name: '건너뛰기' }).click();
  await expect.poll(() => last(page).then((c) => c.method)).toBe('cancel');
  expect((await last(page)).opts).toEqual({ notifications: [{ id: 7001 }] });
});

test('앱: 휴식이 끝나도 화면 안 진동은 겹쳐 내지 않고, 앱을 다시 띄우면 남은 휴식으로 다시 예약하며, 종료하면 지운다', async ({ page }) => {
  await open(page);
  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  const rt = (await st(page)).session.restTimer;
  await expect.poll(() => calls(page, 'schedule').then((c) => c.length)).toBe(1);
  await page.clock.runFor(rt.seconds * 1000 + 2000);
  await expect(page.locator('#restbar')).toHaveClass(/over/);
  expect(await page.evaluate(() => window.__vib)).toBe(0);

  // 앱이 꺼졌다 다시 뜬 경우: 아직 안 끝난 휴식이면 같은 끝 시각으로 다시 예약한다
  await curl(page).locator('[data-action="done"]').nth(1).click();
  const rt2 = (await st(page)).session.restTimer;
  await page.reload();
  await expect(page.getByTestId('session-head')).toBeVisible();
  await expect.poll(() => calls(page, 'schedule').then((c) => c.length)).toBe(1);
  expect((await calls(page, 'schedule'))[0].opts.notifications[0].schedule.at).toBe(endOf(rt2));

  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await page.locator('#sheet').getByRole('button', { name: '확인' }).click();
  await expect.poll(() => last(page).then((c) => c.method)).toBe('cancel');
});

test('앱: 알림 권한을 거부하면 예약하지 않고 화면 안 진동으로 알리며, 설정 탭에 꺼져 있다고 보인다', async ({ page }) => {
  await open(page, { display: 'prompt', ask: 'denied' });
  await expect.poll(() => calls(page, 'requestPermissions').then((c) => c.length)).toBe(1); // 시작 때 한 번 묻는다
  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  const rt = (await st(page)).session.restTimer;
  await page.clock.runFor(rt.seconds * 1000 + 2000);
  await expect(page.locator('#restbar')).toHaveClass(/over/);
  expect(await calls(page, 'schedule')).toHaveLength(0);
  expect(await page.evaluate(() => window.__vib)).toBe(1);
  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page.getByTestId('notice-status')).toContainText('알림이 꺼져 있어');
  await expect(page.getByRole('button', { name: /시험 알림/ })).toHaveCount(0);
});

test('앱: 설정 탭의 시험 알림은 휴식 알림과 다른 번호로 10초 뒤에 예약한다', async ({ page }) => {
  await open(page);
  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page.getByTestId('notice-status')).toContainText('화면이 꺼져 있어도 울립니다');
  const t0 = await page.evaluate(() => Date.now());
  await page.getByRole('button', { name: '시험 알림 (10초 뒤)' }).click();
  await expect.poll(() => calls(page, 'schedule').then((c) => c.length)).toBe(1);
  const n = (await calls(page, 'schedule'))[0].opts.notifications[0];
  expect(n.id).toBe(7002);
  expect(n.schedule.allowWhileIdle).toBe(true);
  const lead = new Date(n.schedule.at).getTime() - t0;
  expect(lead).toBeGreaterThanOrEqual(10000);
  expect(lead).toBeLessThan(11000);
});

test('앱: 정확한 알람이 꺼져 있으면 부정확한 알람으로 예약하고(운동 중 설정 화면을 띄우지 않게) 설정 탭에서 허용 버튼을 보인다', async ({ page }) => {
  await open(page, { exact: 'denied' });
  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  await expect.poll(() => calls(page, 'schedule').then((c) => c.length)).toBe(1);
  expect((await calls(page, 'schedule'))[0].opts.notifications[0].isExactNotification).toBe(false);
  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page.getByTestId('notice-status')).toContainText('정확한 시각 알람이 꺼져');
  await expect(page.getByRole('button', { name: '정확한 알람 허용' })).toBeVisible();
});

test('크롬: 브리지가 없으면 알림 카드가 없고, 휴식이 끝나면 지금처럼 화면 안 진동만 한다', async ({ page }) => {
  await open(page, { bridge: false });
  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  const rt = (await st(page)).session.restTimer;
  await page.clock.runFor(rt.seconds * 1000 + 2000);
  await expect(page.locator('#restbar')).toHaveClass(/over/);
  expect(await page.evaluate(() => window.__vib)).toBe(1);
  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page.getByRole('heading', { name: '휴식 끝 알림' })).toHaveCount(0);
});

// ---------- 운동 중 알림 (새 APK, WorkoutNotice) ----------
const wn = (page, method) => page.evaluate((m) => window.__calls.filter((c) => c.plugin === 'WorkoutNotice' && c.method === m), method);
const lastPlan = async (page) => (await wn(page, 'sync')).at(-1)?.opts.plan;
// 알림에서 누른 기록을 네이티브 기록장에 넣는다 (폰이 잠긴 동안 리시버가 적는 것과 같다)
const pressed = (page, events) => page.evaluate((evs) => sessionStorage.setItem('__wn', JSON.stringify(evs)), events);
const dockTarget = (page) => page.getByTestId('dock-next').evaluate((b) => [b.dataset.uid, +b.dataset.i]);

test('새 앱: 세트를 체크하면 운동 중 알림에 계획을 넘기고, 휴식 끝 알림은 그쪽이 내며, 종료하면 비운다', async ({ page }) => {
  await open(page, { workout: true });
  await expect.poll(() => wn(page, 'sync').then((c) => c.length)).toBe(1);
  expect(await lastPlan(page)).toBeNull(); // 세션이 없으면 알림을 비운다
  await startPull(page);
  expect(await lastPlan(page)).toBeNull(); // 시작 전 화면에서는 띄우지 않는다
  await curl(page).locator('[data-action="done"]').first().click();
  const s = (await st(page)).session;
  await expect.poll(() => lastPlan(page).then((p) => p?.sid)).toBe(s.id);
  const plan = await lastPlan(page);
  expect(plan.rest).toEqual({ startedAt: s.restTimer.startedAt, seconds: s.restTimer.seconds });
  expect(plan.ack).toBe(0);
  expect([plan.steps[0].uid, plan.steps[0].i]).toEqual(await dockTarget(page)); // 첫 단계는 화면의 '다음 세트 기록'과 같은 세트
  expect(plan.steps[0].text).toMatch(/^.+ (워밍업|\d세트), /);
  expect(plan.texts).toMatchObject({ done: '세트 완료', resting: '휴식 중', over: '휴식이 끝났어요' });
  // 휴식 끝 알림은 운동 중 알림이 같은 채널로 내므로, 옛 방식의 예약은 하지 않는다 (지난 실행의 예약을 한 번 지울 뿐)
  expect(await calls(page, 'schedule')).toHaveLength(0);
  expect(await calls(page, 'cancel')).toHaveLength(1);

  const n = (await wn(page, 'sync')).length;
  await page.clock.runFor(3000);
  expect(await wn(page, 'sync')).toHaveLength(n); // 시간이 흐르기만 해서는 다시 넘기지 않는다
  await page.locator('#restbar').getByRole('button', { name: '+30' }).click();
  await expect.poll(() => lastPlan(page).then((p) => p.rest.seconds)).toBe(s.restTimer.seconds + 30);

  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await page.locator('#sheet').getByRole('button', { name: '확인' }).click();
  await expect.poll(() => lastPlan(page)).toBeNull();
});

test('새 앱: 폰이 잠긴 동안 알림에서 누른 세트를 화면 복귀 때 누른 시각 그대로 넣고, 넣은 번호까지 기록장을 비운다', async ({ page }) => {
  await open(page, { workout: true });
  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  await expect.poll(() => lastPlan(page).then((p) => p?.steps.length > 2)).toBe(true);
  const plan = await lastPlan(page);
  const t0 = await page.evaluate(() => Date.now());
  await page.clock.runFor(300000);
  const [a, b] = plan.steps;
  await pressed(page, [
    { seq: 1, sid: plan.sid, uid: a.uid, i: a.i, at: t0 + 95000, kind: a.kind },
    { seq: 2, sid: plan.sid, uid: b.uid, i: b.i, at: t0 + 200000, kind: b.kind },
  ]);
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect.poll(() => st(page).then((x) => x.session.noticeSeq)).toBe(2);
  const s = (await st(page)).session;
  const set = (x) => s.exercises.find((e) => e.uid === x.uid).sets[x.i];
  expect([set(a).done, set(a).doneAt, set(b).done, set(b).doneAt]).toEqual([true, t0 + 95000, true, t0 + 200000]);
  if (a.uid === b.uid) expect(set(b).restBefore).toBe(105); // 세트 간격도 누른 시각으로 계산한다
  expect(s.restTimer.startedAt).toBe(t0 + 200000);
  expect(s.restTimer.seconds).toBe(b.rest); // 알림이 보여 준 휴식과 같다
  // 다음 계획은 적용한 번호를 알려 기록장을 비우고, 세 번째 세트부터 시작한다
  await expect.poll(() => lastPlan(page).then((p) => p.ack)).toBe(2);
  expect([(await lastPlan(page)).steps[0].uid, (await lastPlan(page)).steps[0].i]).toEqual([plan.steps[2].uid, plan.steps[2].i]);
  expect(await page.evaluate(() => sessionStorage.getItem('__wn'))).toBe('[]');
  await expect(page.locator('#restbar')).toContainText(plan.steps[2].text.split(' ')[0]);
});

test('새 앱: 앱을 다시 띄울 때와 앱이 떠 있을 때 누른 기록도 넣고, 그사이 사라진 세트는 알린다', async ({ page }) => {
  await open(page, { workout: true });
  await startPull(page);
  await curl(page).locator('[data-action="done"]').first().click();
  await expect.poll(() => lastPlan(page).then((p) => p?.steps.length > 2)).toBe(true);
  const plan = await lastPlan(page);
  const t0 = await page.evaluate(() => Date.now());
  // 앱이 꺼진 동안 누른 기록: 다시 띄우면 시작하자마자 넣는다
  await pressed(page, [{ seq: 1, sid: plan.sid, uid: plan.steps[0].uid, i: plan.steps[0].i, at: t0 + 1000, kind: plan.steps[0].kind }]);
  await page.reload();
  await expect(page.getByTestId('session-head')).toBeVisible();
  await expect.poll(() => st(page).then((x) => x.session.noticeSeq)).toBe(1);
  // 앱이 떠 있을 때 누른 기록: 네이티브가 recorded 이벤트로 알리면 바로 넣는다
  await pressed(page, [
    { seq: 2, sid: plan.sid, uid: plan.steps[1].uid, i: plan.steps[1].i, at: t0 + 2000, kind: plan.steps[1].kind },
    { seq: 3, sid: plan.sid, uid: 'gone', i: 0, at: t0 + 3000, kind: 'set' },
  ]);
  await page.evaluate(() => window.__listeners['WorkoutNotice:recorded']());
  await expect.poll(() => st(page).then((x) => x.session.noticeSeq)).toBe(3);
  const s = (await st(page)).session;
  expect(s.exercises.find((e) => e.uid === plan.steps[1].uid).sets[plan.steps[1].i].doneAt).toBe(t0 + 2000);
  await expect(page.locator('#toast')).toContainText('그사이 운동이 바뀌어 넣지 못했습니다');
  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page.getByTestId('notice-status')).toContainText('알림의 세트 완료 버튼으로');
});

test('알람 소리 채널이 든 앱: 예전 채널을 만들지 않고, 시험 알림은 운동 중 알림과 같은 채널로 네이티브가 예약한다 (11/23 세션 메모)', async ({ page }) => {
  await open(page, { workout: true, alarm: true });
  await page.locator('#tabs [data-tab="settings"]').click();
  await expect(page.getByTestId('notice-status')).toContainText('무음 모드에서도 알람 소리로');
  expect(await calls(page, 'createChannel')).toEqual([]);
  await page.getByRole('button', { name: '시험 알림 (10초 뒤)' }).click();
  await expect.poll(() => calls(page, 'test').then((c) => c.length)).toBe(1);
  const c = (await calls(page, 'test'))[0];
  expect([c.plugin, c.opts]).toEqual(['WorkoutNotice', { seconds: 10, id: 7002 }]);
  expect(await calls(page, 'schedule')).toEqual([]);
  await expect(page.locator('#toast')).toContainText('무음 모드로 바꿔');
});
