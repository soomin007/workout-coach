// 실제 화면 조작으로 P0 시나리오를 검증한다 (docs/REGRESSION_TEST_PLAN.md). 흐름 테스트는 390 폭에서만.
import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';

// 요일 고정: 일요일이면 '헬스장 휴무'로 집 세션이 되어 결과가 요일마다 달라진다 (known-issues 15). 시계는 그 시각부터 흐른다.
const WEEKDAY = new Date('2026-09-30T18:00:00');
const fixture = (name) => fileURLToPath(new URL(`../fixtures/${name}`, import.meta.url));

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'm390', '흐름 테스트는 m390 에서만');
  await page.clock.install({ time: WEEKDAY });
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

// 시작 전 확인 시트: 부위 · 컨디션 · 시간 · 강도를 고르고 시작한다.
async function fillStart(page, { part = null, energy = 'normal', minutes = 60, intensity = 'normal' } = {}) {
  const sh = page.locator('#sheet');
  if (part) await sh.locator(`.pick[data-k="part"] .chip[data-v="${part}"]`).click();
  await sh.locator(`.pick[data-k="energy"] .chip[data-v="${energy}"]`).click();
  await sh.locator(`.pick[data-k="minutes"] .chip[data-v="${minutes}"]`).click();
  await sh.locator(`.pick[data-k="intensity"] .chip[data-v="${intensity}"]`).click();
  await sh.getByTestId('start-go').click();
}

async function startPart(page, label, minutes = 60, extra = {}) {
  await page.getByRole('button', { name: /부위 직접 선택|다른 부위 고르기/ }).click();
  await fillStart(page, { part: label.toLowerCase(), minutes, ...extra });
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
  await page.locator('[data-action="session-menu"]').click();
  await sheet(page).getByRole('button', { name: /운동 날짜 바꾸기/ }).click();
  await sheet(page).locator('input[name=date]').fill('2026-09-20');
  await sheet(page).getByRole('button', { name: '확인' }).click();
  await page.reload();
  await expect(page.getByTestId('session-head')).toContainText('2026-09-20 기록');
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
  await page.locator('[data-action="session-menu"]').click();
  await sheet(page).getByRole('button', { name: '+ 운동 추가' }).click();
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
  await c.getByRole('button', { name: '한 줄 기록' }).click();
  await sheet(page).locator('input[name=t]').fill('8 12 11 한계');
  await sheet(page).getByRole('button', { name: '기록', exact: true }).click();
  await expect(c.getByTestId('ex-summary')).toHaveText('8kg × 12회 · 8kg × 11회 · 한계');
  await c.locator('[data-action="expand"]').click();
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

test('세트 번호를 누르면 유형 변경과 세트별 RIR 입력을 할 수 있다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await c.locator('[data-action="set-menu"]').nth(1).click();
  await sheet(page).getByRole('button', { name: '백오프로' }).click();
  await c.locator('[data-action="set-menu"]').nth(0).click();
  await sheet(page).getByRole('button', { name: /RIR 직접 입력/ }).click();
  await sheet(page).locator('input[name=n]').fill('2');
  await sheet(page).getByRole('button', { name: '확인' }).click();
  const e = (await st(page)).session.exercises.find((x) => x.exerciseId === 'curl');
  expect([e.sets[0].rir, e.sets[1].type]).toEqual([2, 'backoff']);
  await expect(c.locator('[data-action="set-menu"]').nth(1)).toHaveText('B');
});

test('키패드 완료(Enter)로 숫자 입력이 바로 적용되고 시트가 닫힌다 · 0kg 은 빈 기구로 표시', async ({ page }) => {
  await startPart(page, 'Lower', 60);
  const c = card(page, 'legpress');
  await c.getByTestId('weight-0').locator('.val').click();
  const input = sheet(page).locator('input[name=n]');
  await expect(input).toHaveAttribute('enterkeyhint', 'done');
  await input.fill('0');
  await input.press('Enter');
  await expect(sheet(page)).toBeHidden();
  await expect(c.getByTestId('weight-0')).toContainText('빈 기구');
  await expect(c.getByTestId('weight-1')).toContainText('빈 기구');
  await c.getByTestId('weight-0').getByRole('button', { name: '늘리기' }).click();
  await expect(c.getByTestId('weight-0')).toContainText('5kg');
  await c.getByRole('button', { name: '한 줄 기록' }).click();
  await sheet(page).locator('input[name=t]').fill('0 12 12');
  await sheet(page).locator('input[name=t]').press('Enter');
  await expect(sheet(page)).toBeHidden();
  await expect(c.locator('.set.done')).toHaveCount(2);
});

