import { useMemo, useState, type Dispatch } from 'react';
import {
  STANDARD_RATINGS_A, STANDARD_SIZES_MM2, runChecks, overallStatus, sizeFinder, smallestPassing,
  type AmpacityTable, type Circuit, type CircuitKind, type Device, type Insulation, type Phases,
} from '../engine';
import { StatusChip, fmtNum } from './common';
import { ResultDetail } from './DesignTab';
import { newId, type Action, type AppState } from './state';

/* ---------- What-if ---------- */

function WhatIf({ state, dispatch, table }: { state: AppState; dispatch: Dispatch<Action>; table: AmpacityTable }) {
  const [sel, setSel] = useState(state.circuits[0]?.id ?? '');
  const orig = state.circuits.find((c) => c.id === sel) ?? state.circuits[0];
  const [over, setOver] = useState<Partial<Circuit>>({});
  const [forId, setForId] = useState(orig?.id);
  if (orig && forId !== orig.id) { setForId(orig.id); setOver({}); }

  const trial = useMemo(() => (orig ? { ...orig, ...over } : undefined), [orig, over]);
  const results = useMemo(
    () => (trial ? runChecks(trial, { uoV: 230, ueOhm: state.ueOhm }, table, state.settings) : []),
    [trial, state.ueOhm, table, state.settings],
  );
  const baseline = useMemo(
    () => (orig ? overallStatus(runChecks(orig, { uoV: 230, ueOhm: state.ueOhm }, table, state.settings)) : 'NOT_CHECKED'),
    [orig, state.ueOhm, table, state.settings],
  );

  if (!orig || !trial) return <div className="card empty"><p>Add circuits on the Board tab to try what-if changes.</p></div>;
  const dirty = Object.keys(over).length > 0;
  const set = (p: Partial<Circuit>): void => setOver((o) => ({ ...o, ...p }));
  const sizes = Array.from(new Set([...STANDARD_SIZES_MM2, orig.lineCsaMm2])).sort((a, b) => a - b);
  const ratings = Array.from(new Set([...STANDARD_RATINGS_A, orig.inA])).sort((a, b) => a - b);

  return (
    <>
      <div className="field">
        <label htmlFor="lab-circuit">Circuit</label>
        <select id="lab-circuit" value={orig.id} onChange={(e) => setSel(e.target.value)}>
          {state.circuits.map((c) => <option key={c.id} value={c.id}>{c.ref} – {c.description || 'no description'}</option>)}
        </select>
      </div>
      <div className="card grid">
        <div className="field">
          <label htmlFor="wi-len">Length: {trial.lengthM} m</label>
          <input id="wi-len" type="range" min={1} max={200} step={1} value={Math.min(200, trial.lengthM)} onChange={(e) => set({ lengthM: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="wi-ib">Load Ib: {trial.ibA} A</label>
          <input id="wi-ib" type="range" min={1} max={100} step={0.5} value={Math.min(100, trial.ibA)} onChange={(e) => set({ ibA: Number(e.target.value) })} />
        </div>
        <div className="field">
          <label htmlFor="wi-csa">Line csa (mm²)</label>
          <select id="wi-csa" value={trial.lineCsaMm2} onChange={(e) => set({ lineCsaMm2: Number(e.target.value) })}>
            {sizes.map((z) => <option key={z} value={z}>{z}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wi-in">Device In (A)</label>
          <select id="wi-in" value={trial.inA} onChange={(e) => set({ inA: Number(e.target.value) })}>
            {ratings.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="field">
          <label htmlFor="wi-dev">Curve</label>
          <select id="wi-dev" value={trial.device} onChange={(e) => set({ device: e.target.value as Device })}>
            {(['B', 'C', 'D'] as const).map((d) => <option key={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="row wrap">
        <span>Now: <StatusChip status={overallStatus(results)} /></span>
        {dirty && <span>Was: <StatusChip status={baseline} /></span>}
        <button className="btn" disabled={!dirty} onClick={() => setOver({})}>Reset</button>
        <button className="btn primary" disabled={!dirty} onClick={() => { dispatch({ type: 'saveCircuit', circuit: trial }); setOver({}); }}>Save to circuit</button>
      </div>
      <div className="card">{results.map((r) => <ResultDetail key={r.id} r={r} />)}</div>
    </>
  );
}

/* ---------- Size finder ---------- */

interface Form {
  ref: string; kind: CircuitKind; phases: Phases; device: Device; inA: string; ibA: string; lengthM: string;
  installMethod: string; insulation: Insulation; ambientFactor: string; groupingFactor: string; rcdMa: string;
}
const DEFAULT: Form = {
  ref: 'NEW', kind: 'fixed', phases: '1P', device: 'B', inA: '16', ibA: '10', lengthM: '30',
  installMethod: 'C', insulation: 'PVC70', ambientFactor: '1', groupingFactor: '1', rcdMa: '',
};

function SizeFinder({ state, dispatch, table }: { state: AppState; dispatch: Dispatch<Action>; table: AmpacityTable }) {
  const [f, setF] = useState<Form>(DEFAULT);
  const [added, setAdded] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]): void => setF((p) => ({ ...p, [k]: v }));
  const n = (t: string): number => (t.trim() === '' ? NaN : Number(t));

  const base: Circuit = {
    id: 'finder', ref: f.ref || 'NEW', description: 'Size finder', phases: f.phases, kind: f.kind, device: f.device,
    inA: n(f.inA), ibA: n(f.ibA), lineCsaMm2: 2.5, insulation: f.insulation, lengthM: n(f.lengthM),
    installMethod: f.installMethod, ambientFactor: n(f.ambientFactor), groupingFactor: n(f.groupingFactor),
    ...(f.rcdMa.trim() !== '' ? { rcdMa: n(f.rcdMa) } : {}),
  };
  const options = useMemo(() => sizeFinder(base, { uoV: 230, ueOhm: state.ueOhm }, table, state.settings), [f, state.ueOhm, table, state.settings]); // eslint-disable-line react-hooks/exhaustive-deps
  const best = smallestPassing(options);
  const invalid = options.every((o) => o.overall === 'INPUT_ERROR');

  const txt = (k: keyof Form, label: string, mode?: 'decimal') => (
    <div className="field">
      <label htmlFor={`sf-${k}`}>{label}</label>
      <input id={`sf-${k}`} value={f[k]} inputMode={mode} onChange={(e) => set(k, e.target.value as never)} />
    </div>
  );
  const sel = <K extends 'kind' | 'phases' | 'device' | 'insulation'>(k: K, label: string, opts: readonly Form[K][]) => (
    <div className="field">
      <label htmlFor={`sf-${k}`}>{label}</label>
      <select id={`sf-${k}`} value={f[k]} onChange={(e) => set(k, e.target.value as Form[K])}>{opts.map((o) => <option key={o}>{o}</option>)}</select>
    </div>
  );

  return (
    <>
      <div className="card grid">
        {txt('ref', 'Ref for new circuit')}
        {sel('kind', 'Type', ['lighting', 'socket', 'fixed', 'other'])}
        {sel('phases', 'Phases', ['1P', '3P'])}
        {sel('device', 'Curve', ['B', 'C', 'D'])}
        {txt('inA', 'In (A)', 'decimal')}
        {txt('ibA', 'Ib (A)', 'decimal')}
        {txt('lengthM', 'Length (m)', 'decimal')}
        {txt('installMethod', 'Install method')}
        {sel('insulation', 'Insulation', ['PVC70', 'XLPE90'])}
        {txt('ambientFactor', 'Ca', 'decimal')}
        {txt('groupingFactor', 'Cg', 'decimal')}
        {txt('rcdMa', 'RCD (mA)', 'decimal')}
      </div>

      {invalid ? (
        <div className="card err-box" role="alert">Enter valid numbers for In, Ib, length and the factors.</div>
      ) : (
        <>
          <div className={`card ${best ? 'suggest' : 'err-box'}`} role="status">
            {best
              ? <><b>Smallest passing size: {best.csaMm2} mm²</b> (cpc {best.csaMm2 <= 16 ? best.csaMm2 : best.csaMm2 <= 35 ? 16 : best.csaMm2 / 2} mm² by rule).</>
              : <b>No standard size up to 50 mm² passes every check. Review the load, device or run length.</b>}
            {best && (
              <button className="btn primary small" style={{ marginLeft: 12 }} onClick={() => {
                dispatch({ type: 'saveCircuit', circuit: { ...base, id: newId(), description: 'From size finder', lineCsaMm2: best.csaMm2 } });
                setAdded(`Added ${base.ref} (${best.csaMm2} mm²) to the board.`);
              }}>Add to board</button>
            )}
          </div>
          {added && <p role="status" className="notice">{added}</p>}
          <div className="table-wrap">
            <table className="compact">
              <caption className="sr-only">Every standard size and its result</caption>
              <thead><tr><th>Line csa</th><th>Vd %</th><th>Zs Ω</th><th>Result</th><th>Failing checks</th></tr></thead>
              <tbody>
                {options.map((o) => {
                  const vd = o.results.find((r) => r.id === 'voltage-drop');
                  const ef = o.results.find((r) => r.id === 'earth-fault-loop');
                  const fails = o.results.filter((r) => r.status === 'FAIL').map((r) => r.title);
                  return (
                    <tr key={o.csaMm2} className={o === best ? 'row-pass' : `row-${o.overall.toLowerCase()}`}>
                      <td>{o.csaMm2} mm²{o === best ? ' ★' : ''}</td>
                      <td>{fmtNum(vd?.value)} / {fmtNum(vd?.limit, 0)}</td>
                      <td>{fmtNum(ef?.value)} / {fmtNum(ef?.limit)}</td>
                      <td><StatusChip status={o.overall} /></td>
                      <td>{fails.join(', ') || '–'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </>
  );
}

export function LabTab({ state, dispatch, table }: { state: AppState; dispatch: Dispatch<Action>; table: AmpacityTable }) {
  const [mode, setMode] = useState<'whatif' | 'finder'>('whatif');
  return (
    <section aria-labelledby="lab-h">
      <h2 id="lab-h">Design lab</h2>
      <div className="seg" role="tablist" aria-label="Lab tools">
        <button role="tab" aria-selected={mode === 'whatif'} className={`seg-item ${mode === 'whatif' ? 'on' : ''}`} onClick={() => setMode('whatif')}>What-if sliders</button>
        <button role="tab" aria-selected={mode === 'finder'} className={`seg-item ${mode === 'finder' ? 'on' : ''}`} onClick={() => setMode('finder')}>Cable size finder</button>
      </div>
      <p className="note">Everything here is recalculated by the same engine. Nothing is saved until you press a save or add button.</p>
      {mode === 'whatif' ? <WhatIf state={state} dispatch={dispatch} table={table} /> : <SizeFinder state={state} dispatch={dispatch} table={table} />}
    </section>
  );
}
