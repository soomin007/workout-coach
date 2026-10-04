// 모바일 레이아웃 실측 (360 · 390 · 412). 가로 넘침, 좌우 여백, 터치 크기, 하단 고정 요소 가림.
import { test, expect } from '@playwright/test';

// 요일 고정: 일요일이면 '헬스장 휴무'로 집 세션이 되어 결과가 요일마다 달라진다 (known-issues 15). 시계는 그 시각부터 흐른다.
const WEEKDAY = new Date('2026-09-30T18:00:00');
test.beforeEach(async ({ page }) => { await page.clock.install({ time: WEEKDAY }); });

async function measure(page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out = { vw, scrollW: document.documentElement.scrollWidth, overflow: [], smallTap: [], leftGutter: [] };
    for (const el of document.querySelectorAll('#view *')) {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) continue;
      if (r.right > vw + 0.5 || r.left < -0.5) out.overflow.push(`${el.tagName}.${el.className} ${Math.round(r.left)}~${Math.round(r.right)}`);
    }
    for (const el of document.querySelectorAll('.set button, .effort button, .restbar button, .tabs button')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height < 36) out.smallTap.push(`${el.className}:${Math.round(r.height)}`);
    }
    for (const el of document.querySelectorAll('#view .card')) {
      const r = el.getBoundingClientRect();
      if (r.left < 12) out.leftGutter.push(Math.round(r.left));
    }
    return out;
  });
}

// 시작 전 확인 시트: 부위 · 컨디션 · 시간 · 강도를 고르고 시작한다.
async function fillStart(page, { part = null, energy = 'normal', minutes = 60, intensity = 'normal' } = {}) {
  const sh = page.locator('#sheet');
  if (part) await sh.locator(`.pick[data-k="part"] .chip[data-v="${part}"]`).click();
  await sh.locator(`.pick[data-k="energy"] .chip[data-v="${energy}"]`).click();
  await sh.locator(`.pick[data-k="minutes"] .chip[data-v="${minutes}"]`).click();
  await sh.locator(`.pick[data-k="intensity"] .chip[data-v="${intensity}"]`).click();
  await sh.getByTestId('start-go').click();
}

async function startPart(page, label, minutes) {
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  await fillStart(page, { part: label.toLowerCase(), minutes });
  await expect(page.getByTestId('session-head')).toBeVisible();
}

test('홈 · 기록 · 설정: 가로 넘침 없음, 카드 좌우 여백 확보', async ({ page }) => {
  await page.goto('/');
  for (const tab of ['오늘', '기록', '설정']) {
    await page.locator('#tabs').getByRole('button', { name: tab }).click();
    const m = await measure(page);
    expect(m.scrollW, `${tab} scrollWidth`).toBe(m.vw);
    expect(m.overflow, `${tab} 넘침`).toEqual([]);
    expect(m.leftGutter, `${tab} 좌측 여백`).toEqual([]);
  }
});

test('세션: 일반 · 편측 · 좌우 분리 세트 행이 화면 안에 들어오고 터치 크기가 충분', async ({ page }) => {
  await page.goto('/');
  await startPart(page, 'Lower', 60);
  await page.locator('section.ex[data-exercise="bulgarian"] .split-toggle').first().click();
  await page.locator('section.ex[data-exercise="bulgarian"] [data-action="done"]').first().click();
  const m = await measure(page);
  expect(m.scrollW).toBe(m.vw);
  expect(m.overflow).toEqual([]);
  expect(m.smallTap).toEqual([]);
});

test('세션: 맨 아래 종료 버튼이 휴식 바 · 탭 바에 가리지 않는다', async ({ page }) => {
  await page.goto('/');
  await startPart(page, 'Push', 60);
  await page.locator('section.ex [data-action="done"]').first().click();
  await expect(page.locator('#restbar')).toBeVisible();
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const r = await page.evaluate(() => {
    const b = [...document.querySelectorAll('[data-action="finish"]')][0].getBoundingClientRect();
    const rest = document.getElementById('restbar').getBoundingClientRect();
    return { btnBottom: b.bottom, restTop: rest.top };
  });
  expect(r.btnBottom).toBeLessThanOrEqual(r.restTop);
});

