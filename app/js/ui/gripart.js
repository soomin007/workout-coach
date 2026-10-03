// 그립 그림 (인라인 SVG). 내 눈으로 내려다본 손잡이와 두 손, 어깨 위치(점선)를 그린다.
// 손 모양: over = 손등과 손가락 마디가 보임, under = 손바닥 쪽 말린 손가락이 보임, neutral = 세로 손잡이를 쥐고 마디가 바깥쪽.
// 색은 styles.css 의 .grip-art 규칙이 테마 토큰으로 정한다.
import { esc } from './dom.js';

const W = 280, H = 172, SH = [105, 175];
const X = { close: [117, 163], shoulder: SH, mid: [80, 200], wide: [50, 230] };

const line = (x1, y1, x2, y2, cls) => `<line class="${cls}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`;
const cable = (x, y) => line(x, 0, x, y, 'cable');

// 긴 랫풀 바: 가운데는 곧고 양끝이 아래로 꺾인다. 손이 꺾인 곳에 있으면 그 높이로.
const latY = (x) => (x < 52 ? 62 + ((52 - x) * 16) / 22 : x > 228 ? 62 + ((x - 228) * 16) / 22 : 62);

function attachment(a, xs) {
  const [l, r] = xs;
  switch (a.attach) {
    case 'lat_bar':
      return { svg: cable(140, 62) + `<path class="bar" d="M28,79 L52,62 L228,62 L252,79"/>`, hands: xs.map((x) => [x, latY(x), 'h']) };
    case 'straight_bar':
      return { svg: (a.fixed ? '' : cable(140, 62)) + line(Math.min(l - 34, 104), 62, Math.max(r + 34, 176), 62, 'bar'), hands: xs.map((x) => [x, 62, 'h']) };
    case 'pullup_bar':
      return { svg: line(16, 8, 16, 46, 'bar thin') + line(264, 8, 264, 46, 'bar thin') + line(16, 46, 264, 46, 'bar'), hands: xs.map((x) => [x, 46, 'h']) };
    case 'pullup_parallel':
      return { svg: line(16, 8, 16, 40, 'bar thin') + line(264, 8, 264, 40, 'bar thin') + line(16, 40, 264, 40, 'bar') + xs.map((x) => line(x, 40, x, 92, 'bar')).join(''), hands: xs.map((x) => [x, 68, 'v']) };
    case 'v_handle':
      return { svg: cable(140, 24) + `<circle class="bar thin" cx="140" cy="24" r="5"/>` + line(140, 28, l, 50, 'bar thin') + line(140, 28, r, 50, 'bar thin') + line(l, 50, l, 98, 'bar') + line(r, 50, r, 98, 'bar') + line(l, 98, r, 98, 'bar thin'), hands: xs.map((x) => [x, 74, 'v']) };
    case 'parallel_handles':
      return { svg: cable(140, 40) + line(l - 14, 40, r + 14, 40, 'bar') + line(l, 40, l, 96, 'bar') + line(r, 40, r, 96, 'bar'), hands: xs.map((x) => [x, 70, 'v']) };
    case 'machine_handles':
      return { svg: line(l - 40, 40, l, 40, 'bar thin') + line(r, 40, r + 40, 40, 'bar thin') + line(l, 40, l, 98, 'bar') + line(r, 40, r, 98, 'bar'), hands: xs.map((x) => [x, 72, 'v']) };
    case 'rope':
      return { svg: cable(140, 22) + `<circle class="bar thin" cx="140" cy="22" r="5"/>` + xs.map((x) => `<path class="rope" d="M140,26 Q${x},36 ${x},64 L${x},108"/><circle class="knob" cx="${x}" cy="114" r="7"/>`).join(''), hands: xs.map((x) => [x, 88, 'v']) };
    case 'v_bar':
      return { svg: cable(140, 56) + `<path class="bar" d="M72,96 L128,58 L152,58 L208,96"/>`, hands: [[96, 80, 'h', 34], [184, 80, 'h', -34]] };
    default:
      return { svg: '', hands: [] };
  }
}

// side: 'L' | 'R' (그림에서 왼손 · 오른손). arm: 팔뚝이 이어지는 방향 (down | up).
function hand(x, y, kind, hand, side, arm, rot = 0) {
  const out = side === 'L' ? -1 : 1;
  const forearm = arm === 'up' ? `<rect class="arm" x="-8" y="-50" width="16" height="36" rx="6"/>` : `<rect class="arm" x="-8" y="14" width="16" height="36" rx="6"/>`;
  let body;
  if (kind === 'v') {
    // 세로 손잡이를 쥔 주먹: 손가락 마디가 바깥쪽, 엄지는 위
    const knuckles = [-11, -4, 3, 10].map((ky) => `<circle class="hand" cx="${13 * out}" cy="${ky}" r="3.4"/>`).join('');
    body = `<rect class="hand" x="-13" y="-17" width="26" height="34" rx="9"/>${knuckles}<ellipse class="hand" cx="0" cy="-19" rx="5" ry="4"/>`;
  } else if (hand === 'under') {
    // 손바닥이 보임: 말린 손가락 줄, 엄지는 바깥쪽 위
    const fingers = [-6, 0, 6].map((fy) => line(-11, fy, 11, fy, 'finger')).join('');
    body = `<rect class="hand" x="-15" y="-14" width="30" height="28" rx="9"/>${fingers}<ellipse class="hand" cx="${15 * out}" cy="-9" rx="6" ry="4.5"/>`;
  } else {
    // 손등이 보임: 위쪽에 손가락 마디 네 개
    const knuckles = [-10.5, -3.5, 3.5, 10.5].map((kx) => `<circle class="hand" cx="${kx}" cy="-14" r="3.4"/>`).join('');
    body = `<rect class="hand" x="-15" y="-14" width="30" height="28" rx="9"/>${knuckles}`;
  }
  return `<g transform="translate(${x},${y}) rotate(${rot})">${forearm}${body}</g>`;
}

// grip: grips.js 의 항목. arm: 팔 방향 (푸시다운만 up).
export function gripArt(grip, { arm = 'down' } = {}) {
  const a = grip.art;
  const xs = X[a.width] || X.shoulder;
  const { svg, hands } = attachment(a, xs);
  const guides = SH.map((x) => line(x, 4, x, 132, 'guide')).join('') + `<text x="${SH[0] - 4}" y="12" text-anchor="end">어깨</text><text x="${SH[1] + 4}" y="12">어깨</text>`;
  const hs = hands.map(([x, y, kind, rot = 0], i) => hand(x, y, kind, a.hand, i === 0 ? 'L' : 'R', arm, rot)).join('');
  return `<svg class="grip-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${grip.name}: ${grip.hold}`)}">${guides}${svg}${hs}<text class="cap" x="140" y="${H - 8}" text-anchor="middle">${esc(grip.hold)}</text></svg>`;
}
