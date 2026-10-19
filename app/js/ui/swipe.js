// 세트 줄을 왼쪽으로 밀어 지우기 (10/19 메모, Strong · Hevy 방식). 지운 뒤 토스트의 되돌리기로 살린다.
// 세로 스크롤과 다투지 않도록 처음 움직임이 가로로 뚜렷할 때만 스와이프로 잡는다.
// 밀다가 놓은 손가락의 click 은 버튼(✓ · 스테퍼)으로 가지 않게 한 번 막는다.

const DECIDE = 10;     // 이만큼 움직이면 가로인지 세로인지 정한다(px)
const ARM = 0.35;      // 줄 폭의 이 비율 넘게 밀고 놓으면 삭제

export function bindSwipeDelete(root, onDelete) {
  let g = null;
  let swallowClick = false;

  root.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0 || g) return;
    const row = ev.target.closest('.sets .set');
    const card = row?.closest('[data-uid]');
    if (!row || !card) return;
    g = { row, uid: card.dataset.uid, index: +row.dataset.set, id: ev.pointerId, x: ev.clientX, y: ev.clientY, dx: 0, mode: null };
  });

  root.addEventListener('pointermove', (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const dx = ev.clientX - g.x, dy = ev.clientY - g.y;
    if (!g.mode) {
      if (Math.abs(dx) < DECIDE && Math.abs(dy) < DECIDE) return;
      g.mode = dx < 0 && Math.abs(dx) > Math.abs(dy) * 1.2 ? 'swipe' : 'none';
      if (g.mode === 'swipe') { g.row.classList.add('swiping'); try { g.row.setPointerCapture(g.id); } catch { /* 이미 끝난 포인터 */ } }
    }
    if (g.mode !== 'swipe') return;
    g.dx = Math.min(0, dx);
    g.row.style.transform = `translateX(${g.dx}px)`;
    g.row.classList.toggle('armed', -g.dx > g.row.offsetWidth * ARM);
  });

  const end = (ev) => {
    if (!g || ev.pointerId !== g.id) return;
    const { row, mode, dx, uid, index } = g;
    g = null;
    if (mode !== 'swipe') return;
    swallowClick = ev.type === 'pointerup';
    setTimeout(() => { swallowClick = false; }, 400);
    row.classList.remove('swiping', 'armed');
    if (ev.type === 'pointerup' && -dx > row.offsetWidth * ARM) {
      row.classList.add('swipe-out');
      row.style.transform = 'translateX(-110%)';
      setTimeout(() => onDelete(uid, index), 160);
      return;
    }
    row.classList.add('swipe-back');
    row.style.transform = '';
    setTimeout(() => row.classList.remove('swipe-back'), 200);
  };
  root.addEventListener('pointerup', end);
  root.addEventListener('pointercancel', end);

  root.addEventListener('click', (ev) => {
    if (!swallowClick) return;
    swallowClick = false;
    ev.stopPropagation();
    ev.preventDefault();
  }, { capture: true });
}
