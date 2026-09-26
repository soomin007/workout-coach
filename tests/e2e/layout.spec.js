// 모바일 레이아웃 실측 (360 · 390 · 412). 가로 넘침, 좌우 여백, 터치 크기, 하단 고정 요소 가림.
import { test, expect } from '@playwright/test';

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

async function startPart(page, label, minutes) {
  await page.locator('select[data-k="minutes"]').selectOption(String(minutes));
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  await page.locator('#sheet').getByRole('button', { name: label, exact: true }).click();
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
