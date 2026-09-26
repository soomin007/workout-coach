// 실제 화면 조작으로 P0 시나리오를 검증한다 (docs/REGRESSION_TEST_PLAN.md). 흐름 테스트는 390 폭에서만.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'm390', '흐름 테스트는 m390 에서만');
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') page.errors.push(m.text()); });
  await page.goto('/');
  await expect(page.getByTestId('rec-title')).toBeVisible();
});

test.afterEach(async ({ page }, info) => {
  if (info.project.name === 'm390') expect(page.errors, '콘솔 에러 없음').toEqual([]);
});

const st = (page) => page.evaluate(() => window.__store.state);
const sheet = (page) => page.locator('#sheet');
const card = (page, id) => page.locator(`section.ex[data-exercise="${id}"]`);

async function startPart(page, label, minutes = null) {
  if (minutes) await page.locator('select[data-k="minutes"]').selectOption(String(minutes));
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  await sheet(page).getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByTestId('session-head')).toBeVisible();
}

async function menu(page, id, item) {
  await card(page, id).locator('[data-action="ex-menu"]').click();
  await sheet(page).getByRole('button', { name: item }).click();
}

async function typeNumber(page, locator, value) {
  await locator.click();
  await sheet(page).locator('input[name=n]').fill(String(value));
  await sheet(page).getByRole('button', { name: '확인' }).click();
}

test('운동 변경: 머신 → 덤벨이면 중량 방식 · 증량 · 범위 · 입력 안내가 즉시 바뀌고 새로고침 후에도 유지', async ({ page }) => {
  await startPart(page, 'Pull');
  const before = (await st(page)).session.estimatedMinutes;
  await menu(page, 'rear_cable', '운동 변경');
  await sheet(page).getByRole('button', { name: /덤벨 리버스 플라이/ }).click();
  const c = card(page, 'db_rear');
  await expect(c).toBeVisible();
  await expect(card(page, 'rear_cable')).toHaveCount(0);
  await expect(c.locator('.ex-meta')).toContainText('덤벨 1개당');
  await expect(c.locator('.ex-meta')).toContainText('12~20회');
  const e = (await st(page)).session.exercises.find((x) => x.exerciseId === 'db_rear');
  expect([e.loadMode, e.increment, e.equipment, e.unilateral, e.compound, e.warmupLevel]).toEqual(['per_dumbbell', 1, 'dumbbell', false, false, 'none']);
  expect((await st(page)).session.estimatedMinutes).toBeGreaterThan(0);
  expect(typeof before).toBe('number');
  // 중량 입력 → + 는 새 운동의 증량 단위(1kg)로
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 6);
  await c.getByTestId('weight-0').getByRole('button', { name: '늘리기' }).click();
  await expect(c.getByTestId('weight-0')).toContainText('7');
  await expect(c.getByTestId('weight-1')).toContainText('7', { useInnerText: true });
  await page.reload();
  await expect(card(page, 'db_rear').getByTestId('weight-0')).toContainText('7');
});

test('운동 변경: 편측 → 양측이면 좌우 입력이 사라진다', async ({ page }) => {
  await startPart(page, 'Lower', 30);
  const c = card(page, 'bulgarian');
  await c.getByRole('button', { name: '좌우 다르게 입력' }).first().click();
  await expect(c.getByTestId('left-0')).toBeVisible();
  await menu(page, 'bulgarian', '운동 변경');
  await sheet(page).getByRole('button', { name: /스미스 스쿼트/ }).click();
  await sheet(page).getByRole('button', { name: '교체' }).click();
  const n = card(page, 'smith_squat');
  await expect(n).toBeVisible();
  await expect(n.getByText('좌우 다르게 입력')).toHaveCount(0);
  await expect(n.getByTestId('left-0')).toHaveCount(0);
  const e = (await st(page)).session.exercises.find((x) => x.exerciseId === 'smith_squat');
  expect(e.sets.some((z) => z.split || z.leftReps !== null)).toBe(false);
});

test('미완료 입력이 있을 때 교체를 취소하면 아무것도 바뀌지 않는다 (사용자 운동 포함)', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await c.getByTestId('reps-0').getByRole('button', { name: '늘리기' }).click();
  const before = JSON.stringify((await st(page)).session);
  await menu(page, 'curl', '운동 변경');
  await sheet(page).locator('.list button').first().click();
  await expect(sheet(page)).toContainText('버리고 교체');
  await sheet(page).getByRole('button', { name: '취소' }).click();
  await menu(page, 'curl', '실제로 한 운동 이름 입력');
  await sheet(page).locator('input[name=name]').fill('케이블 컬');
  await sheet(page).getByRole('button', { name: '바꾸기' }).click();
  await sheet(page).getByRole('button', { name: '취소' }).click();
  const after = await st(page);
  expect(JSON.stringify(after.session)).toBe(before);
  expect(after.customExercises).toEqual([]);
  expect(after.prefs).toEqual({});
});

