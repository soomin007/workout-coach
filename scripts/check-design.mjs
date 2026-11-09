// 11/9 전역 웹 디자인 규칙을 기계로 지키는 검사 (known-issues 46).
// 앱 코드(주석 제외)에 글자 글리프 아이콘, 제목 위 꼬리표, 넓힌 자간, 유리 흐림, 왼쪽 색 띠, 고정폭 글꼴, 띄어 쓴 가운데 점이 있거나
// 글자로 쓰는 색이 배경과 대비 4.5:1 에 못 미치면 위반으로 알린다.
//   node scripts/check-design.mjs [app 폴더]    위반이 있으면 종료 코드 1
// tests/unit/design_rules.test.js 가 같은 검사를 npm test 에서 돌리므로, 배포 워크플로의 단위 테스트 단계에서도 막힌다.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const MID = String.fromCharCode(0xb7); // 가운데 점

// 글리프를 아이콘처럼 쓰지 않는다: 화살표, 도형, 체크와 가위표, 점 세 개, 이모지. 곱셈표(×)와 빼기(−)는 글자라서 둔다.
const GLYPH_RANGES = [
  [0x00ab, 0x00ab], [0x00bb, 0x00bb], [0x2039, 0x203a], // 꺾쇠 따옴표
  [0x2022, 0x2022], // 글머리 점
  [0x2190, 0x21ff], // 화살표
  [0x22ee, 0x22ef], // 세로와 가로 점 세 개
  [0x2300, 0x23ff], // 기술 기호(지우기 글리프 등)
  [0x25a0, 0x25ff], // 도형(재생 삼각형 등)
  [0x2600, 0x27bf], // 기타 기호와 딩뱃(체크, 가위표, 일시정지 막대 등)
  [0x2900, 0x297f], [0x2b00, 0x2bff], // 보조 화살표와 기호
];
const EMOJI = /\p{Extended_Pictographic}/u;
const isGlyph = (ch) => {
  const cp = ch.codePointAt(0);
  return GLYPH_RANGES.some(([a, b]) => cp >= a && cp <= b) || EMOJI.test(ch);
};

const CSS_RULES = [
  ['유리 흐림', /backdrop-filter/],
  ['넓힌 자간', /letter-spacing:\s*0?\.(0[4-9]|[1-9])\d*em/],
  ['왼쪽 색 띠', /border-left:\s*[2-9](\.\d+)?px/],
  ['그라데이션 글자', /background-clip:\s*text/],
  ['고정폭이나 타자기 글꼴', /monospace|IBM Plex Mono|Special Elite|Courier|Consolas/i],
  ['제목 balance', /text-wrap:\s*balance/],
  ['영어 대문자 꼬리표', /text-transform:\s*uppercase/],
];

// 주석을 지운다. 줄 번호가 어긋나지 않게 블록 주석의 줄바꿈은 남긴다.
function blankNewlines(s) { return s.replace(/[^\n]/g, ''); }

export function stripCss(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, blankNewlines);
}

export function stripHtml(src) {
  return src.replace(/<!--[\s\S]*?-->/g, blankNewlines);
}

// 문자열 안의 // 는 주석이 아니다(주소 등). 따옴표 짝만 따라가는 단순한 방식이라 정규식 리터럴 속 따옴표에는 약하다.
export function stripJs(src) {
  let out = '';
  let q = null;
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const n = src[i + 1];
    if (q) {
      out += c;
      if (c === String.fromCharCode(92)) { out += n ?? ''; i += 2; continue; }
      if (c === q || (c === '\n' && q !== '`')) q = null;
      i++;
      continue;
    }
    if (c === '/' && n === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? src.length : j + 2;
      out += blankNewlines(src.slice(i, end));
      i = end;
      continue;
    }
    if (c === '/' && n === '/') {
      const j = src.indexOf('\n', i);
      i = j < 0 ? src.length : j;
      continue;
    }
    if (c === "'" || c === '"' || c === '`') q = c;
    out += c;
    i++;
  }
  return out;
}

