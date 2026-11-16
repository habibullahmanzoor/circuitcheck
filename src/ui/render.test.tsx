import { describe, it, expect } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import sampleCsv from '../data/sample-board.csv?raw';
import { loadAmpacity } from '../data/loadAmpacity';
import { checkBoard, parseCsv } from '../engine';
import { DesignTab } from './DesignTab';
import { ReportTab } from './ReportTab';
import { SiteTab } from './SiteTab';
import { BoardTab } from './BoardTab';
import { LabTab } from './LabTab';
import { initialState, reducer, type AppState } from './state';

const { table } = loadAmpacity();
const circuits = parseCsv(sampleCsv).circuits;
const state: AppState = reducer(initialState(), { type: 'replaceCircuits', circuits });
const { reports, summary } = checkBoard(state.circuits, { uoV: 230, ueOhm: state.ueOhm }, table);
const noop = () => undefined;

describe('UI render smoke', () => {
  it('demo table is active and flagged', () => {
    expect(table.demo).toBe(true);
  });
  it('board tab: empty state and populated', () => {
    expect(renderToStaticMarkup(<BoardTab state={initialState()} dispatch={noop} />)).toContain('Check your circuits in seconds');
    const html = renderToStaticMarkup(<BoardTab state={state} dispatch={noop} />);
    expect(html).toContain('Sockets kitchen');
  });
  it('design tab shows a FAIL with formula and a verified suggestion', () => {
    const d = Object.fromEntries(circuits.map((c) => [c.id, c.description]));
    const html = renderToStaticMarkup(<DesignTab reports={reports} summary={summary} descriptions={d} circuits={circuits} dispatch={noop} />);
    expect(html).toContain('Fail');
    expect(html).toContain('Vd = 2 · r_hot · L · Ib');
    expect(html).toContain('Suggested fix (re-checked)');
    expect(html).toMatch(/inputMode="decimal"|Failures only/);
  });
  it('design tab offers Apply buttons for verified fixes', () => {
    const d = Object.fromEntries(circuits.map((c) => [c.id, c.description]));
    expect(renderToStaticMarkup(<DesignTab reports={reports} summary={summary} descriptions={d} circuits={circuits} dispatch={noop} />)).toContain('Apply: increase line csa to 2.5 mm²');
  });
  it('design tab lists assumptions to confirm and the report repeats them', async () => {
    const { inputGaps, boardGaps } = await import('../engine');
    const gaps = inputGaps(circuits, reports);
    const notes = boardGaps(state.ueOhm, table);
    const d = Object.fromEntries(circuits.map((c) => [c.id, c.description]));
    const html = renderToStaticMarkup(<DesignTab reports={reports} summary={summary} descriptions={d} circuits={circuits} dispatch={noop} gaps={gaps} boardNotes={notes} />);
    expect(html).toContain('assumptions to confirm');
    expect(html).toContain('assumed');
    const rep = renderToStaticMarkup(<ReportTab state={state} reports={reports} summary={summary} table={table} />);
    expect(rep).toContain('Inputs assumed or not checked');
  });
  it('guide tab covers every section and shows live defaults', async () => {
    const { GuideTab } = await import('./GuideTab');
    const html = renderToStaticMarkup(<GuideTab onGo={noop} />);
    for (const s of ['Quick start', 'What each tab does', 'Circuit fields explained', 'The checks and formulas', 'How Pass / Fail is decided', 'Glossary', 'Limitations', 'FAQ']) {
      expect(html).toContain(s);
    }
    expect(html).toContain('Design aid only.');
    expect(html).toContain('default 0.95');
    expect(html).toContain('Optional AI features');
    expect(html).toContain('AI import');
    expect(html).toContain('Explain in plain English');
    expect(html).toContain('Only the optional AI features need internet');
    expect(html).toContain('never in backups');
  });
  it('AI controls appear only when AI is enabled with a key', async () => {
    const { AiImportPanel } = await import('./AiImportPanel');
    const off = renderToStaticMarkup(<BoardTab state={state} dispatch={noop} ai={{ enabled: false, apiKey: '', model: 'claude-opus-5-5', persist: 'session' }} />);
    expect(off).toContain('AI import');
    expect(off).toContain('set up');
    const on = renderToStaticMarkup(<BoardTab state={state} dispatch={noop} ai={{ enabled: true, apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx', model: 'claude-opus-5-5', persist: 'session' }} />);
    expect(on).toContain('AI import');
    const panel = renderToStaticMarkup(<AiImportPanel ai={{ enabled: true, apiKey: 'k', model: 'claude-opus-5-5', persist: 'session' }} circuits={[]} dispatch={noop} onDone={noop} />);
    expect(panel).toContain('will be sent to Anthropic');
    expect(panel).toContain('never calculates or decides Pass/Fail');
    expect(panel).toContain('disabled');
  });
  it('design tab shows the AI explain button only for failures when AI is on', () => {
    const ai = { enabled: true, apiKey: 'sk-ant-xxxxxxxxxxxxxxxxxxxx', model: 'claude-opus-5-5' as const, persist: 'session' as const };
    const d = Object.fromEntries(circuits.map((c) => [c.id, c.description]));
    const withAi = renderToStaticMarkup(<DesignTab reports={reports} summary={summary} descriptions={d} circuits={circuits} dispatch={noop} ai={ai} />);
    expect(withAi).toContain('Explain in plain English (AI)');
    const without = renderToStaticMarkup(<DesignTab reports={reports} summary={summary} descriptions={d} circuits={circuits} dispatch={noop} />);
    expect(without).not.toContain('Explain in plain English');
  });
  it('lab tab renders the what-if sliders', () => {
    const html = renderToStaticMarkup(<LabTab state={state} dispatch={noop} table={table} />);
    expect(html).toContain('What-if sliders');
    expect(html).toContain('type="range"');
  });
  it('settings tab lists every assumption with its default', async () => {
    const { SettingsTab } = await import('./SettingsTab');
    const { defaultAiConfig } = await import('../ai/config');
    const html = renderToStaticMarkup(<SettingsTab settings={state.settings} dispatch={noop} ai={defaultAiConfig()} onAi={noop} />);
    expect(html).toContain('AI features (optional)');
    expect(html).toContain('Enable AI features');
    expect(html).toContain('type="password"');
    expect(html).toContain('never calculates and never decides Pass or Fail');
    expect(html).toContain('Voltage drop limit, lighting');
    expect(html).toContain('Assumed disconnection time');
    expect(html).toContain('Default 0.95');
    expect(html).toContain('Nothing. All checks use the built-in defaults.');
  });
  it('report shows the settings used and flags changes', () => {
    const changed = { ...state, settings: { ...state.settings, cmin: 0.9 } };
    const html = renderToStaticMarkup(<ReportTab state={changed} reports={reports} summary={summary} table={table} />);
    expect(html).toContain('Settings used');
    expect(html).toContain('CHANGED by user');
  });
  it('site tab flags a Zs above the limit immediately', () => {
    const c = circuits[0]!;
    const s = reducer(state, { type: 'setSite', id: c.id, patch: { zs: '9.9' } });
    const html = renderToStaticMarkup(<SiteTab state={s} dispatch={noop} />);
    expect(html).toContain('Fail');
    expect(html).toContain('exceeds');
    expect(html).toContain('inputMode="decimal"');
  });
  it('report tab has the disclaimer, failures list and tests', () => {
    const c = circuits[0]!;
    const s = reducer(state, { type: 'setSite', id: c.id, patch: { ir: '0.5', polarity: 'ok' } });
    const html = renderToStaticMarkup(<ReportTab state={s} reports={reports} summary={summary} table={table} />);
    expect(html).toContain('Design aid only.');
    expect(html).toContain('Failures and suggested fixes');
    expect(html).toContain('Insulation resistance');
    
  });
});
