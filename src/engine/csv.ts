import type { Circuit, CircuitKind, Device, Insulation, Phases } from './types';

export const CSV_COLUMNS = [
  'ref',
  'description',
  'phases',
  'kind',
  'device',
  'inA',
  'ibA',
  'lineCsaMm2',
  'cpcCsaMm2',
  'insulation',
  'lengthM',
  'installMethod',
  'ambientFactor',
  'groupingFactor',
  'rcdMa',
] as const;

export interface CsvRowError {
  /** 1-based line number in the file (header is line 1). */
  row: number;
  message: string;
}

export interface CsvParseResult {
  circuits: Circuit[];
  errors: CsvRowError[];
}

interface RawRow {
  line: number;
  cells: string[];
}

/** RFC 4180-style parser: quotes, escaped quotes, CRLF, quoted newlines. */
function tokenise(text: string): RawRow[] {
  const src = text.replace(/^﻿/, '');
  const rows: RawRow[] = [];
  let cells: string[] = [];
  let cur = '';
  let inQ = false;
  let line = 1;
  let rowStart = 1;
  const endRow = (): void => {
    cells.push(cur);
    if (!(cells.length === 1 && cells[0]?.trim() === '')) rows.push({ line: rowStart, cells });
    cells = [];
    cur = '';
  };
  for (let i = 0; i < src.length; i++) {
    const ch = src.charAt(i);
    if (inQ) {
      if (ch === '"') {
        if (src.charAt(i + 1) === '"') { cur += '"'; i++; } else inQ = false;
      } else {
        if (ch === '\n') line++;
        cur += ch;
      }
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { cells.push(cur); cur = ''; }
    else if (ch === '\r') { /* swallow; \n ends the row */ }
    else if (ch === '\n') { endRow(); line++; rowStart = line; }
    else cur += ch;
  }
  if (cur !== '' || cells.length > 0) endRow();
  return rows;
}

const PHASES: readonly Phases[] = ['1P', '3P'];
const KINDS: readonly CircuitKind[] = ['lighting', 'socket', 'fixed', 'other'];
const DEVICES: readonly Device[] = ['B', 'C', 'D'];
const INSULATIONS: readonly Insulation[] = ['PVC70', 'XLPE90'];

function oneOf<T extends string>(v: string, allowed: readonly T[]): T | undefined {
  return allowed.find((a) => a === v);
}

export function parseCsv(text: string): CsvParseResult {
  const rows = tokenise(text);
  const circuits: Circuit[] = [];
  const errors: CsvRowError[] = [];
  const header = rows[0];
  if (!header) return { circuits, errors: [{ row: 1, message: 'File is empty.' }] };

  const idx = new Map<string, number>();
  header.cells.forEach((h, i) => idx.set(h.trim().toLowerCase(), i));
  const required = CSV_COLUMNS.filter(
    (k) => !['cpcCsaMm2', 'ambientFactor', 'groupingFactor', 'rcdMa'].includes(k),
  );
  const missing = required.filter((k) => !idx.has(k.toLowerCase()));
  if (missing.length > 0) {
    return { circuits, errors: [{ row: header.line, message: `Missing column(s): ${missing.join(', ')}.` }] };
  }

  for (const r of rows.slice(1)) {
    const get = (k: string): string => {
      const i = idx.get(k.toLowerCase());
      return i === undefined ? '' : (r.cells[i] ?? '').trim();
    };
    const problems: string[] = [];
    const num = (k: string, opts: { optional?: boolean; dflt?: number } = {}): number | undefined => {
      const raw = get(k);
      if (raw === '') {
        if (opts.dflt !== undefined) return opts.dflt;
        if (!opts.optional) problems.push(`${k} is required`);
        return undefined;
      }
      const n = Number(raw);
      if (!Number.isFinite(n) || n <= 0) { problems.push(`${k} must be a positive number (got "${raw}")`); return undefined; }
      return n;
    };
    const pick = <T extends string>(k: string, allowed: readonly T[]): T | undefined => {
      const v = oneOf(get(k), allowed);
      if (!v) problems.push(`${k} must be one of ${allowed.join('/')} (got "${get(k)}")`);
      return v;
    };

    const ref = get('ref');
    if (ref === '') problems.push('ref is required');
    const installMethod = get('installMethod');
    if (installMethod === '') problems.push('installMethod is required');
    const phases = pick('phases', PHASES);
    const kind = pick('kind', KINDS);
    const device = pick('device', DEVICES);
    const insulation = pick('insulation', INSULATIONS);
    const inA = num('inA');
    const ibA = num('ibA');
    const lineCsaMm2 = num('lineCsaMm2');
    const cpcCsaMm2 = num('cpcCsaMm2', { optional: true });
    const lengthM = num('lengthM');
    const ambientFactor = num('ambientFactor', { dflt: 1 });
    const groupingFactor = num('groupingFactor', { dflt: 1 });
    const rcdMa = num('rcdMa', { optional: true });

    if (
      problems.length > 0 || !phases || !kind || !device || !insulation ||
      inA === undefined || ibA === undefined || lineCsaMm2 === undefined || lengthM === undefined ||
      ambientFactor === undefined || groupingFactor === undefined
    ) {
      errors.push({ row: r.line, message: problems.join('; ') });
      continue;
    }
    const c: Circuit = {
      id: `row-${r.line}`,
      ref,
      description: get('description'),
      phases, kind, device, inA, ibA, lineCsaMm2, insulation, lengthM, installMethod,
      ambientFactor, groupingFactor,
    };
    if (cpcCsaMm2 !== undefined) c.cpcCsaMm2 = cpcCsaMm2;
    if (rcdMa !== undefined) c.rcdMa = rcdMa;
    circuits.push(c);
  }
  return { circuits, errors };
}

const esc = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function toCsv(circuits: readonly Circuit[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const c of circuits) {
    lines.push(
      CSV_COLUMNS.map((k) => {
        const v = c[k];
        return v === undefined ? '' : esc(String(v));
      }).join(','),
    );
  }
  return lines.join('\n') + '\n';
}

/** Split incoming circuits into new ones and ones whose ref already exists (case-insensitive). */
export function dedupeByRef(
  existing: readonly Circuit[],
  incoming: readonly Circuit[],
): { kept: Circuit[]; skipped: Circuit[] } {
  const seen = new Set(existing.map((c) => c.ref.trim().toLowerCase()));
  const kept: Circuit[] = [];
  const skipped: Circuit[] = [];
  for (const c of incoming) {
    const k = c.ref.trim().toLowerCase();
    if (seen.has(k)) skipped.push(c);
    else { seen.add(k); kept.push(c); }
  }
  return { kept, skipped };
}