test('뒤로가기: 시트만 닫히고, 기록 탭이면 오늘 탭으로, 오늘 탭에서는 두 번 눌러야 나간다', async ({ page }) => {
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: '근거와 앱 정책 보기' }).click();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toBeHidden();
  await expect(page.locator('#tabs button.on')).toHaveText('설정');
  await page.goBack();
  await expect(page.locator('#tabs button.on')).toHaveText('오늘');
  await page.locator('.cond-summary').click();
  await page.locator('.cond-summary').click();
  await page.goBack();
  await expect(page.locator('#toast')).toContainText('한 번 더 누르면 종료');
  expect(page.url()).toContain('localhost');
  await page.goBack();
  await expect.poll(() => page.url()).not.toContain('localhost:8181/');
});

test('버튼으로 시트를 닫은 뒤 이어서 연 시트도 뒤로가기로 닫힌다', async ({ page }) => {
  await startPart(page, 'Pull');
  await menu(page, 'curl', '운동 변경');
  await sheet(page).getByRole('button', { name: /해머컬/ }).click();
  await expect(card(page, 'hammer')).toBeVisible();
  await card(page, 'hammer').locator('[data-action="ex-menu"]').click();
  await expect(sheet(page)).toBeVisible();
  await page.goBack();
  await expect(sheet(page)).toBeHidden();
  await expect(page.getByTestId('session-head')).toBeVisible();
});

test('홈: 컨디션이 추천보다 위, 추천 이유는 문장으로, 부족한 근육만 먼저', async ({ page }) => {
  const order = await page.evaluate(() => [...document.querySelectorAll('#view .card')].map((c) => c.querySelector('.kicker')?.textContent || c.querySelector('h3')?.textContent));
  expect(order.slice(0, 2)).toEqual(['오늘 컨디션', '오늘 추천']);
  await expect(page.locator('.reasons li').first()).not.toContainText('필요도');
  await expect(page.locator('select[data-k="minutes"]')).toHaveCount(0);
  await page.locator('[data-action="toggle-cond"]').click();
  await expect(page.locator('select[data-k="minutes"]')).toBeVisible();
});

test('다음 세트 강조 · 휴식 바에 다음 할 것 · 느낌까지 입력하면 운동이 접힌다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 8);
  const first = await page.evaluate(() => document.querySelector('.set.next')?.closest('section').dataset.exercise);
  expect(first).toBe('pullup');
  await c.locator('[data-action="done"]').first().click();
  await expect(c.locator('.set.next')).toHaveCount(0);
  await expect(page.getByTestId('rest-next')).toContainText('다음 · 풀업');
  await c.locator('[data-action="done"]').nth(1).click();
  await c.getByTestId('effort').getByRole('button', { name: '적당' }).click();
  await expect(c.getByTestId('ex-summary')).toContainText('8kg × ');
  await expect(c.getByTestId('ex-summary')).toContainText('적당');
  await c.locator('[data-action="expand"]').click();
  await expect(c.getByTestId('effort')).toBeVisible();
});

test('설정: 앱 버전 표시와 업데이트 확인 버튼', async ({ page }) => {
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await expect(page.getByTestId('app-version')).toContainText('버전');
  await page.getByRole('button', { name: '업데이트 확인' }).click();
  await expect(page.locator('#toast')).toBeVisible();
});

test('오늘 헬스장 못 가요 → 집에서 Core 추천, 헬스장 장비 운동 없음', async ({ page }) => {
  await page.getByTestId('gym-closed').click();
  await expect(page.getByTestId('rec-title')).toHaveText('Core');
  await page.getByRole('button', { name: '집에서 Core 시작' }).click();
  await expect(sheet(page).locator('[name=home]')).toBeChecked();
  await fillStart(page);
  await expect(page.getByTestId('session-head')).toContainText('진행 중 · 집');
  const s = await st(page);
  expect(s.session.home).toBe(true);
  expect(s.session.exercises.every((e) => e.equipment === 'none')).toBe(true);
  expect(s.session.exercises.length).toBeGreaterThanOrEqual(3);
});

