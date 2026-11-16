import { useEffect, useMemo, useReducer, useState } from 'react';
import { boardGaps, checkBoard, inputGaps } from '../engine';
import { loadAmpacity } from '../data/loadAmpacity';
import { BoardTab } from './BoardTab';
import { DEMO_BANNER, Disclaimer } from './common';
import { DesignTab } from './DesignTab';
import { LabTab } from './LabTab';
import { ReportTab } from './ReportTab';
import { loadBrowserAi, saveBrowserAi } from '../ai/client';
import type { AiConfig } from '../ai/config';
import { GuideTab } from './GuideTab';
import { SettingsTab } from './SettingsTab';
import { SiteTab } from './SiteTab';
import { loadState, saveState } from './state';
import { historyReducer, initHistory } from './history';
import './styles.css';

const TABS = [
  { id: 'board', label: 'Board', icon: '▦' },
  { id: 'design', label: 'Design check', icon: '✔' },
  { id: 'lab', label: 'Lab', icon: '◇' },
  { id: 'site', label: 'Site tests', icon: '⚡' },
  { id: 'report', label: 'Report', icon: '▤' },
  { id: 'guide', label: 'Guide', icon: '?' },
] as const;
type TabId = (typeof TABS)[number]['id'] | 'settings';

const loaded = loadAmpacity();

export function App() {
  const [hist, dispatch] = useReducer(historyReducer, undefined, () => initHistory(loadState()));
  const state = hist.present;
  const [ai, setAiState] = useState(loadBrowserAi);
  const setAi = (c: AiConfig): void => { setAiState(c); saveBrowserAi(c); };
  const [tab, setTab] = useState<TabId>('board');

  useEffect(() => saveState(state), [state]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (!(e.ctrlKey || e.metaKey)) return;
      const k = e.key.toLowerCase();
      if (k === 'z' && !e.shiftKey) { e.preventDefault(); dispatch({ type: 'undo' }); }
      else if (k === 'y' || (k === 'z' && e.shiftKey)) { e.preventDefault(); dispatch({ type: 'redo' }); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const { reports, summary } = useMemo(
    () => checkBoard(state.circuits, { uoV: 230, ueOhm: state.ueOhm }, loaded.table, state.settings),
    [state.circuits, state.ueOhm, state.settings],
  );
  const gaps = useMemo(() => inputGaps(state.circuits, reports), [state.circuits, reports]);
  const boardNotes = useMemo(() => boardGaps(state.ueOhm, loaded.table), [state.ueOhm]);
  const descriptions = useMemo(() => Object.fromEntries(state.circuits.map((c) => [c.id, c.description])), [state.circuits]);

  return (
    <div className="app">
      <header className="topbar no-print">
        <span className="brand">
          <svg className="logo" viewBox="0 0 32 32" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#22d3ee" /><stop offset="1" stopColor="#6366f1" /></linearGradient></defs><rect width="32" height="32" rx="8" fill="url(#lg)" /><path d="M18 5 9 18h6l-1 9 9-13h-6z" fill="#fff" /></svg>
          <span>Circuit<span className="brand-accent">Check</span></span>
        </span>
        <nav className="tabs" aria-label="Sections">
          {TABS.map((t) => (
            <button key={t.id} className={tab === t.id ? 'tab on' : 'tab'} aria-current={tab === t.id ? 'page' : undefined} onClick={() => setTab(t.id)}>
              <span aria-hidden="true">{t.icon}</span> {t.label}
            </button>
          ))}
        </nav>
        <div className="undo-bar">
          <button className={`btn small${tab === 'settings' ? ' on' : ''}`} aria-current={tab === 'settings' ? 'page' : undefined} onClick={() => setTab('settings')} aria-label="Assumptions and settings" title="Assumptions and settings">⚙ <span className="hide-sm">Settings</span></button>
          <button className="btn small" disabled={hist.past.length === 0} onClick={() => dispatch({ type: 'undo' })} aria-label="Undo last change" title="Undo (Ctrl+Z)">↶ Undo</button>
          <button className="btn small" disabled={hist.future.length === 0} onClick={() => dispatch({ type: 'redo' })} aria-label="Redo" title="Redo (Ctrl+Y)">↷ Redo</button>
        </div>
      </header>

      {loaded.table.demo && <div className="banner no-print" role="note">{DEMO_BANNER}</div>}
      {loaded.localError && <div className="banner no-print" role="alert">Local ampacity file ignored: {loaded.localError}</div>}

      <main>
        {tab === 'board' && <BoardTab state={state} dispatch={dispatch} ai={ai} onSetupAi={() => { setTab('settings'); setTimeout(() => document.getElementById('ai-settings')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50); }} />}
        {tab === 'design' && <DesignTab reports={reports} summary={summary} descriptions={descriptions} circuits={state.circuits} dispatch={dispatch} gaps={gaps} boardNotes={boardNotes} ai={ai} />}
        {tab === 'lab' && <LabTab state={state} dispatch={dispatch} table={loaded.table} />}
        {tab === 'guide' && <GuideTab onGo={setTab} />}
        {tab === 'settings' && <SettingsTab settings={state.settings} dispatch={dispatch} ai={ai} onAi={setAi} />}
        {tab === 'site' && <SiteTab state={state} dispatch={dispatch} />}
        {tab === 'report' && <ReportTab state={state} reports={reports} summary={summary} table={loaded.table} />}
      </main>

      <footer className="foot"><Disclaimer /></footer>
    </div>
  );
}