test('일부 세트 완료 후 교체: 완료분은 기존 운동, 남은 세트는 새 운동 카드로 분리되고 종료 후 기록이 둘로 남는다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 8);
  await c.locator('[data-action="done"]').first().click();
  await menu(page, 'curl', '운동 변경');
  await sheet(page).getByRole('button', { name: /해머컬/ }).click();
  await sheet(page).getByRole('button', { name: '이어서 하기' }).click();
  await expect(card(page, 'curl').locator('.set')).toHaveCount(1);
  await expect(card(page, 'hammer')).toBeVisible();
  await card(page, 'hammer').locator('[data-action="done"]').first().click();
  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await sheet(page).getByRole('button', { name: '확인' }).click();
  const s = await st(page);
  expect(s.performance.map((p) => p.exerciseId).sort()).toEqual(['curl', 'hammer']);
  expect(new Set(s.performance.map((p) => p.sessionId)).size).toBe(1);
});

test('세션 중 휴식 연장은 오늘만 적용되고 다음 세션 기본 휴식은 그대로', async ({ page }) => {
  await startPart(page, 'Push');
  const c = card(page, 'bench');
  const base = (await st(page)).session.exercises.find((x) => x.exerciseId === 'bench').rest;
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 60);
  const mainRow = c.locator('.set.main').first();
  await typeNumber(page, mainRow.locator('[data-f="reps"].val'), 3);
  await mainRow.locator('[data-action="done"]').click();
  await expect(c.getByTestId('coach')).toContainText('하한');
  await expect(c.locator('.ex-meta')).toContainText(`휴식 ${base + 30}초 (오늘)`);
  await expect(page.getByTestId('rest-time')).toBeVisible();
  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await sheet(page).getByRole('button', { name: '확인' }).click();
  expect((await st(page)).prefs).toEqual({});
  await startPart(page, 'Push');
  await expect(card(page, 'bench').locator('.ex-meta')).toContainText(`휴식 ${base}초`);
  await expect(card(page, 'bench').locator('.ex-meta')).not.toContainText('(오늘)');
});

test('진행 중 날짜를 바꾸면 기록과 운동 기록이 그 날짜로 저장되고 새로고침 후에도 유지', async ({ page }) => {
  await startPart(page, 'Pull');
  await page.locator('input[data-action="session-date"]').fill('2026-09-20');
  await page.locator('input[data-action="session-date"]').dispatchEvent('change');
  await page.reload();
  await expect(page.locator('input[data-action="session-date"]')).toHaveValue('2026-09-20');
  await card(page, 'curl').locator('[data-action="done"]').first().click();
  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await sheet(page).getByRole('button', { name: '확인' }).click();
  const s = await st(page);
  expect(s.history.at(-1).date).toBe('2026-09-20');
  expect(s.performance.every((p) => p.date === '2026-09-20')).toBe(true);
});

test('직접 새 운동을 만들면 카드 · 편측 입력 · 예상 시간이 즉시 반영되고 새로고침 후에도 유지', async ({ page }) => {
  await startPart(page, 'Lower', 30);
  const before = (await st(page)).session.estimatedMinutes;
  await page.getByRole('button', { name: '+ 운동 추가' }).click();
  await sheet(page).getByRole('button', { name: /새로 만들기/ }).click();
  await sheet(page).locator('input[name=name]').fill('힙쓰러스트');
  await sheet(page).locator('select[name=uni]').selectOption('1');
  await sheet(page).getByRole('button', { name: '만들고 추가' }).click();
  const id = (await st(page)).customExercises[0].id;
  const c = card(page, id);
  await expect(c).toBeVisible();
  await expect(c.getByText('좌우 다르게 입력').first()).toBeVisible();
  expect((await st(page)).session.estimatedMinutes).toBeGreaterThan(before);
  await expect(page.getByTestId('session-meta')).toContainText(`예상 ${(await st(page)).session.estimatedMinutes}분`);
  await page.reload();
  await expect(card(page, id)).toBeVisible();
});

test('한 줄 입력으로 세트를 몰아서 기록하고 느낌까지 반영', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await c.getByRole('button', { name: '한 줄 입력' }).click();
  await sheet(page).locator('input[name=t]').fill('8 12 11 한계');
  await sheet(page).getByRole('button', { name: '확인' }).click();
  await expect(c.locator('.set.done')).toHaveCount(2);
  await expect(c.getByTestId('effort').locator('button.on')).toHaveText('한계');
});

