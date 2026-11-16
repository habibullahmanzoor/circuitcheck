import { describe, it, expect } from 'vitest';
import { checkCircuit, parseAmpacityTable, type AmpacityTable, type Circuit } from '../engine';
import demoJson from '../data/ampacity.demo.json';
import {
  AI_CONFIG_KEY, AI_SESSION_KEY, aiReady, clearAiKey, defaultAiConfig, loadAiConfig, looksLikeKey, saveAiConfig, type StorageLike,
} from './config';
import { FIELD_DEFS, readyCircuits, rowFromExtracted, validateRow, type Fields } from './review';
import { EXPLAIN_SYSTEM, EXTRACT_SYSTEM, explainFailure, explainPayload, extractFromFile, extractFromText, fileProblem, testKey } from './service';
import { AiError, type ExtractedCircuit, type Transport } from './types';
import { parseExtraction } from './schemas';

const mem = (): StorageLike & { data: Record<string, string> } => {
  const data: Record<string, string> = {};
  return { data, getItem: (k) => data[k] ?? null, setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
};

const full: ExtractedCircuit = {
  ref: 'L1', description: 'Lights', phases: '1P', kind: 'lighting', device: 'B', inA: 6, ibA: 4, lineCsaMm2: 1.5, cpcCsaMm2: null,
  insulation: 'PVC70', lengthM: 25, installMethod: 'C', ambientFactor: null, groupingFactor: null, rcdMa: null, confidence: 'high', note: '',
};
const partial: ExtractedCircuit = { ...full, ref: 'S2', phases: null, device: null, inA: null, lengthM: null, confidence: 'low', note: 'smudged' };

const fakeTransport = (extractResult: unknown, text = 'It failed because the cable is too long.'): Transport & { calls: unknown[] } => {
  const calls: unknown[] = [];
  return {
    calls,
    extract: async (a) => { calls.push(a); return extractResult; },
    text: async (a) => { calls.push(a); return text; },
  };
};

describe('review rows', () => {
  it('turns nulls into blanks and flags unread required fields', () => {
    const r = rowFromExtracted(partial, 'x');
    expect(r.fields.phases).toBe('');
    expect(r.unread).toEqual(expect.arrayContaining(['phases', 'device', 'inA', 'lengthM']));
    expect(r.confirmed).toBe(false);
    expect(r.confidence).toBe('low');
  });
  it('a complete row validates; Ca/Cg default to 1; cpc and RCD stay unset', () => {
    const v = validateRow(rowFromExtracted(full, 'a').fields, 'id1');
    expect(v.errors).toEqual({});
    expect(v.circuit).toMatchObject({ id: 'id1', ref: 'L1', ambientFactor: 1, groupingFactor: 1, device: 'B', inA: 6 });
    expect(v.circuit?.cpcCsaMm2).toBeUndefined();
    expect(v.circuit?.rcdMa).toBeUndefined();
  });
  it('never defaults a missing required value', () => {
    const v = validateRow(rowFromExtracted(partial, 'b').fields, 'id');
    expect(v.circuit).toBeUndefined();
    expect(Object.keys(v.errors)).toEqual(expect.arrayContaining(['phases', 'device', 'inA', 'lengthM']));
  });
  it('rejects junk numbers and bad enums', () => {
    const f: Fields = { ...rowFromExtracted(full, 'c').fields, inA: 'abc', device: 'Z', lineCsaMm2: '-2', ambientFactor: '0' };
    const v = validateRow(f, 'id');
    expect(v.errors.inA).toBeDefined();
    expect(v.errors.device).toBeDefined();
    expect(v.errors.lineCsaMm2).toBeDefined();
    expect(v.errors.ambientFactor).toBeDefined();
  });
  it('only confirmed, valid rows reach the board; others are reported as blocked', () => {
    const a = { ...rowFromExtracted(full, 'a'), confirmed: true };
    const b = { ...rowFromExtracted(partial, 'b'), confirmed: true };
    const c = { ...rowFromExtracted({ ...full, ref: 'L9' }, 'c'), confirmed: false };
    let n = 0;
    const out = readyCircuits([a, b, c], () => `new-${++n}`);
    expect(out.circuits.map((x) => x.ref)).toEqual(['L1']);
    expect(out.blocked.map((x) => x.id)).toEqual(['b']);
  });
  it('every field has a definition', () => {
    expect(FIELD_DEFS).toHaveLength(15);
  });
});

describe('extraction service', () => {
  it('maps a model reply to review rows', async () => {
    const t = fakeTransport({ circuits: [full, partial], warnings: ['row 3 illegible'] });
    const out = await extractFromFile(t, 'claude-opus-5-5', { mediaType: 'image/png', dataB64: 'AAAA' }, (i) => `r${i}`);
    expect(out.rows.map((r) => r.id)).toEqual(['r0', 'r1']);
    expect(out.warnings).toEqual(['row 3 illegible']);
    const sent = t.calls[0] as { system: string; content: { kind: string }[] };
    expect(sent.system).toBe(EXTRACT_SYSTEM);
    expect(sent.content.map((c) => c.kind)).toEqual(['image', 'text']);
  });
  it('sends PDFs as documents', async () => {
    const t = fakeTransport({ circuits: [], warnings: [] });
    await extractFromFile(t, 'claude-haiku-5-5', { mediaType: 'application/pdf', dataB64: 'AAAA' }, String);
    expect((t.calls[0] as { content: { kind: string }[] }).content[0]?.kind).toBe('pdf');
  });
  it('rejects a malformed reply instead of trusting it', async () => {
    const t = fakeTransport({ circuits: [{ ref: 5 }] });
    await expect(extractFromText(t, 'claude-opus-5-5', 'L1 2.5mm 20m', String)).rejects.toBeInstanceOf(AiError);
    expect(parseExtraction(null)).toBeUndefined();
    expect(parseExtraction({ circuits: [full], warnings: [] })?.circuits).toHaveLength(1);
  });
  it('validates text input and file input before any network call', async () => {
    const t = fakeTransport({ circuits: [], warnings: [] });
    await expect(extractFromText(t, 'claude-opus-5-5', '   ', String)).rejects.toThrow(/Type or paste/);
    await expect(extractFromText(t, 'claude-opus-5-5', 'x'.repeat(20001), String)).rejects.toThrow(/under/);
    expect(t.calls).toHaveLength(0);
    expect(fileProblem({ type: 'image/png', size: 100 })).toBeUndefined();
    expect(fileProblem({ type: 'application/pdf', size: 100 })).toBeUndefined();
    expect(fileProblem({ type: 'image/png', size: 11 * 1024 * 1024 })).toMatch(/10 MB/);
    expect(fileProblem({ type: 'text/plain', size: 10 })).toMatch(/PNG/);
  });
  it('prompts forbid guessing, calculating and citing clauses', () => {
    expect(EXTRACT_SYSTEM).toMatch(/Never infer, estimate or calculate/);
    expect(EXTRACT_SYSTEM).toMatch(/return null/);
    expect(EXPLAIN_SYSTEM).toMatch(/ONLY the numbers/);
    expect(EXPLAIN_SYSTEM).toMatch(/Do not cite regulation or clause numbers/);
  });
});

describe('explain and key test', () => {
  const table = parseAmpacityTable(demoJson).table as AmpacityTable;
  const circuit: Circuit = {
    id: 'a', ref: 'L2', description: 'Lights', phases: '1P', kind: 'lighting', device: 'B', inA: 6, ibA: 5, lineCsaMm2: 1.5, insulation: 'PVC70',
    lengthM: 55, installMethod: 'C', ambientFactor: 1, groupingFactor: 1,
  };
  const failed = checkCircuit(circuit, { uoV: 230, ueOhm: 0.35 }, table).results.find((r) => r.id === 'voltage-drop');
  it('sends only the check and a short circuit summary, never the whole board', async () => {
    expect(failed?.status).toBe('FAIL');
    const payload = JSON.parse(explainPayload(circuit, failed!)) as { circuit: Record<string, unknown>; check: Record<string, unknown> };
    expect(Object.keys(payload)).toEqual(['circuit', 'check']);
    expect(payload.check.suggestedFix).toMatch(/increase line csa/i);
    expect(payload.circuit).not.toHaveProperty('id');
    const t = fakeTransport(null, 'The cable is too long.');
    expect(await explainFailure(t, 'claude-opus-5-5', circuit, failed!)).toBe('The cable is too long.');
    expect((t.calls[0] as { system: string }).system).toBe(EXPLAIN_SYSTEM);
  });
  it('treats an empty reply as an error', async () => {
    await expect(explainFailure(fakeTransport(null, ''), 'claude-opus-5-5', circuit, failed!)).rejects.toBeInstanceOf(AiError);
    await expect(testKey(fakeTransport(null, ''), 'claude-opus-5-5')).rejects.toBeInstanceOf(AiError);
    await expect(testKey(fakeTransport(null, 'OK'), 'claude-opus-5-5')).resolves.toBeUndefined();
  });
});

describe('ai config storage', () => {
  it('defaults to off with no key', () => {
    const c = loadAiConfig(mem(), mem());
    expect(c).toEqual(defaultAiConfig());
    expect(aiReady(c)).toBe(false);
  });
  it('session mode keeps the key out of localStorage', () => {
    const local = mem(); const session = mem();
    saveAiConfig({ enabled: true, apiKey: 'sk-ant-secretsecretsecret', model: 'claude-sonnet-5-5', persist: 'session' }, local, session);
    expect(local.data[AI_CONFIG_KEY]).not.toContain('secret');
    expect(session.data[AI_SESSION_KEY]).toBe('sk-ant-secretsecretsecret');
    const back = loadAiConfig(local, session);
    expect(back).toMatchObject({ enabled: true, apiKey: 'sk-ant-secretsecretsecret', model: 'claude-sonnet-5-5', persist: 'session' });
    expect(aiReady(back)).toBe(true);
    expect(loadAiConfig(local, mem()).apiKey).toBe('');
  });
  it('device mode stores the key in localStorage only', () => {
    const local = mem(); const session = mem();
    saveAiConfig({ enabled: true, apiKey: 'sk-ant-devicekeydevicekey', model: 'claude-opus-5-5', persist: 'device' }, local, session);
    expect(session.data[AI_SESSION_KEY]).toBeUndefined();
    expect(loadAiConfig(local, session).apiKey).toBe('sk-ant-devicekeydevicekey');
  });
  it('removing the key clears both places and survives junk storage', () => {
    const local = mem(); const session = mem();
    saveAiConfig({ enabled: true, apiKey: 'sk-ant-devicekeydevicekey', model: 'claude-opus-5-5', persist: 'device' }, local, session);
    clearAiKey(local, session);
    expect(loadAiConfig(local, session).apiKey).toBe('');
    local.setItem(AI_CONFIG_KEY, '{not json');
    expect(loadAiConfig(local, session)).toEqual(defaultAiConfig());
    expect(loadAiConfig({ ...mem(), getItem: () => { throw new Error('blocked'); } }, mem())).toEqual(defaultAiConfig());
  });
  it('unknown models fall back to the default and key shape is sanity-checked', () => {
    const local = mem();
    local.setItem(AI_CONFIG_KEY, JSON.stringify({ enabled: true, model: 'gpt-x' }));
    expect(loadAiConfig(local, mem()).model).toBe('claude-opus-5-5');
    expect(looksLikeKey('sk-ant-api03-abcdefghijklmnopqrstuvwxyz')).toBe(true);
    expect(looksLikeKey('hello')).toBe(false);
  });
});
