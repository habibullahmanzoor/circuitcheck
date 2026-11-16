import { useState, type Dispatch } from 'react';
import { boardHealth, gapCounts, utilisation, type InputGap, type CheckResult, type Circuit, type CircuitReport, type BoardSummary, type Fix } from '../engine';
import { runExplain } from '../ai/client';
import { aiReady, type AiConfig } from '../ai/config';
import { StatusChip, fmtNum } from './common';
import type { Action } from './state';

function Bar({ r }: { r: CheckResult }) {
  const u = utilisation(r);
  if (u === undefined) return null;
  const pct = Math.round(u * 100);
  return (
    <div className="bar-row">
      <div className="bar" role="img" aria-label={`Utilisation ${pct}% of limit`}>
        <div className={`bar-fill ${u > 1 ? 'over' : ''}`} style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
      <span className="bar-text">{pct}% of limit</span>
    </div>
  );
}

function Explain({ r, explain }: { r: CheckResult; explain: () => Promise<string> }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  if (r.status !== 'FAIL') return null;
  return (
    <div className="ai-explain">
      <button
        className="btn small"
        disabled={busy}
        onClick={() => {
          setBusy(true); setErr('');
          explain().then(setText).catch((e: unknown) => setErr(e instanceof Error ? e.message : 'Something went wrong.')).finally(() => setBusy(false));
        }}
      >
        {busy ? 'Explaining…' : '✦ Explain in plain English (AI)'}
      </button>
      {err && <p role="alert" className="err">{err}</p>}
      {text && (
        <div className="card ai-text" role="status">
          <p>{text}</p>
          <small>AI wording only. It rephrases the numbers above and calculates nothing. Sent to Anthropic: this check and a short circuit summary.</small>
        </div>
      )}
    </div>
  );
}

