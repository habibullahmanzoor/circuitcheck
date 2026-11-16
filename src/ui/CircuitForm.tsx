import { useState, type FormEvent } from 'react';
import type { Circuit, CircuitKind, Device, Insulation, Phases } from '../engine';
import { newId } from './state';

interface Draft {
  ref: string;
  description: string;
  phases: Phases;
  kind: CircuitKind;
  device: Device;
  inA: string;
  ibA: string;
  lineCsaMm2: string;
  cpcCsaMm2: string;
  insulation: Insulation;
  lengthM: string;
  installMethod: string;
  ambientFactor: string;
  groupingFactor: string;
  rcdMa: string;
}

const toDraft = (c: Circuit | null): Draft => ({
  ref: c?.ref ?? '',
  description: c?.description ?? '',
  phases: c?.phases ?? '1P',
  kind: c?.kind ?? 'fixed',
  device: c?.device ?? 'B',
  inA: c ? String(c.inA) : '',
  ibA: c ? String(c.ibA) : '',
  lineCsaMm2: c ? String(c.lineCsaMm2) : '',
  cpcCsaMm2: c?.cpcCsaMm2 !== undefined ? String(c.cpcCsaMm2) : '',
  insulation: c?.insulation ?? 'PVC70',
  lengthM: c ? String(c.lengthM) : '',
  installMethod: c?.installMethod ?? 'C',
  ambientFactor: c ? String(c.ambientFactor) : '1',
  groupingFactor: c ? String(c.groupingFactor) : '1',
  rcdMa: c?.rcdMa !== undefined ? String(c.rcdMa) : '',
});

type Errors = Partial<Record<keyof Draft, string>>;

function build(d: Draft, id: string): { circuit?: Circuit; errors: Errors } {
  const errors: Errors = {};
  const pos = (k: keyof Draft, optional = false): number | undefined => {
    const t = d[k].trim();
    if (t === '') {
      if (!optional) errors[k] = 'Required';
      return undefined;
    }
    const n = Number(t);
    if (!Number.isFinite(n) || n <= 0) {
      errors[k] = 'Enter a number above 0';
      return undefined;
    }
    return n;
  };
  if (d.ref.trim() === '') errors.ref = 'Required';
  if (d.installMethod.trim() === '') errors.installMethod = 'Required';
  const inA = pos('inA');
  const ibA = pos('ibA');
  const lineCsaMm2 = pos('lineCsaMm2');
  const cpc = pos('cpcCsaMm2', true);
  const lengthM = pos('lengthM');
  const ambientFactor = pos('ambientFactor');
  const groupingFactor = pos('groupingFactor');
  const rcd = pos('rcdMa', true);
  if (
    Object.keys(errors).length > 0 || inA === undefined || ibA === undefined || lineCsaMm2 === undefined ||
    lengthM === undefined || ambientFactor === undefined || groupingFactor === undefined
  ) {
    return { errors };
  }
  const circuit: Circuit = {
    id, ref: d.ref.trim(), description: d.description.trim(), phases: d.phases, kind: d.kind, device: d.device,
    inA, ibA, lineCsaMm2, insulation: d.insulation, lengthM, installMethod: d.installMethod.trim(),
    ambientFactor, groupingFactor,
  };
  if (cpc !== undefined) circuit.cpcCsaMm2 = cpc;
  if (rcd !== undefined) circuit.rcdMa = rcd;
  return { circuit, errors };
}

export function CircuitForm({
  circuit,
  onSave,
  onCancel,
}: {
  circuit: Circuit | null;
  onSave: (c: Circuit) => void;
  onCancel: () => void;
}) {
  const [d, setD] = useState<Draft>(() => toDraft(circuit));
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof Draft>(k: K, v: Draft[K]): void => setD((p) => ({ ...p, [k]: v }));

  const submit = (e: FormEvent): void => {
    e.preventDefault();
    const r = build(d, circuit?.id ?? newId());
    setErrors(r.errors);
    if (r.circuit) onSave(r.circuit);
  };

  const text = (k: keyof Draft, label: string, opts: { num?: boolean; hint?: string } = {}) => (
    <div className="field">
      <label htmlFor={`cf-${k}`}>{label}</label>
      <input
        id={`cf-${k}`}
        value={d[k]}
        inputMode={opts.num ? 'decimal' : undefined}
        onChange={(e) => set(k, e.target.value as never)}
        aria-invalid={errors[k] ? true : undefined}
        aria-describedby={errors[k] ? `cf-${k}-err` : undefined}
      />
      {opts.hint && <small>{opts.hint}</small>}
      {errors[k] && <small id={`cf-${k}-err`} className="err">{errors[k]}</small>}
    </div>
  );
  const select = <K extends 'phases' | 'kind' | 'device' | 'insulation'>(k: K, label: string, options: readonly Draft[K][]) => (
    <div className="field">
      <label htmlFor={`cf-${k}`}>{label}</label>
      <select id={`cf-${k}`} value={d[k]} onChange={(e) => set(k, e.target.value as Draft[K])}>
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </div>
  );

  return (
    <form className="card form" onSubmit={submit} noValidate aria-label={circuit ? 'Edit circuit' : 'Add circuit'}>
      <h3>{circuit ? 'Edit circuit' : 'Add circuit'}</h3>
      <div className="grid">
        {text('ref', 'Ref')}
        {text('description', 'Description')}
        {select('phases', 'Phases', ['1P', '3P'])}
        {select('kind', 'Type', ['lighting', 'socket', 'fixed', 'other'])}
        {select('device', 'Device curve', ['B', 'C', 'D'])}
        {text('inA', 'In (A)', { num: true })}
        {text('ibA', 'Ib (A)', { num: true })}
        {text('lineCsaMm2', 'Line csa (mm²)', { num: true })}
        {text('cpcCsaMm2', 'cpc csa (mm²)', { num: true, hint: 'Blank = sized by rule' })}
        {select('insulation', 'Insulation', ['PVC70', 'XLPE90'])}
        {text('lengthM', 'Length (m)', { num: true })}
        {text('installMethod', 'Install method', { hint: 'Key into the ampacity table' })}
        {text('ambientFactor', 'Ambient factor Ca', { num: true })}
        {text('groupingFactor', 'Grouping factor Cg', { num: true })}
        {text('rcdMa', 'RCD (mA)', { num: true, hint: 'Blank = none' })}
      </div>
      <div className="row">
        <button type="submit" className="btn primary">Save circuit</button>
        <button type="button" className="btn" onClick={onCancel}>Cancel</button>
      </div>
    </form>
  );
}
