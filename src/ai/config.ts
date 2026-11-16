import { AI_MODELS, type AiModel } from './types';

/**
 * AI settings are stored separately from the board state on purpose, so the API key is never
 * written into backup files, exports or reports.
 */
export interface AiConfig {
  enabled: boolean;
  apiKey: string;
  model: AiModel;
  /** 'session' keeps the key only until the tab closes; 'device' keeps it in this browser. */
  persist: 'session' | 'device';
}

export const AI_CONFIG_KEY = 'circuitcheck.ai';
export const AI_SESSION_KEY = 'circuitcheck.ai.key';

export const defaultAiConfig = (): AiConfig => ({ enabled: false, apiKey: '', model: 'claude-opus-5-5', persist: 'session' });

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

const isModel = (x: unknown): x is AiModel => AI_MODELS.some((m) => m.id === x);

export function loadAiConfig(local: StorageLike, session: StorageLike): AiConfig {
  const d = defaultAiConfig();
  try {
    const raw = JSON.parse(local.getItem(AI_CONFIG_KEY) ?? 'null') as Record<string, unknown> | null;
    if (raw && typeof raw === 'object') {
      const persist = raw.persist === 'device' ? 'device' : 'session';
      const deviceKey = persist === 'device' && typeof raw.apiKey === 'string' ? raw.apiKey : '';
      const sessionKey = session.getItem(AI_SESSION_KEY) ?? '';
      return {
        enabled: raw.enabled === true,
        apiKey: persist === 'device' ? deviceKey : sessionKey,
        model: isModel(raw.model) ? raw.model : d.model,
        persist,
      };
    }
  } catch {
    /* unreadable storage: fall through to defaults */
  }
  return d;
}

export function saveAiConfig(c: AiConfig, local: StorageLike, session: StorageLike): void {
  try {
    local.setItem(AI_CONFIG_KEY, JSON.stringify({
      enabled: c.enabled, model: c.model, persist: c.persist,
      ...(c.persist === 'device' ? { apiKey: c.apiKey } : {}),
    }));
    if (c.persist === 'session' && c.apiKey) session.setItem(AI_SESSION_KEY, c.apiKey);
    else session.removeItem(AI_SESSION_KEY);
  } catch {
    /* storage unavailable: settings last for this page view only */
  }
}

export function clearAiKey(local: StorageLike, session: StorageLike): void {
  try {
    session.removeItem(AI_SESSION_KEY);
    const raw = JSON.parse(local.getItem(AI_CONFIG_KEY) ?? 'null') as Record<string, unknown> | null;
    if (raw) { delete raw.apiKey; local.setItem(AI_CONFIG_KEY, JSON.stringify(raw)); }
  } catch {
    /* nothing to clear */
  }
}

export const aiReady = (c: AiConfig): boolean => c.enabled && c.apiKey.trim().length > 0;

/** Rough, honest check only: real validation happens when the key is used. */
export const looksLikeKey = (k: string): boolean => /^sk-ant-[\w-]{20,}$/.test(k.trim());
