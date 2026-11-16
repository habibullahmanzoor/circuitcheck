import type { CheckResult, Circuit, Supply } from './types';

export const isPos = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0;
export const isNonNeg = (n: unknown): n is number =>
  typeof n === 'number' && Number.isFinite(n) && n >= 0;

export function inputError(
  id: string,
  title: string,
  clauseRef: string,
  reason: string,
): CheckResult {
  return {
    id,
    title,
    status: 'INPUT_ERROR',
    formula: '',
    inputs: {},
    assumptions: [],
    clauseRef,
    message: `Invalid input: ${reason}`,
  };
}

/** Returns a reason string if the circuit cannot be calculated, else undefined. */
export function circuitProblem(c: Circuit, needIb = true): string | undefined {
  if (!isPos(c.lineCsaMm2)) return 'line csa must be a positive number';
  if (c.cpcCsaMm2 !== undefined && !isPos(c.cpcCsaMm2)) return 'cpc csa must be a positive number';
  if (!isPos(c.lengthM)) return 'length must be a positive number';
  if (!isPos(c.inA)) return 'In must be a positive number';
  if (needIb && !isPos(c.ibA)) return 'Ib must be a positive number';
  return undefined;
}

export function supplyProblem(s: Supply): string | undefined {
  if (!isNonNeg(s.ueOhm)) return 'Ze must be zero or a positive number';
  return undefined;
}

export const fmt = (n: number, dp = 2): string => n.toFixed(dp);
