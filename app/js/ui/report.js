// 리포트 (Leap 의 리포트 탭): 이번 주 요약 · 최근 8주 본세트 · 근육별 주간 세트 · 운동별 추이.
// 차트 규칙(dataviz): 한 계열은 강조색 하나, 막대 위쪽 4px 둥글게, 선 2px · 점 8px + 바탕색 테두리,
// 값 표시는 선택적으로(마지막 값만), 축 · 격자는 흐리게, 표로 보기를 같이 둔다. 글자는 데이터 색을 쓰지 않는다.
import { esc } from './dom.js';
import { MUSCLE_LABEL, MUSCLE_BUDGET } from '../core/catalog.js';
import { muscleSets } from '../core/plan.js';
import { estimate1RM, profileFor } from '../core/coach.js';
import { setReps } from '../core/schema.js';
import { parseDateLocal, localISODate } from '../core/util.js';

const DAY = 86400000;
const mondayOf = (d) => { const m = new Date(d); m.setHours(0, 0, 0, 0); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
const md = (d) => `${d.getMonth() + 1}/${d.getDate()}`;

// 깔끔한 눈금: 0 과 최댓값을 덮는 1 · 2 · 5 × 10^n 간격
function niceMax(v) {
  if (v <= 0) return 4;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const k of [1, 2, 2.5, 5, 10]) if (k * p >= v) return k * p;
  return 10 * p;
}

function weeks(state, now, n = 8) {
  const start = mondayOf(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push({ from: new Date(start.getTime() - i * 7 * DAY), sets: 0, sessions: 0, minutes: 0 });
  for (const h of state.history) {
    const d = parseDateLocal(h.date);
    if (!d) continue;
    const w = out.find((x) => d >= x.from && d < new Date(x.from.getTime() + 7 * DAY));
    if (!w) continue;
    w.sets += Number(h.workSets) || 0;
    w.sessions++;
    w.minutes += h.durationSec ? Math.round(h.durationSec / 60) : 0;
  }
  return out;
}

function weeklyChart(ws) {
  const W = 320, H = 150, L = 30, R = 8, T = 16, B = 124;
  const max = niceMax(Math.max(...ws.map((w) => w.sets)));
  const slot = (W - L - R) / ws.length, bw = Math.min(26, slot * 0.62);
  const y = (v) => B - (v / max) * (B - T);
  const ticks = [0, max / 2, max];
  const grid = ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${t}</text>`).join('');
  const bars = ws.map((w, i) => {
    const x = L + slot * i + (slot - bw) / 2, top = y(w.sets), h = B - top, r = Math.min(4, h);
    const path = h > 0 ? `M${x},${B} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${B} Z` : '';
    const last = i === ws.length - 1;
    return `<g class="bar-g"><title>${md(w.from)} 주: 본세트 ${w.sets} · 운동 ${w.sessions}회 · ${w.minutes}분</title>
      <rect class="hit" x="${L + slot * i}" y="${T}" width="${slot}" height="${B - T}"/>${path ? `<path class="bar" d="${path}"/>` : ''}
      ${last && w.sets ? `<text class="val" x="${x + bw / 2}" y="${top - 4}" text-anchor="middle">${w.sets}</text>` : ''}
      <text class="tick" x="${x + bw / 2}" y="${B + 16}" text-anchor="middle">${md(w.from)}</text></g>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="최근 8주 주간 본세트">${grid}<line class="axis" x1="${L}" x2="${W - R}" y1="${B}" y2="${B}"/>${bars}</svg>`;
}

function trendChart(pts, unit) {
  const W = 320, H = 150, L = 34, R = 50, T = 16, B = 124;
  const vals = pts.map((p) => p.v);
  let lo = Math.min(...vals), hi = Math.max(...vals);
  if (hi === lo) { lo = Math.max(0, lo - 1); hi += 1; }
  const pad = (hi - lo) * 0.15; lo = Math.max(0, lo - pad); hi += pad;
  const x = (i) => (pts.length === 1 ? (L + W - R) / 2 : L + ((W - L - R) * i) / (pts.length - 1));
  const y = (v) => B - ((v - lo) / (hi - lo)) * (B - T);
  const fmt = (v) => String(Math.round(v));
  const ticks = [lo, (lo + hi) / 2, hi];
  const grid = ticks.map((t) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(t)}" y2="${y(t)}"/><text class="tick" x="${L - 6}" y="${y(t) + 4}" text-anchor="end">${Math.round(t)}</text>`).join('');
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i)},${y(p.v)}`).join(' ');
  const dots = pts.map((p, i) => `<g><title>${esc(p.date)}: ${esc(p.text)}</title><circle class="hit" cx="${x(i)}" cy="${y(p.v)}" r="12"/><circle class="dot" cx="${x(i)}" cy="${y(p.v)}" r="4"/></g>`).join('');
  const last = pts[pts.length - 1];
  const dl = (d) => { const z = parseDateLocal(d); return z ? md(z) : d; };
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="운동별 추이">${grid}<line class="axis" x1="${L}" x2="${W - R}" y1="${B}" y2="${B}"/>
    <path class="line" d="${line}"/>${dots}
    <text class="val" x="${x(pts.length - 1) + 8}" y="${y(last.v) + 4}">${fmt(last.v)}${unit}</text>
    <text class="tick" x="${x(0)}" y="${B + 16}" text-anchor="${pts.length === 1 ? 'middle' : 'start'}">${dl(pts[0].date)}</text>
    ${pts.length > 1 ? `<text class="tick" x="${x(pts.length - 1)}" y="${B + 16}" text-anchor="end">${dl(last.date)}</text>` : ''}</svg>`;
}

