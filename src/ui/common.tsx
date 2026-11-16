import type { Status } from '../engine';

export const DISCLAIMER =
  'Design aid only. Results depend on the inputs and assumptions listed. This tool is not a substitute for the judgement and sign-off of a competent person.';

export const DEMO_BANNER = 'Ampacity values are illustrative, not from BS 7671.';

const CHIP: Record<Status, { icon: string; word: string }> = {
  PASS: { icon: '✔', word: 'Pass' },
  FAIL: { icon: '✖', word: 'Fail' },
  ADVISORY: { icon: '!', word: 'Advisory' },
  NOT_CHECKED: { icon: '–', word: 'Not checked' },
  INPUT_ERROR: { icon: '⚠', word: 'Input error' },
};

export const statusWord = (s: Status): string => CHIP[s].word;

/** Status is always conveyed by icon and word, never colour alone. */
export function StatusChip({ status, big = false }: { status: Status; big?: boolean }) {
  const c = CHIP[status];
  return (
    <span className={`chip chip-${status.toLowerCase()}${big ? ' chip-big' : ''}`}>
      <span aria-hidden="true">{c.icon}</span> {c.word}
    </span>
  );
}

export function Disclaimer() {
  return <p className="disclaimer">{DISCLAIMER}</p>;
}

export function fmtNum(n: number | undefined, dp = 2): string {
  return n === undefined || !Number.isFinite(n) ? '–' : n.toFixed(dp);
}
