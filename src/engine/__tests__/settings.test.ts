import { describe, it, expect } from 'vitest';
import demoJson from '../../data/ampacity.demo.json';
import {
  DEFAULT_SETTINGS, SETTING_FIELDS, changedSettings, checkCircuit, earthFaultCheck, faultWithstandCheck,
  parseAmpacityTable, parseSettings, sizeFinder, smallestPassing, testCheck, testLimits, validateSetting,
  voltageDropCheck, zsMax, type AmpacityTable, type Circuit, type Settings,
} from '../index';

const table = parseAmpacityTable(demoJson).table as AmpacityTable;
const supply = { uoV: 230 as const, ueOhm: 0.35 };
const c: Circuit = {
  id: 't', ref: 'T', description: '', phases: '1P', kind: 'fixed', device: 'B', inA: 16, ibA: 10,
  lineCsaMm2: 2.5, insulation: 'PVC70', lengthM: 20, installMethod: 'C', ambientFactor: 1, groupingFactor: 1,
};
const with_ = (id: string, v: number, s: Settings = DEFAULT_SETTINGS): Settings => {
  const f = SETTING_FIELDS.find((x) => x.id === id);
  if (!f) throw new Error(id);
  return f.set(s, v);
};

describe('settings change results', () => {
  it('defaults reproduce the original numbers', () => {
    expect(zsMax('B', 16, DEFAULT_SETTINGS)).toBeCloseTo(2.73, 2);
    expect(voltageDropCheck(c, DEFAULT_SETTINGS).limit).toBe(5);
    expect(changedSettings(DEFAULT_SETTINGS)).toEqual([]);
  });
  it('voltage-drop limit and hot multiplier', () => {
    const tight = with_('vd-other', 1);
    expect(voltageDropCheck(c, tight).status).toBe('FAIL');
    expect(voltageDropCheck(c, with_('hot-pvc', 1.0)).value).toBeLessThan(voltageDropCheck(c).value as number);
    expect(voltageDropCheck({ ...c, kind: 'lighting' }, with_('vd-light', 2.4)).limit).toBe(2.4);
  });
  it('Cmin changes the Zs limit', () => {
    expect(earthFaultCheck(c, supply, with_('cmin', 0.8)).limit).toBeCloseTo((0.8 * 230) / 80, 10);
  });
  it('disconnection time and k change the cpc requirement', () => {
    const base = faultWithstandCheck(c, supply).limit as number;
    expect(faultWithstandCheck(c, supply, with_('disc', 0.4)).limit).toBeCloseTo(base * 2, 6);
    expect(faultWithstandCheck(c, supply, with_('k-pvc', 230)).limit).toBeCloseTo(base / 2, 6);
    expect(faultWithstandCheck({ ...c, insulation: 'XLPE90' }, supply, with_('k-xlpe', 100)).inputs.k).toBe(100);
  });
  it('site limits follow the settings', () => {
    expect(testLimits(c, with_('site-zs', 0.5)).zsMaxMeasured).toBeCloseTo(0.5 * zsMax('B', 16), 10);
    expect(testLimits(c, with_('ir-fail', 2)).irMinMohm).toBe(2);
    expect(testCheck(c, supply, { irMohm: 1.5 }, with_('ir-fail', 2))[0]?.status).toBe('FAIL');
    expect(testCheck(c, supply, { rcdTrip1xMs: 250 }, with_('rcd1', 200))[0]?.status).toBe('FAIL');
    expect(testCheck({ ...c, rcdMa: 30 }, supply, { rcdTrip5xMs: 45 }, with_('rcd5', 50))[0]?.status).toBe('PASS');
    expect(testCheck(c, supply, { measuredZs: 2.4 }, with_('site-zs', 0.95))[0]?.status).toBe('PASS');
    expect(testCheck(c, supply, { measuredZs: 2.4 })[0]?.status).toBe('FAIL');
  });
  it('verified suggestions and the size finder respect the settings', () => {
    const light: Circuit = { ...c, kind: 'lighting', inA: 6, ibA: 5, lineCsaMm2: 1.5, lengthM: 55 };
    const strict = with_('vd-light', 1.5);
    const rep = checkCircuit(light, supply, table, strict);
    expect(rep.results.find((r) => r.id === 'voltage-drop')?.suggestion).toMatch(/increase line csa to (4|6)/i);
    expect(smallestPassing(sizeFinder(light, supply, table, strict))?.csaMm2).not.toBe(
      smallestPassing(sizeFinder(light, supply, table))?.csaMm2,
    );
  });
});

describe('validation and storage', () => {
  it('validates ranges and the IR ordering', () => {
    const f = (id: string) => SETTING_FIELDS.find((x) => x.id === id)!;
    expect(validateSetting(f('cmin'), 0.95, DEFAULT_SETTINGS)).toBeUndefined();
    expect(validateSetting(f('cmin'), 5, DEFAULT_SETTINGS)).toMatch(/between/);
    expect(validateSetting(f('cmin'), NaN, DEFAULT_SETTINGS)).toMatch(/number/);
    expect(validateSetting(f('ir-adv'), 0.5, DEFAULT_SETTINGS)).toMatch(/lower than the fail/);
    expect(validateSetting(f('ir-fail'), 5, DEFAULT_SETTINGS)).toMatch(/higher than the advisory/);
  });
  it('parseSettings keeps valid values and falls back for junk', () => {
    expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(parseSettings('x')).toEqual(DEFAULT_SETTINGS);
    const s = parseSettings({ cmin: 0.9, hotMultiplier: { PVC70: 1.3, XLPE90: 99 }, vdLimitOtherPct: 'five', irFailMohm: 1.5 });
    expect(s.cmin).toBe(0.9);
    expect(s.hotMultiplier.PVC70).toBe(1.3);
    expect(s.hotMultiplier.XLPE90).toBe(DEFAULT_SETTINGS.hotMultiplier.XLPE90);
    expect(s.vdLimitOtherPct).toBe(5);
    expect(s.irFailMohm).toBe(1.5);
  });
  it('lists only what differs from the defaults', () => {
    const s = with_('cmin', 0.9, with_('disc', 0.2));
    expect(changedSettings(s).map((x) => x.label)).toEqual(['Voltage factor Cmin', 'Assumed disconnection time']);
    expect(changedSettings(s)[0]).toMatchObject({ value: 0.9, defaultValue: 0.95 });
  });
});
