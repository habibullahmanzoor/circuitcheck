import { describe, it, expect } from 'vitest';
import sampleText from '../../data/sample-board.csv?raw';
import demoJson from '../../data/ampacity.demo.json';
import {
  ampacityCheck,
  additionalProtectionCheck,
  checkBoard,
  checkCircuit,
  designCurrentCheck,
  earthFaultCheck,
  lookupIt,
  overallStatus,
  parseAmpacityTable,
  parseCsv,
  runChecks,
  summarise,
  testCheck,
  testLimits,
  toCsv,
  voltageDropCheck,
  voltageDropV,
  sizeFinder,
  smallestPassing,
  dedupeByRef,
  zsMax,
  faultWithstandCheck,
  minCpcCsa,
  type AmpacityTable,
  type CheckResult,
  type Circuit,
  type Device,
} from '../index';

const parsed = parseAmpacityTable(demoJson);
if (!parsed.table) throw new Error('demo table invalid: ' + parsed.error);
const table: AmpacityTable = parsed.table;
const supply = { uoV: 230 as const, ueOhm: 0.35 };

const base: Circuit = {
  id: 't', ref: 'T1', description: 'x', phases: '1P', kind: 'fixed', device: 'B', inA: 16, ibA: 10,
  lineCsaMm2: 2.5, insulation: 'PVC70', lengthM: 20, installMethod: 'C', ambientFactor: 1, groupingFactor: 1,
};

describe('ampacity', () => {
  it('demo table is labelled demo', () => {
    expect(table.demo).toBe(true);
    expect(table.name).toMatch(/DEMO/);
  });
  it('lookup and check', () => {
    const it0 = lookupIt(table, 2.5, 'C', 'PVC70', '1P');
    expect(it0).toBeGreaterThan(0);
    const r = ampacityCheck({ ...base, inA: 16 }, table);
    expect(r.status).toBe('PASS');
    expect(r.limit).toBeCloseTo(it0 as number, 6);
  });
  it('applies derating', () => {
    const r = ampacityCheck({ ...base, inA: 16, groupingFactor: 0.5 }, table);
    expect(r.status).toBe('FAIL');
  });
  it('NOT_CHECKED when no entry, never a guess', () => {
    const r = ampacityCheck({ ...base, installMethod: 'ZZ' }, table);
    expect(r.status).toBe('NOT_CHECKED');
    expect(r.value).toBeUndefined();
  });
  it('input errors', () => {
    expect(ampacityCheck({ ...base, ambientFactor: 0 }, table).status).toBe('INPUT_ERROR');
    expect(ampacityCheck({ ...base, lengthM: NaN }, table).status).toBe('INPUT_ERROR');
    expect(designCurrentCheck({ ...base, inA: -1 }).status).toBe('INPUT_ERROR');
  });
  it('Ib vs In', () => {
    expect(designCurrentCheck({ ...base, ibA: 20 }).status).toBe('FAIL');
    expect(designCurrentCheck(base).status).toBe('PASS');
  });
  it('parseAmpacityTable rejects bad input', () => {
    expect(parseAmpacityTable(null).error).toBeDefined();
    expect(parseAmpacityTable({ name: 1, entries: [] }).error).toBeDefined();
    expect(parseAmpacityTable({ name: 'x', entries: 5 }).error).toBeDefined();
    expect(parseAmpacityTable({ name: 'x', entries: [5] }).error).toBeDefined();
    const e = { csaMm2: 2.5, installMethod: 'C', insulation: 'PVC70', phases: '1P', itA: 20 };
    expect(parseAmpacityTable({ name: 'x', entries: [{ ...e, itA: 0 }] }).error).toBeDefined();
    expect(parseAmpacityTable({ name: 'x', entries: [{ ...e, installMethod: '' }] }).error).toBeDefined();
    expect(parseAmpacityTable({ name: 'x', entries: [{ ...e, insulation: 'X' }] }).error).toBeDefined();
    expect(parseAmpacityTable({ name: 'x', entries: [{ ...e, phases: '2P' }] }).error).toBeDefined();
    const ok = parseAmpacityTable({ name: 'mine', note: 'n', entries: [e] });
    expect(ok.table?.demo).toBe(false);
    expect(ok.table?.note).toBe('n');
  });
});

