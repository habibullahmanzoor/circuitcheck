import { describe, it, expect } from 'vitest';
import { HISTORY_LIMIT, exportBackup, historyReducer, initHistory, parseBackup } from './history';
import { initialState, type AppState } from './state';
import type { Circuit } from '../engine';

const c = (id: string): Circuit => ({
  id, ref: id, description: '', phases: '1P', kind: 'fixed', device: 'B', inA: 16, ibA: 10,
  lineCsaMm2: 2.5, insulation: 'PVC70', lengthM: 10, installMethod: 'C', ambientFactor: 1, groupingFactor: 1,
});

describe('undo / redo', () => {
  it('undoes and redoes a recorded edit', () => {
    let h = initHistory(initialState());
    h = historyReducer(h, { type: 'saveCircuit', circuit: c('a') });
    h = historyReducer(h, { type: 'saveCircuit', circuit: c('b') });
    expect(h.present.circuits).toHaveLength(2);
    h = historyReducer(h, { type: 'undo' });
    expect(h.present.circuits.map((x) => x.id)).toEqual(['a']);
    h = historyReducer(h, { type: 'redo' });
    expect(h.present.circuits).toHaveLength(2);
  });
  it('undo and redo are no-ops at the ends', () => {
    const h = initHistory(initialState());
    expect(historyReducer(h, { type: 'undo' })).toBe(h);
    expect(historyReducer(h, { type: 'redo' })).toBe(h);
  });
  it('a new edit clears the redo stack', () => {
    let h = initHistory(initialState());
    h = historyReducer(h, { type: 'saveCircuit', circuit: c('a') });
    h = historyReducer(h, { type: 'undo' });
    expect(h.future).toHaveLength(1);
    h = historyReducer(h, { type: 'saveCircuit', circuit: c('z') });
    expect(h.future).toHaveLength(0);
  });
  it('typing-style actions are not recorded', () => {
    let h = initHistory(initialState());
    h = historyReducer(h, { type: 'setBoardName', name: 'X' });
    h = historyReducer(h, { type: 'setZe', ueOhm: 0.5 });
    h = historyReducer(h, { type: 'setSite', id: 'a', patch: { zs: '1' } });
    expect(h.past).toHaveLength(0);
    expect(h.present.boardName).toBe('X');
  });
  it('no-op actions leave history untouched', () => {
    const h = initHistory(initialState());
    expect(historyReducer(h, { type: 'duplicateCircuit', id: 'nope', newId: 'q' })).toBe(h);
  });
  it('caps the history length', () => {
    let h = initHistory(initialState());
    for (let i = 0; i < HISTORY_LIMIT + 20; i++) h = historyReducer(h, { type: 'saveCircuit', circuit: c(`c${i}`) });
    expect(h.past).toHaveLength(HISTORY_LIMIT);
  });
});

describe('backup', () => {
  const state: AppState = { ...initialState(), boardName: 'Plant room', circuits: [c('a')] };
  it('round-trips', () => {
    const r = parseBackup(exportBackup(state));
    expect(r.error).toBeUndefined();
    expect(r.state).toEqual(state);
  });
  it('restoring is undoable', () => {
    let h = initHistory(initialState());
    h = historyReducer(h, { type: 'loadState', state });
    expect(h.present.boardName).toBe('Plant room');
    expect(historyReducer(h, { type: 'undo' }).present.boardName).toBe('DB1');
  });
  it('rejects junk, wrong files and unknown versions', () => {
    expect(parseBackup('not json').error).toMatch(/JSON/);
    expect(parseBackup('{"a":1}').error).toMatch(/not a CircuitCheck/);
    expect(parseBackup('null').error).toMatch(/not a CircuitCheck/);
    expect(parseBackup(JSON.stringify({ app: 'circuitcheck-backup', state: { version: 99 } })).error).toMatch(/version/);
  });
});