// 파일 하나의 본문(주석 제외)에서 위반을 찾는다. ext: '.js' '.css' '.html'
export function violationsInText(ext, text) {
  const code = ext === '.css' ? stripCss(text) : ext === '.html' ? stripHtml(text) : stripJs(text);
  const out = [];
  code.split('\n').forEach((line, i) => {
    const add = (rule) => out.push({ rule, line: i + 1, text: line.trim().slice(0, 100) });
    if ([...line].some(isGlyph)) add('글리프 아이콘');
    if (/\b(kicker|eyebrow)\b/.test(line)) add('제목 위 꼬리표');
    if (line.includes(' ' + MID + ' ')) add('띄어 쓴 가운데 점');
    if (ext === '.css') for (const [rule, re] of CSS_RULES) if (re.test(line)) add(rule);
  });
  return out;
}

// 대비 비율 (WCAG)
const lin = (v) => { const x = v / 255; return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4; };
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
};
export const contrast = (a, b) => {
  const x = lum(a);
  const y = lum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
const mixHex = (a, b, p) => '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - p) + parseInt(b.slice(i, i + 2), 16) * p).toString(16).padStart(2, '0')).join('');

function tokenBlocks(css) {
  const pick = (re) => {
    const m = css.match(re);
    return m ? Object.fromEntries([...m[1].matchAll(/--([a-z0-9-]+):\s*(#[0-9a-fA-F]{6})/g)].map((x) => [x[1], x[2]])) : null;
  };
  return [
    ['밝은 테마', pick(/^:root\s*\{([\s\S]*?)\n\}/m)],
    ['어두운 테마(시스템 설정)', pick(/@media \(prefers-color-scheme: dark\)\s*\{\s*:root:not\(\[data-theme="light"\]\)\s*\{([\s\S]*?)\n\s*\}/)],
    ['어두운 테마(직접 고름)', pick(/^:root\[data-theme="dark"\]\s*\{([\s\S]*?)\n\}/m)],
  ];
}

const TEXT_TOKENS = ['text', 'muted', 'faint', 'accent', 'good', 'warn', 'bad', 'violet'];
const SURFACES = ['bg', 'surface', 'surface2'];

// 글자로 쓰는 색 토큰은 바탕 세 가지 위에서 4.5:1 이상이어야 한다. 버튼 글자(-ink)와 경고 상자도 같다.
export function checkContrast(css) {
  const out = [];
  const bad = (text) => out.push({ rule: '글자색 대비', file: 'styles.css', line: 0, text });
  for (const [name, t] of tokenBlocks(css)) {
    if (!t) { bad(`${name}의 색 토큰을 읽지 못했다`); continue; }
    const need = (fg, bg, label) => {
      if (!fg || !bg) { bad(`${name}에 ${label}의 토큰이 없다`); return; }
      const r = contrast(fg, bg);
      if (r < 4.5) bad(`${name}, ${label} ${r.toFixed(2)} (4.5 필요)`);
    };
    for (const k of TEXT_TOKENS) for (const s of SURFACES) need(t[k], t[s], `${k} 글자와 ${s} 바탕`);
    need(t['accent-ink'], t.accent, 'accent-ink 글자와 accent 바탕');
    need(t['good-ink'], t.good, 'good-ink 글자와 good 바탕');
    if (t.warn && t.surface) need(t.warn, mixHex(t.surface, t.warn, 0.14), 'warn 글자와 경고 상자 바탕');
  }
  return out;
}

function walk(dir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'vendor' || e.name === 'img') continue; // 남이 만든 코드와 그림은 보지 않는다
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, acc);
    else if (/\.(js|css|html)$/.test(e.name)) acc.push(p);
  }
  return acc;
}

export function checkDesign(appRoot) {
  const out = [];
  for (const f of walk(appRoot)) {
    const rel = path.relative(appRoot, f).split(path.sep).join('/');
    for (const v of violationsInText(path.extname(f), fs.readFileSync(f, 'utf8'))) out.push({ file: rel, ...v });
  }
  const cssFile = path.join(appRoot, 'styles.css');
  if (fs.existsSync(cssFile)) out.push(...checkContrast(fs.readFileSync(cssFile, 'utf8')));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const appRoot = path.resolve(process.argv[2] || fileURLToPath(new URL('../app/', import.meta.url)));
  const hits = checkDesign(appRoot);
  for (const h of hits) console.log(`${h.file}:${h.line}  ${h.rule}  ${h.text}`);
  console.log(hits.length ? `\n위반 ${hits.length}곳` : '위반 없음');
  process.exit(hits.length ? 1 : 0);
}
