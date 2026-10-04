// 브라우저에서만 도는 파일(main.js · ui/*)도 문법 오류가 있으면 앱 전체가 뜨지 않는다. E2E 전에 여기서 잡는다.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../app/', import.meta.url));
const files = ['sw.js', ...['js', 'js/core', 'js/ui'].flatMap((d) => readdirSync(root + d).filter((f) => f.endsWith('.js')).map((f) => `${d}/${f}`))];

test('app 의 모든 JS 파일이 문법 검사를 통과한다', () => {
  for (const f of files) {
    try { execFileSync(process.execPath, ['--check', root + f], { stdio: 'pipe' }); }
    catch (e) { assert.fail(`${f}: ${String(e.stderr).split('\n').slice(0, 5).join(' ')}`); }
  }
});
