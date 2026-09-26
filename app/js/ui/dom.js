// 화면 공용 도우미: 이스케이프, 토스트, 바텀시트 (prompt/confirm 대체).

export function esc(x) {
  return String(x ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 바텀시트. html 을 넣고, [data-sheet-value] 버튼을 누르면 그 값으로 resolve. 배경을 누르면 null.
// collect(root) 가 있으면 값과 함께 { value, data: collect(root) } 로 resolve.
let pending = null;
export function sheet(html, { collect = null } = {}) {
  const bd = document.getElementById('sheet');
  const box = bd.querySelector('.sheet');
  if (pending) pending(null);
  box.innerHTML = html;
  bd.classList.remove('hidden');
  return new Promise((resolve) => {
    const done = (v) => {
      pending = null;
      bd.classList.add('hidden');
      bd.onclick = null;
      box.innerHTML = '';
      resolve(v);
    };
    pending = done;
    bd.onclick = (ev) => {
      if (ev.target === bd) { done(null); return; }
      const b = ev.target.closest('[data-sheet-value]');
      if (!b) return;
      const value = b.dataset.sheetValue;
      if (value === '__cancel') { done(null); return; }
      done(collect ? { value, data: collect(box) } : value);
    };
    // 키패드의 완료(Enter)를 누르면 시트의 주 버튼을 누른 것으로 처리한다 (여러 줄 입력칸은 제외).
    box.onkeydown = (ev) => {
      if (ev.key !== 'Enter' || ev.isComposing || ev.target.tagName !== 'INPUT') return;
      const ok = box.querySelector('.btn.primary[data-sheet-value]');
      if (!ok) return;
      ev.preventDefault();
      ok.click();
    };
    const first = box.querySelector('input,textarea');
    if (first) setTimeout(() => first.focus(), 60);
  });
}

export function closeSheet() {
  if (pending) pending(null);
}

export async function confirmSheet(message, { ok = '확인', cancel = '취소', danger = false } = {}) {
  const v = await sheet(`<h3>${esc(message)}</h3><div class="actions"><button class="btn" data-sheet-value="__cancel">${esc(cancel)}</button><button class="btn ${danger ? 'danger' : 'primary'}" data-sheet-value="ok">${esc(ok)}</button></div>`);
  return v === 'ok';
}

export async function choiceSheet(title, items, { note = '' } = {}) {
  const list = items.map((it) => `<button data-sheet-value="${esc(it.value)}"${it.disabled ? ' disabled' : ''}>${esc(it.label)}${it.hint ? `<span class="tiny">${esc(it.hint)}</span>` : ''}</button>`).join('');
  return sheet(`<h3>${esc(title)}</h3>${note ? `<p class="small">${esc(note)}</p>` : ''}<div class="list">${list}</div><div class="actions"><button class="btn" data-sheet-value="__cancel">닫기</button></div>`);
}

export async function numberSheet(title, value, { step = 'any', suffix = '', zeroLabel = '' } = {}) {
  const r = await sheet(`<h3>${esc(title)}</h3>${zeroLabel ? `<p class="small">${esc(zeroLabel)}</p>` : ''}<div class="row"><input type="number" inputmode="decimal" enterkeyhint="done" step="${step}" min="0" name="n" value="${value ?? ''}" style="flex:1"><span class="small">${esc(suffix)}</span></div>
    <div class="actions"><button class="btn" data-sheet-value="clear">비우기</button><button class="btn primary" data-sheet-value="ok">확인</button></div>`, { collect: (b) => b.querySelector('[name=n]').value });
  if (!r) return undefined;
  if (r.value === 'clear') return null;
  const n = Number(r.data);
  return r.data === '' ? null : Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function textSheet(title, value = '', { placeholder = '', hint = '', multiline = false } = {}) {
  const input = multiline
    ? `<textarea name="t" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input type="text" name="t" enterkeyhint="done" placeholder="${esc(placeholder)}" value="${esc(value)}">`;
  const r = await sheet(`<h3>${esc(title)}</h3>${hint ? `<p class="small">${esc(hint)}</p>` : ''}${input}<div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok">확인</button></div>`, { collect: (b) => b.querySelector('[name=t]').value });
  return r ? r.data : null;
}
