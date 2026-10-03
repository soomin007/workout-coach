// 운동 순서와 선행 피로. 세션 뒤쪽에서 한 운동은 반복이 줄어든다(Simão 2012 리뷰, docs/COACHING_POLICY.md 11절).
// 그래서 "앞에서 같은 근육을 몇 세트 했는가"(prefatigue)를 기록에 남기고, 처방은 같은 조건의 기록끼리 비교한다.
// DOM 도 상태 구조도 모르는 순수 함수만 둔다 (schema.js 와 coach.js 가 함께 쓴다).

// fatiguedAt: 이 이상이면 "앞 피로 있음". lookback: 같은 조건 기록을 찾을 최근 기록 수. repCut: 피로 상태로 옮겨질 때 줄이는 목표 반복.
export const ORDER = { fatiguedAt: 3, lookback: 3, repCut: 2, secondaryCredit: 0.5 };

export function fatigueClass(pf) {
  if (pf === null || pf === undefined || !Number.isFinite(+pf)) return null;
  return +pf >= ORDER.fatiguedAt ? 'fatigued' : 'fresh';
}

// 앞선 운동 한 세트가 이 운동의 주동근을 얼마나 지치게 했나: 주동근이 겹치면 1, 보조근으로만 겹치면 0.5.
export function overlapCredit(primary, prevPrimary, prevSecondary) {
  const ps = primary || [];
  if (ps.some((m) => (prevPrimary || []).includes(m))) return 1;
  if (ps.some((m) => (prevSecondary || []).includes(m))) return ORDER.secondaryCredit;
  return 0;
}

const round1 = (x) => Math.round(x * 10) / 10;
const mainsDone = (sets) => (sets || []).filter((z) => z.done && z.type === 'main');

// 계획 순서 기준: 카드 순서에서 앞에 놓인 운동의 본세트(아직 안 했어도 할 예정인 세트) 합.
export function plannedPrefatigue(entries, idx) {
  const e = entries[idx];
  let n = 0;
  for (const prev of entries.slice(0, idx)) {
    const k = overlapCredit(e.primary, prev.primary, prev.secondary);
    if (k) n += k * (prev.sets || []).filter((z) => z.type === 'main').length;
  }
  return round1(n);
}

// 실제 수행 기준: 이 운동 첫 본세트 완료 시각보다 먼저 끝난 다른 운동의 본세트.
// items: [{ key, primary, secondary, sets }]. 반환: Map(key → { order, prefatigue }).
// 시각이 없는 운동(한 줄 입력 · 계획대로 완료)이 섞이면 그 세션은 카드 순서로 센다.
export function actualOrder(items) {
  const firstAt = (it) => {
    const ts = mainsDone(it.sets).map((z) => z.doneAt).filter((t) => Number.isFinite(t));
    return ts.length ? Math.min(...ts) : null;
  };
  const withT = items.map((it, i) => ({ it, i, t: firstAt(it) })).filter((x) => mainsDone(x.it.sets).length);
  const timed = withT.length && withT.every((x) => x.t !== null);
  const seq = timed ? [...withT].sort((a, b) => a.t - b.t) : withT;
  const out = new Map();
  seq.forEach((x, order) => {
    let n = 0;
    for (const y of withT) {
      if (y === x) continue;
      const k = overlapCredit(x.it.primary, y.it.primary, y.it.secondary);
      if (!k) continue;
      const before = timed ? mainsDone(y.it.sets).filter((z) => z.doneAt < x.t).length : (y.i < x.i ? mainsDone(y.it.sets).length : 0);
      n += k * before;
    }
    out.set(x.it.key, { order, prefatigue: round1(n) });
  });
  return out;
}
