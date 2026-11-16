import { DEFAULT_SETTINGS, SETTING_FIELDS, boardGaps, inputGaps, type AmpacityTable, type BoardSummary, type CheckResult, type Circuit, type CircuitReport } from '../engine';
import { DISCLAIMER, StatusChip, fmtNum, statusWord } from './common';
import { siteResults } from './SiteTab';
import type { AppState } from './state';

const find = (rep: CircuitReport, id: string): CheckResult | undefined => rep.results.find((r) => r.id === id);

function Cell({ r, dp = 1 }: { r: CheckResult | undefined; dp?: number }) {
  if (!r || r.value === undefined) return <td>–</td>;
  return <td>{fmtNum(r.value, dp)}{r.unit === '%' ? '%' : ''} / {fmtNum(r.limit, dp)}</td>;
}

export function ReportTab({
  state,
  reports,
  summary,
  table,
}: {
  state: AppState;
  reports: CircuitReport[];
  summary: BoardSummary;
  table: AmpacityTable;
}) {
  const circuits: Record<string, Circuit> = Object.fromEntries(state.circuits.map((c) => [c.id, c]));
  const failures = reports.flatMap((rep) => rep.results.filter((r) => r.status === 'FAIL' || r.status === 'INPUT_ERROR').map((r) => ({ rep, r })));
  const tests = state.circuits.flatMap((c) => siteResults(c, state.ueOhm, state.site[c.id], state.settings).map((r) => ({ c, r })));
  const gaps = inputGaps(state.circuits, reports);
  const boardNotes = boardGaps(state.ueOhm, table);
  const assumptions = Array.from(new Set(reports.flatMap((rep) => rep.results.flatMap((r) => r.assumptions))));

  return (
    <section aria-labelledby="report-h" className="report">
      <div className="no-print row">
        <h2 id="report-h">Report</h2>
        <button className="btn primary" onClick={() => window.print()}>Print / Save as PDF</button>
      </div>
      {reports.length === 0 ? (
        <div className="card empty no-print"><p>Nothing to report yet. Add circuits on the Board tab.</p></div>
      ) : (
        <article className="sheet">
          <header>
            <h1>CircuitCheck design calculation report</h1>
            <p>Board <b>{state.boardName}</b> · Ze {state.ueOhm} Ω · TN supply, 230 V · Generated {new Date().toLocaleDateString('en-GB')}</p>
          </header>

          <h3>Summary</h3>
          <div className="sum-pills">
            <span className="chip chip-not_checked">{summary.total} circuits</span>
            <span className="chip chip-pass">✔ {summary.pass} pass</span>
            <span className="chip chip-fail">✖ {summary.fail} fail</span>
            <span className="chip chip-advisory">! {summary.advisory} advisory</span>
            {summary.inputError > 0 && <span className="chip chip-input_error">⚠ {summary.inputError} input error</span>}
          </div>

          <h3>Circuits</h3>
          <div className="table-wrap">
            <table className="compact">
              <thead>
                <tr><th>Ref</th><th>Description</th><th>Device</th><th>Ib</th><th>csa / L</th><th>Vd % / limit</th><th>Zs Ω / max</th><th>Status</th></tr>
              </thead>
              <tbody>
                {reports.map((rep) => {
                  const c = circuits[rep.circuitId];
                  return (
                    <tr key={rep.circuitId} className={`row-${rep.overall.toLowerCase()}`}>
                      <td>{rep.ref}</td>
                      <td>{c?.description}</td>
                      <td>{c ? `${c.device}${c.inA}` : ''}</td>
                      <td>{c?.ibA}</td>
                      <td>{c ? `${c.lineCsaMm2} mm² / ${c.lengthM} m` : ''}</td>
                      <Cell r={find(rep, 'voltage-drop')} dp={2} />
                      <Cell r={find(rep, 'earth-fault-loop')} dp={2} />
                      <td><StatusChip status={rep.overall} /></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3>Failures and suggested fixes</h3>
          {failures.length === 0 ? <p>No failures.</p> : (
            <ul className="fail-list">
              {failures.map(({ rep, r }) => (
                <li key={`${rep.circuitId}-${r.id}`}>
                  <b>{rep.ref}: {r.title}.</b> {r.message}{' '}
                  {r.suggestion ?? 'No automatic fix verified; review the design inputs.'}
                </li>
              ))}
            </ul>
          )}

          <h3>Site test results</h3>
          {tests.length === 0 ? <p>No site test values entered.</p> : (
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Ref</th><th>Test</th><th>Result</th><th>Limit</th><th>Status</th></tr></thead>
                <tbody>
                  {tests.map(({ c, r }) => (
                    <tr key={`${c.id}-${r.id}`}>
                      <td>{c.ref}</td>
                      <td>{r.title}</td>
                      <td>{r.value === undefined ? '–' : `${fmtNum(r.value, 2)} ${r.unit ?? ''}`}</td>
                      <td>{r.limit === undefined ? '–' : fmtNum(r.limit, 2)}</td>
                      <td>{statusWord(r.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {(gaps.length > 0 || boardNotes.length > 0) && (
            <>
              <h3>Inputs assumed or not checked</h3>
              <ul className="small">
                {boardNotes.map((n) => <li key={n}>{n}</li>)}
                {gaps.map((g) => <li key={`${g.circuitId}-${g.kind}`}><b>{g.ref}:</b> {g.message}</li>)}
              </ul>
            </>
          )}

          <h3>Settings used</h3>
          <div className="table-wrap">
            <table className="compact">
              <thead><tr><th>Setting</th><th>Value used</th><th>Default</th><th>Note</th></tr></thead>
              <tbody>
                {SETTING_FIELDS.map((f) => {
                  const v = f.get(state.settings);
                  const d = f.get(DEFAULT_SETTINGS);
                  return (
                    <tr key={f.id}>
                      <td>{f.label}</td>
                      <td>{v}{f.unit && ` ${f.unit}`}</td>
                      <td>{d}</td>
                      <td>{v === d ? 'default' : 'CHANGED by user'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <h3>Assumptions</h3>
          <ul className="small">{assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
          <p className="small">Clause references are free text; verify against your licensed copy of BS 7671. Ampacity table: {table.name}.</p>
          <p className="disclaimer">{DISCLAIMER}</p>
        </article>
      )}
    </section>
  );
}