describe('additional protection', () => {
  const sock: Circuit = { ...base, kind: 'socket', inA: 32 };
  it('fails without RCD, passes with 30 mA', () => {
    expect(additionalProtectionCheck(sock)?.status).toBe('FAIL');
    expect(additionalProtectionCheck({ ...sock, rcdMa: 30 })?.status).toBe('PASS');
    expect(additionalProtectionCheck({ ...sock, rcdMa: 100 })?.status).toBe('FAIL');
  });
  it('not applicable to other kinds or > 32 A', () => {
    expect(additionalProtectionCheck(base)).toBeUndefined();
    expect(additionalProtectionCheck({ ...sock, inA: 40 })).toBeUndefined();
  });
  it('input error', () => {
    expect(additionalProtectionCheck({ ...sock, inA: 0 })?.status).toBe('INPUT_ERROR');
  });
});

describe('designCheck', () => {
  it('overallStatus precedence', () => {
    const mk = (status: CheckResult['status']): CheckResult => ({ id: 'x', title: 'x', status, formula: '', inputs: {}, assumptions: [], clauseRef: '', message: '' });
    expect(overallStatus([])).toBe('NOT_CHECKED');
    expect(overallStatus([mk('PASS')])).toBe('PASS');
    expect(overallStatus([mk('PASS'), mk('NOT_CHECKED')])).toBe('ADVISORY');
    expect(overallStatus([mk('ADVISORY'), mk('FAIL')])).toBe('FAIL');
    expect(overallStatus([mk('FAIL'), mk('INPUT_ERROR')])).toBe('INPUT_ERROR');
  });
  it('a good circuit passes everything', () => {
    const r = checkCircuit(base, supply, table);
    expect(r.overall).toBe('PASS');
    expect(r.results.every((x) => x.suggestion === undefined)).toBe(true);
  });
  it('voltage-drop suggestion is verified by re-running', () => {
    const c: Circuit = { ...base, kind: 'lighting', device: 'B', inA: 6, ibA: 5, lineCsaMm2: 1.5, lengthM: 55 };
    const r = checkCircuit(c, supply, table);
    const vd = r.results.find((x) => x.id === 'voltage-drop');
    expect(vd?.status).toBe('FAIL');
    expect(vd?.suggestion).toMatch(/increase line csa to 2\.5 mm²/i);
    expect(vd?.suggestion).toMatch(/shorten the run/i);
    // The claimed csa really passes.
    expect(voltageDropCheck({ ...c, lineCsaMm2: 2.5 }).status).toBe('PASS');
    // The claimed length really passes.
    const m = /to ([\d.]+) m or less/.exec(vd?.suggestion ?? '');
    expect(voltageDropCheck({ ...c, lengthM: Number(m?.[1]) }).status).toBe('PASS');
  });
  it('Zs suggestion options each re-pass', () => {
    const c: Circuit = { ...base, device: 'C', inA: 32, ibA: 10, lengthM: 45, lineCsaMm2: 6, cpcCsaMm2: 2.5 };
    const r = checkCircuit(c, supply, table);
    const ef = r.results.find((x) => x.id === 'earth-fault-loop');
    if (ef?.status === 'FAIL') expect(ef.suggestion).toBeDefined();
    const c2: Circuit = { ...base, device: 'D', inA: 32, ibA: 10, lengthM: 30 };
    const ef2 = checkCircuit(c2, supply, table).results.find((x) => x.id === 'earth-fault-loop');
    expect(ef2?.status).toBe('FAIL');
    expect(ef2?.suggestion).toMatch(/type B device/);
    expect(earthFaultCheck({ ...c2, device: ef2?.suggestion?.includes('type C') ? 'C' : 'B' }, supply).status).toBe('PASS');
  });
  it('fault-withstand, rcd, ib-in and ampacity suggestions', () => {
    const fw = checkCircuit({ ...base, lineCsaMm2: 6, cpcCsaMm2: 1.5, lengthM: 2, ibA: 10 }, { uoV: 230, ueOhm: 0.02 }, table);
    const f = fw.results.find((x) => x.id === 'fault-withstand');
    expect(f?.status).toBe('FAIL');
    expect(f?.suggestion).toMatch(/increase cpc csa to/i);

    const rcd = checkCircuit({ ...base, kind: 'socket' }, supply, table).results.find((x) => x.id === 'rcd-protection');
    expect(rcd?.suggestion).toBe('Fit a 30 mA RCD.');

    const ib = checkCircuit({ ...base, ibA: 20 }, supply, table).results.find((x) => x.id === 'ib-in');
    expect(ib?.suggestion).toMatch(/use a 20 A device/i);

    const amp = checkCircuit({ ...base, inA: 32, ibA: 25 }, supply, table).results.find((x) => x.id === 'ampacity');
    expect(amp?.status).toBe('FAIL');
    expect(amp?.suggestion).toMatch(/increase line csa/i);
  });
  it('no suggestion is offered when nothing verifies', () => {
    const c: Circuit = { ...base, ibA: 200, inA: 100 }; // no standard rating >= 200 A
    const r = checkCircuit(c, supply, table).results.find((x) => x.id === 'ib-in');
    expect(r?.status).toBe('FAIL');
    expect(r?.suggestion).toBeUndefined();
  });
  it('a suggestion that would break another check is rejected', () => {
    // Raising csa fixes the drop here but there is no larger table entry for 3P/E, so ampacity would go NOT_CHECKED, not FAIL: still allowed.
    const c: Circuit = { ...base, kind: 'lighting', ibA: 12, lengthM: 40, inA: 16 };
    const r = checkCircuit(c, supply, table);
    expect(r.results.find((x) => x.id === 'voltage-drop')?.status).toBe('FAIL');
  });
  it('board summary', () => {
    const { circuits, errors } = parseCsv(sampleText);
    expect(errors).toEqual([]);
    const { reports, summary } = checkBoard(circuits, supply, table);
    expect(summary.total).toBe(circuits.length);
    expect(summary.fail).toBeGreaterThanOrEqual(3);
    expect(summary.pass).toBeGreaterThanOrEqual(3);
    expect(summarise(reports)).toEqual(summary);
    const byRef = (ref: string) => reports.find((r) => r.ref === ref);
    expect(byRef('L2')?.results.find((x) => x.id === 'voltage-drop')?.status).toBe('FAIL');
    expect(byRef('S2')?.results.find((x) => x.id === 'rcd-protection')?.status).toBe('FAIL');
    expect(byRef('F1')?.results.find((x) => x.id === 'earth-fault-loop')?.status).toBe('FAIL');
    expect(byRef('S1')?.overall).toBe('PASS');
  });
  it('bad input flows through as INPUT_ERROR', () => {
    expect(checkCircuit({ ...base, lengthM: NaN }, supply, table).overall).toBe('INPUT_ERROR');
  });
});

