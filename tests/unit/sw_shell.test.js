// 서비스 워커 SHELL 에 앱 파일이 빠지면 오프라인에서 그 파일만 없어 앱이 뜨지 않는다 (known-issues 6).
// 안드로이드 앱은 GitHub Pages 를 띄우고 오프라인 시작을 서비스 워커에 맡기므로 더 치명적이다 (docs/NATIVE_APP.md).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = fileURLToPath(new URL('../../app/', import.meta.url));

function shellList() {
  const src = fs.readFileSync(path.join(appDir, 'sw.js'), 'utf8');
  const m = /const SHELL = \[([\s\S]*?)\];/.exec(src);
  assert.ok(m, 'sw.js 에서 SHELL 배열을 찾지 못함');
  return [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]);
}

function jsFiles(dir, base = appDir, acc = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) jsFiles(p, base, acc);
    else if (e.name.endsWith('.js')) acc.push(path.relative(base, p).split(path.sep).join('/'));
  }
  return acc;
}

test('app/js 의 모든 JS 파일과 첫 화면 파일이 SHELL 에 있다', () => {
  const shell = new Set(shellList());
  const need = [...jsFiles(path.join(appDir, 'js')), 'index.html', 'styles.css', 'manifest.webmanifest'];
  assert.deepEqual(need.filter((f) => !shell.has(f)), []);
});

test('SHELL 에 적힌 파일은 모두 실제로 있다 (없으면 install 이 실패해 새 버전이 영영 활성화되지 않는다)', () => {
  const missing = shellList().filter((f) => f !== './' && !fs.existsSync(path.join(appDir, f)));
  assert.deepEqual(missing, []);
});
