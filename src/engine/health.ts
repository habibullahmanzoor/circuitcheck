import type { CircuitReport } from './designCheck';
import type { CheckResult } from './types';

/** Fraction of the limit used by a check. Minimum-size checks (cpc csa) are inverted. */
export function utilisation(r: CheckResult): number | undefined {
  if (r.value === undefined || r.limit === undefined || r.limit <= 0 || r.value <= 0) return undefined;
  if (r.id === 'fault-withstand') return r.limit / r.value;
  return r.value / r.limit;
}

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';

export interface Margin {
  ref: string;
  checkTitle: string;
  utilisation: number;
}

export interface BoardHealth {
  /** 0-100. PASS counts 1, ADVISORY 0.75, anything else 0. */
  score: number;
  /** From the score; any failing or invalid circuit caps the grade at C. */
  grade: Grade;
  /** Passing checks with the least headroom, tightest first. */
  tightest: Margin[];
}

export function boardHealth(reports: readonly CircuitReport[], topN = 3): BoardHealth {
  if (reports.length === 0) return { score: 0, grade: 'F', tightest: [] };
  const pts = reports.reduce((n, r) => n + (r.overall === 'PASS' ? 1 : r.overall === 'ADVISORY' ? 0.75 : 0), 0);
  const score = Math.round((pts / reports.length) * 100);
  let grade: Grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F';
  const bad = reports.some((r) => r.overall === 'FAIL' || r.overall === 'INPUT_ERROR');
  if (bad && (grade === 'A' || grade === 'B')) grade = 'C';
  const margins: Margin[] = [];
  for (const rep of reports) {
    for (const r of rep.results) {
      const u = utilisation(r);
      if ((r.status === 'PASS' || r.status === 'ADVISORY') && u !== undefined) {
        margins.push({ ref: rep.ref, checkTitle: r.title, utilisation: u });
      }
    }
  }
  margins.sort((a, b) => b.utilisation - a.utilisation);
  return { score, grade, tightest: margins.slice(0, topN) };
}
