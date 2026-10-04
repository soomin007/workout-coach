// 버티기 타이머 시트. 준비 → (왼쪽) 버티기 → 자세 바꾸기 → (오른쪽) 버티기. 단계는 core/hold.js.
// 끝나면 { secs } 또는 { left, right } 로 돌려준다. 취소 · 뒤로가기면 null.
// 시간은 시각 차이로 계산해서, 화면이 꺼졌다 켜져도 맞는 단계로 따라잡는다.
import { sheet, closeSheet, esc } from './dom.js';
import { holdPhases, SIDE_LABEL } from '../core/hold.js';

let audio = null;
function beep(freq = 880, ms = 140) {
  try {
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.frequency.value = freq;
    g.gain.value = 0.18;
    o.connect(g).connect(audio.destination);
    o.start();
    o.stop(audio.currentTime + ms / 1000);
  } catch { /* 소리를 못 내도 타이머는 계속 */ }
}

function phaseLabel(ph) {
  const side = ph.side ? SIDE_LABEL[ph.side] : '';
  if (ph.kind === 'prep') return side ? `준비 · ${side}부터` : '준비';
  if (ph.kind === 'switch') return `자세 바꾸기 · 다음은 ${side}`;
  return side ? `${side} 버티기` : '버티기';
}

export function runHold({ title, seconds, unilateral = false, leftFirst = true }) {
  const phases = holdPhases(seconds, { unilateral, leftFirst });
  const done = {};
  let i = 0, start = Date.now(), extra = 0, pausedAt = null, lastTick = null, final = null, lock = null;
  const steps = phases.map((p, k) => `<i data-k="${k}" class="${p.kind}"></i>`).join('');
  const p = sheet(`<div id="hold" class="hold" data-testid="hold">
    <h3>${esc(title)}</h3>
    <div class="hold-steps">${steps}</div>
    <div class="hold-label" id="hold-label"></div>
    <div class="hold-num" id="hold-num"></div>
    <div class="small hold-sub" id="hold-sub"></div>
    <div class="actions"><button class="btn" id="hold-pause">일시정지</button><button class="btn" id="hold-plus">+5초</button><button class="btn primary" id="hold-next"></button></div>
    <div class="actions"><button class="btn ghost" data-sheet-value="__cancel">취소 (기록 안 함)</button></div>
  </div>`);
  const $ = (id) => document.getElementById(id);
  try { navigator.wakeLock?.request('screen').then((l) => { lock = l; }).catch(() => {}); } catch { /* 지원 안 함 */ }

  const elapsed = () => ((pausedAt ?? Date.now()) - start) / 1000;
  const advance = (actual = null) => {
    const ph = phases[i];
    if (ph.kind === 'hold') done[ph.side || 'one'] = actual ?? ph.secs + extra;
    i++; extra = 0; start = Date.now(); lastTick = null;
    if (i >= phases.length) {
      final = unilateral ? { left: done.left ?? null, right: done.right ?? null } : { secs: done.one ?? null };
      closeSheet();
      return;
    }
    navigator.vibrate?.(phases[i].kind === 'hold' ? 200 : [120, 60, 120]);
    beep(phases[i].kind === 'hold' ? 1046 : 660, phases[i].kind === 'hold' ? 300 : 160);
    draw();
  };
  const draw = () => {
    if (final || !$('hold')) return;
    const ph = phases[i];
    const left = ph.secs + extra - elapsed();
    if (left <= 0 && pausedAt === null) return advance();
    const sec = Math.ceil(left);
    if (sec <= 3 && sec !== lastTick && pausedAt === null) { lastTick = sec; beep(880, 90); }
    $('hold-label').textContent = phaseLabel(ph);
    $('hold-num').textContent = `${sec}`;
    $('hold-num').className = `hold-num ${ph.kind}`;
    const next = phases[i + 1];
    $('hold-sub').textContent = ph.kind === 'hold' ? `목표 ${ph.secs}초${next ? ` · 끝나면 자세 바꾸기 ${next.secs}초` : ''}` : `이어서 ${phaseLabel(next)} ${next.secs}초`;
    $('hold-next').textContent = ph.kind === 'hold' ? (next ? '여기까지 · 다음 쪽' : '여기까지 · 기록') : '바로 시작';
    $('hold-plus').hidden = ph.kind === 'hold';
    $('hold-pause').textContent = pausedAt === null ? '일시정지' : '계속';
    document.querySelectorAll('#hold .hold-steps i').forEach((el) => el.classList.toggle('on', +el.dataset.k <= i));
  };
  $('hold').addEventListener('click', (ev) => {
    const id = ev.target.closest('button')?.id;
    if (id === 'hold-pause') {
      if (pausedAt === null) pausedAt = Date.now();
      else { start += Date.now() - pausedAt; pausedAt = null; }
    } else if (id === 'hold-plus') extra += 5;
    else if (id === 'hold-next') {
      const ph = phases[i];
      return advance(ph.kind === 'hold' ? Math.floor(elapsed()) : null);
    } else return;
    draw();
  });
  beep(660, 160);
  draw();
  const t = setInterval(draw, 200);
  return p.then(() => {
    clearInterval(t);
    lock?.release?.().catch(() => {});
    return final;
  });
}
