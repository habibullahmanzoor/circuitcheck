import { ampacityCheck, designCurrentCheck, type AmpacityTable } from './ampacity';
import { additionalProtectionCheck } from './additionalProtection';
import { defaultCpcCsa, STANDARD_SIZES_MM2 } from './conductors';
import { earthFaultCheck } from './earthFault';
import { faultWithstandCheck } from './faultWithstand';
import { DEFAULT_SETTINGS, type Settings } from './settings';
import type { CheckResult, Circuit, Device, Fix, Status, Supply } from './types';
import { voltageDropCheck } from './voltageDrop';

export const STANDARD_RATINGS_A: readonly number[] = [6, 10, 16, 20, 25, 32, 40, 50, 63, 80, 100];

export interface CircuitReport {
  circuitId: string;
  ref: string;
  results: CheckResult[];
  overall: Status;
}

export interface BoardSummary {
  total: number;
  pass: number;
  fail: number;
  advisory: number;
  inputError: number;
}

/** All checks for one circuit, without suggestions. */
export function runChecks(c: Circuit, s: Supply, t: AmpacityTable, cfg: Settings = DEFAULT_SETTINGS): CheckResult[] {
  const out: CheckResult[] = [
    voltageDropCheck(c, cfg),
    earthFaultCheck(c, s, cfg),
    faultWithstandCheck(c, s, cfg),
    designCurrentCheck(c),
    ampacityCheck(c, t),
  ];
  const rcd = additionalProtectionCheck(c);
  if (rcd) out.push(rcd);
  return out;
}

export function overallStatus(results: readonly CheckResult[]): Status {
  if (results.some((r) => r.status === 'INPUT_ERROR')) return 'INPUT_ERROR';
  if (results.some((r) => r.status === 'FAIL')) return 'FAIL';
  if (results.some((r) => r.status === 'ADVISORY' || r.status === 'NOT_CHECKED')) return 'ADVISORY';
  return results.length === 0 ? 'NOT_CHECKED' : 'PASS';
}

const passed = (r: CheckResult | undefined): r is CheckResult =>
  r !== undefined && (r.status === 'PASS' || r.status === 'ADVISORY');

/**
 * Re-run all checks on a variant. Accept it only if the target check now passes and no
 * check that previously did not fail now fails.
 */
function verify(
  variant: Circuit,
  s: Supply,
  t: AmpacityTable,
  targetId: string,
  before: readonly CheckResult[],
  cfg: Settings,
): CheckResult | undefined {
  const after = runChecks(variant, s, t, cfg);
  const target = after.find((r) => r.id === targetId);
  if (!passed(target)) return undefined;
  for (const b of before) {
    if (b.status === 'FAIL') continue;
    const a = after.find((r) => r.id === b.id);
    if (a && (a.status === 'FAIL' || a.status === 'INPUT_ERROR')) return undefined;
  }
  return target;
}

const pctText = (r: CheckResult): string => (r.value ?? 0).toFixed(1);

function ratingsBelow(c: Circuit): number[] {
  return STANDARD_RATINGS_A.filter((r) => r < c.inA && r >= c.ibA).reverse();
}

function curvesBelow(d: Device): Device[] {
  return d === 'D' ? ['C', 'B'] : d === 'C' ? ['B'] : [];
}

/** First verified option in a family, as a fix, or undefined. */
function firstVerified<T>(
  options: readonly T[],
  patchOf: (o: T) => Partial<Circuit>,
  text: (o: T, after: CheckResult) => string,
  c: Circuit,
  s: Supply,
  t: AmpacityTable,
  targetId: string,
  before: readonly CheckResult[],
  cfg: Settings,
): Fix | undefined {
  for (const o of options) {
    const patch = patchOf(o);
    const after = verify({ ...c, ...patch }, s, t, targetId, before, cfg);
    if (after) return { text: text(o, after), patch };
  }
  return undefined;
}

