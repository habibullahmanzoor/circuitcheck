import { VERIFY, type CheckResult, type Circuit, type Insulation, type Phases } from './types';
import { circuitProblem, fmt, inputError, isPos } from './util';

const CLAUSE = `BS 7671 Appendix 4 (${VERIFY})`; // TODO(verify)

export interface AmpacityEntry {
  csaMm2: number;
  installMethod: string;
  insulation: Insulation;
  phases: Phases;
  itA: number;
}

export interface AmpacityTable {
  name: string;
  /** True when the table is illustrative and not from BS 7671. */
  demo: boolean;
  note?: string;
  entries: AmpacityEntry[];
}

export function lookupIt(
  t: AmpacityTable,
  csaMm2: number,
  installMethod: string,
  insulation: Insulation,
  phases: Phases,
): number | undefined {
  return t.entries.find(
    (e) =>
      e.csaMm2 === csaMm2 &&
      e.installMethod === installMethod &&
      e.insulation === insulation &&
      e.phases === phases,
  )?.itA;
}

const isRecord = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);

/** Validate untrusted JSON (e.g. a user-supplied local table). */
export function parseAmpacityTable(x: unknown): { table?: AmpacityTable; error?: string } {
  if (!isRecord(x)) return { error: 'table must be an object' };
  if (typeof x.name !== 'string') return { error: 'name must be a string' };
  if (!Array.isArray(x.entries)) return { error: 'entries must be an array' };
  const entries: AmpacityEntry[] = [];
  for (const [i, raw] of x.entries.entries()) {
    if (!isRecord(raw)) return { error: `entries[${i}] must be an object` };
    const { csaMm2, installMethod, insulation, phases, itA } = raw;
    if (!isPos(csaMm2) || !isPos(itA)) return { error: `entries[${i}]: csaMm2 and itA must be positive numbers` };
    if (typeof installMethod !== 'string' || installMethod === '')
      return { error: `entries[${i}]: installMethod must be a non-empty string` };
    if (insulation !== 'PVC70' && insulation !== 'XLPE90')
      return { error: `entries[${i}]: insulation must be PVC70 or XLPE90` };
    if (phases !== '1P' && phases !== '3P') return { error: `entries[${i}]: phases must be 1P or 3P` };
    entries.push({ csaMm2, installMethod, insulation, phases, itA });
  }
  const table: AmpacityTable = {
    name: x.name,
    demo: x.demo === true,
    entries,
  };
  if (typeof x.note === 'string') table.note = x.note;
  return { table };
}

/** Iz = It · Ca · Cg, A. */
export const correctedIz = (it: number, ca: number, cg: number): number => it * ca * cg;

/** Ib ≤ In: needs no table. */
export function designCurrentCheck(c: Circuit): CheckResult {
  const id = 'ib-in';
  const title = 'Design current vs device rating';
  const problem = circuitProblem(c);
  if (problem) return inputError(id, title, CLAUSE, problem);
  const pass = c.ibA <= c.inA;
  return {
    id,
    title,
    status: pass ? 'PASS' : 'FAIL',
    value: c.ibA,
    limit: c.inA,
    unit: 'A',
    formula: 'Ib ≤ In',
    inputs: { 'Ib (A)': c.ibA, 'In (A)': c.inA },
    assumptions: [],
    clauseRef: CLAUSE,
    message: pass
      ? `Ib ${fmt(c.ibA, 1)} A does not exceed In ${fmt(c.inA, 1)} A.`
      : `Ib ${fmt(c.ibA, 1)} A exceeds In ${fmt(c.inA, 1)} A.`,
  };
}

/** In ≤ Iz using the supplied table. NOT_CHECKED if no entry exists. */
export function ampacityCheck(c: Circuit, t: AmpacityTable): CheckResult {
  const id = 'ampacity';
  const title = 'Current-carrying capacity';
  const problem = circuitProblem(c);
  if (problem) return inputError(id, title, CLAUSE, problem);
  if (!isPos(c.ambientFactor) || !isPos(c.groupingFactor))
    return inputError(id, title, CLAUSE, 'ambient and grouping factors must be positive numbers');

  const it = lookupIt(t, c.lineCsaMm2, c.installMethod, c.insulation, c.phases);
  const formula = 'Iz = It · Ca · Cg ; require In ≤ Iz';
  if (it === undefined) {
    return {
      id,
      title,
      status: 'NOT_CHECKED',
      formula,
      inputs: { 'csa (mm²)': c.lineCsaMm2, method: c.installMethod, insulation: c.insulation, phases: c.phases },
      assumptions: [`Table: ${t.name}`],
      clauseRef: CLAUSE,
      message: `No table entry for ${c.lineCsaMm2} mm², method ${c.installMethod}, ${c.insulation}, ${c.phases}. Not checked.`,
    };
  }
  const iz = correctedIz(it, c.ambientFactor, c.groupingFactor);
  const pass = c.inA <= iz;
  return {
    id,
    title,
    status: pass ? 'PASS' : 'FAIL',
    value: c.inA,
    limit: iz,
    unit: 'A',
    formula,
    inputs: { 'It (A)': it, Ca: c.ambientFactor, Cg: c.groupingFactor, 'Iz (A)': Number(iz.toFixed(2)) },
    assumptions: [
      `Table: ${t.name}${t.demo ? ' (DEMO values, not from BS 7671)' : ''}`,
      'Ca and Cg as entered; the tool does not derive them.',
    ],
    clauseRef: CLAUSE,
    message: pass
      ? `In ${fmt(c.inA, 1)} A is within Iz ${fmt(iz, 1)} A.`
      : `In ${fmt(c.inA, 1)} A exceeds Iz ${fmt(iz, 1)} A.`,
  };
}
