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
      return { svg: cable(140, 56) + `<path class="bar" d="M72,96 L128,58 L152,58 L208,96"/>`, hands: [[96, 80, 'h', -34], [184, 80, 'h', 34]] };
    default:
      return { svg: '', hands: [] };
  }
}

// 손 하나. 왼손 기준으로 그리고(엄지 쪽 = +x, 몸 가운데 쪽) 오른손은 좌우로 뒤집는다.
// arm 'up'(푸시다운)은 위아래로 뒤집어 팔뚝이 위로 가게 한다.
// over: 손등이 보이고, 네 손가락이 바 위로 넘어가며, 엄지는 안쪽에서 바 아래를 감싼다.
// under: 손바닥(손금)이 보이고, 손가락이 바 너머에서 넘어와 손톱 끝이 나를 향한다. 엄지는 바깥쪽.
// v(세로 손잡이): 손등이 바깥쪽 옆면, 네 손가락이 손잡이를 가로질러 안쪽에서 끝나고, 엄지는 위에서 감싼다.
const finger = (x, y, w, h, nail = null) => `<rect class="hand" x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}"/>` +
  (nail === 'bottom' ? `<rect class="nail" x="${x + 1.2}" y="${y + h - 4.6}" width="${w - 2.4}" height="3.4" rx="1.4"/>` : nail === 'right' ? `<rect class="nail" x="${x + w - 4.6}" y="${y + 1.2}" width="3.4" height="${h - 2.4}" rx="1.4"/>` : '');

function leftHand(kind, hand) {
  const forearm = `<rect class="arm" x="-10" y="30" width="20" height="34" rx="7"/>`;
  if (kind === 'v') {
    // 주먹을 앞에서 본 모양: 바깥쪽은 손등, 안쪽은 굽힌 네 손가락(주름선 셋), 엄지는 위에서 감싼다
    const creases = [-3, 8, 19].map((y) => line(-5, y, 11, y, 'crease')).join('');
    return `<rect class="arm" x="-13" y="30" width="18" height="34" rx="7"/><rect class="hand" x="-17" y="-15" width="30" height="47" rx="11"/>${line(-5, -10, -5, 28, 'crease')}${creases}<ellipse class="hand" cx="0" cy="-16" rx="11" ry="5.5"/>`;
  }
  if (hand === 'under') {
    const fingers = [-13.5, -6.5, 0.5, 7.5].map((x) => finger(x, -8, 6, 17, 'bottom')).join('');
    const palm = `<path class="hand" d="M-15,13 Q-15,10 -12,10 L12,10 Q15,10 15,13 L11,34 L-11,34 Z"/><path class="crease" d="M-10,18 Q0,24 10,17"/>`;
    return `${forearm}${palm}${fingers}<ellipse class="hand" cx="-15" cy="6" rx="4.6" ry="9" transform="rotate(25 -15 6)"/>`;
  }
  const heights = [12, 15, 16, 14];
  const fingers = [-13.5, -6.5, 0.5, 7.5].map((x, k) => finger(x, 2 - heights[k], 6, heights[k] + 2)).join('');
  const back = `<path class="hand" d="M-11,32 L-15,5 Q-15,1 -11,1 L11,1 Q15,1 15,5 L11,32 Z"/>`;
  return `${forearm}${back}${fingers}<ellipse class="hand" cx="15" cy="12" rx="4.6" ry="9" transform="rotate(-25 15 12)"/>`;
}

function hand(x, y, kind, grip, side, arm, rot = 0) {
  const sx = side === 'L' ? 1 : -1, sy = arm === 'up' ? -1 : 1;
  return `<g transform="translate(${x},${y}) rotate(${rot}) scale(${sx},${sy})">${leftHand(kind, grip)}</g>`;
}

// grip: grips.js 의 항목. arm: 팔 방향 (푸시다운만 up).
export function gripArt(grip, { arm = 'down' } = {}) {
  const a = grip.art;
  const xs = X[a.width] || X.shoulder;
  const { svg, hands } = attachment(a, xs);
  const guides = SH.map((x) => line(x, 4, x, 132, 'guide')).join('') + `<text x="${SH[0] - 4}" y="12" text-anchor="end">어깨</text><text x="${SH[1] + 4}" y="12">어깨</text>`;
  const hs = hands.map(([x, y, kind, rot = 0], i) => hand(x, y, kind, a.hand, i === 0 ? 'L' : 'R', arm, rot)).join('');
  return `<svg class="grip-art" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(`${grip.name}: ${grip.hold}`)}">${guides}<g transform="translate(0,${arm === 'up' ? 24 : 0})">${svg}${hs}</g><text class="cap" x="140" y="${H - 8}" text-anchor="middle">${esc(grip.hold)}</text></svg>`;
}