function suggest(
  failed: CheckResult,
  c: Circuit,
  s: Supply,
  t: AmpacityTable,
  before: readonly CheckResult[],
  cfg: Settings,
): Fix[] {
  const id = failed.id;
  const bigger = STANDARD_SIZES_MM2.filter((x) => x > c.lineCsaMm2);
  const parts: (Fix | undefined)[] = [];
  const fv = <T,>(o: readonly T[], p: (x: T) => Partial<Circuit>, tx: (x: T, a: CheckResult) => string) =>
    firstVerified(o, p, tx, c, s, t, id, before, cfg);

  if (id === 'voltage-drop') {
    parts.push(fv(bigger, (z) => ({ lineCsaMm2: z }), (z, a) => `increase line csa to ${z} mm² (drop ${pctText(a)}%)`));
    const maxLen = Math.floor(((c.lengthM * (failed.limit ?? 0)) / (failed.value ?? 1)) * 10) / 10;
    parts.push(fv(maxLen > 0 ? [maxLen] : [], (l) => ({ lengthM: l }), (l) => `shorten the run to ${l} m or less`));
  } else if (id === 'earth-fault-loop') {
    parts.push(
      fv(curvesBelow(c.device), (d) => ({ device: d }), (d) => `use a type ${d} device`),
      fv(bigger, (z) => ({ lineCsaMm2: z, cpcCsaMm2: defaultCpcCsa(z) }), (z) => `increase line and cpc csa to ${z} mm²`),
      fv(ratingsBelow(c), (r) => ({ inA: r }), (r) => `use a lower-rated device (${r} A)`),
    );
  } else if (id === 'fault-withstand') {
    const cpcNow = c.cpcCsaMm2 ?? defaultCpcCsa(c.lineCsaMm2);
    parts.push(fv(STANDARD_SIZES_MM2.filter((x) => x > cpcNow), (z) => ({ cpcCsaMm2: z }), (z) => `increase cpc csa to ${z} mm²`));
  } else if (id === 'rcd-protection') {
    parts.push(fv([30], (ma) => ({ rcdMa: ma }), (ma) => `fit a ${ma} mA RCD`));
  } else if (id === 'ib-in') {
    parts.push(fv(STANDARD_RATINGS_A.filter((r) => r >= c.ibA), (r) => ({ inA: r }), (r) => `use a ${r} A device`));
  } else if (id === 'ampacity') {
    parts.push(
      fv(bigger, (z) => ({ lineCsaMm2: z }), (z) => `increase line csa to ${z} mm²`),
      fv(ratingsBelow(c), (r) => ({ inA: r }), (r) => `use a lower-rated device (${r} A)`),
    );
  }
  return parts.filter((p): p is Fix => p !== undefined);
}

/** Checks one circuit and attaches engine-verified suggestions to failures. */
export function checkCircuit(c: Circuit, s: Supply, t: AmpacityTable, cfg: Settings = DEFAULT_SETTINGS): CircuitReport {
  const base = runChecks(c, s, t, cfg);
  const results = base.map((r) => {
    if (r.status !== 'FAIL') return r;
    const fixes = suggest(r, c, s, t, base, cfg);
    if (fixes.length === 0) return r;
    const joined = fixes.map((f) => f.text).join(', or ');
    return { ...r, fixes, suggestion: joined.charAt(0).toUpperCase() + joined.slice(1) + '.' };
  });
  return { circuitId: c.id, ref: c.ref, results, overall: overallStatus(results) };
}

export function summarise(reports: readonly CircuitReport[]): BoardSummary {
  const count = (st: Status): number => reports.filter((r) => r.overall === st).length;
  return {
    total: reports.length,
    pass: count('PASS'),
    fail: count('FAIL'),
    advisory: count('ADVISORY'),
    inputError: count('INPUT_ERROR'),
  };
}

export function checkBoard(
  circuits: readonly Circuit[],
  s: Supply,
  t: AmpacityTable,
  cfg: Settings = DEFAULT_SETTINGS,
): { reports: CircuitReport[]; summary: BoardSummary } {
  const reports = circuits.map((c) => checkCircuit(c, s, t, cfg));
  return { reports, summary: summarise(reports) };
}

export interface SizeOption {
  csaMm2: number;
  results: CheckResult[];
  overall: Status;
}

/** Try every standard line size (cpc by the sizing rule) and report each result. */
export function sizeFinder(base: Circuit, s: Supply, t: AmpacityTable, cfg: Settings = DEFAULT_SETTINGS): SizeOption[] {
  return STANDARD_SIZES_MM2.map((z) => {
    const c: Circuit = { ...base, lineCsaMm2: z, cpcCsaMm2: defaultCpcCsa(z) };
    const results = runChecks(c, s, t, cfg);
    return { csaMm2: z, results, overall: overallStatus(results) };
  });
}

/** Smallest size whose overall status is PASS or ADVISORY. */
export function smallestPassing(opts: readonly SizeOption[]): SizeOption | undefined {
  return opts.find((o) => o.overall === 'PASS' || o.overall === 'ADVISORY');
}
