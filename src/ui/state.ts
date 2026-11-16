import { DEFAULT_SETTINGS, PLACEHOLDER_ZE_OHM, parseSettings, type Circuit, type Settings, type TestInput } from '../engine';

export const STORAGE_KEY = 'circuitcheck.state';
export const STATE_VERSION = 1;

export type Polarity = 'unset' | 'ok' | 'bad';

/** Raw text from the site form so blank and zero stay distinguishable. */
export interface SiteEntry {
  zs: string;
  r1r2: string;
  ir: string;
  polarity: Polarity;
  rcd1: string;
  rcd5: string;
}

export interface SiteSession {
  id: string;
  circuitId: string;
  /** ISO timestamp supplied by the UI so the reducer stays pure. */
  savedAt: string;
  entry: SiteEntry;
}

export interface AppState {
  version: typeof STATE_VERSION;
  boardName: string;
  ueOhm: number;
  circuits: Circuit[];
  site: Record<string, SiteEntry>;
  sessions: SiteSession[];
  settings: Settings;
}

export const emptySite = (): SiteEntry => ({ zs: '', r1r2: '', ir: '', polarity: 'unset', rcd1: '', rcd5: '' });

export const initialState = (): AppState => ({
  version: STATE_VERSION,
  boardName: 'DB1',
  ueOhm: PLACEHOLDER_ZE_OHM,
  circuits: [],
  site: {},
  sessions: [],
  settings: DEFAULT_SETTINGS,
});

export type Action =
  | { type: 'setBoardName'; name: string }
  | { type: 'setZe'; ueOhm: number }
  | { type: 'saveCircuit'; circuit: Circuit }
  | { type: 'duplicateCircuit'; id: string; newId: string }
  | { type: 'deleteCircuit'; id: string }
  | { type: 'replaceCircuits'; circuits: Circuit[] }
  | { type: 'appendCircuits'; circuits: Circuit[] }
  | { type: 'setSite'; id: string; patch: Partial<SiteEntry> }
  | { type: 'loadState'; state: AppState }
  | { type: 'setSettings'; settings: Settings }
  | { type: 'saveSession'; session: SiteSession }
  | { type: 'deleteSession'; id: string }
  | { type: 'reset' };

export function reducer(s: AppState, a: Action): AppState {
  switch (a.type) {
    case 'setBoardName':
      return { ...s, boardName: a.name };
    case 'setZe':
      return { ...s, ueOhm: a.ueOhm };
    case 'saveCircuit': {
      const exists = s.circuits.some((c) => c.id === a.circuit.id);
      return {
        ...s,
        circuits: exists
          ? s.circuits.map((c) => (c.id === a.circuit.id ? a.circuit : c))
          : [...s.circuits, a.circuit],
      };
    }
    case 'duplicateCircuit': {
      const src = s.circuits.find((c) => c.id === a.id);
      if (!src) return s;
      return { ...s, circuits: [...s.circuits, { ...src, id: a.newId, ref: `${src.ref}-copy` }] };
    }
    case 'deleteCircuit': {
      const site = { ...s.site };
      delete site[a.id];
      return {
        ...s,
        circuits: s.circuits.filter((c) => c.id !== a.id),
        site,
        sessions: s.sessions.filter((x) => x.circuitId !== a.id),
      };
    }
    case 'loadState':
      return a.state;
    case 'setSettings':
      return { ...s, settings: a.settings };
    case 'saveSession':
      return { ...s, sessions: [...s.sessions, a.session] };
    case 'deleteSession':
      return { ...s, sessions: s.sessions.filter((x) => x.id !== a.id) };
    case 'replaceCircuits':
      return { ...s, circuits: a.circuits, site: {}, sessions: [] };
    case 'appendCircuits':
      return { ...s, circuits: [...s.circuits, ...a.circuits] };
    case 'setSite':
      return { ...s, site: { ...s.site, [a.id]: { ...(s.site[a.id] ?? emptySite()), ...a.patch } } };
    case 'reset':
      return initialState();
  }
}

const num = (t: string): number | undefined => (t.trim() === '' ? undefined : Number(t.trim()));

