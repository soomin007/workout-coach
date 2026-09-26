// icon.svg → icon-192.png, icon-512.png (Playwright 크롬으로 렌더). 아이콘을 바꿨을 때만 실행.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../app/icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:#0f1216}svg{width:${size}px;height:${size}px;display:block}</style>${svg}`);
  await page.screenshot({ path: new URL(`../app/icon-${size}.png`, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1') });
  await page.close();
}
await browser.close();
console.log('icons ok');
