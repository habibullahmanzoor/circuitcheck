import { describe, it, expect } from 'vitest';
import { delta, evaluateSession, sessionsFor, sessionsToCsv } from './sessions';
import { emptySite, initialState, reducer, migrate, type SiteSession } from './state';
import { boardHealth, type CircuitReport, type Circuit, type CheckResult } from '../engine';

const c: Circuit = {
  id: 'a', ref: 'S1', description: '', phases: '1P', kind: 'fixed', device: 'B', inA: 16, ibA: 10,
  lineCsaMm2: 2.5, insulation: 'PVC70', lengthM: 10, installMethod: 'C', ambientFactor: 1, groupingFactor: 1,
};
const sess = (id: string, at: string, zs: string): SiteSession => ({ id, circuitId: 'a', savedAt: at, entry: { ...emptySite(), zs, polarity: 'ok' } });

describe('sessions', () => {
  it('reducer saves and deletes, and deleting a circuit removes its sessions', () => {
    let s = reducer(initialState(), { type: 'saveCircuit', circuit: c });
    s = reducer(s, { type: 'saveSession', session: sess('1', '2026-01-01', '1.0') });
    s = reducer(s, { type: 'saveSession', session: sess('2', '2026-02-01', '9.9') });
    expect(s.sessions).toHaveLength(2);
    s = reducer(s, { type: 'deleteSession', id: '1' });
    expect(s.sessions.map((x) => x.id)).toEqual(['2']);
    s = reducer(s, { type: 'deleteCircuit', id: 'a' });
    expect(s.sessions).toEqual([]);
  });
  it('evaluates against current limits and orders by date', () => {
    expect(evaluateSession(sess('1', 'x', '1.0'), c, 0.35).overall).toBe('PASS');
    expect(evaluateSession(sess('2', 'x', '9.9'), c, 0.35).overall).toBe('FAIL');
    expect(evaluateSession({ ...sess('3', 'x', ''), entry: emptySite() }, c, 0.35).overall).toBe('EMPTY');
    const all = [sess('2', '2026-02-01', '1'), sess('1', '2026-01-01', '1'), { ...sess('9', '2026-03-01', '1'), circuitId: 'z' }];
    expect(sessionsFor(all, 'a').map((x) => x.id)).toEqual(['1', '2']);
  });
  it('delta handles blanks and junk', () => {
    expect(delta('1.0', '1.5')).toBeCloseTo(0.5);
    expect(delta(undefined, '1')).toBeUndefined();
    expect(delta('', '1')).toBeUndefined();
    expect(delta('a', '1')).toBeUndefined();
  });
  it('csv export has a header, escapes, and skips orphans', () => {
    const csv = sessionsToCsv([sess('1', '2026-01-01', '9.9'), { ...sess('2', '2026-01-02', '1'), circuitId: 'gone' }], [c], 0.35);
    const lines = csv.trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatch(/^savedAt,ref,/);
    expect(lines[1]).toContain('S1');
    expect(lines[1]).toContain('FAIL');
    expect(lines[1]).toContain('Measured Zs');
  });
  it('migrate keeps valid sessions and drops bad ones', () => {
    const s = reducer(reducer(initialState(), { type: 'saveCircuit', circuit: c }), { type: 'saveSession', session: sess('1', 'd', '1') });
    expect(migrate(JSON.parse(JSON.stringify(s))).sessions).toEqual(s.sessions);
    expect(migrate({ version: 1, sessions: [{ id: 1 }, 5] }).sessions).toEqual([]);
    expect(migrate({ version: 1 }).sessions).toEqual([]);
  });
});

describe('boardHealth', () => {
  const res = (id: string, value: number, limit: number, status: CheckResult['status'] = 'PASS'): CheckResult =>
    ({ id, title: id, status, value, limit, formula: '', inputs: {}, assumptions: [], clauseRef: '', message: '' });
  const rep = (ref: string, overall: CircuitReport['overall'], results: CheckResult[] = []): CircuitReport => ({ circuitId: ref, ref, results, overall });
  it('empty board', () => expect(boardHealth([])).toEqual({ score: 0, grade: 'F', tightest: [] }));
  it('scores and grades', () => {
    expect(boardHealth([rep('a', 'PASS'), rep('b', 'PASS')])).toMatchObject({ score: 100, grade: 'A' });
    expect(boardHealth([rep('a', 'ADVISORY'), rep('b', 'PASS')]).score).toBe(88);
    expect(boardHealth([rep('a', 'PASS'), rep('b', 'FAIL'), rep('c', 'FAIL')])).toMatchObject({ score: 33, grade: 'F' });
  });
  it('a failing circuit caps the grade at C', () => {
    const reps = Array.from({ length: 19 }, (_, i) => rep(`p${i}`, 'PASS')).concat(rep('f', 'FAIL'));
    const h = boardHealth(reps);
    expect(h.score).toBe(95);
    expect(h.grade).toBe('C');
    expect(boardHealth([rep('f', 'INPUT_ERROR'), ...Array.from({ length: 9 }, (_, i) => rep(`p${i}`, 'PASS'))]).grade).toBe('C');
  });
  it('lists the tightest passing margins, inverting fault-withstand', () => {
    const h = boardHealth([
      rep('a', 'PASS', [res('voltage-drop', 2.9, 3), res('fault-withstand', 6, 3)]),
      rep('b', 'PASS', [res('earth-fault-loop', 1.2, 2), res('voltage-drop', 4, 3, 'FAIL')]),
    ], 2);
    expect(h.tightest.map((m) => m.ref + ':' + m.checkTitle)).toEqual(['a:voltage-drop', 'b:earth-fault-loop']);
    expect(h.tightest[0]?.utilisation).toBeCloseTo(0.9667, 3);
  });
});
