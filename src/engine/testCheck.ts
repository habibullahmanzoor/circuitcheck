import { r1r2ColdOhm, resolveCpc } from './conductors';
import { zsMax, zsMaxMeasured } from './earthFault';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { VERIFY, type CheckResult, type Circuit, type Status, type Supply } from './types';
import { fmt, inputError, isNonNeg, isPos, supplyProblem } from './util';

const CLAUSE = `BS 7671 Part 6 / GN3 (${VERIFY})`; // TODO(verify)

/** Measured values from site. A field left undefined has not been entered. */
export interface TestInput {
  measuredZs?: number;
  measuredR1R2?: number;
  irMohm?: number;
  polarityOk?: boolean;
  rcdTrip1xMs?: number;
  rcdTrip5xMs?: number;
}

/** Defaults only; live limits come from Settings. */
export const IR_FAIL_MOHM = DEFAULT_SETTINGS.irFailMohm;
export const IR_ADVISORY_MOHM = DEFAULT_SETTINGS.irAdvisoryMohm;
export const RCD_1X_MAX_MS = DEFAULT_SETTINGS.rcd1xMaxMs;
export const RCD_5X_MAX_MS = DEFAULT_SETTINGS.rcd5xMaxMs;
export const CONSISTENCY_TOL = 0.25;
export const R1R2_TOL = 0.2;

const make = (
  id: string,
  title: string,
  status: Status,
  message: string,
  extra: Partial<CheckResult>,
): CheckResult => ({
  id,
  title,
  status,
  formula: '',
  inputs: {},
  assumptions: [],
  clauseRef: CLAUSE,
  message,
  ...extra,
});

/** Limits to show beside each field on the site form. */
export function testLimits(c: Circuit, cfg: Settings = DEFAULT_SETTINGS): { zsMaxMeasured: number; irMinMohm: number } {
  return { zsMaxMeasured: zsMaxMeasured(c.device, c.inA, cfg), irMinMohm: cfg.irFailMohm };
}

