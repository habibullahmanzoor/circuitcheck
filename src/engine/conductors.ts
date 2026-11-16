import { DEFAULT_SETTINGS, type Settings } from './settings';
import type { Circuit, Insulation } from './types';

/** BS EN 60228 max DC resistance at 20 °C, copper, mΩ/m. */
const R20_MOHM_PER_M: Readonly<Record<string, number>> = {
  '1.5': 12.1,
  '2.5': 7.41,
  '4': 4.61,
  '6': 3.08,
  '10': 1.83,
  '16': 1.15,
  '25': 0.727,
  '35': 0.524,
  '50': 0.387,
};

/** Copper resistivity at 20 °C, mΩ·mm²/m, used for sizes not in the table. */
const RHO20 = 17.241;

export const STANDARD_SIZES_MM2: readonly number[] = [1.5, 2.5, 4, 6, 10, 16, 25, 35, 50];

/** TODO(verify): operating-temperature multipliers against your licensed copy. */
export const HOT_MULTIPLIER: Readonly<Record<Insulation, number>> = {
  PVC70: 1.2,
  XLPE90: 1.28,
};

/** Resistance at 20 °C in Ω/m. Caller must pass a positive finite csa. */
export function r20OhmPerM(csaMm2: number): number {
  const tabled = R20_MOHM_PER_M[String(csaMm2)];
  return (tabled ?? RHO20 / csaMm2) / 1000;
}

export function hotMultiplier(ins: Insulation, cfg: Settings = DEFAULT_SETTINGS): number {
  return cfg.hotMultiplier[ins];
}

/** CPC default sizing: S ≤ 16 → S; 16 < S ≤ 35 → 16; S > 35 → S/2. */
export function defaultCpcCsa(lineCsaMm2: number): number {
  if (lineCsaMm2 <= 16) return lineCsaMm2;
  if (lineCsaMm2 <= 35) return 16;
  return lineCsaMm2 / 2;
}

export function resolveCpc(c: Circuit): number {
  return c.cpcCsaMm2 ?? defaultCpcCsa(c.lineCsaMm2);
}

/** Next standard size above the given csa, or undefined if none. */
export function nextSizeUp(csaMm2: number): number | undefined {
  return STANDARD_SIZES_MM2.find((s) => s > csaMm2);
}

/** (R1+R2) at 20 °C for a run, Ω. */
export function r1r2ColdOhm(lineCsa: number, cpcCsa: number, lengthM: number): number {
  return lengthM * (r20OhmPerM(lineCsa) + r20OhmPerM(cpcCsa));
}

/** (R1+R2) at operating temperature, Ω. */
export function r1r2HotOhm(
  lineCsa: number,
  cpcCsa: number,
  lengthM: number,
  ins: Insulation,
  cfg: Settings = DEFAULT_SETTINGS,
): number {
  return r1r2ColdOhm(lineCsa, cpcCsa, lengthM) * hotMultiplier(ins, cfg);
}
