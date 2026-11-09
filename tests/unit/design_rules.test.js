// 11/9 전역 웹 디자인 규칙(known-issues 46)을 기계로 지킨다.
// 글리프 아이콘, 제목 위 꼬리표, 넓힌 자간, 유리 흐림, 왼쪽 색 띠, 고정폭 글꼴, 글자색 대비 4.5:1 이 다시 들어오면 여기서 막힌다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { checkDesign, contrast, stripJs, violationsInText } from '../../scripts/check-design.mjs';

const app = fileURLToPath(new URL('../../app/', import.meta.url));
const ARROW = String.fromCharCode(0x2192);
const CHECK = String.fromCharCode(0x2713);

test('앱 코드와 색 토큰에 디자인 규칙 위반이 없다', () => {
  const hits = checkDesign(app);
  assert.deepEqual(hits.map((h) => `${h.file}:${h.line} ${h.rule} ${h.text}`), []);
});

test('검사 도구: 주석 속 글리프는 넘기고 문자열 속 글리프는 잡는다', () => {
  const src = `// ${ARROW} 주석은 본다\n/* ${CHECK}\n${CHECK} */\nconst a = '${ARROW}';\nconst url = 'https://x.dev/a'; // ${ARROW}\n`;
  const hits = violationsInText('.js', src);
  assert.deepEqual(hits.map((h) => [h.rule, h.line]), [['글리프 아이콘', 4]]);
  assert.ok(!stripJs(src).includes(CHECK));
});

test('검사 도구: CSS 규칙과 꼬리표 클래스를 잡는다', () => {
  const css = '.a { backdrop-filter: blur(4px); letter-spacing: .08em; border-left: 3px solid red; }\n.b { letter-spacing: .01em; }\n/* text-transform: uppercase */';
  assert.deepEqual(violationsInText('.css', css).map((h) => h.rule), ['유리 흐림', '넓힌 자간', '왼쪽 색 띠']);
  assert.deepEqual(violationsInText('.js', '<div class="kicker">x</div>').map((h) => h.rule), ['제목 위 꼬리표']);
});

test('대비 계산: 검정과 흰색은 21 대 1, 같은 색은 1 대 1', () => {
  assert.equal(contrast('#000000', '#ffffff').toFixed(1), '21.0');
  assert.equal(contrast('#777777', '#777777').toFixed(1), '1.0');
});