// 운동 한 번의 대표값: 무게가 있으면 추정 최대 무게(Epley + 남은 반복), 없으면 최고 반복(또는 초)
function sessionPoint(p) {
  const mains = (p.sets || []).filter((z) => z.done && z.type === 'main' && setReps(z) !== null);
  if (!mains.length) return null;
  const sec = p.measure === 'seconds';
  const weighted = mains.filter((z) => z.weight > 0 && !sec);
  if (weighted.length) {
    const best = weighted.map((z) => ({ z, e: estimate1RM(z.weight, setReps(z), z.rir) })).filter((x) => x.e).sort((a, b) => b.e - a.e)[0];
    if (best) return { v: Math.round(best.e * 10) / 10, kind: 'e1rm', text: `${best.z.weight}kg × ${setReps(best.z)}회 → 추정 최대 ${Math.round(best.e)}kg` };
  }
  const r = Math.max(...mains.map(setReps));
  return { v: r, kind: sec ? 'sec' : 'reps', text: `최고 ${r}${sec ? '초' : '회'}` };
}

export function exerciseTrend(state, id) {
  const recs = (state.performance || []).filter((p) => p.exerciseId === id && !p.heavy).sort((a, b) => a.date.localeCompare(b.date));
  const pts = recs.map((p) => ({ date: p.date, ...sessionPoint(p) })).filter((x) => x.v !== undefined && x.v !== null);
  const kind = pts.find((x) => x.kind === 'e1rm') ? 'e1rm' : pts[0]?.kind;
  return { pts: pts.filter((x) => x.kind === kind).slice(-12), kind };
}

export function renderReport(state, ui, now = new Date()) {
  const ws = weeks(state, now);
  const cur = ws[ws.length - 1];
  const tiles = [['이번 주 운동', `${cur.sessions}회`], ['본세트', `${cur.sets}`], ['운동 시간', `${cur.minutes}분`]]
    .map(([l, v]) => `<div class="tile"><span class="small">${l}</span><b>${v}</b></div>`).join('');
  const weekTable = `<details class="more"><summary>표로 보기</summary><table class="mini"><tr><th>주</th><th>운동</th><th>본세트</th><th>시간</th></tr>${ws.slice().reverse().map((w) => `<tr><td>${md(w.from)}</td><td>${w.sessions}</td><td>${w.sets}</td><td>${w.minutes}분</td></tr>`).join('')}</table></details>`;

  const muscles = Object.keys(MUSCLE_BUDGET).map((m) => ({ m, n: muscleSets(state, m, now), b: MUSCLE_BUDGET[m] }));
  const meters = muscles.map(({ m, n, b }) => `<div class="meter-row"><span>${esc(MUSCLE_LABEL[m] || m)}</span><span class="meter"><i style="width:${Math.min(100, (n / b) * 100)}%"></i></span><span class="small">${n}/${b}</span></div>`).join('');

  const done = [...new Set((state.performance || []).map((p) => p.exerciseId))];
  const pick = ui.reportEx && done.includes(ui.reportEx) ? ui.reportEx : done[done.length - 1];
  let trend = '<p class="small">운동 기록이 쌓이면 운동별 추이가 나옵니다.</p>';
  if (pick) {
    const { pts, kind } = exerciseTrend(state, pick);
    const unit = kind === 'e1rm' ? 'kg' : kind === 'sec' ? '초' : '회';
    const opts = done.map((id) => `<option value="${esc(id)}"${id === pick ? ' selected' : ''}>${esc(profileFor(state, id)?.name || id)}</option>`).join('');
    trend = `<select data-action="report-ex" aria-label="운동 고르기">${opts}</select>
      <div class="small" style="margin:6px 0">${kind === 'e1rm' ? '세션마다 가장 좋은 세트로 계산한 추정 최대 무게(kg)' : kind === 'sec' ? '세션마다 가장 오래 버틴 시간(초)' : '세션마다 최고 반복 수'}</div>
      ${pts.length ? trendChart(pts, unit) : '<p class="small">평소 기록이 아직 없습니다.</p>'}
      ${pts.length ? `<details class="more"><summary>표로 보기</summary><table class="mini"><tr><th>날짜</th><th>내용</th></tr>${pts.slice().reverse().map((p) => `<tr><td>${esc(p.date)}</td><td>${esc(p.text)}</td></tr>`).join('')}</table></details>` : ''}`;
  }
  return `<section class="card report" data-testid="report">
      <h3>이번 주</h3><div class="tiles">${tiles}</div>
      <h3 style="margin-top:14px">최근 8주 본세트</h3>${weeklyChart(ws)}${weekTable}
    </section>
    <section class="card report"><h3>운동별 추이</h3>${trend}</section>
    <section class="card report"><h3>근육별 이번 주 세트</h3><div class="small" style="margin-bottom:6px">최근 7일 · 목표 대비 (보조로 쓴 세트는 절반으로 셈)</div>${meters}</section>`;
}