test('종료를 잊은 세션: 다시 열면 저장을 묻고, 운동 시간은 마지막 기록까지로', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await c.locator('[data-action="done"]').nth(0).click();
  await c.locator('[data-action="done"]').nth(1).click();
  // 5시간 전으로 되돌려 "잊고 방치"를 흉내 낸다 (두 세트 간격은 20분)
  await page.evaluate(() => window.__store.commit((s) => {
    const H = 5 * 3600000;
    s.session.startedAt -= H; s.session.lastActivityAt -= H; s.session.timer.start -= H;
    const done = s.session.exercises.flatMap((e) => e.sets.filter((z) => z.doneAt));
    done[0].doneAt -= H + 20 * 60000; done[1].doneAt -= H;
  }));
  await page.reload();
  await expect(sheet(page)).toContainText('끝내지 않은 운동이 있어요');
  await sheet(page).getByRole('button', { name: '저장하고 종료' }).click();
  await expect(sheet(page)).toContainText('Pull 완료 · 2세트');
  await sheet(page).getByRole('button', { name: '확인' }).click();
  const h = (await st(page)).history.at(-1);
  expect(h.durationSec).toBeGreaterThanOrEqual(21 * 60);
  expect(h.durationSec).toBeLessThanOrEqual(27 * 60);
});

test('계획대로 완료 한 번으로 운동의 남은 세트가 기록된다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 8);
  await c.getByRole('button', { name: '계획대로 완료' }).click();
  await expect(c.getByTestId('effort')).toBeVisible();
  const e = (await st(page)).session.exercises.find((x) => x.exerciseId === 'curl');
  expect(e.sets.every((z) => z.done && z.weight === 8)).toBe(true);
});

test('기록 수정에서 운동 시간을 고칠 수 있다', async ({ page }) => {
  await startPart(page, 'Pull');
  await card(page, 'curl').locator('[data-action="done"]').first().click();
  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await sheet(page).getByRole('button', { name: '확인' }).click();
  await page.locator('#tabs').getByRole('button', { name: '기록' }).click();
  await page.locator('[data-action="hist-edit"]').first().click();
  await sheet(page).locator('input[name=min]').fill('55');
  await sheet(page).getByRole('button', { name: '저장' }).click();
  expect((await st(page)).history.at(-1).durationSec).toBe(3300);
  await expect(page.locator('.hist-item').first()).toContainText('55분');
});

test('시작 전 확인: 오늘 고르지 않은 시간·강도는 비어 있고, 다 골라야 시작된다', async ({ page }) => {
  // 어제 30분·일반으로 했던 상태
  await page.evaluate(() => window.__store.commit((s) => { s.check.minutes = 30; s.check.intensity = 'normal'; s.check.day = '2000-01-01'; s.check.confirmed = ['minutes', 'intensity']; s.history.push({ id: 'old', date: '2026-09-01', part: 'push', source: 'manual', workSets: 5 }); }));
  await page.getByRole('button', { name: '부위 직접 선택' }).click();
  const sh = sheet(page);
  await expect(sh.locator('.pick[data-k="minutes"] .chip.on')).toHaveCount(0);
  await expect(sh.locator('.pick[data-k="intensity"] .chip.on')).toHaveCount(0);
  await expect(sh).toContainText('지난번: 30분 · 일반');
  const go = sh.getByTestId('start-go');
  await expect(go).toBeDisabled();
  await expect(go).toHaveText('4개 더 고르면 시작');
  await sh.locator('.pick[data-k="part"] .chip[data-v="lower"]').click();
  await sh.locator('.pick[data-k="energy"] .chip[data-v="good"]').click();
  await sh.locator('.pick[data-k="minutes"] .chip[data-v="75"]').click();
  await expect(go).toBeDisabled();
  await sh.locator('.pick[data-k="intensity"] .chip[data-v="strength"]').click();
  await expect(go).toHaveText('Lower 시작 · 75분 · 근력 중심');
  await go.click();
  await expect(page.getByTestId('session-mode')).toContainText('75분 · 근력 중심');
  const s = await st(page);
  expect([s.session.minutes, s.session.intensity]).toEqual([75, 'strength']);
  expect(s.check.confirmed.sort()).toEqual(['energy', 'intensity', 'lowerDoms', 'minutes', 'pain', 'upperDoms']);
});

test('시작 전 확인: 오늘 이미 고른 값은 채워져 있어 한 번에 시작', async ({ page }) => {
  await page.evaluate(() => window.__store.commit((s) => { s.settings.ptDay = null; }));
  await page.getByRole('button', { name: '보통' }).click();
  await page.locator('[data-action="toggle-cond"]').click();
  await page.locator('select[data-k="minutes"]').selectOption('45');
  await page.locator('select[data-k="intensity"]').selectOption('light');
  await page.locator('[data-action="start"]').click();
  const go = sheet(page).getByTestId('start-go');
  await expect(go).toBeEnabled();
  await expect(go).toContainText('45분 · 가볍게');
  await go.click();
  await expect(page.getByTestId('session-head')).toBeVisible();
  expect((await st(page)).session.source).toBe('recommended');
});

