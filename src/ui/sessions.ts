import { DEFAULT_SETTINGS, overallStatus, testCheck, type CheckResult, type Circuit, type Settings, type Status } from '../engine';
import { toTestInput, type SiteSession } from './state';

export interface SessionView {
  session: SiteSession;
  results: CheckResult[];
  overall: Status | 'EMPTY';
}

/** Re-evaluate a stored session against the circuit's current limits. */
export function evaluateSession(s: SiteSession, c: Circuit, ueOhm: number, cfg: Settings = DEFAULT_SETTINGS): SessionView {
  const results = testCheck(c, { uoV: 230, ueOhm }, toTestInput(s.entry), cfg);
  return { session: s, results, overall: results.length === 0 ? 'EMPTY' : overallStatus(results) };
}

/** Sessions for one circuit, oldest first. */
export const sessionsFor = (all: readonly SiteSession[], circuitId: string): SiteSession[] =>
  all.filter((s) => s.circuitId === circuitId).sort((a, b) => a.savedAt.localeCompare(b.savedAt));

/** Change in a numeric measurement from the previous session (undefined if either is missing). */
export function delta(prev: string | undefined, cur: string): number | undefined {
  if (prev === undefined || prev.trim() === '' || cur.trim() === '') return undefined;
  const a = Number(prev);
  const b = Number(cur);
  return Number.isFinite(a) && Number.isFinite(b) ? b - a : undefined;
}

const esc = (v: string): string => (/[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function sessionsToCsv(sessions: readonly SiteSession[], circuits: readonly Circuit[], ueOhm: number, cfg: Settings = DEFAULT_SETTINGS): string {
  const head = ['savedAt', 'ref', 'zsOhm', 'r1r2Ohm', 'irMohm', 'polarity', 'rcd1xMs', 'rcd5xMs', 'overall', 'failures'];
  const lines = [head.join(',')];
  const ordered = [...sessions].sort((a, b) => a.savedAt.localeCompare(b.savedAt));
  for (const s of ordered) {
    const c = circuits.find((x) => x.id === s.circuitId);
    if (!c) continue;
    const v = evaluateSession(s, c, ueOhm, cfg);
    const fails = v.results.filter((r) => r.status === 'FAIL' || r.status === 'INPUT_ERROR').map((r) => r.title).join('; ');
    const e = s.entry;
    lines.push([s.savedAt, c.ref, e.zs, e.r1r2, e.ir, e.polarity, e.rcd1, e.rcd5, v.overall, fails].map(esc).join(','));
  }
  return lines.join('\n') + '\n';
}