/** Validate whatever has been entered so far. Only entered fields produce results. */
export function testCheck(c: Circuit, s: Supply, t: TestInput, cfg: Settings = DEFAULT_SETTINGS): CheckResult[] {
  const out: CheckResult[] = [];
  const bad = (id: string, title: string, why: string): CheckResult => inputError(id, title, CLAUSE, why);
  const sp = supplyProblem(s);

  if (t.measuredZs !== undefined) {
    const title = 'Measured Zs';
    if (!isPos(t.measuredZs) || !isPos(c.inA)) out.push(bad('test-zs', title, 'Zs and In must be positive numbers'));
    else {
      const lim = zsMaxMeasured(c.device, c.inA, cfg);
      const pass = t.measuredZs <= lim;
      out.push(
        make('test-zs', title, pass ? 'PASS' : 'FAIL',
          pass
            ? `Zs ${fmt(t.measuredZs)} Ω is within ${fmt(lim)} Ω.`
            : `Zs ${fmt(t.measuredZs)} Ω exceeds ${fmt(lim)} Ω.`,
          {
            value: t.measuredZs,
            limit: lim,
            unit: 'Ω',
            formula: `Zs_measured ≤ ${cfg.siteZsFactor} · Zs_max`,
            inputs: { 'Zs_max (Ω)': Number(zsMax(c.device, c.inA, cfg).toFixed(3)), factor: cfg.siteZsFactor },
            assumptions: [`Measured at ambient temperature, so ${cfg.siteZsFactor} × the operating-temperature limit applies.`],
          }),
      );
    }
  }

  if (t.irMohm !== undefined) {
    const title = 'Insulation resistance';
    if (!isNonNeg(t.irMohm)) out.push(bad('test-ir', title, 'insulation resistance must be zero or positive'));
    else {
      const st: Status = t.irMohm < cfg.irFailMohm ? 'FAIL' : t.irMohm < cfg.irAdvisoryMohm ? 'ADVISORY' : 'PASS';
      out.push(
        make('test-ir', title, st,
          st === 'FAIL' ? `${fmt(t.irMohm)} MΩ is below ${cfg.irFailMohm} MΩ.`
            : st === 'ADVISORY' ? `${fmt(t.irMohm)} MΩ passes but is below ${cfg.irAdvisoryMohm} MΩ; investigate.`
              : `${fmt(t.irMohm)} MΩ is satisfactory.`,
          {
            value: t.irMohm,
            limit: cfg.irFailMohm,
            unit: 'MΩ',
            formula: `IR ≥ ${cfg.irFailMohm} MΩ (advisory below ${cfg.irAdvisoryMohm} MΩ)`,
            assumptions: ['Minimum values as set in this tool; check the test voltage and limits for your installation.'],
          }),
      );
    }
  }

  if (t.polarityOk !== undefined) {
    out.push(
      make('test-polarity', 'Polarity', t.polarityOk ? 'PASS' : 'FAIL',
        t.polarityOk ? 'Polarity correct.' : 'Polarity incorrect.', { formula: 'polarity must be correct' }),
    );
  }

  if (t.rcdTrip1xMs !== undefined) {
    const title = 'RCD trip time at 1×IΔn';
    if (!isNonNeg(t.rcdTrip1xMs)) out.push(bad('test-rcd-1x', title, 'trip time must be zero or positive'));
    else {
      const pass = t.rcdTrip1xMs <= cfg.rcd1xMaxMs;
      out.push(
        make('test-rcd-1x', title, pass ? 'PASS' : 'FAIL',
          pass ? `${fmt(t.rcdTrip1xMs, 0)} ms is within ${cfg.rcd1xMaxMs} ms.` : `${fmt(t.rcdTrip1xMs, 0)} ms exceeds ${cfg.rcd1xMaxMs} ms.`,
          { value: t.rcdTrip1xMs, limit: cfg.rcd1xMaxMs, unit: 'ms', formula: `t(1×) ≤ ${cfg.rcd1xMaxMs} ms` }),
      );
    }
  }

  if (t.rcdTrip5xMs !== undefined) {
    const title = 'RCD trip time at 5×IΔn';
    if (!isNonNeg(t.rcdTrip5xMs)) out.push(bad('test-rcd-5x', title, 'trip time must be zero or positive'));
    else if (c.rcdMa === undefined || !(c.rcdMa <= 30)) {
      out.push(make('test-rcd-5x', title, 'NOT_CHECKED', 'The 5× limit applies to RCDs rated 30 mA or less.', { unit: 'ms' }));
    } else {
      const pass = t.rcdTrip5xMs <= cfg.rcd5xMaxMs;
      out.push(
        make('test-rcd-5x', title, pass ? 'PASS' : 'FAIL',
          pass ? `${fmt(t.rcdTrip5xMs, 0)} ms is within ${cfg.rcd5xMaxMs} ms.` : `${fmt(t.rcdTrip5xMs, 0)} ms exceeds ${cfg.rcd5xMaxMs} ms.`,
          { value: t.rcdTrip5xMs, limit: cfg.rcd5xMaxMs, unit: 'ms', formula: `t(5×) ≤ ${cfg.rcd5xMaxMs} ms (RCD ≤ 30 mA)` }),
      );
    }
  }

  if (t.measuredR1R2 !== undefined) {
    const title = 'Measured (R1+R2) vs design';
    if (!isNonNeg(t.measuredR1R2) || !isPos(c.lineCsaMm2) || !isPos(c.lengthM))
      out.push(bad('test-r1r2', title, '(R1+R2), csa and length must be valid numbers'));
    else {
      const design = r1r2ColdOhm(c.lineCsaMm2, resolveCpc(c), c.lengthM);
      const dev = Math.abs(t.measuredR1R2 - design) / design;
      const ok = dev <= R1R2_TOL;
      out.push(
        make('test-r1r2', title, ok ? 'PASS' : 'ADVISORY',
          ok ? `Within ${R1R2_TOL * 100}% of design (${fmt(design, 3)} Ω).`
            : `Differs from design (${fmt(design, 3)} Ω) by ${fmt(dev * 100, 0)}%.`,
          {
            value: t.measuredR1R2,
            limit: design,
            unit: 'Ω',
            formula: '|measured − design_cold| / design_cold ≤ 20%',
            inputs: { 'design cold (Ω)': Number(design.toFixed(4)) },
            assumptions: ['Design value is at 20 °C; adjust for site temperature before drawing conclusions.'],
          }),
      );
    }
  }

  if (t.measuredZs !== undefined && t.measuredR1R2 !== undefined) {
    const title = 'Zs consistency';
    if (sp || !isPos(t.measuredZs) || !isNonNeg(t.measuredR1R2)) out.push(bad('test-consistency', title, sp ?? 'Zs and (R1+R2) must be valid numbers'));
    else {
      const expect = s.ueOhm + t.measuredR1R2;
      const dev = Math.abs(t.measuredZs - expect) / t.measuredZs;
      const ok = dev <= CONSISTENCY_TOL;
      out.push(
        make('test-consistency', title, ok ? 'PASS' : 'ADVISORY',
          ok ? 'Zs agrees with Ze + (R1+R2).' : `Zs differs from Ze + (R1+R2) = ${fmt(expect, 3)} Ω by ${fmt(dev * 100, 0)}%; recheck readings.`,
          {
            value: t.measuredZs,
            limit: expect,
            unit: 'Ω',
            formula: '|Zs − (Ze + (R1+R2))| / Zs ≤ 25%',
            inputs: { 'Ze (Ω)': s.ueOhm },
          }),
      );
    }
  }

  return out;
}
