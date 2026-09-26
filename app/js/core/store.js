// 상태 보관 · 원자적 커밋 · 저장/복원. 저장소 어댑터를 주입받아 테스트 가능하게 한다.
// commit(fn): 복제한 초안에 fn 을 적용하고, 예외 없이 끝났을 때만 교체한다 → 실패·취소 시 상태 불변.
import { freshState, normalizeState, looksLikeV10 } from './schema.js';
import { importAny } from './migrate.js';

export const LS_KEY = 'workoutCoach.v10';
export const LEGACY_LS_KEYS = ['workoutCoachUnifiedV9', 'workoutCoachUnifiedV8', 'workoutCoachUnifiedV7'];

export function createStore({ local, idb = null, onChange = () => {}, clock = () => new Date() } = {}) {
  let state = freshState();
  const status = { local: 'idle', idb: idb ? 'idle' : 'none', error: null };

  function persist() {
    const json = JSON.stringify(state);
    try { local.setItem(LS_KEY, json); status.local = 'ok'; status.error = null; }
    catch (err) { status.local = 'error'; status.error = '기기 저장 공간에 저장하지 못했습니다. JSON 백업을 받아 두세요.'; }
    if (idb) {
      const snap = structuredClone(state);
      Promise.resolve().then(() => idb.set(snap)).then(() => { status.idb = 'ok'; onChange(state, { persisted: true }); }).catch(() => { status.idb = 'error'; onChange(state, { persisted: false }); });
    }
  }

  return {
    get state() { return state; },
    status,
    commit(fn, { silent = false } = {}) {
      const draft = structuredClone(state);
      const result = fn(draft);
      draft.revision = (state.revision || 0) + 1;
      draft.savedAt = clock().toISOString();
      state = draft;
      persist();
      if (!silent) onChange(state, { result });
      return result;
    },
    // 두 저장소 중 revision 이 큰 쪽을 쓴다. 둘 다 없으면 옛 버전 키를 찾아 마이그레이션한다.
    async load() {
      const notes = [];
      let fromLocal = null, fromIdb = null;
      try { const raw = local.getItem(LS_KEY); if (raw) fromLocal = JSON.parse(raw); } catch { /* 손상된 값은 무시 */ }
      if (idb) { try { fromIdb = await idb.get(); } catch { fromIdb = null; } }
      const cands = [fromLocal, fromIdb].filter(looksLikeV10);
      if (cands.length) {
        cands.sort((a, b) => (b.revision || 0) - (a.revision || 0));
        state = normalizeState(cands[0]);
        if (cands.length === 2 && cands[0] === fromIdb && (fromIdb.revision || 0) > (fromLocal.revision || 0)) notes.push('기기 저장소보다 최신인 백업 저장소 데이터로 복원했습니다.');
      } else {
        for (const key of LEGACY_LS_KEYS) {
          let raw = null;
          try { raw = local.getItem(key); } catch { raw = null; }
          if (!raw) continue;
          try { const r = importAny(JSON.parse(raw)); state = r.state; notes.push(...r.notes); persist(); break; } catch { /* 다음 키 */ }
        }
      }
      onChange(state, { loaded: true });
      return notes;
    },
    // 가져오기: 성공할 때만 교체한다. 실패하면 ImportError 를 던지고 현재 상태는 그대로.
    importJSON(text) {
      let parsed;
      try { parsed = JSON.parse(text); } catch { throw new Error('JSON 형식이 아닙니다. 현재 기록은 그대로 두었습니다.'); }
      const r = importAny(parsed);
      const next = r.state;
      next.revision = (state.revision || 0) + 1;
      next.savedAt = clock().toISOString();
      state = next;
      persist();
      onChange(state, { imported: true });
      return r.notes;
    },
    exportJSON() {
      return JSON.stringify(state, null, 2);
    },
  };
}

export function memoryLocal() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, map: m };
}
