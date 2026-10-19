// 운동 기록의 메모를 빠짐없이 뽑는다: 세션 메모와 운동별 메모를 날짜순으로 한 목록에.
// 사용: node scripts/memos.mjs [시작 날짜 YYYY-MM-DD] [data.json 경로]
// 경로를 주지 않으면 soomin007/workout-log 의 data.json 을 gh 로 받는다.
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const [since = '0000-00-00', file] = process.argv.slice(2);
const raw = file
  ? readFileSync(file, 'utf8')
  : execFileSync('gh', ['api', 'repos/soomin007/workout-log/contents/data.json', '-H', 'Accept: application/vnd.github.raw'], { encoding: 'utf8', maxBuffer: 64 << 20 });
const state = JSON.parse(raw).state || JSON.parse(raw);

const rows = [];
for (const h of state.history || []) {
  const note = h.note || h.memo; // 세션 메모는 note, 운동 메모는 memo 에 들어 있다
  if (note && h.date >= since) rows.push([h.date, `[세션 ${h.part}]`, note]);
}
for (const p of state.performance || []) {
  if (p.memo && p.date >= since) rows.push([p.date, `[${p.name || p.exerciseId}]`, p.memo]);
}
rows.sort((a, b) => a[0].localeCompare(b[0]));
for (const [date, where, memo] of rows) console.log(`${date} ${where} ${memo.trim()}`);
console.log(`\n메모 ${rows.length}개. 항목마다 처리 결과를 세션 로그에 적는다(known-issues 26).`);
