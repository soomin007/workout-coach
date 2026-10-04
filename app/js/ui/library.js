// 운동 탭(라이브러리)과 운동 상세 시트. 운동 중이 아닐 때도 설명 · 근육 · 그립 · 지난 기록을 본다 (2026-10-03 사용자 요청).
// 화면 구성은 Leap 앱의 운동 탭 · 운동 상세(설명 · 기록)를 따른다 (docs/LEAP_UI_PLAN.md).
import { esc } from './dom.js';
import { ALL_CATALOG, EQUIPMENT, MUSCLE_LABEL, LOAD_MODES } from '../core/catalog.js';
import { profileFor, prescribeForOrder } from '../core/coach.js';
import { guideFor } from '../core/guide.js';
import { gripsFor, gripById, gripArm, lastGrip, gripOf } from '../core/grips.js';
import { setReps, EFFORT_LABEL } from '../core/schema.js';
import { gripArt } from './gripart.js';
import { bodyMap } from './bodymap.js';
import { exerciseImages } from '../core/media.js';

const MODE_LABEL = Object.fromEntries(LOAD_MODES);
const MUSCLE_X = { ...MUSCLE_LABEL, core: '복근', brachialis: '상완근' };
// 부위 칩 (Leap 의 집중 영역 분류): 근육 키 → 칩
export const LIB_GROUPS = [['all', '전체'], ['chest', '가슴'], ['back', '등'], ['shoulder', '어깨'], ['arm', '팔'], ['core', '복근'], ['leg', '다리']];
const GROUP_OF = { chest: 'chest', back: 'back', upper_back: 'back', front_delt: 'shoulder', side_delt: 'shoulder', rear_delt: 'shoulder', biceps: 'arm', triceps: 'arm', brachialis: 'arm', core: 'core', quads: 'leg', hamstring: 'leg', glute: 'leg', calf: 'leg' };

const names = (xs) => xs.map((m) => MUSCLE_X[m] || m).join(', ');

function allExercises(state) {
  const custom = (state.customExercises || []).map((x) => x.id);
  return [...ALL_CATALOG.map((x) => x.id), ...custom].map((id) => profileFor(state, id)).filter(Boolean);
}

function searchText(p) {
  const base = ALL_CATALOG.find((x) => x.id === p.id);
  return [p.name, ...(base?.aliases || []), names(p.primary), names(p.secondary), EQUIPMENT[p.equipment] || ''].join(' ').toLowerCase();
}

export function renderLibrary(state, ui) {
  const group = ui.libGroup || 'all';
  const q = (ui.libQuery || '').trim().toLowerCase();
  const unav = new Set(state.settings.unavailableExercises || []);
  const items = allExercises(state).filter((p) => group === 'all' || p.primary.some((m) => GROUP_OF[m] === group));
  const list = items.map((p) => {
    const text = searchText(p);
    return `<button class="lib-item${q && !text.includes(q) ? ' hidden' : ''}" data-action="ex-detail" data-id="${esc(p.id)}" data-search="${esc(text)}">
      <span class="lib-thumb" aria-hidden="true">${exerciseImages(p.id)[0] ? `<img class="ex-img" src="${exerciseImages(p.id)[0]}" alt="" loading="lazy" decoding="async">` : bodyMap(p)}</span>
      <span class="lib-txt"><b>${esc(p.name)}</b><span class="small">${esc(names(p.primary))} · ${esc(EQUIPMENT[p.equipment] || '맨몸')}</span>${unav.has(p.id) ? '<span class="tiny">이 헬스장에 없음으로 제외됨</span>' : ''}</span>
    </button>`;
  }).join('');
  return `<section class="lib-head">
      <h2>운동</h2>
      <input type="search" class="lib-search" data-action="lib-q" placeholder="운동 · 근육 · 장비 검색" value="${esc(ui.libQuery || '')}" aria-label="운동 검색">
      <div class="row lib-groups">${LIB_GROUPS.map(([k, l]) => `<button class="chip${group === k ? ' on' : ''}" data-action="lib-group" data-g="${k}">${l}</button>`).join('')}</div>
    </section>
    <div class="lib-list" data-testid="lib-list">${list || '<div class="small">이 부위 운동이 없습니다.</div>'}</div>`;
}