describe('testCheck', () => {
  const c: Circuit = { ...base, rcdMa: 30 }; // B16 -> limit 0.8*2.73 = 2.18
  const lim = testLimits(c).zsMaxMeasured;
  it('limits', () => {
    expect(lim).toBeCloseTo(0.8 * zsMax('B', 16), 10);
    expect(testLimits(c).irMinMohm).toBe(1);
  });
  it('nothing entered gives nothing', () => {
    expect(testCheck(c, supply, {})).toEqual([]);
  });
  it('Zs pass/fail at the boundary', () => {
    expect(testCheck(c, supply, { measuredZs: lim })[0]?.status).toBe('PASS');
    expect(testCheck(c, supply, { measuredZs: lim + 0.01 })[0]?.status).toBe('FAIL');
    expect(testCheck(c, supply, { measuredZs: -1 })[0]?.status).toBe('INPUT_ERROR');
  });
  it('insulation resistance bands', () => {
    const st = (v: number) => testCheck(c, supply, { irMohm: v })[0]?.status;
    expect(st(0.5)).toBe('FAIL');
    expect(st(1.5)).toBe('ADVISORY');
    expect(st(2)).toBe('PASS');
    expect(st(-1)).toBe('INPUT_ERROR');
  });
  it('polarity', () => {
    expect(testCheck(c, supply, { polarityOk: false })[0]?.status).toBe('FAIL');
    expect(testCheck(c, supply, { polarityOk: true })[0]?.status).toBe('PASS');
  });
  it('RCD trip times', () => {
    const r = (t: Parameters<typeof testCheck>[2], cc = c) => testCheck(cc, supply, t);
    expect(r({ rcdTrip1xMs: 301 })[0]?.status).toBe('FAIL');
    expect(r({ rcdTrip1xMs: 300 })[0]?.status).toBe('PASS');
    expect(r({ rcdTrip1xMs: -1 })[0]?.status).toBe('INPUT_ERROR');
    expect(r({ rcdTrip5xMs: 41 })[0]?.status).toBe('FAIL');
    expect(r({ rcdTrip5xMs: 40 })[0]?.status).toBe('PASS');
    expect(r({ rcdTrip5xMs: -1 })[0]?.status).toBe('INPUT_ERROR');
    expect(r({ rcdTrip5xMs: 10 }, { ...c, rcdMa: undefined })[0]?.status).toBe('NOT_CHECKED');
    expect(r({ rcdTrip5xMs: 10 }, { ...c, rcdMa: 100 })[0]?.status).toBe('NOT_CHECKED');
  });
  it('R1+R2 vs design and consistency', () => {
    const design = 20 * (0.00741 + 0.00741);
    const near = testCheck(c, supply, { measuredR1R2: design * 1.1 })[0];
    expect(near?.status).toBe('PASS');
    const far = testCheck(c, supply, { measuredR1R2: design * 1.3 })[0];
    expect(far?.status).toBe('ADVISORY');
    expect(testCheck(c, supply, { measuredR1R2: -1 })[0]?.status).toBe('INPUT_ERROR');

    const good = testCheck(c, supply, { measuredZs: 0.35 + design, measuredR1R2: design });
    expect(good.find((x) => x.id === 'test-consistency')?.status).toBe('PASS');
    const off = testCheck(c, supply, { measuredZs: 1.5, measuredR1R2: design });
    expect(off.find((x) => x.id === 'test-consistency')?.status).toBe('ADVISORY');
    const err = testCheck(c, { uoV: 230, ueOhm: -1 }, { measuredZs: 1, measuredR1R2: 0.3 });
    expect(err.find((x) => x.id === 'test-consistency')?.status).toBe('INPUT_ERROR');
  });
  it('bad In gives INPUT_ERROR for Zs', () => {
    expect(testCheck({ ...c, inA: 0 }, supply, { measuredZs: 1 })[0]?.status).toBe('INPUT_ERROR');
  });
});

