// 근육 지도: 앞 · 뒤 인체에 주동근(진한) · 보조근(연한) · 나머지(회색)를 칠한다. Leap 앱의 집중 영역 그림을 참고해 직접 그렸다.
// 왼쪽 반신만 [dx, y] 로 정의하고 좌우를 대칭으로 만든다(dx 는 몸 중심에서의 거리, 음수 = 그림 왼쪽).
// 근육 키는 catalog.js 의 MUSCLE_LABEL 과 같다 (+ core). 색은 styles.css 의 .body-map 규칙(테마 토큰).

const FRONT = 55, BACK = 165;
const ALIAS = { brachialis: 'biceps' };

// 반신 다각형: [근육 키 | null(회색), 점들]
const FRONT_HALF = [
  ['side_delt', [[-27, 39], [-21, 34], [-19, 48], [-26, 54]]],
  ['front_delt', [[-21, 34], [-11, 32], [-11, 41], [-19, 48]]],
  ['chest', [[-11, 33], [-1, 35], [-1, 52], [-9, 55], [-16, 50], [-17, 45], [-11, 41]]],
  ['biceps', [[-27, 56], [-19, 51], [-17, 70], [-25, 74]]],
  [null, [[-26, 77], [-17, 73], [-20, 97], [-27, 98]]],
  ['core', [[-15, 55], [-9, 57], [-9, 88], [-13, 92], [-15, 80]]],
  ['quads', [[-16, 98], [-3, 100], [-4, 138], [-13, 140], [-17, 120]]],
  [null, [[-13, 146], [-4, 145], [-5, 180], [-11, 181]]],
];
const BACK_HALF = [
  ['side_delt', [[-27, 40], [-21, 35], [-19, 49], [-26, 55]]],
  ['rear_delt', [[-21, 35], [-13, 34], [-13, 44], [-19, 49]]],
  ['back', [[-13, 47], [-2, 64], [-3, 86], [-12, 80], [-17, 60]]],
  ['triceps', [[-27, 57], [-19, 52], [-17, 71], [-25, 75]]],
  [null, [[-26, 78], [-17, 74], [-20, 97], [-27, 98]]],
  [null, [[-3, 88], [-12, 82], [-14, 94], [-3, 96]]],
  ['glute', [[-15, 97], [-1, 98], [-1, 117], [-15, 118]]],
  ['hamstring', [[-15, 121], [-2, 122], [-4, 146], [-13, 146]]],
  ['calf', [[-14, 150], [-4, 150], [-5, 179], [-12, 180]]],
];
// 가운데에 걸친 영역: [근육 키, 점들(절대 x)]
const FRONT_MID = [['core', [[-8, 57], [8, 57], [8, 90], [0, 95], [-8, 90]]]];
const BACK_MID = [['upper_back', [[0, 27], [13, 35], [11, 45], [0, 62], [-11, 45], [-13, 35]]]];

const pts = (cx, ps, flip = 1) => ps.map(([dx, y]) => `${cx + dx * flip},${y}`).join(' ');

function figure(cx, half, mid, cls) {
  const poly = (m, p) => `<polygon class="${cls(m)}" points="${p}"/>`;
  const parts = [];
  parts.push(`<ellipse class="m-off" cx="${cx}" cy="15" rx="9" ry="11"/><polygon class="m-off" points="${pts(cx, [[-5, 25], [5, 25], [6, 32], [-6, 32]])}"/>`);
  for (const [m, p] of mid) parts.push(poly(m, pts(cx, p)));
  for (const [m, p] of half) { parts.push(poly(m, pts(cx, p))); parts.push(poly(m, pts(cx, p, -1))); }
  for (const s of [-1, 1]) parts.push(`<ellipse class="m-off" cx="${cx + s * 25}" cy="103" rx="4" ry="5"/>`);
  return parts.join('');
}

// muscles: { primary: [], secondary: [] }. opts.width: 그림 폭(px). 반환: SVG 문자열.
export function bodyMap({ primary = [], secondary = [] } = {}, { width = null, label = '' } = {}) {
  const P = new Set(primary.map((m) => ALIAS[m] || m)), S = new Set(secondary.map((m) => ALIAS[m] || m));
  const cls = (m) => (m && P.has(m) ? 'm-prim' : m && S.has(m) ? 'm-sec' : 'm-off');
  const style = width ? ` style="width:${width}px"` : '';
  return `<svg class="body-map" viewBox="0 0 220 186"${style} role="img" aria-label="${label || '근육 지도'}">${figure(FRONT, FRONT_HALF, FRONT_MID, cls)}${figure(BACK, BACK_HALF, BACK_MID, cls)}</svg>`;
}
