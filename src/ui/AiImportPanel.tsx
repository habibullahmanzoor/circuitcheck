import { useEffect, useState, type Dispatch } from 'react';
import { dedupeByRef, type Circuit } from '../engine';
import { fileToBase64, runExtractFile, runExtractText } from '../ai/client';
import type { AiConfig } from '../ai/config';
import { FIELD_DEFS, readyCircuits, validateRow, type FieldKey, type ReviewRow } from '../ai/review';
import type { MediaType } from '../ai/types';
import { StatusChip } from './common';
import { newId, type Action } from './state';

type Source = 'file' | 'text';

const CONF_STATUS = { high: 'PASS', medium: 'ADVISORY', low: 'FAIL' } as const;

export function AiImportPanel({ ai, circuits, dispatch, onDone }: { ai: AiConfig; circuits: Circuit[]; dispatch: Dispatch<Action>; onDone: (msg: string) => void }) {
  const [source, setSource] = useState<Source>('file');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [showErrors, setShowErrors] = useState(false);

  useEffect(() => {
    if (!file || !file.type.startsWith('image/')) { setPreview(null); return; }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const extract = async (): Promise<void> => {
    setError(''); setBusy(true); setRows([]); setWarnings([]); setShowErrors(false);
    try {
      const rid = (i: number): string => `ai-${Date.now()}-${i}`;
      let out;
      if (source === 'file') {
        if (!file) throw new Error('Choose a photo or PDF first.');
        const { fileProblem } = await import('../ai/service');
        const problem = fileProblem(file);
        if (problem) throw new Error(problem);
        out = await runExtractFile(ai, { mediaType: file.type as MediaType, dataB64: await fileToBase64(file) }, rid);
      } else {
        out = await runExtractText(ai, text, rid);
      }
      setRows(out.rows); setWarnings(out.warnings);
      if (out.rows.length === 0) setError('No circuits were found in that source.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setBusy(false);
    }
  };

  const setField = (id: string, k: FieldKey, v: string): void =>
    setRows((rs) => rs.map((r) => (r.id === id ? { ...r, fields: { ...r.fields, [k]: v } } : r)));
  const setConfirmed = (id: string, v: boolean): void => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, confirmed: v } : r)));

  const add = (): void => {
    setShowErrors(true);
    const { circuits: ok, blocked } = readyCircuits(rows, newId);
    if (blocked.length > 0) { setError(`${blocked.length} checked row(s) still have missing or invalid values. Fix the highlighted fields.`); return; }
    if (ok.length === 0) { setError('Tick "I checked this row" on each row you want to add.'); return; }
    const { kept, skipped } = dedupeByRef(circuits, ok);
    dispatch({ type: 'appendCircuits', circuits: kept });
    const addedIds = new Set(ok.map((c) => c.ref.toLowerCase()));
    setRows((rs) => rs.filter((r) => !(r.confirmed && addedIds.has(r.fields.ref.trim().toLowerCase()))));
    setError('');
    onDone(`Added ${kept.length} circuit(s) from AI import${skipped.length ? `; skipped ${skipped.length} whose ref already exists (${skipped.map((c) => c.ref).join(', ')})` : ''}. Review them on the Design check tab.`);
  };

  const confirmedCount = rows.filter((r) => r.confirmed).length;

  return (
    <div className="card ai-panel" aria-label="AI import">
      <h3>AI import <span className="chip chip-advisory mini">uses the internet</span></h3>
      <p className="note">
        The AI only reads and transcribes; it never calculates or decides Pass/Fail. Everything it proposes appears below for you to
        check and correct. Nothing is added until you tick each row.
      </p>

      <div className="seg" role="tablist" aria-label="Source">
        <button role="tab" aria-selected={source === 'file'} className={`seg-item ${source === 'file' ? 'on' : ''}`} onClick={() => setSource('file')}>Photo or PDF</button>
        <button role="tab" aria-selected={source === 'text'} className={`seg-item ${source === 'text' ? 'on' : ''}`} onClick={() => setSource('text')}>Describe in words</button>
      </div>

      {source === 'file' ? (
        <div className="field">
          <label htmlFor="ai-file">Schedule photo or PDF (max 10 MB)</label>
          <input id="ai-file" type="file" accept="image/png,image/jpeg,image/webp,image/gif,application/pdf" onChange={(e) => { setFile(e.target.files?.[0] ?? null); setRows([]); }} />
        </div>
      ) : (
        <div className="field">
          <label htmlFor="ai-text">Describe or paste your circuits</label>
          <textarea id="ai-text" rows={5} value={text} onChange={(e) => setText(e.target.value)} placeholder="e.g. Cooker: 30 m of 6 mm² twin and earth on a 32 A B-curve MCB, load 28 A. Kitchen sockets: 2.5 mm², 18 m, B20, 30 mA RCD." />
        </div>
      )}

      <label className="check">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        I understand this {source === 'file' ? 'file' : 'text'} will be sent to Anthropic using my API key.
      </label>
      <div className="row wrap">
        <button className="btn primary" disabled={!consent || busy || (source === 'file' ? !file : text.trim() === '')} onClick={() => void extract()}>
          {busy ? 'Reading…' : 'Extract circuits'}
        </button>
        <span className="note">Model: {ai.model}</span>
      </div>
      {error && <p role="alert" className="err">{error}</p>}
      {warnings.length > 0 && (
        <div className="card err-box" role="status"><b>The AI flagged:</b><ul>{warnings.map((w) => <li key={w}>{w}</li>)}</ul></div>
      )}

      {rows.length > 0 && (
        <div className="ai-review">
          <h3>Check each row against the original</h3>
          {preview && <img className="ai-preview" src={preview} alt="The uploaded schedule, for comparison" />}
          {rows.map((r) => {
            const v = showErrors ? validateRow(r.fields, r.id).errors : {};
            return (
              <div key={r.id} className={`ai-row card${r.confirmed ? ' confirmed' : ''}`}>
                <div className="row">
                  <b>{r.fields.ref || '(no ref)'}</b>
                  <span className="row-right">
                    <StatusChip status={CONF_STATUS[r.confidence]} />
                    <span className="note">AI confidence: {r.confidence}</span>
                  </span>
                </div>
                {r.note && <p className="note">AI note: {r.note}</p>}
                {r.unread.length > 0 && <p className="err">Not read: {r.unread.map((k) => FIELD_DEFS.find((d) => d.key === k)?.label).join(', ')}. Fill these in yourself.</p>}
                <div className="grid">
                  {FIELD_DEFS.map((d) => (
                    <div className="field" key={d.key}>
                      <label htmlFor={`${r.id}-${d.key}`}>{d.label}{d.required && ' *'}</label>
                      {d.kind === 'enum' ? (
                        <select id={`${r.id}-${d.key}`} value={r.fields[d.key]} aria-invalid={v[d.key] || r.unread.includes(d.key) ? true : undefined} onChange={(e) => setField(r.id, d.key, e.target.value)}>
                          <option value="">–</option>
                          {d.options?.map((o) => <option key={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input id={`${r.id}-${d.key}`} value={r.fields[d.key]} inputMode={d.kind === 'num' ? 'decimal' : undefined} aria-invalid={v[d.key] || (r.unread.includes(d.key) && r.fields[d.key].trim() === '') ? true : undefined} onChange={(e) => setField(r.id, d.key, e.target.value)} />
                      )}
                      {v[d.key] && <small className="err">{v[d.key]}</small>}
                    </div>
                  ))}
                </div>
                <label className="check">
                  <input type="checkbox" checked={r.confirmed} onChange={(e) => setConfirmed(r.id, e.target.checked)} />
                  I checked this row against the original
                </label>
              </div>
            );
          })}
          <div className="row wrap">
            <button className="btn primary" onClick={add} disabled={confirmedCount === 0}>Add {confirmedCount} checked circuit{confirmedCount === 1 ? '' : 's'} to the board</button>
            <button className="btn" onClick={() => setRows(rows.map((r) => ({ ...r, confirmed: false })))}>Untick all</button>
          </div>
        </div>
      )}
    </div>
  );
}