/** Blank fields are "not entered"; unparseable text becomes NaN so the engine flags it. */
export function toTestInput(e: SiteEntry): TestInput {
  const t: TestInput = {};
  const zs = num(e.zs);
  const r = num(e.r1r2);
  const ir = num(e.ir);
  const r1 = num(e.rcd1);
  const r5 = num(e.rcd5);
  if (zs !== undefined) t.measuredZs = zs;
  if (r !== undefined) t.measuredR1R2 = r;
  if (ir !== undefined) t.irMohm = ir;
  if (e.polarity !== 'unset') t.polarityOk = e.polarity === 'ok';
  if (r1 !== undefined) t.rcdTrip1xMs = r1;
  if (r5 !== undefined) t.rcdTrip5xMs = r5;
  return t;
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

export function isCircuit(x: unknown): x is Circuit {
  if (!isObj(x)) return false;
  return (
    typeof x.id === 'string' && typeof x.ref === 'string' && typeof x.description === 'string' &&
    (x.phases === '1P' || x.phases === '3P') &&
    (x.kind === 'lighting' || x.kind === 'socket' || x.kind === 'fixed' || x.kind === 'other') &&
    (x.device === 'B' || x.device === 'C' || x.device === 'D') &&
    isNum(x.inA) && isNum(x.ibA) && isNum(x.lineCsaMm2) &&
    (x.cpcCsaMm2 === undefined || isNum(x.cpcCsaMm2)) &&
    (x.insulation === 'PVC70' || x.insulation === 'XLPE90') &&
    isNum(x.lengthM) && typeof x.installMethod === 'string' &&
    isNum(x.ambientFactor) && isNum(x.groupingFactor) &&
    (x.rcdMa === undefined || isNum(x.rcdMa))
  );
}

/** Turn whatever was stored into a valid state. Unknown versions fall back to defaults. */
export function migrate(raw: unknown): AppState {
  const d = initialState();
  if (!isObj(raw) || raw.version !== STATE_VERSION) return d;
  const site: Record<string, SiteEntry> = {};
  if (isObj(raw.site)) {
    for (const [k, v] of Object.entries(raw.site)) {
      if (isObj(v)) {
        const e = emptySite();
        if (typeof v.zs === 'string') e.zs = v.zs;
        if (typeof v.r1r2 === 'string') e.r1r2 = v.r1r2;
        if (typeof v.ir === 'string') e.ir = v.ir;
        if (typeof v.rcd1 === 'string') e.rcd1 = v.rcd1;
        if (typeof v.rcd5 === 'string') e.rcd5 = v.rcd5;
        if (v.polarity === 'ok' || v.polarity === 'bad') e.polarity = v.polarity;
        site[k] = e;
      }
    }
  }
  const sessions: SiteSession[] = [];
  if (Array.isArray(raw.sessions)) {
    for (const v of raw.sessions) {
      if (isObj(v) && typeof v.id === 'string' && typeof v.circuitId === 'string' && typeof v.savedAt === 'string' && isObj(v.entry)) {
        const e = emptySite();
        const en = v.entry;
        if (typeof en.zs === 'string') e.zs = en.zs;
        if (typeof en.r1r2 === 'string') e.r1r2 = en.r1r2;
        if (typeof en.ir === 'string') e.ir = en.ir;
        if (typeof en.rcd1 === 'string') e.rcd1 = en.rcd1;
        if (typeof en.rcd5 === 'string') e.rcd5 = en.rcd5;
        if (en.polarity === 'ok' || en.polarity === 'bad') e.polarity = en.polarity;
        sessions.push({ id: v.id, circuitId: v.circuitId, savedAt: v.savedAt, entry: e });
      }
    }
  }
  return {
    version: STATE_VERSION,
    sessions,
    settings: parseSettings(raw.settings),
    boardName: typeof raw.boardName === 'string' ? raw.boardName : d.boardName,
    ueOhm: isNum(raw.ueOhm) && raw.ueOhm >= 0 ? raw.ueOhm : d.ueOhm,
    circuits: Array.isArray(raw.circuits) ? raw.circuits.filter(isCircuit) : [],
    site,
  };
}

export function loadState(): AppState {
  try {
    const txt = localStorage.getItem(STORAGE_KEY);
    return txt ? migrate(JSON.parse(txt) as unknown) : initialState();
  } catch {
    return initialState();
  }
}

export function saveState(s: AppState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* storage unavailable or full: the app still works for this session */
  }
}

export function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
