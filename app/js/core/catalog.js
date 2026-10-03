// 운동 카탈로그: 정적 기본값. 사용자 선호(prefs)나 세션 조정은 여기에 쓰지 않는다.
// v9 DB 를 옮기면서 바꾼 점: 어깨 프레스 주동근 shoulder → front_delt, Core 3슬롯 구성, 기록 호환용 aliases.

export const PARTS = ['push', 'pull', 'lower', 'core'];
export const PART_LABEL = { push: 'Push', pull: 'Pull', lower: 'Lower', core: 'Core' };

export const LOAD_MODES = [
  // plates: 원판식 머신(레그프레스 등). 양쪽 원판을 더한 값이고 기구 자체 무게는 넣지 않는다(공중량은 알 수 없음).
  ['total', '총중량'], ['per_side', '한쪽당'], ['plates', '원판 합계'], ['per_dumbbell', '덤벨 1개당'],
  ['machine', '머신 표시값'], ['bodyweight', '체중'], ['assist', '보조중량'],
];

export const EQUIPMENT = {
  bench_rack: '벤치/랙', dumbbell_bench: '덤벨+벤치', chest_press: '체스트프레스 머신', smith: '스미스 머신',
  barbell: '바벨', shoulder_press: '숄더프레스 머신', dumbbell: '덤벨', cable: '케이블', pullup: '풀업바',
  lat_pulldown: '랫풀다운', cable_row: '케이블 로우', chest_supported_row: '체스트 서포티드 로우',
  tbar: 'T바/플레이트 로우', rack: '스쿼트 랙', leg_curl: '레그컬', leg_press: '레그프레스',
  abduction: '힙 어브덕션', calf_machine: '카프 머신', none: '장비 불필요',
};

export const MUSCLE_LABEL = {
  chest: '가슴', back: '광배/등', upper_back: '상부등', front_delt: '전면어깨', side_delt: '측면어깨',
  rear_delt: '후면어깨', triceps: '삼두', biceps: '이두', quads: '대퇴사두', hamstring: '햄스트링',
  glute: '둔근', calf: '종아리',
};
export const MUSCLE_BUDGET = {
  chest: 10, back: 12, upper_back: 8, front_delt: 6, side_delt: 8, rear_delt: 6, triceps: 6, biceps: 6,
  quads: 10, hamstring: 8, glute: 8, calf: 6,
};
export const PART_MUSCLES = {
  push: ['chest', 'front_delt', 'side_delt', 'triceps'],
  pull: ['back', 'upper_back', 'rear_delt', 'biceps'],
  lower: ['quads', 'hamstring', 'glute', 'calf'],
};

export const CORE_SLOTS = {
  push: ['horizontal_push', 'vertical_push', 'lateral_delt', 'triceps'],
  pull: ['vertical_pull', 'horizontal_pull', 'rear_delt', 'biceps'],
  lower: ['squat', 'unilateral', 'hamstring', 'calf'],
  core: ['core_anti_extension', 'core_anti_rotation', 'core_lateral'],
};
export const OPTIONAL_SLOTS = {
  push: ['secondary_chest_press', 'chest_isolation', 'chest_finisher'],
  pull: ['secondary_vertical_pull', 'secondary_back', 'biceps_secondary'],
  lower: ['secondary_squat', 'secondary_lower', 'glute_med'],
  core: ['core_flexion'],
};
export const SESSION_ORDER = {
  push: ['horizontal_push', 'secondary_chest_press', 'vertical_push', 'chest_isolation', 'lateral_delt', 'triceps', 'chest_finisher'],
  pull: ['vertical_pull', 'secondary_vertical_pull', 'horizontal_pull', 'secondary_back', 'rear_delt', 'biceps', 'biceps_secondary'],
  lower: ['squat', 'secondary_squat', 'unilateral', 'hamstring', 'secondary_lower', 'glute_med', 'calf'],
  core: ['core_anti_extension', 'core_anti_rotation', 'core_lateral', 'core_flexion'],
};
export const SLOT_COMPAT = {
  horizontal_push: ['horizontal_push', 'secondary_chest_press', 'chest_finisher'],
  secondary_chest_press: ['secondary_chest_press', 'horizontal_push'],
  vertical_push: ['vertical_push'], lateral_delt: ['lateral_delt'], triceps: ['triceps'],
  chest_isolation: ['chest_isolation'], chest_finisher: ['chest_finisher', 'horizontal_push'],
  vertical_pull: ['vertical_pull', 'secondary_vertical_pull'],
  secondary_vertical_pull: ['secondary_vertical_pull', 'vertical_pull'],
  horizontal_pull: ['horizontal_pull', 'secondary_back'], secondary_back: ['secondary_back', 'horizontal_pull'],
  rear_delt: ['rear_delt'], biceps: ['biceps', 'biceps_secondary'], biceps_secondary: ['biceps_secondary', 'biceps'],
  squat: ['squat', 'secondary_squat', 'secondary_lower'], secondary_squat: ['secondary_squat', 'squat', 'secondary_lower'],
  unilateral: ['unilateral', 'secondary_lower'], hamstring: ['hamstring'],
  secondary_lower: ['secondary_lower', 'unilateral', 'secondary_squat'], glute_med: ['glute_med'], calf: ['calf'],
  core_anti_extension: ['core_anti_extension'], core_anti_rotation: ['core_anti_rotation'],
  core_lateral: ['core_lateral'], core_flexion: ['core_flexion'],
};

