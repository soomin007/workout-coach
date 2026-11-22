// app/icon.svg 에서 아이콘 PNG 를 만든다 (Playwright 크롬으로 렌더). 아이콘을 바꿨을 때만 실행.
//   웹: app/icon-192.png, app/icon-512.png (모서리는 투명)
//   안드로이드 7 이하용 런처 PNG: android/app/src/main/res/mipmap-*/ic_launcher.png, ic_launcher_round.png
// 안드로이드 8 이상은 적응형 아이콘(drawable/ic_launcher_fg.xml + values/ic_launcher_background.xml)을 쓰므로,
// 모양을 바꾸면 그 벡터도 같은 비율로 고친다(108dp 판, 가운데 지름 66dp 안전 영역).
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const file = (rel) => new URL(rel, import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const svg = readFileSync(new URL('../app/icon.svg', import.meta.url), 'utf8');
// 런처의 둥근 모양: 아이콘 안쪽 그림(바탕 사각형을 뺀 나머지)을 파란 원 위에 조금 줄여 얹는다
const inner = svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').replace(/<rect width="512" height="512"[^>]*\/>/, '');
const fill = svg.match(/<rect width="512" height="512"[^>]*fill="(#[0-9a-fA-F]{6})"/)[1];
const round = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><circle cx="256" cy="256" r="256" fill="${fill}"/><g transform="translate(256 256) scale(0.82) translate(-256 -256)">${inner}</g></svg>`;

const browser = await chromium.launch();
async function render(markup, size, out) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{width:${size}px;height:${size}px;display:block}</style>${markup}`);
  await page.screenshot({ path: file(out), omitBackground: true });
  await page.close();
}
for (const size of [192, 512]) await render(svg, size, `../app/icon-${size}.png`);
for (const [dpi, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
  await render(svg, size, `../android/app/src/main/res/mipmap-${dpi}/ic_launcher.png`);
  await render(round, size, `../android/app/src/main/res/mipmap-${dpi}/ic_launcher_round.png`);
}
await browser.close();
console.log('icons ok');
