import { describe, it, expect } from 'vitest';
import {
  r1r2ColdOhm,
  r20OhmPerM,
  defaultCpcCsa,
  nextSizeUp,
  hotMultiplier,
  voltageDropV,
  voltageDropCheck,
  zsMax,
  zsMaxMeasured,
  earthFaultCheck,
  minCpcCsa,
  evaluateFaultWithstand,
  faultWithstandCheck,
  K_FACTOR,
  type Circuit,
} from '../index';

const base: Circuit = {
  id: 't',
  ref: 'T1',
  description: 'test',
  phases: '1P',
  kind: 'socket',
  device: 'B',
  inA: 16,
  ibA: 16,
  lineCsaMm2: 2.5,
  cpcCsaMm2: 1.5,
  insulation: 'PVC70',
  lengthM: 20,
  installMethod: 'C',
  ambientFactor: 1,
  groupingFactor: 1,
};
const supply = { uoV: 230 as const, ueOhm: 0.35 };

describe('Zs_max golden values', () => {
  it.each([
    ['B', 16, 2.73],
    ['B', 32, 1.37],
    ['C', 16, 1.37],
    ['C', 32, 0.68],
  ] as const)('%s%i -> %f ohm', (dev, inA, expected) => {
    expect(zsMax(dev, inA)).toBeCloseTo(expected, 1);
    expect(Math.abs(zsMax(dev, inA) - expected)).toBeLessThanOrEqual(0.01);
  });
  it('measured limit is 0.8 x design', () => {
    expect(zsMaxMeasured('B', 16)).toBeCloseTo(0.8 * zsMax('B', 16), 10);
  });
});

describe('conductors', () => {
  it('table values', () => {
    expect(r20OhmPerM(2.5)).toBeCloseTo(0.00741, 8);
    expect(r20OhmPerM(1.5)).toBeCloseTo(0.0121, 8);
  });
  it('falls back to rho/S for non-table sizes', () => {
    expect(r20OhmPerM(1.0) * 1000).toBeCloseTo(17.241, 6);
  });
  it('(R1+R2) cold 2.5 + 1.5 = 19.51 mohm/m', () => {
    expect(r1r2ColdOhm(2.5, 1.5, 1) * 1000).toBeCloseTo(19.51, 6);
  });
  it('cpc default sizing', () => {
    expect(defaultCpcCsa(2.5)).toBe(2.5);
    expect(defaultCpcCsa(16)).toBe(16);
    expect(defaultCpcCsa(25)).toBe(16);
    expect(defaultCpcCsa(35)).toBe(16);
    expect(defaultCpcCsa(50)).toBe(25);
  });
  it('next size up', () => {
    expect(nextSizeUp(1.5)).toBe(2.5);
    expect(nextSizeUp(50)).toBeUndefined();
  });
});

describe('voltage drop golden values', () => {
  const perAm = (csa: number) =>
    voltageDropV({ ...base, lineCsaMm2: csa, lengthM: 1, ibA: 1 }) * 1000;
  it('2.5 mm2 PVC ~ 17.8 mV/A/m', () => {
    expect(Math.abs(perAm(2.5) - 17.8)).toBeLessThanOrEqual(0.3);
  });
  it('1.5 mm2 PVC ~ 29.0 mV/A/m', () => {
    expect(Math.abs(perAm(1.5) - 29.0)).toBeLessThanOrEqual(0.5);
  });
  it('worked example 2.5mm2, 20 m, 16 A: recomputed from formula', () => {
    const expectedV = 2 * (7.41 / 1000) * 1.2 * 20 * 16;
    const r = voltageDropCheck(base);
    expect(r.inputs['Vd (V)']).toBeCloseTo(expectedV, 3);
    expect(expectedV).toBeCloseTo(5.7, 1);
    expect(r.value).toBeCloseTo((expectedV / 230) * 100, 6);
    expect(r.value).toBeCloseTo(2.5, 0);
    expect(r.status).toBe('PASS');
  });
  it('lighting 3% limit fails where 5% passes', () => {
    const c = { ...base, lineCsaMm2: 1.5, lengthM: 30, ibA: 10, inA: 10 }; // 3.8 %
    expect(voltageDropCheck({ ...c, kind: 'lighting' }).status).toBe('FAIL');
    expect(voltageDropCheck({ ...c, kind: 'fixed' }).status).toBe('PASS');
  });
  it('three-phase uses sqrt3 and 400 V', () => {
    const r = voltageDropCheck({ ...base, phases: '3P' });
    const vd = Math.sqrt(3) * (7.41 / 1000) * 1.2 * 20 * 16;
    expect(r.inputs['Vd (V)']).toBeCloseTo(vd, 3);
    expect(r.value).toBeCloseTo((vd / 400) * 100, 6);
  });
  it('large csa gives an advisory when otherwise passing', () => {
    const r = voltageDropCheck({ ...base, lineCsaMm2: 25, cpcCsaMm2: undefined, ibA: 10 });
    expect(r.status).toBe('ADVISORY');
  });
  it('XLPE multiplier is 1.28', () => {
    expect(hotMultiplier('XLPE90')).toBe(1.28);
  });
  it('bad input yields INPUT_ERROR, not a throw', () => {
    expect(voltageDropCheck({ ...base, lengthM: -1 }).status).toBe('INPUT_ERROR');
    expect(voltageDropCheck({ ...base, ibA: NaN }).status).toBe('INPUT_ERROR');
  });
});

