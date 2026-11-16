import type { CheckResult, Circuit } from '../engine';
import { loadAiConfig, saveAiConfig, type AiConfig, type StorageLike } from './config';
import type { ExtractionOutcome } from './service';
import type { MediaType } from './types';

/**
 * Thin, lazy entry points for the UI. The SDK, zod and the prompts are only downloaded when an AI feature is
 * actually used, so the offline core never loads them.
 */
async function parts(cfg: AiConfig) {
  const [{ createTransport }, svc] = await Promise.all([import('./transport'), import('./service')]);
  return { t: await createTransport(cfg.apiKey), svc };
}

export async function runExplain(cfg: AiConfig, c: Circuit, r: CheckResult): Promise<string> {
  const { t, svc } = await parts(cfg);
  return svc.explainFailure(t, cfg.model, c, r);
}

export async function runExtractFile(cfg: AiConfig, file: { mediaType: MediaType; dataB64: string }, newId: (i: number) => string): Promise<ExtractionOutcome> {
  const { t, svc } = await parts(cfg);
  return svc.extractFromFile(t, cfg.model, file, newId);
}

export async function runExtractText(cfg: AiConfig, text: string, newId: (i: number) => string): Promise<ExtractionOutcome> {
  const { t, svc } = await parts(cfg);
  return svc.extractFromText(t, cfg.model, text, newId);
}

export async function runTestKey(cfg: AiConfig): Promise<void> {
  const { t, svc } = await parts(cfg);
  return svc.testKey(t, cfg.model);
}

/* Browser storage with safe fallbacks (storage can be blocked in private windows). */
const memory = (): StorageLike => {
  const d: Record<string, string> = {};
  return { getItem: (k) => d[k] ?? null, setItem: (k, v) => { d[k] = v; }, removeItem: (k) => { delete d[k]; } };
};
const pick = (get: () => Storage): StorageLike => { try { return get(); } catch { return memory(); } };
export const stores = (): { local: StorageLike; session: StorageLike } => ({ local: pick(() => localStorage), session: pick(() => sessionStorage) });

export const loadBrowserAi = (): AiConfig => { const s = stores(); return loadAiConfig(s.local, s.session); };
export const saveBrowserAi = (c: AiConfig): void => { const s = stores(); saveAiConfig(c, s.local, s.session); };

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1] ?? '');
    r.onerror = () => reject(new Error('Could not read the file.'));
    r.readAsDataURL(file);
  });
}
