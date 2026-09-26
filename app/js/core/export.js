// CSV · TXT 내보내기 (JSON 은 store.exportJSON).
import { setReps, EFFORT_LABEL } from './schema.js';
import { PART_LABEL } from './catalog.js';

const LOAD_LABEL = { total: '총중량', per_side: '한쪽당', per_dumbbell: '덤벨 1개당', machine: '머신', bodyweight: '체중', assist: '보조' };

export function toCSV(state) {
  const rows = [['session_id', 'date', 'part', 'exercise_id', 'name', 'slot', 'load_mode', 'increment', 'set', 'type', 'weight', 'reps', 'left_reps', 'right_reps', 'rir', 'rest_before_sec', 'effort', 'memo']];
  for (const p of state.performance) {
    p.sets.forEach((z, i) => rows.push([
      p.sessionId, p.date, p.part, p.exerciseId, p.name, p.slot, p.loadMode, p.increment, i + 1, z.type,
      z.weight, z.split ? '' : z.reps, z.split ? z.leftReps : '', z.split ? z.rightReps : '', z.rir, z.restBefore ?? z.legacyRestActual ?? '', p.effort || '', p.memo,
    ]));
  }
  const esc = (x) => `"${String(x ?? '').replaceAll('"', '""')}"`;
  return '﻿' + rows.map((r) => r.map(esc).join(',')).join('\n');
}

export function setText(z, measure = 'reps') {
  const u = measure === 'seconds' ? '초' : '';
  const reps = z.split ? `L${z.leftReps ?? '-'}/R${z.rightReps ?? '-'}${u}` : `${z.reps ?? '-'}${u}`;
  const w = z.weight === null || z.weight === undefined ? '' : `${z.weight}kg×`;
  return `${w}${reps}${z.rir !== null && z.rir !== undefined ? ` RIR${z.rir}` : ''}`;
}

export function toTXT(state) {
  let o = 'Workout Coach 기록\n\n';
  const hs = [...state.history].sort((a, b) => b.date.localeCompare(a.date));
  for (const h of hs) {
    const dur = h.durationSec ? ` ${Math.round(h.durationSec / 60)}분` : '';
    o += `${h.date} ${PART_LABEL[h.part] || h.part} ${h.workSets || 0}세트${dur}${h.source === 'pt' ? ' PT' : ''}${h.note ? ` · ${h.note}` : ''}\n`;
    for (const p of state.performance.filter((x) => x.sessionId === h.id)) {
      const main = p.sets.filter((z) => z.type !== 'warmup');
      o += `  - ${p.name} (${LOAD_LABEL[p.loadMode] || p.loadMode}): ${main.map((z) => setText(z, p.measure)).join(' / ')}${p.effort ? ` · 느낌 ${EFFORT_LABEL[p.effort]}` : ''}${p.memo ? ` · ${p.memo}` : ''}\n`;
    }
  }
  return o;
}

export { setReps };
