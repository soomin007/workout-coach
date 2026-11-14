// 안드로이드 앱(Capacitor)이 페이지에 넣어 주는 브리지를 흉내 내어, 휴식 끝 알림을 언제 예약하고 지우는지 실제 화면 조작으로 검증한다.
// 브리지가 없는 크롬에서는 알림 카드가 없고 화면 안 진동만 그대로인지도 본다 (docs/NATIVE_APP.md).
import { test, expect } from '@playwright/test';

const WEEKDAY = new Date('2026-09-30T18:00:00'); // known-issues 15

// display: checkPermissions 가 처음 돌려줄 값, ask: requestPermissions 가 돌려줄 값. bridge=false 면 진동만 흉내 낸다.
function setup(page, { bridge = true, display = 'granted', ask = 'granted', exact = 'granted' } = {}) {
  return page.addInitScript(({ bridge, display, ask, exact }) => {
    window.__vib = 0;
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: () => { window.__vib += 1; return true; } });
    if (!bridge) return;
    const calls = [];
    window.__calls = calls;
    window.Capacitor = {
      isNativePlatform: () => true,
      PluginHeaders: [{ name: 'App', methods: [] }, { name: 'LocalNotifications', methods: [] }],
      nativePromise: (plugin, method, opts = {}) => {
        calls.push({ plugin, method, opts: JSON.parse(JSON.stringify(opts)) });
        const r = { checkPermissions: { display }, requestPermissions: { display: ask }, checkExactNotificationSetting: { exact_alarm: exact } }[method];
        return Promise.resolve(r || {});
      },
    };
  }, { bridge, display, ask, exact });
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
  expect(n.body).toMatch(/^다음: .+ (워밍업|\d세트), /);

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
