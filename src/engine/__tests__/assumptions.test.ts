import { describe, it, expect } from 'vitest';
import demoJson from '../../data/ampacity.demo.json';
import {
  PLACEHOLDER_ZE_OHM, boardGaps, checkBoard, gapCounts, inputGaps, parseAmpacityTable,
  type AmpacityTable, type Circuit,
} from '../index';

const table = parseAmpacityTable(demoJson).table as AmpacityTable;
const supply = { uoV: 230 as const, ueOhm: 0.35 };
const c = (over: Partial<Circuit>): Circuit => ({
  id: 'a', ref: 'A', description: '', phases: '1P', kind: 'fixed', device: 'B', inA: 16, ibA: 10,
  lineCsaMm2: 2.5, cpcCsaMm2: 2.5, insulation: 'PVC70', lengthM: 10, installMethod: 'C', ambientFactor: 0.9, groupingFactor: 0.8, ...over,
});
const gaps = (cs: Circuit[]) => inputGaps(cs, checkBoard(cs, supply, table).reports);

describe('input gaps', () => {
  it('a fully specified circuit has none', () => {
    expect(gaps([c({})])).toEqual([]);
  });
  it('flags a blank cpc', () => {
    const g = gaps([c({ cpcCsaMm2: undefined })]);
    expect(g.map((x) => x.kind)).toEqual(['cpc']);
    expect(g[0]?.ref).toBe('A');
  });
  it('flags assumed no derating only when both factors are 1', () => {
    expect(gaps([c({ ambientFactor: 1, groupingFactor: 1 })]).map((x) => x.kind)).toEqual(['derating']);
    expect(gaps([c({ ambientFactor: 1, groupingFactor: 0.8 })])).toEqual([]);
  });
  it('flags circuits whose ampacity could not be checked', () => {
    expect(gaps([c({ installMethod: 'ZZ' })]).map((x) => x.kind)).toEqual(['ampacity']);
  });
  it('counts per circuit', () => {
    const cs = [c({ id: 'a', cpcCsaMm2: undefined, ambientFactor: 1, groupingFactor: 1 }), c({ id: 'b' })];
    expect(gapCounts(gaps(cs))).toEqual({ a: 2 });
  });
});

describe('board gaps', () => {
  it('flags the placeholder Ze and the demo table', () => {
    const g = boardGaps(PLACEHOLDER_ZE_OHM, table);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatch(/Ze is still the starting value/);
    expect(g[1]).toMatch(/demo table/);
  });
  it('is quiet once Ze is changed and a real table is loaded', () => {
    expect(boardGaps(0.42, { ...table, demo: false })).toEqual([]);
  });
});
