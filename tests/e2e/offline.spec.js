// 설치형 앱 동작: 서비스 워커 등록 후 오프라인에서도 열리고 기록이 남아 있다.
import { test, expect } from '@playwright/test';

test('오프라인에서도 앱이 열리고 저장된 세션이 그대로', async ({ page, context }, info) => {
  test.skip(info.project.name !== 'm390');
  await page.goto('/?sw');
  await page.evaluate(async () => { await navigator.serviceWorker.ready; });
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  for (const [k, v] of [['part', 'pull'], ['energy', 'normal'], ['minutes', '60'], ['intensity', 'normal']]) await page.locator(`#sheet .pick[data-k="${k}"] .chip[data-v="${v}"]`).click();
  await page.getByTestId('start-go').click();
  await expect(page.getByTestId('session-head')).toBeVisible();
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByTestId('session-head')).toBeVisible();
  await context.setOffline(false);
});
