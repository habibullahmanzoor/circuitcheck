import { useState, type Dispatch } from 'react';
import { DEFAULT_SETTINGS, SETTING_FIELDS, changedSettings, validateSetting, type Settings } from '../engine';
import { runTestKey, stores } from '../ai/client';
import { clearAiKey, looksLikeKey, type AiConfig } from '../ai/config';
import { AI_MODELS } from '../ai/types';
import type { Action } from './state';

function applyDrafts(base: Settings, drafts: Record<string, string>): { settings: Settings; errors: Record<string, string> } {
  let s = base;
  const errors: Record<string, string> = {};
  for (const f of SETTING_FIELDS) {
    const text = drafts[f.id] ?? String(f.get(base));
    const v = text.trim() === '' ? NaN : Number(text);
    const err = validateSetting(f, v, s);
    if (err) errors[f.id] = err;
    else s = f.set(s, v);
  }
  return { settings: s, errors };
}

function AiSettings({ ai, onAi }: { ai: AiConfig; onAi: (c: AiConfig) => void }) {
  const [status, setStatus] = useState<{ ok: boolean; msg: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<AiConfig>): void => { setStatus(null); onAi({ ...ai, ...p }); };
  const keyOk = ai.apiKey.trim() === '' || looksLikeKey(ai.apiKey);

  return (
    <div className="card" id="ai-settings">
      <h3>AI features (optional) <span className="chip chip-advisory mini">uses the internet</span></h3>
      <p className="note">
        Off by default. When on, you can import a schedule from a photo or PDF, describe circuits in words, and get plain-English
        explanations of failures. The AI only reads and rephrases: it never calculates and never decides Pass or Fail, and nothing it
        proposes is added without you checking it.
      </p>
      <ul className="small">
        <li><b>What is sent:</b> only what you choose in each feature (the file or text you submit, or one failed check with a short circuit summary), to Anthropic, using your key.</li>
        <li><b>Your key</b> is never included in backups, CSV exports or reports. It is used directly from this browser, so use a key with a low spend limit and remove it on shared computers.</li>
        <li>Usage is billed to your Anthropic account. These features do not work offline; everything else still does.</li>
      </ul>
      <label className="check">
        <input type="checkbox" checked={ai.enabled} onChange={(e) => set({ enabled: e.target.checked })} />
        Enable AI features
      </label>
      <div className="settings-grid">
        <div className="field">
          <label htmlFor="ai-key">Anthropic API key</label>
          <input id="ai-key" type="password" autoComplete="off" spellCheck={false} value={ai.apiKey} placeholder="sk-ant-…" aria-invalid={!keyOk ? true : undefined} onChange={(e) => set({ apiKey: e.target.value })} />
          <small>{keyOk ? 'Create one in the Anthropic Console. Set a monthly spend limit.' : <span className="err">That does not look like an Anthropic key (it should start with sk-ant-).</span>}</small>
        </div>
        <div className="field">
          <label htmlFor="ai-model">Model</label>
          <select id="ai-model" value={ai.model} onChange={(e) => set({ model: e.target.value as AiConfig['model'] })}>
            {AI_MODELS.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
          </select>
          <small>{AI_MODELS.find((m) => m.id === ai.model)?.hint}</small>
        </div>
        <fieldset className="field">
          <legend>Remember the key</legend>
          <label className="check"><input type="radio" name="ai-persist" checked={ai.persist === 'session'} onChange={() => set({ persist: 'session' })} /> Until I close this tab (safer)</label>
          <label className="check"><input type="radio" name="ai-persist" checked={ai.persist === 'device'} onChange={() => set({ persist: 'device' })} /> On this device</label>
        </fieldset>
      </div>
      <div className="row wrap">
        <button className="btn" disabled={busy || ai.apiKey.trim() === ''} onClick={() => {
          setBusy(true); setStatus(null);
          runTestKey(ai).then(() => setStatus({ ok: true, msg: 'Key works.' })).catch((e: unknown) => setStatus({ ok: false, msg: e instanceof Error ? e.message : 'Test failed.' })).finally(() => setBusy(false));
        }}>{busy ? 'Testing…' : 'Test key'}</button>
        <button className="btn danger" disabled={ai.apiKey === ''} onClick={() => { const s = stores(); clearAiKey(s.local, s.session); setStatus(null); onAi({ ...ai, apiKey: '', enabled: false }); }}>Remove key</button>
      </div>
      {status && <p role="status" className={status.ok ? 'notice' : 'err'}>{status.ok ? '✔ ' : '✖ '}{status.msg}</p>}
    </div>
  );
}

export function SettingsTab({ settings, dispatch, ai, onAi }: { settings: Settings; dispatch: Dispatch<Action>; ai: AiConfig; onAi: (c: AiConfig) => void }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState(false);

  const { settings: next, errors } = applyDrafts(settings, drafts);
  const hasErrors = Object.keys(errors).length > 0;
  const dirty = SETTING_FIELDS.some((f) => f.get(next) !== f.get(settings));
  const changed = changedSettings(settings);

  const save = (): void => {
    dispatch({ type: 'setSettings', settings: next });
    setDrafts({});
    setSaved(true);
  };
  const reset = (): void => {
    if (!window.confirm('Reset every assumption to the built-in defaults?')) return;
    dispatch({ type: 'setSettings', settings: DEFAULT_SETTINGS });
    setDrafts({});
    setSaved(true);
  };

  return (
    <section aria-labelledby="settings-h">
      <h2 id="settings-h">Assumptions &amp; settings</h2>
      <p className="note">
        These values drive every calculation. The defaults come from the build plan and are <b>not verified</b>: check each one
        against your licensed copy of BS 7671, then save your own. Settings are stored on this device, and every report lists the
        values it used and flags any you changed.
      </p>

      <div className="card">
        <div className="settings-grid">
          {SETTING_FIELDS.map((f) => {
            const text = drafts[f.id] ?? String(f.get(settings));
            const isChanged = f.get(next) !== f.get(DEFAULT_SETTINGS);
            return (
              <div className="field" key={f.id}>
                <label htmlFor={`set-${f.id}`}>
                  {f.label}{f.unit && ` (${f.unit})`}
                  {isChanged && <span className="chip chip-advisory mini">changed</span>}
                </label>
                <input
                  id={`set-${f.id}`}
                  inputMode="decimal"
                  value={text}
                  aria-invalid={errors[f.id] ? true : undefined}
                  aria-describedby={`set-${f.id}-h`}
                  onChange={(e) => { setSaved(false); setDrafts((d) => ({ ...d, [f.id]: e.target.value })); }}
                />
                <small id={`set-${f.id}-h`}>
                  {errors[f.id] ? <span className="err">{errors[f.id]}</span> : f.help} Default {f.get(DEFAULT_SETTINGS)}.
                </small>
              </div>
            );
          })}
        </div>
      </div>

      <div className="row wrap">
        <button className="btn primary" disabled={!dirty || hasErrors} onClick={save}>Save settings</button>
        <button className="btn" disabled={Object.keys(drafts).length === 0} onClick={() => setDrafts({})}>Discard edits</button>
        <button className="btn danger" disabled={changed.length === 0} onClick={reset}>Reset to defaults</button>
      </div>
      {saved && <p role="status" className="notice">Saved. All checks have been recalculated with these values.</p>}

      <div className="card">
        <h3>Currently changed from defaults</h3>
        {changed.length === 0 ? (
          <p className="note">Nothing. All checks use the built-in defaults.</p>
        ) : (
          <ul>
            {changed.map((c) => (
              <li key={c.label}><b>{c.label}:</b> {c.value}{c.unit && ` ${c.unit}`} (default {c.defaultValue})</li>
            ))}
          </ul>
        )}
      </div>

      <AiSettings ai={ai} onAi={onAi} />

      <div className="card">
        <h3>Assumptions this tool still makes</h3>
        <ul className="small">
          <li>Voltage drop is resistive only; reactance is not modelled.</li>
          <li>Fault withstand uses one assumed disconnection time, not the breaker&apos;s let-through energy.</li>
          <li>The earth-fault loop limit uses the instantaneous trip multiples 5, 10 and 20 for B, C and D devices.</li>
          <li>Single-phase supply is 230 V TN; three-phase is balanced loads only.</li>
          <li>Ca and Cg are entered by you; the tool does not derive them. The ampacity table is whatever is loaded.</li>
        </ul>
      </div>
    </section>
  );
}
