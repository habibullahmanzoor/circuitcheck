export type Phases = '1P' | '3P';
export type Device = 'B' | 'C' | 'D';
export type Insulation = 'PVC70' | 'XLPE90';
export type CircuitKind = 'lighting' | 'socket' | 'fixed' | 'other';

export interface Circuit {
  id: string;
  ref: string;
  description: string;
  phases: Phases;
  kind: CircuitKind;
  device: Device;
  inA: number;
  ibA: number;
  lineCsaMm2: number;
  cpcCsaMm2?: number;
  insulation: Insulation;
  lengthM: number;
  installMethod: string;
  ambientFactor: number;
  groupingFactor: number;
  rcdMa?: number;
}

export interface Supply {
  uoV: 230;
  /** External earth fault loop impedance Ze, ohms */
  ueOhm: number;
}

export type Status = 'PASS' | 'FAIL' | 'ADVISORY' | 'NOT_CHECKED' | 'INPUT_ERROR';

export interface CheckResult {
  id: string;
  title: string;
  status: Status;
  value?: number;
  limit?: number;
  unit?: string;
  formula: string;
  inputs: Record<string, number | string>;
  assumptions: string[];
  clauseRef: string;
  message: string;
  /** Only set when the engine re-ran the check with the change and it passed. */
  suggestion?: string;
  /** Engine-verified changes that can be applied to the circuit. */
  fixes?: Fix[];
}

export interface Fix {
  text: string;
  patch: Partial<Circuit>;
}

export const VERIFY = 'verify against your licensed copy';
