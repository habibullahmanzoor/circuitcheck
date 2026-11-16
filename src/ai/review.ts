import type { Circuit, CircuitKind, Device, Insulation, Phases } from '../engine';
import type { Confidence, ExtractedCircuit } from './types';

export type FieldKey =
  | 'ref' | 'description' | 'phases' | 'kind' | 'device' | 'inA' | 'ibA' | 'lineCsaMm2' | 'cpcCsaMm2'
  | 'insulation' | 'lengthM' | 'installMethod' | 'ambientFactor' | 'groupingFactor' | 'rcdMa';

export interface FieldDef {
  key: FieldKey;
  label: string;
  kind: 'text' | 'num' | 'enum';
  options?: readonly string[];
  required: boolean;
}

export const FIELD_DEFS: readonly FieldDef[] = [
  { key: 'ref', label: 'Ref', kind: 'text', required: true },
  { key: 'description', label: 'Description', kind: 'text', required: false },
  { key: 'phases', label: 'Phases', kind: 'enum', options: ['1P', '3P'], required: true },
  { key: 'kind', label: 'Type', kind: 'enum', options: ['lighting', 'socket', 'fixed', 'other'], required: true },
  { key: 'device', label: 'Curve', kind: 'enum', options: ['B', 'C', 'D'], required: true },
  { key: 'inA', label: 'In (A)', kind: 'num', required: true },
  { key: 'ibA', label: 'Ib (A)', kind: 'num', required: true },
  { key: 'lineCsaMm2', label: 'Line csa (mm²)', kind: 'num', required: true },
  { key: 'cpcCsaMm2', label: 'cpc csa (mm²)', kind: 'num', required: false },
  { key: 'insulation', label: 'Insulation', kind: 'enum', options: ['PVC70', 'XLPE90'], required: true },
  { key: 'lengthM', label: 'Length (m)', kind: 'num', required: true },
  { key: 'installMethod', label: 'Install method', kind: 'text', required: true },
  { key: 'ambientFactor', label: 'Ca', kind: 'num', required: false },
  { key: 'groupingFactor', label: 'Cg', kind: 'num', required: false },
  { key: 'rcdMa', label: 'RCD (mA)', kind: 'num', required: false },
];

export type Fields = Record<FieldKey, string>;

/** One proposed circuit awaiting a human decision. Nothing reaches the board until `confirmed` is true and the row validates. */
export interface ReviewRow {
  id: string;
  confirmed: boolean;
  fields: Fields;
  /** Fields the model could not read (null). Shown highlighted so they cannot be missed. */
  unread: FieldKey[];
  confidence: Confidence;
  note: string;
}

const str = (v: string | number | null): string => (v === null ? '' : String(v));

export function rowFromExtracted(e: ExtractedCircuit, id: string): ReviewRow {
  const fields: Fields = {
    ref: e.ref, description: e.description, phases: str(e.phases), kind: str(e.kind), device: str(e.device),
    inA: str(e.inA), ibA: str(e.ibA), lineCsaMm2: str(e.lineCsaMm2), cpcCsaMm2: str(e.cpcCsaMm2),
    insulation: str(e.insulation), lengthM: str(e.lengthM), installMethod: str(e.installMethod),
    ambientFactor: str(e.ambientFactor), groupingFactor: str(e.groupingFactor), rcdMa: str(e.rcdMa),
  };
  const unread = FIELD_DEFS.filter((d) => d.required && fields[d.key].trim() === '').map((d) => d.key);
  return { id, confirmed: false, fields, unread, confidence: e.confidence, note: e.note };
}

export interface RowResult {
  circuit?: Circuit;
  errors: Partial<Record<FieldKey, string>>;
}

/** Same rules as the manual circuit form. Blank Ca/Cg become 1; blank cpc and RCD stay unset. Required enums are never defaulted. */
export function validateRow(f: Fields, id: string): RowResult {
  const errors: Partial<Record<FieldKey, string>> = {};
  const num = (k: FieldKey, optional: boolean, dflt?: number): number | undefined => {
    const t = f[k].trim();
    if (t === '') {
      if (dflt !== undefined) return dflt;
      if (!optional) errors[k] = 'Required';
      return undefined;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) { errors[k] = 'Enter a number above 0'; return undefined; }
    return n;
  };
  const pick = <T extends string>(k: FieldKey, allowed: readonly T[]): T | undefined => {
    const v = allowed.find((a) => a === f[k].trim());
    if (!v) errors[k] = `Choose ${allowed.join(' / ')}`;
    return v;
  };
  if (f.ref.trim() === '') errors.ref = 'Required';
  if (f.installMethod.trim() === '') errors.installMethod = 'Required';
  const phases = pick<Phases>('phases', ['1P', '3P']);
  const kind = pick<CircuitKind>('kind', ['lighting', 'socket', 'fixed', 'other']);
  const device = pick<Device>('device', ['B', 'C', 'D']);
  const insulation = pick<Insulation>('insulation', ['PVC70', 'XLPE90']);
  const inA = num('inA', false);
  const ibA = num('ibA', false);
  const lineCsaMm2 = num('lineCsaMm2', false);
  const cpc = num('cpcCsaMm2', true);
  const lengthM = num('lengthM', false);
  const ambientFactor = num('ambientFactor', true, 1);
  const groupingFactor = num('groupingFactor', true, 1);
  const rcd = num('rcdMa', true);
  if (
    Object.keys(errors).length > 0 || !phases || !kind || !device || !insulation || inA === undefined || ibA === undefined ||
    lineCsaMm2 === undefined || lengthM === undefined || ambientFactor === undefined || groupingFactor === undefined
  ) {
    return { errors };
  }
  const circuit: Circuit = {
    id, ref: f.ref.trim(), description: f.description.trim(), phases, kind, device, inA, ibA, lineCsaMm2, insulation,
    lengthM, installMethod: f.installMethod.trim(), ambientFactor, groupingFactor,
  };
  if (cpc !== undefined) circuit.cpcCsaMm2 = cpc;
  if (rcd !== undefined) circuit.rcdMa = rcd;
  return { circuit, errors };
}

/** Rows that may be added to the board: the person ticked "I checked this row" and it validates. */
export function readyCircuits(rows: readonly ReviewRow[], newId: () => string): { circuits: Circuit[]; blocked: ReviewRow[] } {
  const circuits: Circuit[] = [];
  const blocked: ReviewRow[] = [];
  for (const r of rows) {
    if (!r.confirmed) continue;
    const v = validateRow(r.fields, newId());
    if (v.circuit) circuits.push(v.circuit);
    else blocked.push(r);
  }
  return { circuits, blocked };
}