function recSummary(p) {
  const u = p.measure === 'seconds' ? '초' : '회';
  return (p.sets || []).filter((z) => z.done && z.type === 'main').map((z) => {
    const r = z.split ? `L${z.leftReps ?? '-'}/R${z.rightReps ?? '-'}` : `${setReps(z) ?? '-'}`;
    return `${z.weight !== null && z.weight !== undefined ? `${z.weight}kg × ` : ''}${r}${u}`;
  }).join(', ');
}

// 운동 상세 시트: 설명 탭(근육 지도 · 방법 · 주의 · 그립) · 기록 탭(다음 처방 · 지난 기록)
export function exerciseDetailHtml(state, id) {
  const p = profileFor(state, id);
  if (!p) return '<h3>운동을 찾을 수 없습니다.</h3>';
  const g = guideFor(id);
  const grips = gripsFor(id);
  const gNow = grips ? lastGrip(state, id) : null;
  const list = (xs, tag) => `<${tag}>${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</${tag}>`;
  const u = p.measure === 'seconds' ? '초' : '회';
  const facts = [
    ['집중 영역', names(p.primary)], ['보조', p.secondary.length ? names(p.secondary) : '-'],
    ['장비', EQUIPMENT[p.equipment] || '맨몸'], ['목표', `${p.range[0]}~${p.range[1]}${u} · 휴식 ${p.rest}초`],
    ['무게 적는 법', MODE_LABEL[p.mode] || p.mode],
  ].map(([k, v]) => `<div class="fact"><span>${k}</span><b>${esc(v)}</b></div>`).join('');
  const gripHtml = grips ? `<div class="guide-h">그립</div><div class="grip-list compact">${grips.map((x) => `<div class="grip-opt${x.id === gNow ? ' on' : ''}">${gripArt(x, { arm: gripArm(id) })}<div class="grip-name">${esc(x.name)}${x.id === gNow ? ' <span class="tag">지난번</span>' : ''}</div><p class="small">${esc(x.emphasis)}</p></div>`).join('')}</div>` : '';
  const imgs = exerciseImages(id, gNow);
  const frames = imgs.length ? `<div class="ex-frames${imgs.length === 1 ? ' one' : ''}" data-testid="ex-frames">${imgs.map((src, k) => `<figure><img src="${src}" alt="${esc(p.name)} ${imgs.length === 1 ? '자세' : k ? '끝 자세' : '시작 자세'}" loading="lazy"><figcaption>${imgs.length === 1 ? '자세' : k ? '끝' : '시작'}</figcaption></figure>`).join('')}</div>` : '';
  const desc = `${frames}${bodyMap(p, { label: `${p.name} 근육 지도` })}
    <div class="facts">${facts}</div>
    ${g ? `<div class="guide-h">하는 방법</div>${list(g.how, 'ol')}<div class="guide-h">주의할 점</div>${list(g.caution, 'ul')}` : '<p class="small">직접 만든 운동이라 설명이 없습니다.</p>'}
    ${p.cue ? `<div class="guide-h">내 체크 포인트</div><p>${esc(p.cue)}</p>` : ''}
    ${gripHtml}`;
  const recs = (state.performance || []).filter((x) => x.exerciseId === id).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
  const rx = prescribeForOrder(p, state, null, gNow);
  const hist = `<div class="rx-next"><div class="guide-h">다음에 하면</div><p>${esc(rx.note)}</p></div>
    ${recs.length ? `<div class="guide-h">지난 기록</div><div class="rec-list">${recs.map((r) => `<div class="rec-row"><span class="small">${esc(r.date)}${r.heavy ? ' · 무거운 날' : ''}${gripsFor(id) ? ` · ${esc(gripById(id, gripOf(r))?.short || '')}` : ''}</span><b>${esc(recSummary(r))}</b>${r.effort ? `<span class="tiny">${EFFORT_LABEL[r.effort]}</span>` : ''}</div>`).join('')}</div>` : '<p class="small">아직 기록이 없습니다.</p>'}`;
  return `<div class="ex-detail" data-testid="ex-detail">
    <div class="seg" role="tablist"><button class="on" data-pane="desc" role="tab">설명</button><button data-pane="hist" role="tab">기록</button></div>
    <h3>${esc(p.name)}</h3>
    <div class="pane" data-pane="desc">${desc}</div>
    <div class="pane hidden" data-pane="hist">${hist}</div>
    <div class="actions"><button class="btn primary" data-sheet-value="__cancel">닫기</button></div>
  </div>`;
}
