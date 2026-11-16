import { useMemo, useState, type Dispatch } from 'react';
import {
  DEFAULT_SETTINGS, overallStatus, testCheck, testLimits, r1r2ColdOhm, resolveCpc,
  type CheckResult, type Circuit, type Settings, type Status,
} from '../engine';
import { StatusChip, fmtNum } from './common';
import { emptySite, newId, toTestInput, type Action, type AppState, type Polarity, type SiteEntry } from './state';
import { delta, evaluateSession, sessionsFor, sessionsToCsv } from './sessions';

function Delta({ d, unit, lowerIsBetter }: { d: number | undefined; unit: string; lowerIsBetter: boolean }) {
  if (d === undefined) return null;
  if (d === 0) return <span className="delta">no change</span>;
  const worse = lowerIsBetter ? d > 0 : d < 0;
  return <span className={`delta ${worse ? 'worse' : 'better'}`}>{d > 0 ? '▲' : '▼'} {Math.abs(d).toFixed(2)} {unit} ({worse ? 'worse' : 'better'})</span>;
}

export function siteResults(c: Circuit, ueOhm: number, e: SiteEntry | undefined, cfg: Settings = DEFAULT_SETTINGS): CheckResult[] {
  return testCheck(c, { uoV: 230, ueOhm }, toTestInput(e ?? emptySite()), cfg);
}

