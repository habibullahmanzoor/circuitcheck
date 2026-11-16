import { useRef, useState, type Dispatch } from 'react';
import { dedupeByRef, parseCsv, toCsv, type Circuit, type CsvRowError } from '../engine';
import sampleCsv from '../data/sample-board.csv?raw';
import { aiReady, type AiConfig } from '../ai/config';
import { AiImportPanel } from './AiImportPanel';
import { CircuitForm } from './CircuitForm';
import { exportBackup, parseBackup } from './history';
import { newId, type Action, type AppState } from './state';

function withFreshIds(cs: Circuit[]): Circuit[] {
  return cs.map((c) => ({ ...c, id: newId() }));
}

export function BoardTab({ state, dispatch, ai, onSetupAi }: { state: AppState; dispatch: Dispatch<Action>; ai?: AiConfig; onSetupAi?: () => void }) {
  const [editing, setEditing] = useState<Circuit | 'new' | null>(null);
  const [showAi, setShowAi] = useState(false);
  const [importErrors, setImportErrors] = useState<CsvRowError[]>([]);
  const [notice, setNotice] = useState('');
  const [zeText, setZeText] = useState(String(state.ueOhm));
  const fileRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);

  const zeNum = Number(zeText);
  const zeValid = zeText.trim() !== '' && Number.isFinite(zeNum) && zeNum >= 0;

  const loadSample = (): void => {
    if (state.circuits.length > 0 && !window.confirm('Replace the current circuits with the sample board?')) return;
    const r = parseCsv(sampleCsv);
    dispatch({ type: 'replaceCircuits', circuits: withFreshIds(r.circuits) });
    setImportErrors(r.errors);
    setNotice(`Loaded ${r.circuits.length} sample circuits.`);
  };

  const onFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const r = parseCsv(await file.text());
    const { kept, skipped } = dedupeByRef(state.circuits, r.circuits);
    dispatch({ type: 'appendCircuits', circuits: withFreshIds(kept) });
    setImportErrors(r.errors);
    setNotice(
      `Imported ${kept.length} circuit(s)` +
        (skipped.length ? `; skipped ${skipped.length} already on the board (${skipped.map((c) => c.ref).join(', ')})` : '') +
        (r.errors.length ? `; ${r.errors.length} invalid row(s) skipped` : '') + '.',
    );
    if (fileRef.current) fileRef.current.value = '';
  };

  const saveBackup = (): void => {
    const url = URL.createObjectURL(new Blob([exportBackup(state)], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.boardName || 'board'}-backup.json`;
    a.click();
    URL.revokeObjectURL(url);
    setNotice('Backup saved. It includes circuits, site readings and saved test sessions.');
  };

  const onBackup = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    const r = parseBackup(await file.text());
    if (backupRef.current) backupRef.current.value = '';
    if (!r.state) { setNotice(`Could not restore: ${r.error ?? 'unknown error'}`); return; }
    if (!window.confirm(`Replace everything on this device with "${r.state.boardName}" (${r.state.circuits.length} circuits)? You can undo this.`)) return;
    dispatch({ type: 'loadState', state: r.state });
    setNotice(`Restored "${r.state.boardName}".`);
  };

  const exportCsv = (): void => {
    const url = URL.createObjectURL(new Blob([toCsv(state.circuits)], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `${state.boardName || 'board'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <section aria-labelledby="board-h">
      <h2 id="board-h">Board</h2>
      <div className="card grid">
        <div className="field">
          <label htmlFor="board-name">Board name</label>
          <input id="board-name" value={state.boardName} onChange={(e) => dispatch({ type: 'setBoardName', name: e.target.value })} />
        </div>
        <div className="field">
          <label htmlFor="board-ze">Ze (Ω)</label>
          <input
            id="board-ze"
            inputMode="decimal"
            value={zeText}
            aria-invalid={!zeValid}
            onChange={(e) => {
              setZeText(e.target.value);
              const n = Number(e.target.value);
              if (e.target.value.trim() !== '' && Number.isFinite(n) && n >= 0) dispatch({ type: 'setZe', ueOhm: n });
            }}
          />
          {!zeValid && <small className="err">Enter 0 or a positive number (last valid value in use)</small>}
        </div>
        <div className="field">
          <span className="label">Supply type</span>
          <p className="static">TN (fixed in v1) · 230 V single-phase</p>
        </div>
      </div>

      <div className="row wrap">
        <button className="btn primary" onClick={() => setEditing('new')}>Add circuit</button>
        <button className="btn" onClick={loadSample}>Load sample board</button>
        <button className="btn" onClick={() => fileRef.current?.click()}>Import CSV</button>
        <button className="btn" onClick={exportCsv} disabled={state.circuits.length === 0}>Export CSV</button>
        {ai && aiReady(ai) ? (
          <button className="btn" aria-expanded={showAi} onClick={() => setShowAi((v) => !v)}>✦ AI import</button>
        ) : (
          <button className="btn" onClick={onSetupAi} title="Turn on AI features in Settings first">✦ AI import <span className="chip chip-not_checked mini">set up</span></button>
        )}
        <button className="btn" onClick={saveBackup}>Save backup</button>
        <button className="btn" onClick={() => backupRef.current?.click()}>Restore backup</button>
        <input ref={backupRef} type="file" accept=".json,application/json" hidden aria-label="Restore backup file" onChange={(e) => void onBackup(e.target.files?.[0])} />
        <input ref={fileRef} type="file" accept=".csv,text/csv" hidden aria-label="Import CSV file" onChange={(e) => void onFile(e.target.files?.[0])} />
      </div>

      {notice && <p role="status" className="notice">{notice}</p>}
      {showAi && ai && aiReady(ai) && (
        <AiImportPanel ai={ai} circuits={state.circuits} dispatch={dispatch} onDone={(m) => { setNotice(m); }} />
      )}
      {importErrors.length > 0 && (
        <div className="card err-box" role="alert">
          <strong>Rows skipped</strong>
          <ul>{importErrors.map((e) => <li key={`${e.row}-${e.message}`}>Row {e.row}: {e.message}</li>)}</ul>
        </div>
      )}

      {editing && (
        <CircuitForm
          key={editing === 'new' ? 'new' : editing.id}
          circuit={editing === 'new' ? null : editing}
          onSave={(c) => { dispatch({ type: 'saveCircuit', circuit: c }); setEditing(null); }}
          onCancel={() => setEditing(null)}
        />
      )}

      {state.circuits.length === 0 ? (
        <div className="hero">
          <svg className="hero-art" viewBox="0 0 220 120" aria-hidden="true">
            <defs><linearGradient id="hg" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#a78bfa" /></linearGradient></defs>
            <path d="M10 60h50l10-30 20 60 20-60 20 60 10-30h70" fill="none" stroke="url(#hg)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="10" cy="60" r="6" fill="#22d3ee" /><circle cx="210" cy="60" r="6" fill="#a78bfa" />
          </svg>
          <p className="eyebrow">Design &amp; site test checker</p>
          <h3>Check your circuits in seconds</h3>
          <p>Voltage drop, earth fault loop, fault withstand and RCD rules, with every formula shown. Then validate site test readings against the design limits.</p>
          <div className="row wrap center">
            <button className="btn primary" onClick={loadSample}>Try the sample board</button>
            <button className="btn" onClick={() => setEditing('new')}>Add a circuit</button>
          </div>
          <ul className="feats">
            <li><b>Traceable</b> formulas and inputs</li>
            <li><b>Offline</b> on site</li>
            <li><b>Verified</b> fix suggestions</li>
          </ul>
        </div>
) : (
        <div className="table-wrap">
          <table>
            <caption className="sr-only">Circuit schedule</caption>
            <thead>
              <tr>
                <th>Ref</th><th>Description</th><th>Type</th><th>Device</th><th>Ib (A)</th>
                <th>Line / cpc (mm²)</th><th>L (m)</th><th>RCD</th><th><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody>
              {state.circuits.map((c) => (
                <tr key={c.id}>
                  <td data-label="Ref">{c.ref}</td>
                  <td data-label="Description">{c.description}</td>
                  <td data-label="Type">{c.kind}</td>
                  <td data-label="Device">{c.device}{c.inA}</td>
                  <td data-label="Ib (A)">{c.ibA}</td>
                  <td data-label="Line / cpc">{c.lineCsaMm2} / {c.cpcCsaMm2 ?? 'auto'}</td>
                  <td data-label="L (m)">{c.lengthM}</td>
                  <td data-label="RCD">{c.rcdMa ? `${c.rcdMa} mA` : 'none'}</td>
                  <td className="actions">
                    <button className="btn small" onClick={() => setEditing(c)} aria-label={`Edit ${c.ref}`}>Edit</button>
                    <button className="btn small" onClick={() => dispatch({ type: 'duplicateCircuit', id: c.id, newId: newId() })} aria-label={`Duplicate ${c.ref}`}>Duplicate</button>
                    <button className="btn small danger" onClick={() => { if (window.confirm(`Delete circuit ${c.ref}?`)) dispatch({ type: 'deleteCircuit', id: c.id }); }} aria-label={`Delete ${c.ref}`}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
