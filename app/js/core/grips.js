// 그립(손잡이·잡는 법) 선택지. 운동별로 고를 수 있는 그립과 자극 부위, 잡는 법, 그림 정보.
// 근거: docs/research/grip_research.md. EMG(근활성) 연구라 차이는 "강조"이지 다른 운동이 되는 것은 아니다.
// art: 그림 정보 (ui/gripart.js). attach: 손잡이 모양, hand: over(오버핸드) · under(언더핸드) · neutral(손바닥끼리), width: 손 간격.
// primary/secondary 가 없으면 카탈로그 값을 그대로 쓴다 (기본 그립은 항상 카탈로그와 같다).

const G = (id, name, short, art, hold, emphasis, how, muscles = {}) => ({ id, name, short, art, hold, emphasis, how, ...muscles });

export const GRIPS = {
  lat: { def: 'overhand_mid', list: [
    G('overhand_mid', '오버핸드 · 어깨보다 넓게', '오버핸드 넓게', { attach: 'lat_bar', hand: 'over', width: 'mid' }, '손등이 내 쪽',
      '광배 중심. 랫풀다운 그립 비교에서 광배 활성이 가장 높게 나온 기본 그립입니다.',
      ['긴 바의 꺾이는 곳보다 한 뼘 안쪽을, 손등이 내 쪽을 보게 잡습니다.', '가슴을 들고 팔꿈치를 옆구리 쪽 아래로 끌어내려 바를 쇄골~윗가슴까지 당깁니다.']),
    G('overhand_wide', '오버핸드 · 아주 넓게', '오버핸드 아주 넓게', { attach: 'lat_bar', hand: 'over', width: 'wide' }, '손등이 내 쪽',
      '광배와 등 위쪽 바깥. 위보다 활성 차이는 작고 당기는 거리가 짧아집니다. 어깨가 불편하면 위 그립으로.',
      ['바가 꺾인 부분을 손등이 내 쪽을 보게 잡습니다.', '팔꿈치를 옆으로 벌린 채 아래로 당겨 바를 윗가슴까지. 머리 뒤로 당기지 않습니다.'],
      { primary: ['back'], secondary: ['upper_back', 'biceps'] }),
    G('underhand', '언더핸드 · 어깨너비', '언더핸드', { attach: 'lat_bar', hand: 'under', width: 'shoulder' }, '손바닥이 내 쪽',
      '이두 참여가 늘어 더 무겁게 당겨지기도 하지만, 광배 활성은 오버핸드보다 조금 낮습니다.',
      ['바 가운데 쪽을 어깨너비로, 손바닥이 내 쪽을 보게 잡습니다.', '팔꿈치를 몸 앞쪽 아래로 당겨 바를 윗가슴까지 가져옵니다.'],
      { primary: ['back'], secondary: ['biceps'] }),
    G('neutral_close', 'V바 · 좁은 뉴트럴', 'V바', { attach: 'v_handle', hand: 'neutral', width: 'close' }, '손바닥끼리 마주 봄',
      '팔꿈치가 몸통 가까이 내려와 광배 아래쪽까지 길게 당깁니다. 손목과 어깨가 편하고 팔 바깥쪽(상완근) 참여가 늘어납니다.',
      ['긴 바를 빼고 케이블 고리에 V바(삼각 손잡이)를 겁니다.', '손바닥끼리 마주 보게 잡고, 상체를 살짝 뒤로 기울여 손잡이를 명치 쪽으로 당깁니다.']),
  ] },
  row: { def: 'neutral_close', list: [
    G('neutral_close', 'V핸들 · 좁은 뉴트럴', 'V핸들', { attach: 'v_handle', hand: 'neutral', width: 'close' }, '손바닥끼리 마주 봄',
      '광배 쪽 강조. 좁은 그립 로우에서 광배 활성이 더 높게 나왔습니다. 팔꿈치가 옆구리를 스치며 지나갑니다.',
      ['V핸들을 손바닥끼리 마주 보게 잡고 무릎을 살짝 굽혀 앉습니다.', '가슴을 세운 채 팔꿈치를 옆구리를 따라 뒤로, 손잡이를 배꼽 쪽으로 당깁니다.']),
    G('neutral_mid', '평행 손잡이 · 어깨너비 뉴트럴', '평행 손잡이', { attach: 'parallel_handles', hand: 'neutral', width: 'shoulder' }, '손바닥끼리 마주 봄',
      '광배와 등 가운데(승모 중부 · 능형근)를 고르게. 중간 너비 뉴트럴에서 승모 활성이 가장 높았다는 연구가 있습니다. 손잡이가 없으면 V핸들로 하세요.',
      ['어깨너비 평행 손잡이를 손바닥끼리 마주 보게 잡습니다.', '팔꿈치를 몸에서 조금 띄워 명치 높이로 당기고, 끝에서 어깨뼈를 모읍니다.']),
    G('overhand_wide', '긴 바 · 넓은 오버핸드', '넓은 오버핸드', { attach: 'straight_bar', hand: 'over', width: 'mid' }, '손등이 위',
      '등 위쪽(승모 중·하부, 능형근)과 후면 어깨 강조. 넓은 그립 로우에서 승모 활성이 더 높게 나왔습니다.',
      ['긴 바를 손등이 위를 보게 어깨보다 넓게 잡습니다.', '팔꿈치를 옆으로 벌려 바를 명치~가슴 아래로 당기고, 어깨뼈를 모아 1초 멈춥니다.', 'V핸들보다 같은 무게가 무겁게 느껴집니다. 한두 단계 낮춰 시작하세요.'],
      { primary: ['upper_back'], secondary: ['back', 'rear_delt', 'biceps'] }),
  ] },
  chest_row: { def: 'neutral', list: [
    G('neutral', '세로 손잡이 · 뉴트럴', '세로 손잡이', { attach: 'machine_handles', hand: 'neutral', width: 'shoulder' }, '손바닥끼리 마주 봄',
      '광배와 등 가운데를 고르게. 팔꿈치가 몸 옆을 지나갑니다.',
      ['가슴 패드에 몸을 붙이고 세로 손잡이를 손바닥끼리 마주 보게 잡습니다.', '팔꿈치를 뒤로 보내 손이 옆구리 앞까지 오게 당깁니다.']),
    G('overhand_wide', '가로 손잡이 · 넓은 오버핸드', '가로 손잡이', { attach: 'straight_bar', hand: 'over', width: 'mid', fixed: true }, '손등이 위',
      '등 위쪽(승모 중·하부, 능형근)과 후면 어깨 강조.',
      ['가로 손잡이를 손등이 위를 보게 넓게 잡습니다.', '팔꿈치를 옆으로 벌려 뒤로 당기고, 끝에서 어깨뼈를 모아 1초 멈춥니다.'],
      { primary: ['upper_back'], secondary: ['back', 'rear_delt', 'biceps'] }),
  ] },
  tbar: { def: 'neutral_close', list: [
    G('neutral_close', 'V핸들 · 좁은 뉴트럴', '좁은 손잡이', { attach: 'v_handle', hand: 'neutral', width: 'close', fixed: true }, '손바닥끼리 마주 봄',
      '등 가운데 전체. 무게를 많이 다루기 좋습니다.',
      ['바 끝에 V핸들을 끼우거나 기구의 좁은 손잡이를 손바닥끼리 마주 보게 잡습니다.', '엉덩이를 뒤로 빼 상체를 45도쯤 숙이고, 허리를 중립으로 둔 채 손잡이를 배꼽 쪽으로 당깁니다.']),
    G('overhand_wide', '넓은 손잡이 · 오버핸드', '넓은 손잡이', { attach: 'straight_bar', hand: 'over', width: 'mid', fixed: true }, '손등이 위',
      '등 위쪽과 후면 어깨를 더 강조합니다.',
      ['기구의 넓은 가로 손잡이를 손등이 위를 보게 잡습니다.', '팔꿈치를 옆으로 벌려 가슴 아래쪽으로 당기고 어깨뼈를 모읍니다.'],
      { primary: ['upper_back'], secondary: ['rear_delt', 'back', 'biceps'] }),
  ] },
  pullup: { def: 'overhand_mid', list: [
    G('overhand_mid', '풀업 · 오버핸드', '오버핸드', { attach: 'pullup_bar', hand: 'over', width: 'mid' }, '손등이 내 쪽',
      '광배 중심. 친업보다 광배 활성이 높게 나왔습니다.',
      ['어깨보다 조금 넓게, 손등이 내 쪽을 보게 바를 잡습니다.', '어깨를 귀에서 멀리 내린 다음, 팔꿈치를 옆구리로 끌어내리며 턱이 바를 넘을 때까지 올라갑니다.']),
    G('underhand', '친업 · 언더핸드', '친업', { attach: 'pullup_bar', hand: 'under', width: 'shoulder' }, '손바닥이 내 쪽',
      '이두 참여가 커서 보통 몇 회 더 됩니다. 광배는 풀업보다 조금 덜 씁니다.',
      ['어깨너비로, 손바닥이 내 쪽을 보게 바를 잡습니다.', '팔꿈치를 몸 앞쪽 아래로 당기며 가슴을 바에 가깝게 올립니다.'],
      { primary: ['back'], secondary: ['biceps'] }),
    G('neutral', '뉴트럴 · 평행 손잡이', '뉴트럴', { attach: 'pullup_parallel', hand: 'neutral', width: 'shoulder' }, '손바닥끼리 마주 봄',
      '손목과 어깨가 편하고 팔 바깥쪽(상완근) 참여가 큽니다. 풀업과 친업의 중간입니다.',
      ['철봉 옆의 평행 손잡이를 손바닥끼리 마주 보게 잡습니다.', '팔꿈치를 몸 옆으로 끌어내리며 올라갑니다.']),
  ] },
  pushdown: { def: 'rope', arm: 'up', list: [
    G('rope', '로프', '로프', { attach: 'rope', hand: 'neutral', width: 'close' }, '손바닥끼리 마주 봄',
      '아래에서 로프 양끝을 바깥으로 벌려 팔을 끝까지 펴기 쉽습니다. 바보다 전체 활성이 약간 높았다는 연구가 있습니다.',
      ['로프 끝의 매듭 바로 위를 손바닥끼리 마주 보게 잡습니다.', '팔꿈치를 옆구리에 고정하고, 아래에서 양손을 바깥으로 벌리며 팔을 끝까지 폅니다.']),
    G('straight_bar', '일자 바 · 오버핸드', '일자 바', { attach: 'straight_bar', hand: 'over', width: 'close' }, '손등이 위',
      '무게를 더 다루기 쉽습니다. 부위 차이는 크지 않습니다.',
      ['짧은 일자 바를 어깨너비보다 좁게, 손등이 위를 보게 잡습니다.', '팔꿈치를 옆구리에 붙인 채 바를 허벅지 앞까지 밀어 내립니다.']),
    G('v_bar', 'V바(꺾인 바)', 'V바', { attach: 'v_bar', hand: 'over', width: 'close' }, '손등이 위, 손목 비스듬히',
      '손목이 비스듬히 놓여 일자 바보다 손목이 편합니다.',
      ['꺾인 바의 양쪽 경사면을 잡습니다.', '팔꿈치를 고정한 채 바를 아래로 밀어 팔을 끝까지 폅니다.']),
  ] },
};

