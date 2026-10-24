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

// 부동소수 오차 없이 step 단위로 반올림. origin: 눈금의 시작(랫풀다운 스택 5 · 12.5 · 20 … 이면 5).
export function roundTo(x, step, mode = 'round', origin = 0) {
  if (!Number.isFinite(x)) return null;
  const s = step > 0 ? step : 0.5;
  const f = mode === 'floor' ? Math.floor : mode === 'ceil' ? Math.ceil : Math.round;
  const o = Number(origin) || 0;
  return Number((f((x - o) / s + 1e-9) * s + o).toFixed(3));
}

// 기구 무게 눈금. g: { inc, start, ladder } (세션 운동은 inc 대신 increment).
// ladder 가 있으면 그 목록에 있는 무게만 쓴다(헬스장 덤벨 20 뒤 26 · 30, 어브덕션 스택 25 뒤 32 · 40).
// 없으면 start 에서 inc 간격(랫풀다운 5 · 12.5 · 20 …). fallback 은 inc 가 0 일 때 쓸 간격.
export function snapW(x, g, mode = 'round', fallback = 0.5) {
  if (!Number.isFinite(x)) return null;
  const L = g?.ladder;
  if (!L?.length) {
    const inc = +(g?.inc ?? g?.increment) || 0;
    return roundTo(x, inc > 0 ? inc : fallback, mode, g?.start);
  }
  const lo = [...L].reverse().find((v) => v <= x + 1e-9) ?? L[0];
  const hi = L.find((v) => v >= x - 1e-9) ?? L[L.length - 1];
  if (mode === 'floor') return lo;
  if (mode === 'ceil') return hi;
  return x - lo <= hi - x ? lo : hi;
}

// 눈금을 n 칸 옮긴 무게. 눈금 끝을 넘지 않는다.
export function stepW(w, n, g, fallback = 0.5) {
  const L = g?.ladder;
  if (!L?.length) {
    const inc = +(g?.inc ?? g?.increment) || 0;
    const s = inc > 0 ? inc : fallback;
    return roundTo(w + n * s, s, 'round', g?.start);
  }
  const i = L.indexOf(snapW(w, g));
  return L[Math.max(0, Math.min(L.length - 1, i + n))];
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
