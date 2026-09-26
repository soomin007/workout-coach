// DOM 을 모르는 공용 도우미.

export function localISODate(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateLocal(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return null;
  const [y, m, d] = str.split('-').map(Number);
  const x = new Date(y, m - 1, d, 12, 0, 0, 0);
  return Number.isNaN(x.getTime()) ? null : x;
}

export function endOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x.getTime();
}

// '' · null · undefined · 숫자 아님 → null. 0 은 0 (빈 RIR 과 RIR 0 을 구분한다).
export function toNum(x) {
  if (x === null || x === undefined || String(x).trim() === '') return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

// 부동소수 오차 없이 step 단위로 반올림.
export function roundTo(x, step, mode = 'round') {
  if (!Number.isFinite(x)) return null;
  const s = step > 0 ? step : 0.5;
  const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
  return Number((f(x / s + 1e-9) * s).toFixed(3));
}

export function clamp(x, lo, hi) {
  return Math.max(lo, Math.min(hi, x));
}

export function newId(prefix = 'u') {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

export function clone(x) {
  return structuredClone(x);
}