export function gripsFor(exerciseId) {
  return GRIPS[exerciseId]?.list || null;
}

// 그림에서 팔뚝이 이어지는 방향. 푸시다운만 손 위쪽으로 팔꿈치가 있다.
export function gripArm(exerciseId) {
  return GRIPS[exerciseId]?.arm || 'down';
}

export function defaultGripId(exerciseId) {
  return GRIPS[exerciseId]?.def || null;
}

export function gripById(exerciseId, gripId) {
  return gripsFor(exerciseId)?.find((g) => g.id === gripId) || null;
}

// 기록의 그립. 그립 기능 전 기록은 그 운동의 기본 그립으로 본다.
export function gripOf(rec) {
  return rec?.grip || defaultGripId(rec?.exerciseId);
}

// 지난번에 쓴 그립(없으면 기본). 다음 세션도 같은 그립으로 시작한다: 같은 그립이어야 진행을 비교할 수 있다.
export function lastGrip(state, exerciseId) {
  if (!gripsFor(exerciseId)) return null;
  const xs = (state.performance || []).filter((p) => p.exerciseId === exerciseId);
  if (!xs.length) return defaultGripId(exerciseId);
  const last = xs.reduce((a, p) => (p.date >= a.date ? p : a));
  return gripById(exerciseId, gripOf(last)) ? gripOf(last) : defaultGripId(exerciseId);
}

// 그립에 따른 주동근 · 보조근. 기본 그립이거나 그립이 바꾸지 않으면 profile 값.
export function gripMuscles(exerciseId, gripId, profile) {
  const g = gripById(exerciseId, gripId);
  return { primary: [...(g?.primary || profile.primary || [])], secondary: [...(g?.secondary || profile.secondary || [])] };
}
