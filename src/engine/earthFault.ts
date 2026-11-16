import { r1r2ColdOhm, r1r2HotOhm, resolveCpc } from './conductors';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import { VERIFY, type CheckResult, type Circuit, type Device, type Supply } from './types';
import { circuitProblem, fmt, inputError, supplyProblem } from './util';

const ID = 'earth-fault-loop';
const TITLE = 'Earth fault loop impedance';
const CLAUSE = `BS 7671 Chapter 41 / Table 41.3 (${VERIFY})`; // TODO(verify)

/** Defaults, kept as named exports for readability. Live values come from Settings. */
export const CMIN = DEFAULT_SETTINGS.cmin;
export const UO = 230;
export const K_DEVICE: Readonly<Record<Device, number>> = { B: 5, C: 10, D: 20 };
export const AMBIENT_FACTOR = DEFAULT_SETTINGS.siteZsFactor;

/** Magnetic trip current Ia = k·In, A. */
export const tripCurrentA = (device: Device, inA: number): number => K_DEVICE[device] * inA;

/** Maximum Zs at operating temperature: Cmin·Uo / Ia, Ω. */
export const zsMax = (device: Device, inA: number, cfg: Settings = DEFAULT_SETTINGS): number =>
  (cfg.cmin * UO) / tripCurrentA(device, inA);

/** Limit to apply to a Zs measured at ambient temperature, Ω. */
export const zsMaxMeasured = (device: Device, inA: number, cfg: Settings = DEFAULT_SETTINGS): number =>
  cfg.siteZsFactor * zsMax(device, inA, cfg);

export function earthFaultCheck(c: Circuit, s: Supply, cfg: Settings = DEFAULT_SETTINGS): CheckResult {
  const problem = circuitProblem(c, false) ?? supplyProblem(s);
  if (problem) return inputError(ID, TITLE, CLAUSE, problem);

  const cpc = resolveCpc(c);
  const cold = r1r2ColdOhm(c.lineCsaMm2, cpc, c.lengthM);
  const hot = r1r2HotOhm(c.lineCsaMm2, cpc, c.lengthM, c.insulation, cfg);
  const zsDesign = s.ueOhm + hot;
  const limit = zsMax(c.device, c.inA, cfg);
  const pass = zsDesign <= limit;

  return {
    id: ID,
    title: TITLE,
    status: pass ? 'PASS' : 'FAIL',
    value: zsDesign,
    limit,
    unit: 'Ω',
    formula: 'Zs = Ze + (R1+R2)_hot ≤ Zs_max = Cmin · Uo / (k · In)',
    inputs: {
      'Ze (Ω)': s.ueOhm,
      '(R1+R2) cold (Ω)': Number(cold.toFixed(4)),
      '(R1+R2) hot (Ω)': Number(hot.toFixed(4)),
      'cpc csa (mm²)': cpc,
      k: K_DEVICE[c.device],
      'In (A)': c.inA,
      Cmin: cfg.cmin,
      'Uo (V)': UO,
    },
    assumptions: [
      `Device type ${c.device}: instantaneous trip at ${K_DEVICE[c.device]}×In.`,
      `Limit taken at operating temperature; site measurements are compared with ${cfg.siteZsFactor} × limit.`,
      c.cpcCsaMm2 === undefined ? 'cpc size defaulted by the sizing rule.' : 'cpc size as entered.',
    ],
    clauseRef: CLAUSE,
    message: pass
      ? `Design Zs ${fmt(zsDesign)} Ω is within the ${fmt(limit)} Ω limit.`
      : `Design Zs ${fmt(zsDesign)} Ω exceeds the ${fmt(limit)} Ω limit.`,
  };
}