export function SiteTab({ state, dispatch }: { state: AppState; dispatch: Dispatch<Action> }) {
  const [sel, setSel] = useState<string>(state.circuits[0]?.id ?? '');
  const circuit = state.circuits.find((c) => c.id === sel) ?? state.circuits[0];
  const entry = circuit ? state.site[circuit.id] ?? emptySite() : emptySite();

  const results = useMemo(
    () => (circuit ? siteResults(circuit, state.ueOhm, state.site[circuit.id], state.settings) : []),
    [circuit, state.ueOhm, state.site, state.settings],
  );

  if (!circuit) {
    return (
      <section aria-labelledby="site-h">
        <h2 id="site-h">Site tests</h2>
        <div className="card empty"><p>No circuits yet. Add circuits on the Board tab, then enter test results here.</p></div>
      </section>
    );
  }

  const history = sessionsFor(state.sessions, circuit.id);
  const lim = testLimits(circuit, state.settings);
  const design = r1r2ColdOhm(circuit.lineCsaMm2, resolveCpc(circuit), circuit.lengthM);
  const rcd5Applies = circuit.rcdMa !== undefined && circuit.rcdMa <= 30;
  const overall: Status | 'EMPTY' = results.length === 0 ? 'EMPTY' : overallStatus(results);
  const patch = (p: Partial<SiteEntry>): void => dispatch({ type: 'setSite', id: circuit.id, patch: p });
  const resultFor = (id: string): CheckResult | undefined => results.find((r) => r.id === id);

  const field = (id: string, label: string, key: 'zs' | 'r1r2' | 'ir' | 'rcd1' | 'rcd5', limitText: string) => {
    const r = resultFor(id);
    return (
      <div className="field big">
        <label htmlFor={`site-${key}`}>{label}</label>
        <input id={`site-${key}`} inputMode="decimal" value={entry[key]} onChange={(e) => patch({ [key]: e.target.value })} aria-describedby={`site-${key}-lim`} />
        <small id={`site-${key}-lim`} className="limit">{limitText}</small>
        {r && <div aria-live="polite"><StatusChip status={r.status} /> <span className="inline-msg">{r.message}</span></div>}
      </div>
    );
  };

  const polarityOptions: [Polarity, string][] = [['unset', 'Not tested'], ['ok', 'Correct'], ['bad', 'Incorrect']];

  return (
    <section aria-labelledby="site-h">
      <h2 id="site-h">Site tests</h2>
      <div className="field">
        <label htmlFor="site-circuit">Circuit</label>
        <select id="site-circuit" value={circuit.id} onChange={(e) => setSel(e.target.value)}>
          {state.circuits.map((c) => <option key={c.id} value={c.id}>{c.ref} – {c.description || 'no description'}</option>)}
        </select>
        <small>{circuit.device}{circuit.inA} · {circuit.lineCsaMm2} mm² · {circuit.lengthM} m · Ze {state.ueOhm} Ω</small>
      </div>

      <div className={`verdict verdict-${overall.toLowerCase()}`} role="status" aria-live="polite">
        {overall === 'EMPTY' ? <span>Enter a measured value to see the result</span> : <StatusChip status={overall} big />}
      </div>

      {field('test-zs', 'Measured Zs (Ω)', 'zs', `Zs ≤ ${fmtNum(lim.zsMaxMeasured)} Ω (${state.settings.siteZsFactor} × design limit)`)}
      {field('test-r1r2', 'Measured R1+R2 (Ω)', 'r1r2', `Design (cold) ${fmtNum(design, 3)} Ω; advisory if more than 20% different`)}
      {field('test-ir', 'Insulation resistance (MΩ)', 'ir', `IR ≥ ${state.settings.irFailMohm} MΩ (advisory below ${state.settings.irAdvisoryMohm} MΩ)`)}

      <fieldset className="field big">
        <legend>Polarity</legend>
        <div className="seg">
          {polarityOptions.map(([v, label]) => (
            <label key={v} className={`seg-item ${entry.polarity === v ? 'on' : ''}`}>
              <input type="radio" name="polarity" value={v} checked={entry.polarity === v} onChange={() => patch({ polarity: v })} />
              {label}
            </label>
          ))}
        </div>
        {resultFor('test-polarity') && <StatusChip status={resultFor('test-polarity')!.status} />}
      </fieldset>

      {field('test-rcd-1x', 'RCD trip time at 1×IΔn (ms)', 'rcd1', `t ≤ ${state.settings.rcd1xMaxMs} ms`)}
      {field('test-rcd-5x', 'RCD trip time at 5×IΔn (ms)', 'rcd5', rcd5Applies ? `t ≤ ${state.settings.rcd5xMaxMs} ms (RCD ≤ 30 mA)` : 'Limit applies to RCDs ≤ 30 mA; none recorded for this circuit')}
      <div className="row wrap">
        <button
          className="btn primary"
          disabled={results.length === 0}
          onClick={() => dispatch({ type: 'saveSession', session: { id: newId(), circuitId: circuit.id, savedAt: new Date().toISOString(), entry: { ...entry } } })}
        >
          Save this test session
        </button>
        <button className="btn" disabled={state.sessions.length === 0} onClick={() => {
          const url = URL.createObjectURL(new Blob([sessionsToCsv(state.sessions, state.circuits, state.ueOhm, state.settings)], { type: 'text/csv' }));
          const a = document.createElement('a');
          a.href = url;
          a.download = `${state.boardName || 'board'}-site-tests.csv`;
          a.click();
          URL.revokeObjectURL(url);
        }}>
          Export all sessions (CSV)
        </button>
      </div>

      <h3>History for {circuit.ref}</h3>
      {history.length === 0 ? (
        <p className="note">No saved sessions yet. Enter readings, then save a session to keep a dated record and compare re-tests.</p>
      ) : (
        <ul className="history">
          {[...history].reverse().map((s, i, arr) => {
            const prev = arr[i + 1];
            const v = evaluateSession(s, circuit, state.ueOhm, state.settings);
            return (
              <li key={s.id} className="card">
                <div className="row">
                  <span><b>{new Date(s.savedAt).toLocaleString('en-GB')}</b></span>
                  {v.overall !== 'EMPTY' && <StatusChip status={v.overall} />}
                </div>
                <p className="note">
                  Zs {s.entry.zs || '–'} Ω · R1+R2 {s.entry.r1r2 || '–'} Ω · IR {s.entry.ir || '–'} MΩ · RCD {s.entry.rcd1 || '–'}/{s.entry.rcd5 || '–'} ms
                </p>
                {prev && (
                  <p className="note">
                    Since previous: <Delta d={delta(prev.entry.zs, s.entry.zs)} unit="Ω Zs" lowerIsBetter />{' '}
                    <Delta d={delta(prev.entry.ir, s.entry.ir)} unit="MΩ IR" lowerIsBetter={false} />
                  </p>
                )}
                <div className="row wrap">
                  <button className="btn small" onClick={() => patch({ ...s.entry })}>Load into form</button>
                  <button className="btn small danger" onClick={() => { if (window.confirm('Delete this saved session?')) dispatch({ type: 'deleteSession', id: s.id }); }}>Delete</button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      <p className="note">Entered values are stored on this device. The tool works offline once loaded.</p>
    </section>
  );
}
