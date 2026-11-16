import { describe, it, expect } from 'vitest';
import { initialState, migrate, reducer, toTestInput, emptySite, isCircuit } from './state';
import type { Circuit } from '../engine';

const c: Circuit = {
  id: 'a', ref: 'A', description: '', phases: '1P', kind: 'fixed', device: 'B', inA: 16, ibA: 10,
  lineCsaMm2: 2.5, insulation: 'PVC70', lengthM: 10, installMethod: 'C', ambientFactor: 1, groupingFactor: 1,
};

describe('reducer', () => {
  it('saves, edits, duplicates and deletes circuits', () => {
    let s = reducer(initialState(), { type: 'saveCircuit', circuit: c });
    expect(s.circuits).toHaveLength(1);
    s = reducer(s, { type: 'saveCircuit', circuit: { ...c, ref: 'A2' } });
    expect(s.circuits).toHaveLength(1);
    expect(s.circuits[0]?.ref).toBe('A2');
    s = reducer(s, { type: 'duplicateCircuit', id: 'a', newId: 'b' });
    expect(s.circuits.map((x) => x.id)).toEqual(['a', 'b']);
    s = reducer(s, { type: 'setSite', id: 'a', patch: { zs: '1.2' } });
    s = reducer(s, { type: 'deleteCircuit', id: 'a' });
    expect(s.circuits.map((x) => x.id)).toEqual(['b']);
    expect(s.site.a).toBeUndefined();
    expect(reducer(s, { type: 'duplicateCircuit', id: 'zz', newId: 'q' })).toBe(s);
  });
  it('replace, append, name, Ze and reset', () => {
    let s = reducer(initialState(), { type: 'replaceCircuits', circuits: [c] });
    s = reducer(s, { type: 'appendCircuits', circuits: [{ ...c, id: 'z' }] });
    expect(s.circuits).toHaveLength(2);
    s = reducer(s, { type: 'setBoardName', name: 'X' });
    s = reducer(s, { type: 'setZe', ueOhm: 0.5 });
    expect([s.boardName, s.ueOhm]).toEqual(['X', 0.5]);
    expect(reducer(s, { type: 'reset' })).toEqual(initialState());
  });
});

describe('toTestInput', () => {
  it('blank means not entered, junk becomes NaN', () => {
    expect(toTestInput(emptySite())).toEqual({});
    const t = toTestInput({ zs: '1.2', r1r2: 'abc', ir: '0', polarity: 'bad', rcd1: ' 25 ', rcd5: '' });
    expect(t.measuredZs).toBe(1.2);
    expect(Number.isNaN(t.measuredR1R2)).toBe(true);
    expect(t.irMohm).toBe(0);
    expect(t.polarityOk).toBe(false);
    expect(t.rcdTrip1xMs).toBe(25);
    expect(t.rcdTrip5xMs).toBeUndefined();
  });
});

describe('migrate', () => {
  it('round-trips a valid state', () => {
    const s = reducer(initialState(), { type: 'saveCircuit', circuit: c });
    const s2 = reducer(s, { type: 'setSite', id: 'a', patch: { zs: '1', polarity: 'ok' } });
    expect(migrate(JSON.parse(JSON.stringify(s2)))).toEqual(s2);
  });
  it('falls back to defaults for unknown or corrupt data', () => {
    expect(migrate(null)).toEqual(initialState());
    expect(migrate({ version: 99 })).toEqual(initialState());
    const m = migrate({ version: 1, boardName: 5, ueOhm: -1, circuits: [c, { id: 1 }], site: { a: { zs: 1 }, b: 3 } });
    expect(m.boardName).toBe('DB1');
    expect(m.ueOhm).toBe(0.35);
    expect(m.circuits).toEqual([c]);
    expect(m.site.a).toEqual(emptySite());
    expect(m.site.b).toBeUndefined();
    expect(migrate({ version: 1 }).circuits).toEqual([]);
  });
  it('isCircuit rejects bad shapes', () => {
    expect(isCircuit(c)).toBe(true);
    expect(isCircuit({ ...c, device: 'Z' })).toBe(false);
    expect(isCircuit({ ...c, lengthM: NaN })).toBe(false);
    expect(isCircuit([])).toBe(false);
  });
});
