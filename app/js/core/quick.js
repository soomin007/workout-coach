// 한 줄 입력 해석: 운동이 끝난 뒤 몰아서 기록하거나 음성 받아쓰기(Gboard)로 넣을 때 쓴다.
// 예) "50 10 10 8 한계"  "50x10, 50x10, 45x8"  "10 10 8"(체중)  "52.5 × 6 6 5 적당"
import { findEntry, TransitionError } from './session.js';
import { makeSet } from './schema.js';

const EFFORT_WORDS = [
  [/(여유|쉬움|쉬웠|가벼)/, 'easy'],
  [/(적당|보통|괜찮)/, 'ok'],
  [/(한계|힘듦|힘들|실패|빡)/, 'hard'],
];

export function parseQuickLine(text, { weighted = true } = {}) {
  const src = String(text || '');
  let effort = null;
  for (const [re, v] of EFFORT_WORDS) if (re.test(src)) effort = v;
  const norm = src.replace(/[×*X]/g, 'x').replace(/(kg|킬로|키로)/gi, ' ').replace(/(회|개|번)/g, ' ').replace(/,/g, ' ')
    .replace(/(\d)\s*x\s*(\d)/g, '$1x$2');
  const tokens = norm.split(/\s+/).filter((t) => /^\d+(\.\d+)?(x\d+)?$/.test(t));
  const sets = [];
  if (tokens.some((t) => t.includes('x'))) {
    let w = null;
    for (const t of tokens) {
      if (t.includes('x')) { const [a, b] = t.split('x').map(Number); w = a; sets.push({ weight: a, reps: b }); }
      else sets.push({ weight: w, reps: Number(t) });
    }
  } else {
    const nums = tokens.map(Number);
    if (weighted && nums.length >= 2) nums.slice(1).forEach((r) => sets.push({ weight: nums[0], reps: r }));
    else nums.forEach((r) => sets.push({ weight: null, reps: r }));
  }
  if (!sets.length || sets.some((x) => !Number.isFinite(x.reps) || x.reps <= 0 || x.reps > 200)) {
    throw new TransitionError('quick_parse', '숫자를 읽지 못했습니다. 예: "50 10 10 8 한계" 또는 "50x10 45x8"');
  }
  return { sets, effort };
}

// 해석 결과를 본세트에 앞에서부터 채우고 완료 처리한다. 모자라면 세트를 추가하고, 남는 빈 세트는 그대로 둔다.
export function applyQuickLine(state, uid, text) {
  const { entry } = findEntry(state, uid);
  const weighted = entry.loadMode !== 'bodyweight' || entry.sets.some((z) => z.type === 'main' && z.weight !== null);
  const { sets, effort } = parseQuickLine(text, { weighted });
  const mains = () => entry.sets.filter((z) => z.type !== 'warmup');
  const targets = mains().filter((z) => !z.done);
  while (targets.length < sets.length) {
    const z = makeSet('main', null, null);
    entry.sets.push(z);
    targets.push(z);
  }
  sets.forEach((x, i) => {
    const z = targets[i];
    if (x.weight !== null || entry.loadMode === 'bodyweight') z.weight = x.weight;
    z.reps = x.reps; z.split = false; z.leftReps = null; z.rightReps = null;
    z.done = true; z.doneAt = null; z.touched = true;
  });
  if (effort) entry.effort = effort;
  return { count: sets.length, effort };
}
