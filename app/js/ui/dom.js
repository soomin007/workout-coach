// 화면 공용 도우미: 이스케이프, 토스트, 바텀시트 (prompt/confirm 대체).

export function esc(x) {
  return String(x ?? '').replace(/[&<>'"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[c]));
}

let toastTimer = null;
export function toast(msg, ms = 2200) {
  if (!msg) return;
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 바텀시트. html 을 넣고, [data-sheet-value] 버튼을 누르면 그 값으로 resolve. 배경을 누르면 null.
// collect(root) 가 있으면 값과 함께 { value, data: collect(root) } 로 resolve.
//
// 뒤로가기: 시트가 열리면 방문 기록을 하나 쌓고, 뒤로가기(popstate)는 시트만 닫는다.
// 버튼으로 닫을 때는 쌓은 기록을 history.back() 으로 되돌리며, 그 popstate 는 무시한다.
// 되돌리기가 끝나기 전에 다음 시트가 열리면 기록이 꼬이므로 settle 을 기다린 뒤 쌓는다.
let pending = null;
let hasEntry = false;
let ignorePop = 0;
let settle = Promise.resolve();
let settleResolve = null;

function pushEntry() {
  settle.then(() => {
    if (pending && !hasEntry) { history.pushState({ sheet: true }, ''); hasEntry = true; }
  });
}

// popstate 에서 호출. 시트 관련으로 처리했으면 true.
export function handleSheetBack() {
  if (ignorePop > 0) {
    ignorePop--;
    if (ignorePop === 0 && settleResolve) { settleResolve(); settleResolve = null; }
    return true;
  }
  if (pending) { hasEntry = false; pending(null, { fromBack: true }); return true; }
  return false;
}

export function sheetOpen() { return !!pending; }

export function sheet(html, { collect = null } = {}) {
  const bd = document.getElementById('sheet');
  const box = bd.querySelector('.sheet');
  if (pending) pending(null, { replacing: true });
  box.innerHTML = html;
  bd.classList.remove('hidden');
  return new Promise((resolve) => {
    const done = (v, { replacing = false, fromBack = false } = {}) => {
      pending = null;
      if (!replacing) {
        bd.classList.add('hidden');
        bd.onclick = null;
        box.innerHTML = '';
        if (hasEntry && !fromBack) {
          hasEntry = false;
          ignorePop++;
          settle = new Promise((r) => { settleResolve = r; });
          history.back();
        }
      }
      resolve(v);
    };
    pending = done;
    pushEntry();
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
    // 그 사이 사용자가 다른 칸을 눌렀으면 포커스를 빼앗지 않는다 (빼앗으면 입력이 엉뚱한 칸으로 간다)
    if (first) setTimeout(() => { if (!box.contains(document.activeElement)) first.focus(); }, 60);
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

// 숫자 입력 시트: 화면 키패드(Leap 방식, 폰 키보드를 띄우지 않는다) + 최근 칩.
// recent: 최근 값 칩(누르면 그 값). combos: [{ label, weight, reps }] 무게 × 횟수 칩(누르면 둘 다).
// 반환: 숫자 | null(비우기) | { weight, reps }(묶음 칩) | undefined(취소 · 잘못된 값).
export async function numberSheet(title, value, { step = 'any', suffix = '', zeroLabel = '', recent = [], combos = [] } = {}) {
  const chipRow = (label, items) => (items.length ? `<div class="tiny" style="margin-top:4px">${label}</div><div class="row recent-vals" style="margin:4px 0 8px">${items}</div>` : '');
  const chips = chipRow('최근 사용', combos.map((c, i) => `<button class="chip" data-sheet-value="c:${i}">${esc(c.label)}</button>`).join(''))
    || chipRow('최근 무게', recent.map((x) => `<button class="chip" data-sheet-value="v:${esc(x)}">${esc(x)}</button>`).join(''));
  const dec = step !== '1';
  const key = (k, cls = '') => `<button type="button" class="key${cls}" data-key="${k}">${k === 'back' ? '⌫' : k}</button>`;
  const pad = `<div class="keypad">${['1', '2', '3'].map((k) => key(k)).join('')}${key('back', ' fn')}${['4', '5', '6'].map((k) => key(k)).join('')}<button type="button" class="key fn" data-key="kbd" aria-label="폰 키보드로 입력">자판</button>${['7', '8', '9'].map((k) => key(k)).join('')}<button class="key ok btn primary" data-sheet-value="ok">확인</button>${dec ? key('.') : '<span></span>'}${key('0')}<button class="key fn" data-sheet-value="clear">비우기</button></div>`;
  const p = sheet(`<h3>${esc(title)}</h3>${zeroLabel ? `<p class="small">${esc(zeroLabel)}</p>` : ''}${chips}<div class="row num-display"><input type="text" inputmode="none" enterkeyhint="done" autocomplete="off" name="n" value="${value ?? ''}" style="flex:1"><span class="small">${esc(suffix)}</span></div>${pad}`,
    { collect: (b) => b.querySelector('[name=n]').value });
  const box = document.querySelector('#sheet .sheet');
  const input = box.querySelector('[name=n]');
  let fresh = true; // 첫 숫자는 기존 값을 바꿔 쓴다 (Leap 처럼 값이 선택된 상태)
  box.querySelector('.keypad').addEventListener('click', (ev) => {
    const k = ev.target.closest('[data-key]')?.dataset.key;
    if (!k) return;
    if (k === 'kbd') { input.inputMode = dec ? 'decimal' : 'numeric'; input.focus(); return; }
    let v = fresh ? '' : input.value;
    fresh = false;
    if (k === 'back') v = v.slice(0, -1);
    else if (k === '.') { if (!v.includes('.')) v = (v || '0') + '.'; }
    else v += k;
    input.value = v;
  });
  input.addEventListener('input', () => { fresh = false; });
  const r = await p;
  if (!r) return undefined;
  if (r.value === 'clear') return null;
  if (r.value.startsWith('v:')) return Number(r.value.slice(2));
  if (r.value.startsWith('c:')) { const c = combos[+r.value.slice(2)]; return c ? { weight: c.weight, reps: c.reps } : undefined; }
  const raw = String(r.data).replace(/\.$/, '');
  const n = Number(raw);
  return raw === '' ? null : Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function textSheet(title, value = '', { placeholder = '', hint = '', multiline = false } = {}) {
  const input = multiline
    ? `<textarea name="t" autocomplete="off" placeholder="${esc(placeholder)}">${esc(value)}</textarea>`
    : `<input type="text" name="t" autocomplete="off" enterkeyhint="done" placeholder="${esc(placeholder)}" value="${esc(value)}">`;
  const r = await sheet(`<h3>${esc(title)}</h3>${hint ? `<p class="small">${esc(hint)}</p>` : ''}${input}<div class="actions"><button class="btn" data-sheet-value="__cancel">취소</button><button class="btn primary" data-sheet-value="ok">확인</button></div>`, { collect: (b) => b.querySelector('[name=t]').value });
  return r ? r.data : null;
}
