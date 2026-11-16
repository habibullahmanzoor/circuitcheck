import { migrate, reducer, type Action, type AppState } from './state';

/** Actions that are single, deliberate edits. Typing into fields is not recorded one keystroke at a time. */
const RECORDED: ReadonlySet<Action['type']> = new Set([
  'saveCircuit', 'duplicateCircuit', 'deleteCircuit', 'replaceCircuits', 'appendCircuits',
  'saveSession', 'deleteSession', 'loadState', 'setSettings', 'reset',
]);

export const HISTORY_LIMIT = 50;

export interface History {
  past: AppState[];
  present: AppState;
  future: AppState[];
}

export type HAction = Action | { type: 'undo' } | { type: 'redo' };

export const initHistory = (present: AppState): History => ({ past: [], present, future: [] });

export function historyReducer(h: History, a: HAction): History {
  if (a.type === 'undo') {
    const prev = h.past[h.past.length - 1];
    if (!prev) return h;
    return { past: h.past.slice(0, -1), present: prev, future: [h.present, ...h.future] };
  }
  if (a.type === 'redo') {
    const [next, ...rest] = h.future;
    if (!next) return h;
    return { past: [...h.past, h.present], present: next, future: rest };
  }
  const present = reducer(h.present, a);
  if (present === h.present) return h;
  if (!RECORDED.has(a.type)) return { ...h, present };
  return { past: [...h.past, h.present].slice(-HISTORY_LIMIT), present, future: [] };
}

/* ---------- Backup / restore ---------- */

const APP_TAG = 'circuitcheck-backup';

export function exportBackup(s: AppState): string {
  return JSON.stringify({ app: APP_TAG, version: s.version, state: s }, null, 2);
}

export function parseBackup(text: string): { state?: AppState; error?: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: 'The file is not valid JSON.' };
  }
  if (typeof raw !== 'object' || raw === null || (raw as Record<string, unknown>).app !== APP_TAG) {
    return { error: 'This is not a CircuitCheck backup file.' };
  }
  const state = migrate((raw as Record<string, unknown>).state);
  const stored = (raw as { state?: { version?: unknown } }).state;
  if (stored?.version !== state.version) return { error: 'Unsupported backup version.' };
  return { state };
}
