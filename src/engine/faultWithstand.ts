import { r1r2ColdOhm, resolveCpc } from './conductors';
import { VERIFY, type CheckResult, type Circuit, type Insulation, type Supply } from './types';
import { UO } from './earthFault';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { circuitProblem, fmt, inputError, isPos, supplyProblem } from './util';

const ID = 'fault-withstand';
const TITLE = 'CPC fault withstand (adiabatic)';
const CLAUSE = `BS 7671 Reg 543.1 (${VERIFY})`; // TODO(verify)

/** Defaults, kept as named exports. Live values come from Settings. TODO(verify) */
export const DEFAULT_DISCONNECTION_S = DEFAULT_SETTINGS.disconnectionS;
export const K_FACTOR: Readonly<Record<Insulation, number>> = DEFAULT_SETTINGS.kFactor;

/** Minimum cpc csa, mm²: S = I·√t / k. */
export const minCpcCsa = (ipfA: number, tS: number, k: number): number =>
  (ipfA * Math.sqrt(tS)) / k;

export interface FaultInput {
  cpcCsaMm2: number;
  ipfA: number;
  tS: number;
  k: number;
}

/** Low-level evaluation with explicit fault current. */
export function evaluateFaultWithstand(f: FaultInput): CheckResult {
  if (!isPos(f.cpcCsaMm2) || !isPos(f.ipfA) || !isPos(f.tS) || !isPos(f.k)) {
    return inputError(ID, TITLE, CLAUSE, 'cpc csa, fault current, time and k must be positive numbers');
  }
  const sMin = minCpcCsa(f.ipfA, f.tS, f.k);
  const pass = f.cpcCsaMm2 >= sMin;
  return {
    id: ID,
    title: TITLE,
    status: pass ? 'PASS' : 'FAIL',
    value: f.cpcCsaMm2,
    limit: sMin,
    unit: 'mm²',
    formula: 'S_min = I_pf · √t / k ; require cpc csa ≥ S_min',
    inputs: { 'I_pf (A)': Number(f.ipfA.toFixed(1)), 't (s)': f.tS, k: f.k, 'S_min (mm²)': Number(sMin.toFixed(3)) },
    assumptions: [
      `Disconnection time assumed ${f.tS} s (configurable).`,
      'Worst case: fault current from cold conductors.',
      'Manufacturer let-through I²t not used (v2).',
    ],
    clauseRef: CLAUSE,
    message: pass
      ? `cpc ${fmt(f.cpcCsaMm2, 1)} mm² ≥ required ${fmt(sMin)} mm².`
      : `cpc ${fmt(f.cpcCsaMm2, 1)} mm² is below the required ${fmt(sMin)} mm².`,
  };
}

export function faultWithstandCheck(c: Circuit, s: Supply, cfg: Settings = DEFAULT_SETTINGS): CheckResult {
  const tS = cfg.disconnectionS;
  const problem = circuitProblem(c, false) ?? supplyProblem(s);
  if (problem) return inputError(ID, TITLE, CLAUSE, problem);
  const cpc = resolveCpc(c);
  const zsCold = s.ueOhm + r1r2ColdOhm(c.lineCsaMm2, cpc, c.lengthM);
  const ipf = UO / zsCold;
  const r = evaluateFaultWithstand({ cpcCsaMm2: cpc, ipfA: ipf, tS, k: cfg.kFactor[c.insulation] });
  return {
    ...r,
    formula: 'I_pf = Uo / Zs_cold ; S_min = I_pf · √t / k ; require cpc csa ≥ S_min',
    inputs: { ...r.inputs, 'Zs cold (Ω)': Number(zsCold.toFixed(4)), 'Uo (V)': UO },
  };
}
