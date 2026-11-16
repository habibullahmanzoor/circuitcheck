import { DEFAULT_SETTINGS as D, SETTING_FIELDS } from '../engine';
import { DISCLAIMER } from './common';

const SECTIONS = [
  ['start', 'Quick start'],
  ['tabs', 'What each tab does'],
  ['inputs', 'Circuit fields explained'],
  ['checks', 'The checks and formulas'],
  ['status', 'How Pass / Fail is decided'],
  ['settings', 'Assumptions & settings'],
  ['site', 'Site testing'],
  ['report', 'Reports'],
  ['data', 'Your data, privacy & offline'],
  ['ai', 'Optional AI features'],
  ['glossary', 'Glossary'],
  ['limits', 'Limitations'],
  ['faq', 'FAQ & shortcuts'],
] as const;

export function GuideTab({ onGo }: { onGo: (tab: 'board' | 'design' | 'lab' | 'site' | 'report' | 'settings') => void }) {
  return (
    <section aria-labelledby="guide-h" className="guide">
      <h2 id="guide-h">How to use CircuitCheck</h2>
      <p className="note">
        CircuitCheck checks low-voltage final-circuit designs against BS 7671-style rules, then checks your site test readings
        against the design limits. Every result shows its formula, inputs and assumptions. {DISCLAIMER}
      </p>

      <div className="guide-layout">
        <nav className="guide-toc card" aria-label="Guide contents">
          <b>Contents</b>
          <ul>{SECTIONS.map(([id, label]) => <li key={id}><a href={`#guide-${id}`} onClick={(e) => { e.preventDefault(); document.getElementById(`guide-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }}>{label}</a></li>)}</ul>
        </nav>

        <div className="guide-body">
          <article id="guide-start" className="card">
            <h3>Quick start (2 minutes)</h3>
            <ol>
              <li><b>Board tab:</b> press <i>Try the sample board</i> (or <i>Add circuit</i> for your own). Set <b>Ze</b>, the external earth fault loop impedance of your supply.</li>
              <li><b>Design check tab:</b> read the board health and each circuit card. Failing circuits open automatically and show the formula, the numbers and a re-checked fix.</li>
              <li>Press an <b>Apply:</b> button to accept a fix. <i>Undo</i> in the top bar reverses it.</li>
              <li><b>Lab tab:</b> try what-if changes with sliders, or find the smallest cable size that passes.</li>
              <li><b>Site tests tab:</b> pick a circuit, type your meter readings, and see Pass/Fail instantly. Save a dated session.</li>
              <li><b>Report tab:</b> press <i>Print / Save as PDF</i> for an A4 report.</li>
            </ol>
            <div className="row wrap">
              <button className="btn primary" onClick={() => onGo('board')}>Go to Board</button>
              <button className="btn" onClick={() => onGo('settings')}>Review assumptions</button>
            </div>
          </article>

          <article id="guide-tabs" className="card">
            <h3>What each tab does</h3>
            <dl>
              <dt>Board</dt><dd>Your circuit schedule. Add, edit, duplicate or delete circuits. Import or export CSV, and save or restore a full backup. Importing skips circuits whose ref already exists. With AI enabled, <b>✦ AI import</b> reads a schedule photo or PDF (or a description in words) into rows you must check and tick before they are added.</dd>
              <dt>Design check</dt><dd>Runs every check on every circuit. Shows a board health score, counts of pass / fail / advisory, the tightest margins, and a panel of assumptions you should confirm. Use <i>Failures only</i> to focus. With AI enabled, failed checks get a <b>✦ Explain in plain English</b> button.</dd>
              <dt>Lab</dt><dd><b>What-if sliders</b> change length, load, size, breaker rating and curve on a copy of a circuit and recalculate live. Nothing changes until you press <i>Save to circuit</i>. <b>Cable size finder</b> tries every standard size and marks the smallest that passes everything.</dd>
              <dt>Site tests</dt><dd>Enter measured Zs, R1+R2, insulation resistance, polarity and RCD trip times. Limits are shown beside each field. Save sessions to build a history with change-since-last-test, and export all sessions as CSV.</dd>
              <dt>Report</dt><dd>Printable summary: circuits table, failures with fixes, site results, settings used, assumed inputs, and the disclaimer.</dd>
              <dt>⚙ Settings</dt><dd>Every tunable assumption in one place, saved on this device, plus the optional <b>AI features</b> switch and API key.</dd>
              <dt>↶ Undo / ↷ Redo</dt><dd>Reverse or repeat board edits (Ctrl+Z / Ctrl+Y). Typing in a field is not recorded keystroke by keystroke.</dd>
            </dl>
          </article>

          <article id="guide-inputs" className="card">
            <h3>Circuit fields explained</h3>
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Field</th><th>Meaning</th><th>If you leave it unsure</th></tr></thead>
                <tbody>
                  <tr><td>Ref / Description</td><td>Your label for the circuit, e.g. L1, “Sockets kitchen”.</td><td>Ref must be unique; it is used to skip duplicates on import.</td></tr>
                  <tr><td>Phases</td><td>1P = single-phase 230 V. 3P = balanced three-phase 400 V.</td><td>Unbalanced loads are not supported.</td></tr>
                  <tr><td>Type</td><td>lighting, socket, fixed or other. Sets the voltage-drop limit and whether the RCD rule applies.</td><td>Use “other” if none fit.</td></tr>
                  <tr><td>Device curve and In</td><td>The breaker type (B, C, D) and its rating in amps.</td><td>The curve sets how fast it must trip: ×5, ×10, ×20 of In.</td></tr>
                  <tr><td>Ib</td><td>Design current: the load the circuit really carries.</td><td>Must not exceed In.</td></tr>
                  <tr><td>Line csa / cpc csa</td><td>Cross-sectional area (mm²) of the live and earth conductors.</td><td>Blank cpc uses the sizing rule and is flagged as an assumption.</td></tr>
                  <tr><td>Length</td><td>Run length in metres from the board to the furthest point.</td><td>Longer runs drop more voltage and raise Zs.</td></tr>
                  <tr><td>Insulation</td><td>PVC 70 °C or XLPE 90 °C. Changes the hot multiplier and k factor.</td><td></td></tr>
                  <tr><td>Install method</td><td>A key such as C that selects a row of your ampacity table.</td><td>No matching table entry means the ampacity check is “Not checked”.</td></tr>
                  <tr><td>Ca / Cg</td><td>Ambient-temperature and grouping correction factors (1 = none).</td><td>Both 1 is flagged: confirm there is no derating.</td></tr>
                  <tr><td>RCD (mA)</td><td>Rating of the RCD protecting the circuit. Blank = none.</td><td>Socket circuits up to 32 A need 30 mA or less.</td></tr>
                </tbody>
              </table>
            </div>
          </article>

          <article id="guide-checks" className="card">
            <h3>The checks and formulas</h3>
            <p className="note">Clause references are free text. Verify them against your licensed copy of BS 7671.</p>
            <div className="table-wrap">
              <table className="compact">
                <thead><tr><th>Check</th><th>Calculation</th><th>Pass when</th></tr></thead>
                <tbody>
                  <tr><td>Voltage drop</td><td><code>Vd = 2·r·L·Ib</code> (1φ), <code>√3·r·L·Ib</code> (3φ), with r at operating temperature</td><td>Drop ≤ {D.vdLimitLightingPct}% (lighting) or {D.vdLimitOtherPct}% (other)</td></tr>
                  <tr><td>Earth fault loop</td><td><code>Zs = Ze + (R1+R2)hot</code>; limit <code>Cmin·Uo / (k·In)</code></td><td>Zs ≤ limit (k = 5, 10, 20 for B, C, D)</td></tr>
                  <tr><td>cpc fault withstand</td><td><code>S_min = I·√t / k</code>, where <code>I = Uo / Zs_cold</code></td><td>cpc csa ≥ S_min</td></tr>
                  <tr><td>Ib ≤ In</td><td>Design current against breaker rating</td><td>Ib ≤ In</td></tr>
                  <tr><td>Current-carrying capacity</td><td><code>Iz = It·Ca·Cg</code> from the ampacity table</td><td>In ≤ Iz; “Not checked” if no table entry</td></tr>
                  <tr><td>Additional protection</td><td>Socket circuits up to 32 A</td><td>RCD of 30 mA or less recorded</td></tr>
                </tbody>
              </table>
            </div>
            <p>Fault withstand assumes the breaker disconnects in {D.disconnectionS} s (a setting). Voltage drop includes resistance only.</p>
          </article>

          <article id="guide-status" className="card">
            <h3>How Pass / Fail is decided</h3>
            <p>Each check computes a <b>value</b> and compares it with a <b>limit</b>. No AI is involved in any calculation or in Pass/Fail: the same inputs always give the same answer.</p>
            <ul>
              <li><b>✔ Pass</b>: the value is within the limit.</li>
              <li><b>✖ Fail</b>: the value breaks the limit. The card shows the formula and a re-checked fix.</li>
              <li><b>! Advisory</b>: passes, but needs a look (for example insulation resistance under {D.irAdvisoryMohm} MΩ, or reactance ignored at 25 mm² and above).</li>
              <li><b>– Not checked</b>: the app lacks data and will not guess (for example no ampacity table entry).</li>
              <li><b>⚠ Input error</b>: a number is missing or invalid.</li>
            </ul>
            <p>A circuit&apos;s overall status is its worst check: input error, then fail, then advisory, then pass. The <b>utilisation bar</b> shows how much of the limit is used; over 100% is a fail. <b>Board health</b> scores pass as 1 and advisory as 0.75; any failing circuit caps the grade at C.</p>
            <p><b>Suggested fixes</b> are only shown when the engine has re-run every check with the change and confirmed the target now passes without breaking anything that was passing.</p>
          </article>

          <article id="guide-settings" className="card">
            <h3>Assumptions &amp; settings</h3>
            <p>The app starts with defaults taken from the project plan. They are <b>not verified</b>. Open <i>⚙ Settings</i>, check each value against your licensed copy of BS 7671, and save yours.</p>
            <ul className="two-col">
              {SETTING_FIELDS.map((f) => <li key={f.id}><b>{f.label}:</b> default {f.get(D)}{f.unit && ` ${f.unit}`}</li>)}
            </ul>
            <p>Saved values apply everywhere, are included in backups, and are listed in every report with changes flagged. The <b>assumptions to confirm</b> panel on Design check lists inputs the app had to assume: a blank cpc, Ca and Cg both 1, a missing ampacity entry, the starting Ze, and the demo table.</p>
          </article>

          <article id="guide-site" className="card">
            <h3>Site testing</h3>
            <ol>
              <li>Pick the circuit. Its limits are shown next to each field.</li>
              <li>Type readings as you measure. Leave a field blank if you did not test it; blank is simply skipped.</li>
              <li>Measured Zs is compared with {D.siteZsFactor} × the design limit because you measure at room temperature.</li>
              <li>Insulation resistance fails below {D.irFailMohm} MΩ and gives an advisory below {D.irAdvisoryMohm} MΩ.</li>
              <li>RCD trip must be ≤ {D.rcd1xMaxMs} ms at 1×; for 30 mA RCDs also ≤ {D.rcd5xMaxMs} ms at 5×.</li>
              <li>Two readings that disagree (Zs vs Ze + R1+R2 by more than 25%, or R1+R2 over 20% from design) raise an advisory: re-check your readings.</li>
              <li><b>Save this test session</b> keeps a dated record. History shows the change since the previous test and can be exported as CSV.</li>
            </ol>
          </article>

          <article id="guide-report" className="card">
            <h3>Reports</h3>
            <p>The Report tab builds an A4 summary. Use <i>Print / Save as PDF</i> and, if your browser offers it, tick <b>Background graphics</b> to keep the colours. The report includes failures with fixes, any site results, the settings used (changes flagged), the assumed inputs, and the disclaimer. It is a design aid, not a certificate.</p>
          </article>

          <article id="guide-data" className="card">
            <h3>Your data, privacy &amp; offline use</h3>
            <ul>
              <li>Everything is stored <b>in this browser on this device</b>. There is no account or server. The only thing that can leave the device is what you send to the optional AI features (see the AI section), and only after you switch them on.</li>
              <li>After the first visit the app works <b>offline</b>. Saved circuits, readings and settings stay available. Only the optional AI features need internet.</li>
              <li><b>Save backup</b> (Board tab) downloads everything as one JSON file. <b>Restore backup</b> loads it on another device. Restoring can be undone.</li>
              <li>Clearing your browser data removes the board, so keep a backup of important work.</li>
              <li>To use licensed cable ratings, add <code>src/data/ampacity.local.json</code> (see the README). It is git-ignored so it is never committed.</li>
            </ul>
          </article>

          <article id="guide-ai" className="card">
            <h3>Optional AI features</h3>
            <p>Off by default. Turn them on in <i>⚙ Settings → AI features</i> with your own Anthropic API key. They need internet and are billed to your Anthropic account.</p>
            <ul>
              <li><b>✦ AI import (Board tab):</b> upload a photo or PDF of a schedule, or describe circuits in words. The AI proposes rows; you check each one against the original, fix anything it could not read, and tick <i>I checked this row</i>. Only ticked, valid rows are added. Anything it could not read is left blank and highlighted, never guessed.</li>
              <li><b>✦ Explain in plain English (Design check):</b> on a failed check, the AI rewords the engine&apos;s own numbers for a non-expert. It is told to add no numbers, no clause references and no compliance claims.</li>
            </ul>
            <p><b>What the AI never does:</b> calculate, decide Pass or Fail, supply standards values, or change your board without your confirmation. All results still come from the deterministic engine.</p>
            <p><b>What is sent:</b> only the file or text you submit, or one failed check with a short circuit summary. Not your board name, other circuits, settings or backups. <b>Your key</b> is kept for this tab only unless you choose to remember it on this device, and it is never written to backups, CSV exports or reports. It is used directly from the browser, so use a key with a low spend limit and remove it on shared computers.</p>
            <p>AI can misread digits, especially handwriting. Always compare each row with the original before ticking it.</p>
          </article>

          <article id="guide-glossary" className="card">
            <h3>Glossary</h3>
            <dl className="two-col-dl">
              <dt>Ze</dt><dd>External earth fault loop impedance: resistance of the supply side of the fault path.</dd>
              <dt>Zs</dt><dd>Total earth fault loop impedance at the circuit: Ze plus (R1+R2).</dd>
              <dt>R1+R2</dt><dd>Resistance of the line conductor plus the protective (earth) conductor of a circuit.</dd>
              <dt>In</dt><dd>Rated current of the protective device (breaker).</dd>
              <dt>Ib</dt><dd>Design current: the load the circuit is designed to carry.</dd>
              <dt>Iz</dt><dd>Current-carrying capacity of the cable after correction factors.</dd>
              <dt>It</dt><dd>Tabulated current rating from the ampacity table, before corrections.</dd>
              <dt>Ca / Cg</dt><dd>Ambient temperature and grouping correction factors.</dd>
              <dt>cpc</dt><dd>Circuit protective conductor (the earth wire).</dd>
              <dt>csa</dt><dd>Cross-sectional area of a conductor in mm².</dd>
              <dt>MCB curve B / C / D</dt><dd>How fast the breaker trips on a fault: at 5×, 10× or 20× its rating.</dd>
              <dt>RCD</dt><dd>Residual current device: trips on small leakage currents; 30 mA gives shock protection.</dd>
              <dt>Cmin</dt><dd>Minimum voltage factor used when setting the earth-fault limit.</dd>
              <dt>TN</dt><dd>Supply earthing arrangement where the earth comes from the supplier (the only type in v1).</dd>
              <dt>Utilisation</dt><dd>How much of a limit a value uses, as a percentage.</dd>
            </dl>
          </article>

          <article id="guide-limits" className="card">
            <h3>Limitations</h3>
            <ul>
              <li>The built-in ampacity table is <b>synthetic and illustrative</b>, not from BS 7671. Load your own for real work.</li>
              <li>Default constants are unverified until you confirm them in Settings.</li>
              <li>Voltage drop is resistive only. Fault withstand uses one assumed disconnection time, not manufacturer let-through energy.</li>
              <li>Single-phase TN supplies are the focus. Three-phase is balanced only. No unbalanced loads, harmonics, breaking-capacity coordination or cable routing.</li>
              <li>Clause references are free text: verify against your licensed copy.</li>
              <li>AI features (if you enable them) can misread a schedule and need internet and your own API key. They are tested with simulated replies, not yet against the live service. Every AI-proposed row needs your confirmation.</li>
              <li>Output is never a certificate and gives no compliance guarantee. A competent person must sign off.</li>
            </ul>
          </article>

          <article id="guide-faq" className="card">
            <h3>FAQ &amp; shortcuts</h3>
            <dl>
              <dt>Why does everything say “assumed”?</dt><dd>Blank cpc sizes, Ca = Cg = 1 and the starting Ze are flagged so a result built on defaults is never mistaken for a confirmed one. Fill them in and the flags go away.</dd>
              <dt>Why is a check “Not checked”?</dt><dd>The ampacity table has no entry for that size, install method, insulation and phase count. The app will not guess.</dd>
              <dt>My import skipped circuits.</dt><dd>Rows with an existing ref are skipped, and invalid rows are reported with their row numbers. The rest still load.</dd>
              <dt>Can I undo Apply?</dt><dd>Yes: use the Undo button in the banner or the top bar, or Ctrl+Z.</dd>
              <dt>How do I move my board to a phone?</dt><dd>Save backup on one device, then Restore backup on the other.</dd>
              <dt>I don&apos;t see the AI buttons.</dt><dd>They appear only after you turn on <i>⚙ Settings → AI features</i> and enter an API key. Use <i>Test key</i> to check it.</dd>
              <dt>Is my API key saved in backups?</dt><dd>No. It is stored separately, never in backups, CSV exports or reports, and by default only until the tab closes.</dd>
              <dt>Can the AI make a circuit pass?</dt><dd>No. It only reads schedules and rewords results. Pass/Fail comes from the engine&apos;s formulas.</dd>
              <dt>Keyboard</dt><dd><kbd>Ctrl</kbd>+<kbd>Z</kbd> undo, <kbd>Ctrl</kbd>+<kbd>Y</kbd> or <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd> redo (when not typing in a field). All forms are keyboard accessible and labelled.</dd>
            </dl>
          </article>
        </div>
      </div>
    </section>
  );
}
