// 운동 동작 그림: RepDB 무료 등급(github.com/sergei-argutin/exercise-dataset, 2026-10-04 받음).
// 조건: 앱 안 사용, "Exercise data by RepDB (repdb.co)" 표기(설정 탭 · README), 데이터셋으로 재배포 금지.
// 우리 운동에 맞는 것만 골라 320px 로 줄여 app/img/ex/ 에 넣었다. 키는 RepDB id, 파일은 <id>-start|peak|main.webp.
// 맞는 그림이 없는 운동(케이블 리어델트 플라이 등)은 근육 지도만 쓴다.

// hold: 시작 · 끝 두 장이 아니라 한 장(main)인 버티기 운동
const HOLD = new Set(['plank', 'bird-dog-hold', 'side-plank', 'high-plank']);

export const EX_MEDIA = {
  bench: 'bench-press', incline_db: 'incline-db-press', chest_press: 'chest-press-machine', smith_incline: 'smith-machine-incline-bench-press',
  ohp: 'ohp', shoulder_machine: 'machine-shoulder-press', lateral: 'lateral-raise', cable_lateral: 'cable-lateral-raise',
  pushdown: 'tricep-pushdown', cable_fly: 'cable-fly', pike_pushup: 'pike-push-ups', pushup: 'push-up',
  pullup: 'pull-up', lat: 'lat-pulldown', row: 'seated-cable-row', chest_row: 'chest-supported-db-row', db_row: 'single-arm-db-row',
  tbar: 't-bar-row', facepull: 'face-pull', db_rear: 'dumbbell-reverse-fly', curl: 'bicep-curl', hammer: 'hammer-curl',
  squat: 'squat', smith_squat: 'smith-machine-squat', bulgarian: 'bulgarian-split-squat', legcurl: 'seated-leg-curl',
  legpress: 'single-leg-press', abduction: 'hip-abduction', bw_split_squat: 'split-squat', glute_bridge: 'glute-bridge',
  calf: 'single-leg-calf-raise', deadbug: 'dead-bug', plank: 'plank', bird_dog: 'bird-dog-hold', pallof: 'cable-pallof-press',
  side_plank: 'side-plank', reverse_crunch: 'reverse-crunches', crunch: 'crunches', shoulder_tap: 'high-plank',
};

// 그립마다 다른 그림이 있으면 그것으로 (grips.js 의 그립 id)
export const GRIP_MEDIA = {
  lat: { underhand: 'reverse-grip-lat-pulldown', neutral_close: 'v-bar-lat-pulldown' },
  row: { overhand_wide: 'wide-grip-seated-cable-row' },
  pullup: { underhand: 'chin-ups', neutral: 'neutral-grip-pull-ups' },
  pushdown: { v_bar: 'v-bar-tricep-pushdown' },
};

// 반환: 그림 경로 배열(시작 · 끝, 또는 한 장). 없으면 [].
export function exerciseImages(exerciseId, grip = null) {
  const id = (grip && GRIP_MEDIA[exerciseId]?.[grip]) || EX_MEDIA[exerciseId];
  if (!id) return [];
  return HOLD.has(id) ? [`img/ex/${id}-main.webp`] : [`img/ex/${id}-start.webp`, `img/ex/${id}-peak.webp`];
}

export const MEDIA_CREDIT = { text: 'Exercise data by RepDB (repdb.co)', url: 'https://repdb.co' };
