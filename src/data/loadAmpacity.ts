import { parseAmpacityTable, type AmpacityTable } from '../engine';
import demoJson from './ampacity.demo.json';

/** Optional, git-ignored override. The glob resolves to {} when the file is absent. */
const local = import.meta.glob<unknown>('./ampacity.local.json', { eager: true, import: 'default' });

export interface LoadedTable {
  table: AmpacityTable;
  /** Set when a local file exists but is invalid, so the UI can say why it was ignored. */
  localError?: string;
}

export function loadAmpacity(): LoadedTable {
  const demo = parseAmpacityTable(demoJson).table;
  if (!demo) throw new Error('Bundled demo ampacity table is invalid');
  const raw = local['./ampacity.local.json'];
  if (raw === undefined) return { table: { ...demo, demo: true } };
  const r = parseAmpacityTable(raw);
  if (r.table) return { table: r.table };
  return { table: { ...demo, demo: true }, localError: r.error ?? 'invalid' };
}