export const SLOT_LABEL = {
  horizontal_push: '수평 밀기', secondary_chest_press: '가슴 보조 프레스', vertical_push: '어깨 프레스', lateral_delt: '측면 어깨',
  triceps: '삼두', chest_isolation: '가슴 고립', chest_finisher: '가슴 마무리',
  vertical_pull: '수직 당기기', secondary_vertical_pull: '수직 당기기 보조', horizontal_pull: '수평 당기기', secondary_back: '등 보조',
  rear_delt: '후면 어깨', biceps: '이두', biceps_secondary: '이두 보조',
  squat: '스쿼트', secondary_squat: '스쿼트 보조', unilateral: '편측 하체', hamstring: '햄스트링', secondary_lower: '하체 보조',
  glute_med: '중둔근', calf: '종아리',
  core_anti_extension: '항신전', core_anti_rotation: '항회전', core_lateral: '항측굴', core_flexion: '복부 굴곡',
};
export const slotName = (x) => SLOT_LABEL[x] || String(x || '').replaceAll('_', ' ');

// measure: 'reps'(기본) 또는 'seconds'(버티기). range 는 measure 단위.
export const DB = {
  push: [
    { id: 'bench', name: '바벨 벤치프레스', role: 'horizontal_push', primary: ['chest'], secondary: ['triceps', 'front_delt'], sets: 3, range: [6, 8], rest: 180, inc: 2.5, mode: 'total', priority: 100, equipment: 'bench_rack', compound: true, why: '가슴 메인 수평 프레스', cue: '견갑을 고정하고 전완이 바닥과 수직에 가깝게. 전면어깨/삼두만 강하면 그립·터치 위치를 점검.' },
    { id: 'incline_db', name: '덤벨 인클라인 프레스', role: 'secondary_chest_press', primary: ['chest'], secondary: ['front_delt', 'triceps'], sets: 3, range: [8, 10], rest: 150, inc: 2, mode: 'per_dumbbell', priority: 92, equipment: 'dumbbell_bench', compound: true, why: '상부가슴 보완 프레스' },
    { id: 'chest_press', name: '체스트프레스 머신', role: 'secondary_chest_press', primary: ['chest'], secondary: ['triceps'], sets: 3, range: [8, 12], rest: 120, inc: 5, mode: 'machine', priority: 90, equipment: 'chest_press', compound: true, why: '안정적으로 가슴 볼륨 확보' },
    { id: 'smith_incline', name: '스미스 인클라인 프레스', role: 'secondary_chest_press', primary: ['chest'], secondary: ['front_delt', 'triceps'], sets: 3, range: [8, 12], rest: 150, inc: 5, mode: 'per_side', priority: 84, equipment: 'smith', compound: true, why: '고정 궤도의 상부가슴 프레스' },
    { id: 'ohp', name: '바벨 오버헤드프레스', role: 'vertical_push', primary: ['front_delt'], secondary: ['side_delt', 'triceps'], sets: 3, range: [6, 10], rest: 180, inc: 2.5, mode: 'total', priority: 86, equipment: 'barbell', compound: true, why: '어깨 메인 프레스' },
    { id: 'shoulder_machine', name: '머신 숄더프레스', role: 'vertical_push', primary: ['front_delt'], secondary: ['side_delt', 'triceps'], sets: 3, range: [8, 12], rest: 150, inc: 5, mode: 'machine', priority: 84, equipment: 'shoulder_press', compound: true, why: '안정적인 어깨 프레스' },
    { id: 'lateral', name: '사이드 레터럴레이즈', role: 'lateral_delt', primary: ['side_delt'], secondary: [], sets: 3, range: [12, 20], rest: 75, inc: 1, mode: 'per_dumbbell', priority: 95, equipment: 'dumbbell', why: '측면삼각근 직접 볼륨' },
    { id: 'cable_lateral', name: '케이블 레터럴레이즈', role: 'lateral_delt', primary: ['side_delt'], secondary: [], sets: 3, range: [12, 20], rest: 75, inc: 2.5, mode: 'machine', priority: 82, equipment: 'cable', why: '측면삼각근 지속 장력' },
    { id: 'pushdown', name: '트라이셉 푸시다운', role: 'triceps', primary: ['triceps'], secondary: [], sets: 2, range: [10, 15], rest: 75, inc: 2.5, mode: 'machine', priority: 95, equipment: 'cable', why: '삼두 직접 볼륨' },
    { id: 'cable_fly', name: '케이블 플라이', role: 'chest_isolation', primary: ['chest'], secondary: [], sets: 2, range: [10, 15], rest: 90, inc: 5, mode: 'machine', priority: 90, equipment: 'cable', why: '프레스 후 가슴 고립' },
    { id: 'pike_pushup', name: '파이크 푸쉬업', role: 'vertical_push', primary: ['front_delt'], secondary: ['triceps'], sets: 3, range: [6, 12], rest: 90, inc: 0, mode: 'bodyweight', priority: 40, equipment: 'none', compound: true, why: '집에서 하는 어깨 프레스', cue: '엉덩이를 높이 들고 머리가 손 사이로 내려가게.' },
    { id: 'pushup', name: '푸쉬업', role: 'chest_finisher', primary: ['chest'], secondary: ['triceps'], sets: 2, range: [10, 20], rest: 60, inc: 0, mode: 'bodyweight', priority: 60, equipment: 'none', why: '가벼운 마무리' },
  ],
  pull: [
    { id: 'pullup', name: '풀업', role: 'vertical_pull', primary: ['back'], secondary: ['biceps'], sets: 3, range: [6, 10], rest: 180, inc: 0, mode: 'bodyweight', priority: 100, equipment: 'pullup', compound: true, why: '수직 당기기 메인', cue: '첫 세트를 실패까지 밀지 말고 RIR 1~2를 남겨 이후 세트 붕괴를 줄이기.' },
    { id: 'lat', name: '랫풀다운', aliases: ['시티드 랫풀다운'], role: 'secondary_vertical_pull', primary: ['back'], secondary: ['biceps'], sets: 3, range: [8, 12], rest: 120, inc: 5, mode: 'machine', priority: 92, equipment: 'lat_pulldown', compound: true, why: '광배 추가 볼륨' },
    { id: 'row', name: '시티드 케이블 로우', role: 'horizontal_pull', primary: ['back', 'upper_back'], secondary: ['biceps'], sets: 3, range: [8, 12], rest: 120, inc: 7.5, mode: 'machine', priority: 95, equipment: 'cable_row', compound: true, why: '수평 당기기 메인' },
    { id: 'chest_row', name: '체스트 서포티드 로우', role: 'horizontal_pull', primary: ['back', 'upper_back'], secondary: ['biceps'], sets: 3, range: [8, 12], rest: 120, inc: 5, mode: 'machine', priority: 93, equipment: 'chest_supported_row', compound: true, why: '허리 부담을 줄인 수평 당기기' },
    { id: 'db_row', name: '원암 덤벨 로우', role: 'horizontal_pull', primary: ['back'], secondary: ['upper_back', 'biceps', 'rear_delt'], sets: 3, range: [8, 12], rest: 90, inc: 2, mode: 'per_dumbbell', priority: 80, equipment: 'dumbbell', compound: true, unilateral: true, why: '덤벨만으로 하는 수평 당기기', cue: '허리는 중립, 팔꿈치를 골반 쪽으로 당기기.' },
    { id: 'tbar', name: 'T바/플레이트 로우', aliases: ['T바 로우'], role: 'secondary_back', primary: ['upper_back'], secondary: ['back', 'biceps'], sets: 2, range: [8, 12], rest: 120, inc: 5, mode: 'machine', priority: 86, equipment: 'tbar', compound: true, why: '상부 등 보완' },
    { id: 'rear_cable', name: '케이블 리어델트 플라이', role: 'rear_delt', primary: ['rear_delt'], secondary: [], sets: 2, range: [12, 20], rest: 75, inc: 2.5, mode: 'machine', priority: 92, equipment: 'cable', why: '후면삼각근 직접 볼륨' },
    { id: 'facepull', name: '페이스풀', role: 'rear_delt', primary: ['rear_delt'], secondary: ['upper_back'], sets: 2, range: [12, 20], rest: 75, inc: 2.5, mode: 'machine', priority: 84, equipment: 'cable', why: '후면어깨/견갑 보완' },
    { id: 'db_rear', name: '덤벨 리버스 플라이', role: 'rear_delt', primary: ['rear_delt'], secondary: [], sets: 2, range: [12, 20], rest: 75, inc: 1, mode: 'per_dumbbell', priority: 76, equipment: 'dumbbell', why: '후면삼각근 대체' },
    { id: 'curl', name: '덤벨 바이셉 컬', role: 'biceps', primary: ['biceps'], secondary: [], sets: 2, range: [8, 12], rest: 75, inc: 2, mode: 'per_dumbbell', priority: 90, equipment: 'dumbbell', why: '이두 직접 볼륨' },
    { id: 'hammer', name: '해머컬', role: 'biceps_secondary', primary: ['biceps'], secondary: ['brachialis'], sets: 2, range: [10, 15], rest: 75, inc: 2, mode: 'per_dumbbell', priority: 78, equipment: 'dumbbell', why: '상완근/이두 보완' },
  ],
  lower: [
    { id: 'squat', name: '프리 스쿼트', role: 'squat', primary: ['quads', 'glute'], secondary: [], sets: 3, range: [5, 8], rest: 210, inc: 2.5, mode: 'total', priority: 100, equipment: 'rack', compound: true, why: '하체 메인 복합운동' },
    { id: 'smith_squat', name: '스미스 스쿼트', role: 'secondary_squat', primary: ['quads', 'glute'], secondary: [], sets: 3, range: [8, 10], rest: 180, inc: 5, mode: 'per_side', priority: 95, equipment: 'smith', compound: true, why: '안정적인 하체 추가 볼륨' },
    { id: 'bulgarian', name: '불가리안 스플릿 스쿼트', role: 'unilateral', primary: ['quads', 'glute'], secondary: ['hamstring'], sets: 3, range: [8, 10], rest: 150, inc: 2, mode: 'per_dumbbell', priority: 92, equipment: 'dumbbell_bench', compound: true, unilateral: true, why: '편측 하체와 좌우 균형', cue: '왼쪽부터 시작하고 오른쪽 반복수는 왼쪽을 넘기지 않기. 상체를 과하게 숙이지 말고 척추 중립.' },
    { id: 'legcurl', name: '레그컬', role: 'hamstring', primary: ['hamstring'], secondary: [], sets: 3, range: [10, 15], rest: 90, inc: 5, mode: 'machine', priority: 95, equipment: 'leg_curl', why: '햄스트링 직접 볼륨' },
    { id: 'legpress', name: '싱글 레그프레스', role: 'secondary_lower', primary: ['quads', 'glute'], secondary: [], sets: 2, range: [8, 12], rest: 120, inc: 5, mode: 'plates', priority: 88, equipment: 'leg_press', unilateral: true, why: '편측 하체 추가 볼륨', cue: '왼쪽 무릎/대퇴사두 우세와 오른쪽 둔근 우세를 관찰. 무릎 궤적·골반 회전·뒤꿈치 들림 체크.' },
    { id: 'abduction', name: '힙 어브덕션 (다리 벌리기)', aliases: ['힙 어브덕션'], role: 'glute_med', primary: ['glute'], secondary: [], sets: 2, range: [12, 20], rest: 75, inc: 5, mode: 'machine', priority: 78, equipment: 'abduction', why: '둔근 보조' },
    { id: 'bw_split_squat', name: '맨몸 스플릿 스쿼트', role: 'unilateral', primary: ['quads', 'glute'], secondary: [], sets: 3, range: [10, 15], rest: 75, inc: 0, mode: 'bodyweight', priority: 45, equipment: 'none', compound: true, unilateral: true, why: '집에서 하는 편측 하체' },
    { id: 'glute_bridge', name: '글루트 브릿지', role: 'glute_med', primary: ['glute'], secondary: ['hamstring'], sets: 2, range: [12, 20], rest: 60, inc: 0, mode: 'bodyweight', priority: 40, equipment: 'none', why: '집에서 하는 둔근 운동', cue: '허리를 꺾지 말고 엉덩이를 조여서 올리기.' },
    { id: 'calf', name: '한발 카프레이즈', role: 'calf', primary: ['calf'], secondary: [], sets: 2, range: [12, 20], rest: 60, inc: 0, mode: 'bodyweight', priority: 75, equipment: 'none', unilateral: true, why: '종아리 보완', cue: '반동 없이 천천히. 통증/잠김/불안정이 있으면 중단.' },
  ],
  core: [
    { id: 'deadbug', name: '데드버그', role: 'core_anti_extension', primary: ['core'], secondary: [], sets: 3, range: [8, 12], rest: 60, inc: 0, mode: 'bodyweight', priority: 100, equipment: 'none', why: '허리를 바닥에 붙인 채 버티는 항신전', cue: '허리가 뜨기 직전까지만 팔다리를 뻗기. 숨을 내쉬며 천천히.' },
    { id: 'plank', name: '플랭크', role: 'core_anti_extension', primary: ['core'], secondary: [], sets: 3, range: [20, 45], measure: 'seconds', rest: 60, inc: 0, mode: 'bodyweight', priority: 85, equipment: 'none', why: '몸통 전면 버티기' },
    { id: 'bird_dog', name: '버드독', role: 'core_anti_rotation', primary: ['core'], secondary: [], sets: 3, range: [6, 10], rest: 60, inc: 0, mode: 'bodyweight', priority: 100, equipment: 'none', unilateral: true, why: '골반 회전을 막는 항회전 (McGill 빅3)', cue: '뻗은 자세에서 2~3초 멈추기. 골반이 돌아가지 않게.' },
    { id: 'pallof', name: '팰로프 프레스', role: 'core_anti_rotation', primary: ['core'], secondary: [], sets: 3, range: [10, 12], rest: 60, inc: 2.5, mode: 'machine', priority: 90, equipment: 'cable', unilateral: true, why: '케이블 당김에 버티는 항회전' },
    { id: 'side_plank', name: '사이드 플랭크', role: 'core_lateral', primary: ['core'], secondary: [], sets: 2, range: [15, 40], measure: 'seconds', rest: 60, inc: 0, mode: 'bodyweight', priority: 100, equipment: 'none', unilateral: true, why: '옆구리 항측굴 (McGill 빅3)' },
    { id: 'reverse_crunch', name: '리버스 크런치 / 레그레이즈', role: 'core_flexion', primary: ['core'], secondary: [], sets: 2, range: [10, 15], rest: 60, inc: 0, mode: 'bodyweight', priority: 70, equipment: 'none', why: '하복부 (선택, 허리 불편하면 제외)' },
    { id: 'crunch', name: '크런치', role: 'core_flexion', primary: ['core'], secondary: [], sets: 2, range: [10, 20], rest: 60, inc: 0, mode: 'bodyweight', priority: 60, equipment: 'none', why: '복직근 (선택, 허리 불편하면 제외)' },
  ],
};

export const ALL_CATALOG = Object.entries(DB).flatMap(([part, xs]) => xs.map((x) => ({ ...x, part })));

export function catalogById(id) {
  return ALL_CATALOG.find((x) => x.id === id) || null;
}

// 이름(또는 과거 별칭)으로 카탈로그 운동을 찾는다. 기록 마이그레이션에서 오염된 id 를 바로잡는 데 쓴다.
export function catalogByName(name) {
  const n = String(name || '').trim();
  if (!n) return null;
  return ALL_CATALOG.find((x) => x.name === n || (x.aliases || []).includes(n)) || null;
}

// v9 이전 slot/role 이름을 현재 이름으로.
export function migrateRole(role, exerciseId) {
  if (role !== 'core') return role;
  return catalogById(exerciseId)?.role || 'core_flexion';
}