test('오늘 운동을 마치면 추천 대신 완료 표시, 추가 운동은 오늘 한 부위를 뺀다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 8);
  await c.locator('[data-action="done"]').first().click();
  await page.getByRole('button', { name: /저장하고 종료/ }).click();
  await sheet(page).getByRole('button', { name: '확인' }).click();
  await expect(page.getByTestId('done-today')).toBeVisible();
  await expect(page.getByTestId('rec-title')).toHaveText('Pull 완료');
  await expect(page.locator('#view')).not.toContainText('오늘 추천');
  await expect(page.locator('#view')).toContainText('추가 운동을 할까요?');
  await page.getByRole('button', { name: '다른 부위 고르기' }).click();
  await expect(sheet(page)).toContainText('추가 운동 설정');
  await expect(sheet(page).locator('.pick[data-k="part"] .chip[data-v="pull"]')).toContainText('오늘 함');
});

test('한 줄 기록에 숫자가 아닌 글을 적어도 사라지지 않고 메모로 저장할 수 있다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await c.getByRole('button', { name: '한 줄 기록' }).click();
  await sheet(page).locator('input[name=t]').fill('왼쪽 팔꿈치가 살짝 아팠음');
  await sheet(page).getByRole('button', { name: '기록', exact: true }).click();
  await expect(sheet(page).getByTestId('quick-error')).toBeVisible();
  await expect(sheet(page).locator('input[name=t]')).toHaveValue('왼쪽 팔꿈치가 살짝 아팠음');
  await sheet(page).getByRole('button', { name: '이 글을 메모로 저장' }).click();
  await expect(c).toContainText('메모: 왼쪽 팔꿈치가 살짝 아팠음');
  await expect(c.getByRole('button', { name: '메모 수정' })).toBeVisible();
});

test('중량 입력: 오늘 쓴 무게가 최근 무게 칩으로 떠서 한 번에 고른다', async ({ page }) => {
  await startPart(page, 'Pull');
  const c = card(page, 'curl');
  await typeNumber(page, c.getByTestId('weight-0').locator('.val'), 9);
  await c.locator('[data-action="done"]').first().click();
  await c.getByTestId('weight-1').locator('.val').click();
  await sheet(page).locator('.recent-vals').getByRole('button', { name: '9', exact: true }).click();
  await expect(sheet(page)).toBeHidden();
  await expect(c.getByTestId('weight-1')).toContainText('9kg');
});

test('PT 요일이어도 오늘 PT 없어요를 누르면 일반 추천, 다시 누르면 PT 날', async ({ page }) => {
  const dow = await page.evaluate(() => new Date().getDay());
  await page.evaluate((d) => window.__store.commit((s) => { s.settings.ptDay = d; s.settings.gymClosedSunday = false; }), dow);
  await expect(page.getByTestId('rec-title')).toHaveText('PT 날');
  await page.getByTestId('no-pt').click();
  await expect(page.getByTestId('rec-title')).not.toHaveText('PT 날');
  await expect(page.getByTestId('no-pt')).toHaveText('오늘 PT 있어요');
  await page.getByTestId('no-pt').click();
  await expect(page.getByTestId('rec-title')).toHaveText('PT 날');
});

test('운동 설명: 하는 방법과 주의할 점, 화면 유지 버튼은 글자로', async ({ page }) => {
  await startPart(page, 'Lower');
  const g = card(page, 'squat').getByTestId('guide');
  await g.locator('summary').click();
  await expect(g).toContainText('하는 방법');
  await expect(g).toContainText('주의할 점');
  await expect(g.locator('ol li')).toHaveCount(3);
  await expect(page.getByTestId('wakelock')).toHaveText(/화면 유지/);
});

test('근력 중심: 첫 메인 운동이 톱세트 + 백오프, 톱세트 뒤 남은 반복을 묻는다', async ({ page }) => {
  await page.evaluate(() => window.__store.commit((s) => { s.performance.push({ sessionId: 'p', date: '2026-09-20', part: 'lower', exerciseId: 'squat', name: '프리 스쿼트', sets: [{ type: 'main', weight: 100, reps: 3, rir: 2, done: true }], effort: 'ok' }); }));
  await startPart(page, 'Lower', 60, { intensity: 'strength' });
  const c = card(page, 'squat');
  await expect(c).toContainText('무거운 날');
  await expect(c.locator('.set.main .no').first()).toContainText('톱');
  await expect(c.locator('.set.main')).toHaveCount(3);
  const topI = await c.locator('.set').evaluateAll((xs) => xs.findIndex((x) => x.querySelector('.no')?.textContent.startsWith('톱')));
  await expect(c.getByTestId(`weight-${topI}`)).toContainText('97.5kg');
  await expect(c.getByTestId(`weight-${topI + 1}`)).toContainText('87.5kg');
  await c.locator('.set').nth(topI).locator('[data-action="done"]').click();
  await c.getByTestId('top-rir').getByRole('button', { name: '2' }).click();
  await expect(c.getByTestId('top-rir')).toHaveCount(0);
  const s = await st(page);
  expect(s.session.exercises[0].sets[topI].rir).toBe(2);
});

