import type { AmpacityTable } from './ampacity';
import type { CircuitReport } from './designCheck';
import type { Circuit } from './types';

/** The Ze the app starts with. If it is still this value, the user has probably not entered the real one. */
export const PLACEHOLDER_ZE_OHM = 0.35;

export type GapKind = 'cpc' | 'derating' | 'ampacity';

export interface InputGap {
  circuitId: string;
  ref: string;
  kind: GapKind;
  message: string;
}

/** Per-circuit inputs the engine had to assume or could not check. */
export function inputGaps(circuits: readonly Circuit[], reports: readonly CircuitReport[]): InputGap[] {
  const gaps: InputGap[] = [];
  for (const c of circuits) {
    if (c.cpcCsaMm2 === undefined) {
      gaps.push({ circuitId: c.id, ref: c.ref, kind: 'cpc', message: 'cpc size left blank, so the sizing rule was used. Confirm the installed cpc.' });
    }
    if (c.ambientFactor === 1 && c.groupingFactor === 1) {
      gaps.push({ circuitId: c.id, ref: c.ref, kind: 'derating', message: 'Ca and Cg are both 1, so no derating is assumed. Confirm ambient temperature and grouping.' });
    }
    const amp = reports.find((r) => r.circuitId === c.id)?.results.find((r) => r.id === 'ampacity');
    if (amp?.status === 'NOT_CHECKED') {
      gaps.push({ circuitId: c.id, ref: c.ref, kind: 'ampacity', message: 'No ampacity table entry for this size, method and insulation, so current-carrying capacity was not checked.' });
    }
  }
  return gaps;
}

/** Board-level assumptions that apply to every circuit. */
export function boardGaps(ueOhm: number, table: AmpacityTable): string[] {
  const out: string[] = [];
  if (ueOhm === PLACEHOLDER_ZE_OHM) out.push(`Ze is still the starting value (${PLACEHOLDER_ZE_OHM} Ω). Enter the declared or measured Ze for this supply.`);
  if (table.demo) out.push('Ampacity uses the illustrative demo table, not values from BS 7671.');
  return out;
}

/** Number of gaps per circuit id. */
export function gapCounts(gaps: readonly InputGap[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const g of gaps) out[g.circuitId] = (out[g.circuitId] ?? 0) + 1;
  return out;
}