export function ResultDetail({ r, onApply, explain }: { r: CheckResult; onApply?: (f: Fix) => void; explain?: () => Promise<string> }) {
  return (
    <div className="result">
      <div className="result-head">
        <StatusChip status={r.status} />
        <strong>{r.title}</strong>
      </div>
      <p>{r.message}</p>
      {r.value !== undefined && r.limit !== undefined && (
        <p className="vl">
          Value <b>{fmtNum(r.value, 3)}</b> vs limit <b>{fmtNum(r.limit, 3)}</b> {r.unit}
        </p>
      )}
      <Bar r={r} />
      {r.suggestion && <p className="suggest"><b>Suggested fix (re-checked):</b> {r.suggestion}</p>}
      {explain && <Explain r={r} explain={explain} />}
      {onApply && r.fixes && r.fixes.length > 0 && (
        <div className="row wrap">
          {r.fixes.map((f) => (
            <button key={f.text} className="btn small" onClick={() => onApply(f)}>Apply: {f.text.replace(/ \(drop [\d.]+%\)/, '')}</button>
          ))}
        </div>
      )}
      <details>
        <summary>Formula, inputs and assumptions</summary>
        {r.formula && <p><code>{r.formula}</code></p>}
        {Object.keys(r.inputs).length > 0 && (
          <ul className="inputs">
            {Object.entries(r.inputs).map(([k, v]) => <li key={k}>{k}: <b>{String(v)}</b></li>)}
          </ul>
        )}
        {r.assumptions.length > 0 && (
          <ul>{r.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
        )}
        <p className="clause">Ref: {r.clauseRef}</p>
      </details>
    </div>
  );
}

export function DesignTab({
  reports,
  summary,
  descriptions,
  circuits,
  dispatch,
  gaps = [],
  boardNotes = [],
  ai,
}: {
  ai?: AiConfig;
  gaps?: InputGap[];
  boardNotes?: string[];
  reports: CircuitReport[];
  summary: BoardSummary;
  descriptions: Record<string, string>;
  circuits: Circuit[];
  dispatch: Dispatch<Action>;
}) {
  const [failuresOnly, setFailuresOnly] = useState(false);
  const health = boardHealth(reports);
  const explainFor = (circuitId: string, r: CheckResult): (() => Promise<string>) | undefined => {
    const c = circuits.find((x) => x.id === circuitId);
    if (!ai || !aiReady(ai) || !c || r.status !== 'FAIL') return undefined;
    return () => runExplain(ai, c, r);
  };
  const perCircuit = gapCounts(gaps);
  const gapTotal = gaps.length + boardNotes.length;
  const [applied, setApplied] = useState<{ before: Circuit; text: string } | null>(null);
  const apply = (id: string, f: Fix): void => {
    const c = circuits.find((x) => x.id === id);
    if (!c) return;
    setApplied({ before: c, text: `Applied to ${c.ref}: ${f.text}` });
    dispatch({ type: 'saveCircuit', circuit: { ...c, ...f.patch } });
  };
  const shown = failuresOnly ? reports.filter((r) => r.overall === 'FAIL' || r.overall === 'INPUT_ERROR') : reports;

  return (
    <section aria-labelledby="design-h">
      <h2 id="design-h">Design check</h2>
      {reports.length === 0 ? (
        <div className="card empty"><p>No circuits to check. Add circuits on the Board tab first.</p></div>
      ) : (
        <>
          <div className="overview">
          <div className="card health-card">
            <svg className="ring" viewBox="0 0 80 80" role="img" aria-label={`Board health ${health.score} out of 100, grade ${health.grade}`}>
              <circle cx="40" cy="40" r="34" className="ring-bg" />
              <circle cx="40" cy="40" r="34" className={`ring-fg grade-${health.grade}`} strokeDasharray={`${(health.score / 100) * 213.6} 213.6`} transform="rotate(-90 40 40)" />
              <text x="40" y="46" textAnchor="middle" className="ring-text">{health.score}</text>
            </svg>
            <div>
              <h3>Board health: grade {health.grade}</h3>
              <p className="note">Pass counts 1, advisory 0.75. Any failing circuit caps the grade at C.</p>
              {health.tightest.length > 0 && (
                <ul className="margins" aria-label="Tightest margins">
                  {health.tightest.map((m) => (
                    <li key={`${m.ref}-${m.checkTitle}`}><b>{m.ref}</b> {m.checkTitle}: {Math.round(m.utilisation * 100)}% of limit</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
          <div className="tiles" role="status">
            <div className="tile t-pass"><b>{summary.pass}</b><span>✔ Pass</span></div>
            <div className="tile t-fail"><b>{summary.fail}</b><span>✖ Fail</span></div>
            <div className="tile t-adv"><b>{summary.advisory}</b><span>! Advisory</span></div>
            {summary.inputError > 0 && <div className="tile t-fail"><b>{summary.inputError}</b><span>⚠ Input error</span></div>}
          </div>
          <div className="health" role="img" aria-label={`${summary.pass} of ${summary.total} circuits pass`}>
            <div className="h-pass" style={{ flex: summary.pass }} />
            <div className="h-adv" style={{ flex: summary.advisory }} />
            <div className="h-fail" style={{ flex: summary.fail + summary.inputError }} />
          </div>
          </div>
          {gapTotal > 0 && (
            <details className="card gaps">
              <summary><b>{gapTotal} assumption{gapTotal === 1 ? '' : 's'} to confirm</b> <span className="note">Results above rely on defaults or unchecked inputs</span></summary>
              {boardNotes.length > 0 && (
                <>
                  <h3>Whole board</h3>
                  <ul>{boardNotes.map((n) => <li key={n}>{n}</li>)}</ul>
                </>
              )}
              {gaps.length > 0 && (
                <>
                  <h3>Per circuit</h3>
                  <ul>{gaps.map((g) => <li key={`${g.circuitId}-${g.kind}`}><b>{g.ref}:</b> {g.message}</li>)}</ul>
                </>
              )}
              <p className="note">Fill these in on the Board tab (Edit), or review the values on the ⚙ Settings page.</p>
            </details>
          )}
          <label className="check">
            <input type="checkbox" checked={failuresOnly} onChange={(e) => setFailuresOnly(e.target.checked)} />
            Failures only
          </label>
          {applied && (
            <div className="card suggest" role="status">
              {applied.text}.{' '}
              <button className="btn small" onClick={() => { dispatch({ type: 'saveCircuit', circuit: applied.before }); setApplied(null); }}>Undo</button>
            </div>
          )}
          {shown.length === 0 && <p className="notice">No failures.</p>}
          <div className="cards-grid">
          {shown.map((rep) => (
            <details key={rep.circuitId} className={`card circuit-card stripe-${rep.overall.toLowerCase()}`} open={rep.overall === 'FAIL'}>
              <summary>
                <span className="cc-title"><b>{rep.ref}</b> {descriptions[rep.circuitId]}</span>
                <span className="row-right">
                  {perCircuit[rep.circuitId] ? <span className="chip chip-not_checked mini" title="Inputs relying on defaults">≈ {perCircuit[rep.circuitId]} assumed</span> : null}
                  <StatusChip status={rep.overall} />
                </span>
              </summary>
              {rep.results.map((r) => <ResultDetail key={r.id} r={r} onApply={(f) => apply(rep.circuitId, f)} explain={explainFor(rep.circuitId, r)} />)}
            </details>
          ))}
          </div>
        </>
      )}
    </section>
  );
}