test('레그프레스: 기본값이 원판 합계, 공중량 칸은 없다', async ({ page }) => {
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: '운동 골라서 설정' }).click();
  await sheet(page).getByRole('button', { name: /싱글 레그프레스/ }).click();
  await expect(sheet(page).locator('select[name=loadMode]')).toHaveValue('plates');
  await expect(sheet(page).locator('input[name=base]')).toHaveCount(0);
  await sheet(page).getByRole('button', { name: '저장' }).click();
  expect((await st(page)).prefs.legpress.loadMode).toBe('plates');
});

test('그립: 카드의 그림 칩을 누르면 그립별 그림 · 자극 부위 · 잡는 법이 나오고, 고른 그립이 자극 부위와 함께 유지된다', async ({ page }) => {
  await startPart(page, 'Pull', 60);
  const row = card(page, 'row');
  await expect(row.getByTestId('grip-chip')).toContainText('V핸들');
  await row.getByTestId('grip-chip').click();
  const opts = sheet(page).locator('.grip-opt');
  await expect(opts).toHaveCount(3);
  await expect(sheet(page).locator('.grip-opt svg.grip-art')).toHaveCount(3);
  const wide = sheet(page).locator('.grip-opt[data-grip="overhand_wide"]');
  await expect(wide).toContainText('주로 상부등');
  await wide.getByRole('button', { name: '이 그립으로' }).click();
  await expect(row.getByTestId('grip-chip')).toContainText('넓은 오버핸드');
  await expect(row.getByTestId('grip-chip')).toContainText('주로 상부등');
  await page.reload();
  await expect(card(page, 'row').getByTestId('grip-chip')).toContainText('넓은 오버핸드');
  // 세트를 하나 끝내면 그립은 보기만 할 수 있다
  await card(page, 'row').locator('.set:not(.warmup) [data-action="done"]').first().click();
  await card(page, 'row').getByTestId('grip-chip').click();
  await expect(sheet(page).getByRole('button', { name: '이 그립으로' })).toHaveCount(0);
  await sheet(page).getByRole('button', { name: '닫기' }).click();
  const s = await st(page);
  expect(s.session.exercises.find((e) => e.exerciseId === 'row')).toMatchObject({ grip: 'overhand_wide', primary: ['upper_back'] });
});

test('타이머: 일시정지하면 글자로 알려 주고, 세트를 끝내면 다시 간다', async ({ page }) => {
  await startPart(page, 'Pull', 60);
  await page.locator('[data-action="timer"]').click();
  await expect(page.getByTestId('timer-paused')).toBeVisible();
  await card(page, 'pullup').locator('[data-action="done"]').first().click();
  await expect(page.getByTestId('timer-paused')).toHaveCount(0);
});

test('버티기 타이머: 준비 → 왼쪽 → 자세 바꾸기 → 오른쪽이 끝나면 그 시간으로 세트가 완료된다', async ({ page }) => {
  await startPart(page, 'Core', 30);
  const c = card(page, 'side_plank');
  const secs = Number((await c.getByTestId('hold-start').textContent()).match(/(\d+)초/)[1]);
  await c.getByTestId('hold-start').click();
  await expect(sheet(page).getByTestId('hold')).toBeVisible();
  await expect(sheet(page).locator('#hold-label')).toHaveText('준비 · 왼쪽부터');
  await page.clock.runFor(6000);
  await expect(sheet(page).locator('#hold-label')).toHaveText('왼쪽 버티기');
  await page.clock.runFor(secs * 1000 + 500);
  await expect(sheet(page).locator('#hold-label')).toHaveText('자세 바꾸기 · 다음은 오른쪽');
  await sheet(page).getByRole('button', { name: '바로 시작' }).click();
  await page.clock.runFor(4000);
  await sheet(page).getByRole('button', { name: '여기까지 · 기록' }).click();
  await expect(page.locator('#sheet')).toBeHidden();
  const z = (await st(page)).session.exercises.find((e) => e.exerciseId === 'side_plank').sets.find((x) => x.done);
  expect(z).toMatchObject({ split: true, leftReps: secs, rightReps: 4 });
});
