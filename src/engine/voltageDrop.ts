import { hotMultiplier, r20OhmPerM } from './conductors';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { VERIFY, type CheckResult, type Circuit } from './types';
import { circuitProblem, fmt, inputError } from './util';

const ID = 'voltage-drop';
const TITLE = 'Voltage drop';
const CLAUSE = `BS 7671 Appendix 4 / Reg 525 (${VERIFY})`; // TODO(verify)

/** Limit in % of nominal voltage. */
export const vdLimitPercent = (c: Pick<Circuit, 'kind'>, cfg: Settings = DEFAULT_SETTINGS): number =>
  c.kind === 'lighting' ? cfg.vdLimitLightingPct : cfg.vdLimitOtherPct;

export const nominalV = (c: Pick<Circuit, 'phases'>): number => (c.phases === '3P' ? 400 : 230);

/** Volts dropped. 1φ: 2·r·L·Ib; 3φ balanced: √3·r·L·Ib. r in Ω/m at operating temp. */
export function voltageDropV(
  c: Pick<Circuit, 'phases' | 'lineCsaMm2' | 'insulation' | 'lengthM' | 'ibA'>,
  cfg: Settings = DEFAULT_SETTINGS,
): number {
  const rHot = r20OhmPerM(c.lineCsaMm2) * hotMultiplier(c.insulation, cfg);
  const k = c.phases === '3P' ? Math.sqrt(3) : 2;
  return k * rHot * c.lengthM * c.ibA;
}

export function voltageDropCheck(c: Circuit, cfg: Settings = DEFAULT_SETTINGS): CheckResult {
  const problem = circuitProblem(c);
  if (problem) return inputError(ID, TITLE, CLAUSE, problem);

  const mult = hotMultiplier(c.insulation, cfg);
  const vd = voltageDropV(c, cfg);
  const un = nominalV(c);
  const pct = (vd / un) * 100;
  const limit = vdLimitPercent(c, cfg);
  const pass = pct <= limit;
  const rHotMohm = r20OhmPerM(c.lineCsaMm2) * mult * 1000;

  const assumptions = [
    'Resistive only (reactance neglected).',
    `Conductor at operating temperature (×${mult} for ${c.insulation}).`,
    `Limit ${limit}% for ${c.kind === 'lighting' ? 'lighting' : 'other'} circuits.`,
  ];
  let status: CheckResult['status'] = pass ? 'PASS' : 'FAIL';
  let message = pass
    ? `Drop ${fmt(vd)} V (${fmt(pct)}%) is within the ${limit}% limit.`
    : `Drop ${fmt(vd)} V (${fmt(pct)}%) exceeds the ${limit}% limit.`;
  if (pass && c.lineCsaMm2 >= 25) {
    status = 'ADVISORY';
    message += ' Reactance is not included; check the result for large conductors.';
    assumptions.push('Reactance not included (csa ≥ 25 mm²).');
  }

  return {
    id: ID,
    title: TITLE,
    status,
    value: pct,
    limit,
    unit: '%',
    formula:
      c.phases === '3P'
        ? 'Vd = √3 · r_hot · L · Ib ; % = Vd / 400 × 100'
        : 'Vd = 2 · r_hot · L · Ib ; % = Vd / 230 × 100',
    inputs: {
      'r_hot (mΩ/m)': Number(rHotMohm.toFixed(3)),
      'L (m)': c.lengthM,
      'Ib (A)': c.ibA,
      'Vd (V)': Number(vd.toFixed(3)),
    },
    assumptions,
    clauseRef: CLAUSE,
    message,
  };
}
