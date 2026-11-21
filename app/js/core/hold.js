// 버티기(시간형) 운동 타이머의 단계. 사이드 플랭크처럼 좌우가 있으면 자세를 바꾸는 시간을 사이에 둔다.
// 2026-10-04 사용자 제안: "양쪽을 번갈아 할 때 걸리는 시간까지 고려해서 한 쪽당 쓸 수 있는 타이머".
export const HOLD = { prep: 5, switch: 10 };
export const SIDE_LABEL = { left: '왼쪽', right: '오른쪽' };

// 버티기 세트의 목표 초: 세트에 적힌 값, 좌우를 나눠 적었으면 긴 쪽, 없으면 처방, 그것도 없으면 범위 하한.
// 앱의 버티기 타이머(main.js holdSet)와 알림의 버티기 타이머(core/notice.js)가 같은 값을 쓴다.
export function holdSeconds(e, z) {
  return z.reps ?? (z.split ? Math.max(z.leftReps ?? 0, z.rightReps ?? 0) || null : null) ?? e.prescription?.reps ?? e.range?.[0];
}

// 반환: [{ kind: 'prep' | 'switch' | 'hold', secs, side: 'left' | 'right' | null }]
export function holdPhases(seconds, { unilateral = false, leftFirst = true, prep = HOLD.prep, sw = HOLD.switch } = {}) {
  const sides = unilateral ? (leftFirst ? ['left', 'right'] : ['right', 'left']) : [null];
  const out = [{ kind: 'prep', secs: prep, side: sides[0] }];
  sides.forEach((side, i) => {
    if (i) out.push({ kind: 'switch', secs: sw, side });
    out.push({ kind: 'hold', secs: seconds, side });
  });
  return out;
}
