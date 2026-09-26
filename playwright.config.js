import { defineConfig, devices } from '@playwright/test';

// 모바일 크롬 기준. 레이아웃 점검은 세 뷰포트, 흐름 테스트는 390 하나에서만 돈다(spec 안에서 분기).
const mobile = (w, h) => ({ ...devices['Pixel 7'], viewport: { width: w, height: h }, deviceScaleFactor: 2 });

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 30000,
  fullyParallel: true,
  reporter: [['list']],
  use: { baseURL: 'http://localhost:8181/', locale: 'ko-KR', timezoneId: 'Asia/Seoul', trace: 'retain-on-failure' },
  webServer: { command: 'node scripts/serve.mjs', env: { PORT: '8181' }, url: 'http://localhost:8181/', reuseExistingServer: true },
  projects: [
    { name: 'm390', use: mobile(390, 844) },
    { name: 'm360', use: mobile(360, 800) },
    { name: 'm412', use: mobile(412, 915) },
  ],
});