describe('csv', () => {
  it('sample board parses with no errors and round-trips', () => {
    const a = parseCsv(sampleText);
    expect(a.errors).toEqual([]);
    expect(a.circuits.length).toBeGreaterThanOrEqual(8);
    const b = parseCsv(toCsv(a.circuits));
    expect(b.errors).toEqual([]);
    expect(b.circuits).toEqual(a.circuits);
  });
  it('handles quotes, commas, CRLF, BOM and column order', () => {
    const text =
      '﻿ref,phases,kind,device,inA,ibA,lineCsaMm2,insulation,lengthM,installMethod,description\r\n' +
      'A1,1P,fixed,B,16,10,2.5,PVC70,10,C,"Pump, ""main"""\r\n';
    const r = parseCsv(text);
    expect(r.errors).toEqual([]);
    expect(r.circuits[0]?.description).toBe('Pump, "main"');
    expect(r.circuits[0]?.ambientFactor).toBe(1);
    expect(r.circuits[0]?.cpcCsaMm2).toBeUndefined();
    const round = parseCsv(toCsv(r.circuits));
    expect(round.circuits[0]?.description).toBe('Pump, "main"');
  });
  it('a bad row gives a row-numbered error and keeps the other rows', () => {
    const lines = sampleText.trim().split('\n');
    lines[3] = 'S1,Bad row,9P,socket,X,abc,16,2.5,,PVC70,-5,C,1,1,';
    const r = parseCsv(lines.join('\n'));
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.row).toBe(4);
    expect(r.errors[0]?.message).toMatch(/phases/);
    expect(r.errors[0]?.message).toMatch(/device/);
    expect(r.errors[0]?.message).toMatch(/inA/);
    expect(r.errors[0]?.message).toMatch(/lengthM/);
    expect(r.circuits).toHaveLength(lines.length - 2);
  });
  it('reports empty file, missing columns, missing required cells', () => {
    expect(parseCsv('').errors[0]?.message).toMatch(/empty/i);
    expect(parseCsv('ref,phases\nA,1P').errors[0]?.message).toMatch(/Missing column/);
    const head = sampleText.split('\n')[0];
    const r = parseCsv(`${head}\n,,1P,fixed,B,16,10,2.5,,PVC70,10,,1,1,`);
    expect(r.errors[0]?.message).toMatch(/ref is required/);
    expect(r.errors[0]?.message).toMatch(/installMethod is required/);
  });
  it('rows after quoted newlines keep correct line numbers', () => {
    const head = sampleText.split('\n')[0];
    const good = 'A,"two\nlines",1P,fixed,B,16,10,2.5,,PVC70,10,C,1,1,';
    const bad = 'B,x,1P,fixed,B,16,10,2.5,,PVC70,0,C,1,1,';
    const r = parseCsv(`${head}\n${good}\n${bad}`);
    expect(r.circuits).toHaveLength(1);
    expect(r.errors[0]?.row).toBe(4);
  });
});

