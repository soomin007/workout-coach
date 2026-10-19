// 운동 기록의 메모를 빠짐없이 뽑는다: 세션 메모와 운동별 메모를 날짜순으로 한 목록에.
// 사용: node scripts/memos.mjs [시작 날짜 YYYY-MM-DD] [data.json 경로]
//       node scripts/memos.mjs --unhandled   처리 장부(docs/memo-ledger.json)에 없는 메모만. 세션 시작 훅이 쓴다.
//       node scripts/memos.mjs --keys [시작 날짜]   장부에 적을 키와 함께 출력
// 경로를 주지 않으면 soomin007/workout-log 의 data.json 을 gh 로 받는다.
// 장부에는 메모 글 대신 해시 키만 둔다(이 저장소는 공개, 메모 원문은 개인 기록 저장소에만 있다).
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';

const LEDGER = new URL('../docs/memo-ledger.json', import.meta.url);
const flags = process.argv.slice(2).filter((a) => a.startsWith('--'));
const [since = '0000-00-00', file] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const unhandled = flags.includes('--unhandled');

let raw;
try {
  raw = file
    ? readFileSync(file, 'utf8')
    : execFileSync('gh', ['api', 'repos/soomin007/workout-log/contents/data.json', '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8', maxBuffer: 64 << 20, stdio: ['ignore', 'pipe', 'ignore'] });
} catch {
  if (unhandled) process.exit(0); // 오프라인이면 세션 시작을 막지 않는다
  throw new Error('data.json 을 받지 못했습니다.');
}
const state = JSON.parse(raw).state || JSON.parse(raw);

const keyOf = (date, where, memo) => createHash('sha1').update(`${date}|${where}|${memo.trim()}`).digest('hex').slice(0, 12);
const rows = [];
for (const h of state.history || []) {
  const note = h.note || h.memo; // 세션 메모는 note, 운동 메모는 memo 에 들어 있다
  if (note && h.date >= since) rows.push([h.date, `[세션 ${h.part}]`, note]);
}
for (const p of state.performance || []) {
  if (p.memo && p.date >= since) rows.push([p.date, `[${p.name || p.exerciseId}]`, p.memo]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));

const ledger = existsSync(LEDGER) ? JSON.parse(readFileSync(LEDGER, 'utf8')) : {};
const list = (unhandled ? rows.filter(([d, w, m]) => !ledger[keyOf(d, w, m)]) : rows);
const line = ([d, w, m]) => `${flags.includes('--keys') || unhandled ? `${keyOf(d, w, m)} ` : ''}${d} ${w} ${m.trim()}`;

if (unhandled) {
  if (!list.length) process.exit(0);
  const text = `처리 장부에 없는 운동 메모 ${list.length}개 (known-issues 26). 작업 전에 하나씩 반영 · 답변 · 보류를 정하고 docs/memo-ledger.json 에 키를 적는다:\n${list.map(line).join('\n')}`;
  console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
} else {
  for (const r of list) console.log(line(r));
  console.log(`\n메모 ${list.length}개. 처리하면 docs/memo-ledger.json 에 키와 결과를 적는다(known-issues 26).`);
}