describe('earth fault check', () => {
  it('design Zs = Ze + hot R1+R2', () => {
    const r = earthFaultCheck(base, supply);
    const hot = 20 * (0.00741 + 0.0121) * 1.2;
    expect(r.value).toBeCloseTo(0.35 + hot, 6);
    expect(r.limit).toBeCloseTo(zsMax('B', 16), 10);
    expect(r.status).toBe('PASS');
  });
  it('fails for long run on C32', () => {
    const r = earthFaultCheck({ ...base, device: 'C', inA: 32, lengthM: 60 }, supply);
    expect(r.status).toBe('FAIL');
  });
  it('bad input', () => {
    expect(earthFaultCheck({ ...base, inA: 0 }, supply).status).toBe('INPUT_ERROR');
    expect(earthFaultCheck(base, { uoV: 230, ueOhm: -1 }).status).toBe('INPUT_ERROR');
  });
});

describe('fault withstand', () => {
  it.each([
    [1000, 0.1, 115],
    [3200, 0.4, 143],
    [450, 0.2, 115],
  ])('S_min = I*sqrt(t)/k for I=%f t=%f k=%f', (i, t, k) => {
    expect(minCpcCsa(i, t, k)).toBeCloseTo((i * Math.sqrt(t)) / k, 10);
    expect(evaluateFaultWithstand({ cpcCsaMm2: 10, ipfA: i, tS: t, k }).limit).toBeCloseTo(
      (i * Math.sqrt(t)) / k,
      10,
    );
  });
  it('1.0 mm2 cpc fails where 1.5 mm2 passes at 436 A, 0.1 s, k=115 (S_min = 1.2)', () => {
    const args = { ipfA: 436, tS: 0.1, k: 115 };
    expect(evaluateFaultWithstand({ ...args, cpcCsaMm2: 1.0 }).status).toBe('FAIL');
    expect(evaluateFaultWithstand({ ...args, cpcCsaMm2: 1.5 }).status).toBe('PASS');
  });
  it('full check uses cold Zs', () => {
    const r = faultWithstandCheck(base, supply);
    const zsCold = 0.35 + 20 * (0.00741 + 0.0121);
    expect(r.inputs['Zs cold (Ω)']).toBeCloseTo(zsCold, 3);
    expect(r.limit).toBeCloseTo(((230 / zsCold) * Math.sqrt(0.1)) / K_FACTOR.PVC70, 2);
  });
  it('very low impedance fails a small cpc', () => {
    const r = faultWithstandCheck({ ...base, lengthM: 1 }, { uoV: 230, ueOhm: 0.02 });
    expect(r.status).toBe('FAIL');
  });
  it('bad input', () => {
    expect(faultWithstandCheck({ ...base, lengthM: 0 }, supply).status).toBe('INPUT_ERROR');
    expect(evaluateFaultWithstand({ cpcCsaMm2: 1, ipfA: -1, tS: 0.1, k: 115 }).status).toBe(
      'INPUT_ERROR',
    );
  });
});