describe('property tests (deterministic grids)', () => {
  const sizes = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];
  const lengths = [1, 2, 5, 10, 20, 50, 100, 250];
  const currents = [1, 2, 6, 10, 16, 32, 63];
  const vd = (len: number, ib: number, csa: number) =>
    voltageDropV({ phases: '1P', lineCsaMm2: csa, insulation: 'PVC70', lengthM: len, ibA: ib });

  it('voltage drop increases with length and current', () => {
    for (const csa of sizes) for (const ib of currents) {
      for (let i = 1; i < lengths.length; i++) expect(vd(lengths[i] as number, ib, csa)).toBeGreaterThan(vd(lengths[i - 1] as number, ib, csa));
    }
    for (const csa of sizes) for (const len of lengths) {
      for (let i = 1; i < currents.length; i++) expect(vd(len, currents[i] as number, csa)).toBeGreaterThan(vd(len, currents[i - 1] as number, csa));
    }
  });
  it('voltage drop decreases with csa', () => {
    for (const len of lengths) for (const ib of currents) {
      for (let i = 1; i < sizes.length; i++) expect(vd(len, ib, sizes[i] as number)).toBeLessThan(vd(len, ib, sizes[i - 1] as number));
    }
  });
  it('Zs_max decreases as In increases', () => {
    for (const d of ['B', 'C', 'D'] as Device[]) {
      for (let i = 1; i < currents.length; i++) expect(zsMax(d, currents[i] as number)).toBeLessThan(zsMax(d, currents[i - 1] as number));
    }
  });
  it('no NaN for any positive finite input', () => {
    const nums = (r: CheckResult) => [r.value, r.limit, ...Object.values(r.inputs).filter((v): v is number => typeof v === 'number')];
    for (const csa of sizes) for (const len of lengths) for (const ib of currents) for (const dev of ['B', 'C', 'D'] as Device[]) {
      const c: Circuit = { ...base, lineCsaMm2: csa, lengthM: len, ibA: ib, inA: ib * 2, device: dev };
      for (const r of runChecks(c, supply, table)) {
        for (const n of nums(r)) if (n !== undefined) expect(Number.isNaN(n)).toBe(false);
      }
    }
    expect(Number.isNaN(minCpcCsa(1e-9, 1e-9, 1e-9))).toBe(false);
    expect(Number.isNaN(faultWithstandCheck({ ...base, lengthM: 1e-6 }, { uoV: 230, ueOhm: 0 }).limit)).toBe(false);
  });
});

describe('apply-fix patches, size finder, dedupe', () => {
  it('every fix patch really passes when applied', () => {
    const { circuits } = parseCsv(sampleText);
    for (const c of circuits) {
      const rep = checkCircuit(c, supply, table);
      for (const r of rep.results) {
        for (const f of r.fixes ?? []) {
          const after = runChecks({ ...c, ...f.patch }, supply, table).find((x) => x.id === r.id);
          expect(['PASS', 'ADVISORY']).toContain(after?.status);
        }
      }
    }
  });
  it('size finder returns all sizes and the smallest passing one', () => {
    const c: Circuit = { ...base, kind: 'lighting', device: 'B', inA: 6, ibA: 5, lengthM: 55 };
    const opts = sizeFinder(c, supply, table);
    expect(opts).toHaveLength(9);
    const best = smallestPassing(opts);
    expect(best?.csaMm2).toBe(2.5);
    expect(opts[0]?.overall).toBe('FAIL');
    expect(smallestPassing(opts.map((o) => ({ ...o, overall: 'FAIL' as const })))).toBeUndefined();
  });
  it('dedupes by ref, case-insensitively, including within the incoming batch', () => {
    const a = { ...base, ref: 'L1' };
    const r = dedupeByRef([a], [{ ...base, ref: 'l1', id: 'x' }, { ...base, ref: 'L2', id: 'y' }, { ...base, ref: 'L2', id: 'z' }]);
    expect(r.kept.map((c) => c.id)).toEqual(['y']);
    expect(r.skipped).toHaveLength(2);
  });
});