test('긴 시트는 스크롤되고 닫기 버튼에 닿을 수 있다', async ({ page }) => {
  await page.goto('/');
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: '운동 골라서 설정' }).click();
  const close = page.locator('#sheet').getByRole('button', { name: '닫기' });
  await close.scrollIntoViewIfNeeded();
  await close.click();
  await expect(page.locator('#sheet')).toBeHidden();
});

test('시작 전 확인 시트: 가로 넘침 없이, 스크롤하지 않아도 시작 버튼이 화면 안에 보인다', async ({ page }, info) => {
  await page.goto('/');
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  const box = page.locator('#sheet .sheet');
  await expect(box.getByTestId('start-go')).toBeVisible();
  const m = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth, vh = window.innerHeight;
    const over = [...document.querySelectorAll('#sheet .sheet *')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5); }).length;
    const go = document.querySelector('[data-testid=start-go]').getBoundingClientRect();
    const sh = document.querySelector('#sheet .sheet');
    return { over, goBottom: go.bottom, goTop: go.top, vh, scrollW: sh.scrollWidth, clientW: sh.clientWidth };
  });
  expect(m.over).toBe(0);
  expect(m.scrollW).toBe(m.clientW);
  expect(m.goBottom).toBeLessThanOrEqual(m.vh);
  expect(m.goTop).toBeGreaterThan(m.vh * 0.6);
  if (info.project.name === 'm360') await page.screenshot({ path: test.info().outputPath('start-sheet.png') });
});

test('무거운 날 카드: 톱세트 표시와 안내가 화면 안에 들어온다', async ({ page }, info) => {
  await page.goto('/');
  await page.evaluate(() => window.__store.commit((s) => { s.performance.push({ sessionId: 'p', date: '2026-09-20', part: 'lower', exerciseId: 'squat', name: '프리 스쿼트', sets: [{ type: 'main', weight: 100, reps: 3, rir: 2, done: true }], effort: 'ok' }); }));
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  await fillStart(page, { part: 'lower', intensity: 'strength' });
  await expect(page.getByTestId('session-head')).toBeVisible();
  const m = await measure(page);
  expect(m.overflow).toEqual([]);
  expect(m.scrollW).toBe(m.vw);
  if (info.project.name === 'm360') await page.locator('section.ex[data-exercise="squat"]').screenshot({ path: test.info().outputPath('heavy.png') });
});

test('그립 칩과 그립 시트: 가로 넘침 없이 그림이 화면 안에 들어온다', async ({ page }, info) => {
  await page.goto('/');
  await startPart(page, 'Pull', 60);
  let m = await measure(page);
  expect(m.overflow).toEqual([]);
  expect(m.scrollW).toBe(m.vw);
  await page.locator('section.ex[data-exercise="row"] [data-testid="grip-chip"]').click();
  const sh = await page.evaluate(() => {
    const box = document.querySelector('#sheet .sheet');
    const vw = document.documentElement.clientWidth;
    const over = [...box.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5); }).map((el) => el.tagName);
    const art = box.querySelector('svg.grip-art').getBoundingClientRect();
    return { over, scrollW: box.scrollWidth, clientW: box.clientWidth, artW: art.width };
  });
  expect(sh.over).toEqual([]);
  expect(sh.scrollW).toBe(sh.clientW);
  expect(sh.artW).toBeGreaterThan(200);
  if (info.project.name === 'm360') await page.locator('#sheet .sheet').screenshot({ path: test.info().outputPath('grip-sheet.png') });
});

test('버티기 타이머 시트: 큰 숫자와 버튼이 넘치지 않는다', async ({ page }, info) => {
  await page.goto('/');
  await startPart(page, 'Core', 30);
  await page.locator('section.ex[data-exercise="side_plank"] [data-testid="hold-start"]').click();
  await page.clock.runFor(7000);
  const sh = await page.evaluate(() => {
    const box = document.querySelector('#sheet .sheet');
    const vw = document.documentElement.clientWidth;
    const over = [...box.querySelectorAll('*')].filter((el) => { const r = el.getBoundingClientRect(); return r.width && (r.right > vw + 0.5 || r.left < -0.5); }).map((el) => el.id || el.tagName);
    return { over, scrollW: box.scrollWidth, clientW: box.clientWidth };
  });
  expect(sh.over).toEqual([]);
  expect(sh.scrollW).toBe(sh.clientW);
  if (info.project.name === 'm360') await page.locator('#sheet .sheet').screenshot({ path: test.info().outputPath('hold.png') });
});