test('세트 완료 · 느낌 버튼: ✓ 한 번으로 계획대로 기록되고 운동이 끝나면 느낌을 묻는다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 8);
  const dones = c.locator('[data-action="done"]');
  const n = await dones.count();
  await expect(c.getByTestId('effort')).toHaveCount(0);
  for (let i = 0; i < n; i++) await dones.nth(i).click();
  await expect(c.getByTestId('effort')).toBeVisible();
  await c.getByTestId('effort').getByRole('button', { name: '적당' }).click();
  const e = (await st(page)).session.exercises.find((x) => x.exerciseId === 'curl');
  expect(e.sets.every((z) => z.done && z.weight === 8 && z.reps === e.prescription.reps)).toBe(true);
  expect(e.effort).toBe('ok');
  expect(e.sets.at(-1).rir).toBe(2);
});

test('휴식 타이머: +30 반영, 끝 누르면 사라짐', async ({ page }) => {
  await startPart(page, 'Pull');
  await card(page, 'curl').locator('[data-action="done"]').first().click();
  const t0 = (await st(page)).session.restTimer.seconds;
  await page.locator('#restbar').getByRole('button', { name: '+30' }).click();
  expect((await st(page)).session.restTimer.seconds).toBe(t0 + 30);
  await page.locator('#restbar').getByRole('button', { name: '끝' }).click();
  await expect(page.locator('#restbar')).toBeHidden();
});

test('입력 중 새로고침해도 세션이 그대로 복원된다', async ({ page }) => {
  await startPart(page, 'Push');
  await typeNumber(page, card(page, 'bench').getByTestId('weight-0').locator('.val'), 50);
  const before = JSON.stringify((await st(page)).session);
  await page.reload();
  await expect(page.getByTestId('session-head')).toBeVisible();
  expect((await st(page)).session).toEqual(JSON.parse(before));
});

test('v7 백업 복원: 보정 내역을 보여 주고 기록 탭에 나타난다. 잘못된 파일은 기존 상태를 건드리지 않는다', async ({ page }) => {
  await page.locator('#tabs').getByRole('button', { name: '기록' }).click();
  await page.locator('#importFile').setInputFiles(fixture('v7_synthetic.json'));
  await expect(sheet(page)).toContainText('바로잡았습니다');
  await sheet(page).getByRole('button', { name: '확인' }).click();
  await expect(page.locator('.hist-item')).toHaveCount(2);
  const before = await st(page);
  await page.locator('#importFile').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"foo":1}') });
  await expect(page.locator('#toast')).toContainText('백업 파일이 아닙니다');
  await page.locator('#importFile').setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('#toast')).toContainText('JSON 형식이 아닙니다');
  expect(await st(page)).toEqual(before);
});

test('JSON 내보내기 → 다른 기기(새 브라우저)에서 복원하면 같은 상태', async ({ page, browser }) => {
  await page.locator('#tabs').getByRole('button', { name: '기록' }).click();
  await page.locator('#importFile').setInputFiles(fixture('v9_synthetic.json'));
  await sheet(page).getByRole('button', { name: '확인' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const path = await (await dl).path();
  const src = await st(page);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await p2.goto('/');
  await p2.locator('#tabs').getByRole('button', { name: '기록' }).click();
  await p2.locator('#importFile').setInputFiles(path);
  await p2.locator('#sheet').getByRole('button', { name: '확인' }).click();
  const dst = await p2.evaluate(() => window.__store.state);
  for (const k of ['history', 'performance', 'prefs', 'customExercises', 'settings']) expect(dst[k]).toEqual(src[k]);
  await ctx.close();
});

test('PT 혼합 기록과 이력 수정', async ({ page }) => {
  await page.getByRole('button', { name: 'PT 기록' }).first().click();
  await sheet(page).locator('input[name=part][value=push]').check();
  await sheet(page).locator('input[name=part][value=lower]').check();
  await sheet(page).locator('input[name=sets]').fill('10');
  await sheet(page).getByRole('button', { name: '저장' }).click();
  expect((await st(page)).history.map((h) => [h.part, h.workSets])).toEqual([['push', 5], ['lower', 5]]);
  await page.locator('#tabs').getByRole('button', { name: '기록' }).click();
  await page.locator('[data-action="hist-edit"]').first().click();
  await sheet(page).locator('input[name=date]').fill('2026-09-01');
  await sheet(page).getByRole('button', { name: '저장' }).click();
  expect((await st(page)).history.some((h) => h.date === '2026-09-01')).toBe(true);
});

test('운동별 기본값 설정은 명시적으로 저장한 것만 남고 현재 세션에도 반영', async ({ page }) => {
  await startPart(page, 'Pull');
  await menu(page, 'curl', '이 운동 기본값 설정');
  await sheet(page).locator('select[name=rest]').selectOption('120');
  await sheet(page).getByRole('button', { name: '저장' }).click();
  await expect(card(page, 'curl').locator('.ex-meta')).toContainText('휴식 120초');
  expect((await st(page)).prefs.curl.rest).toBe(120);
});
