import { VERIFY, type CheckResult, type Circuit } from './types';
import { inputError, isPos } from './util';

const ID = 'rcd-protection';
const TITLE = 'Additional protection (RCD)';
const CLAUSE = `BS 7671 Reg 411.3.3 (${VERIFY})`; // TODO(verify)

/** Returns undefined when the rule does not apply to this circuit. */
export function additionalProtectionCheck(c: Circuit): CheckResult | undefined {
  if (c.kind !== 'socket') return undefined;
  if (!isPos(c.inA)) return inputError(ID, TITLE, CLAUSE, 'In must be a positive number');
  if (c.inA > 32) return undefined;
  const ok = c.rcdMa !== undefined && Number.isFinite(c.rcdMa) && c.rcdMa > 0 && c.rcdMa <= 30;
  return {
    id: ID,
    title: TITLE,
    status: ok ? 'PASS' : 'FAIL',
    value: c.rcdMa,
    limit: 30,
    unit: 'mA',
    formula: 'socket circuit with In ≤ 32 A requires RCD rating ≤ 30 mA',
    inputs: { kind: c.kind, 'In (A)': c.inA, 'RCD (mA)': c.rcdMa ?? 'none' },
    assumptions: ['Rule applied to all socket circuits up to 32 A; exceptions are not modelled.'],
    clauseRef: CLAUSE,
    message: ok ? 'A 30 mA (or lower) RCD is recorded.' : 'No 30 mA RCD recorded for this socket circuit.',
  };
}
