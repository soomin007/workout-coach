// GitHub 동기화 흐름. api.github.com 은 메모리 가짜 서버로 가로챈다 (실제 네트워크 없음).
import { test, expect } from '@playwright/test';

test.beforeEach(async ({ page }, info) => {
  test.skip(info.project.name !== 'm390', '흐름 테스트는 m390 에서만');
  page.errors = [];
  page.on('pageerror', (e) => page.errors.push(e.message));
});

test.afterEach(async ({ page }, info) => { if (info.project.name === 'm390') expect(page.errors, '콘솔 에러 없음').toEqual([]); });

const b64 = (t) => Buffer.from(t, 'utf8').toString('base64');
const unb64 = (t) => Buffer.from(t, 'base64').toString('utf8');

async function fakeGitHub(page) {
  const gh = { file: null, n: 0, bodies: [] };
  await page.route('https://api.github.com/**', async (route) => {
    const req = route.request();
    const u = new URL(req.url());
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(body) });
    if (req.headers().authorization !== 'Bearer tok') return json(401, {});
    if (u.pathname === '/repos/me/log') return json(200, {});
    if (u.pathname !== '/repos/me/log/contents/data.json') return json(404, {});
    if (req.method() === 'GET') return gh.file ? json(200, { sha: gh.file.sha, content: b64(gh.file.text), encoding: 'base64' }) : json(404, {});
    const body = req.postDataJSON();
    gh.bodies.push(req.postData());
    if ((gh.file?.sha ?? undefined) !== body.sha) return json(409, {});
    gh.file = { sha: `sha${++gh.n}`, text: unb64(body.content) };
    return json(200, { content: { sha: gh.file.sha } });
  });
  gh.remote = () => JSON.parse(gh.file.text);
  gh.edit = (fn) => { const s = gh.remote(); fn(s); gh.file = { sha: `sha${++gh.n}`, text: JSON.stringify(s, null, 2) }; };
  return gh;
}

const sheet = (page) => page.locator('#sheet');
const st = (page) => page.evaluate(() => window.__store.state);

async function logPT(page, note) {
  await page.locator('#tabs').getByRole('button', { name: '오늘' }).click();
  await page.getByRole('button', { name: 'PT 기록' }).first().click();
  await sheet(page).locator('input[name=part][value=push]').check();
  await sheet(page).locator('textarea[name=note]').fill(note);
  await sheet(page).getByRole('button', { name: '저장' }).click();
}

async function syncNow(page) {
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: '지금 동기화' }).click();
}

test('연결 · 올리기 · PC 수정 받기 · 충돌 선택', async ({ page }) => {
  const gh = await fakeGitHub(page);
  await page.goto('/');
  await logPT(page, '벤치');

  // 연결: 잘못된 토큰은 거절하고 저장하지 않는다
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await page.getByRole('button', { name: 'GitHub 연결' }).click();
  await sheet(page).locator('input[name=repo]').fill('me/log');
  await sheet(page).locator('input[name=token]').fill('bad');
  await sheet(page).getByRole('button', { name: '연결' }).click();
  await expect(page.locator('#toast')).toContainText('토큰');
  expect(await page.evaluate(() => localStorage.getItem('workoutCoach.sync'))).toBeFalsy();

  await page.getByRole('button', { name: 'GitHub 연결' }).click();
  await sheet(page).locator('input[name=repo]').fill('me/log');
  await sheet(page).locator('input[name=token]').fill('tok');
  await sheet(page).getByRole('button', { name: '연결' }).click();
  await expect(page.getByTestId('sync-status')).toContainText('me/log');
  await expect.poll(() => gh.file && gh.remote().history.length).toBe(1);
  expect(gh.bodies.join('')).not.toContain('tok"');

  // 폰에서 기록 → 올리기
  await logPT(page, '스쿼트');
  await syncNow(page);
  await expect.poll(() => gh.remote().history.length).toBe(2);

  // PC 에서 고침 → 받기
  gh.edit((s) => { s.history[0].workSets = 20; });
  await syncNow(page);
  await expect.poll(async () => (await st(page)).history[0].workSets).toBe(20);

  // 양쪽 수정 → 묻고, 폰 기록을 남긴다
  gh.edit((s) => { s.history[0].note = 'PC 수정'; });
  await logPT(page, '데드');
  await syncNow(page);
  await expect(sheet(page)).toContainText('양쪽에서 바뀌었어요');
  await sheet(page).getByRole('button', { name: '이 폰 기록 남기기' }).click();
  await expect.poll(() => gh.remote().history.length).toBe(3);
  expect(gh.remote().history[0].note).toBe('벤치');

  // 새로고침해도 연결이 유지되고, 바뀐 게 없으면 올리지 않는다
  const puts = gh.bodies.length;
  await page.reload();
  await page.locator('#tabs').getByRole('button', { name: '설정' }).click();
  await expect(page.getByTestId('sync-status')).toContainText('마지막 동기화');
  await page.getByRole('button', { name: '지금 동기화' }).click();
  await expect(page.locator('#toast')).toContainText('이미 최신');
  expect(gh.bodies.length).toBe(puts);
});
