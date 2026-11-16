import type { Insulation } from './types';

/**
 * Every tunable assumption in one place. Defaults come from the build plan and are
 * marked TODO(verify): confirm them against your licensed copy, then save your own values.
 */
export interface Settings {
  hotMultiplier: Record<Insulation, number>;
  kFactor: Record<Insulation, number>;
  vdLimitLightingPct: number;
  vdLimitOtherPct: number;
  cmin: number;
  disconnectionS: number;
  siteZsFactor: number;
  irFailMohm: number;
  irAdvisoryMohm: number;
  rcd1xMaxMs: number;
  rcd5xMaxMs: number;
}

export const DEFAULT_SETTINGS: Settings = {
  hotMultiplier: { PVC70: 1.2, XLPE90: 1.28 },
  kFactor: { PVC70: 115, XLPE90: 143 },
  vdLimitLightingPct: 3,
  vdLimitOtherPct: 5,
  cmin: 0.95,
  disconnectionS: 0.1,
  siteZsFactor: 0.8,
  irFailMohm: 1.0,
  irAdvisoryMohm: 2.0,
  rcd1xMaxMs: 300,
  rcd5xMaxMs: 40,
};

export interface SettingField {
  id: string;
  label: string;
  unit: string;
  help: string;
  min: number;
  max: number;
  step: number;
  get: (s: Settings) => number;
  set: (s: Settings, v: number) => Settings;
}

export const SETTING_FIELDS: readonly SettingField[] = [
  {
    id: 'hot-pvc', label: 'Hot multiplier, PVC 70 °C', unit: '×', min: 1, max: 2, step: 0.01,
    help: 'Raises 20 °C conductor resistance to operating temperature.',
    get: (s) => s.hotMultiplier.PVC70,
    set: (s, v) => ({ ...s, hotMultiplier: { ...s.hotMultiplier, PVC70: v } }),
  },
  {
    id: 'hot-xlpe', label: 'Hot multiplier, XLPE 90 °C', unit: '×', min: 1, max: 2, step: 0.01,
    help: 'As above, for 90 °C insulation.',
    get: (s) => s.hotMultiplier.XLPE90,
    set: (s, v) => ({ ...s, hotMultiplier: { ...s.hotMultiplier, XLPE90: v } }),
  },
  {
    id: 'k-pvc', label: 'k factor, PVC copper cpc', unit: '', min: 50, max: 250, step: 1,
    help: 'Used in S = I·√t / k for the cpc fault-withstand check.',
    get: (s) => s.kFactor.PVC70,
    set: (s, v) => ({ ...s, kFactor: { ...s.kFactor, PVC70: v } }),
  },
  {
    id: 'k-xlpe', label: 'k factor, XLPE copper cpc', unit: '', min: 50, max: 250, step: 1,
    help: 'As above, for XLPE.',
    get: (s) => s.kFactor.XLPE90,
    set: (s, v) => ({ ...s, kFactor: { ...s.kFactor, XLPE90: v } }),
  },
  {
    id: 'vd-light', label: 'Voltage drop limit, lighting', unit: '%', min: 0.1, max: 15, step: 0.1,
    help: 'Maximum drop for lighting circuits.',
    get: (s) => s.vdLimitLightingPct, set: (s, v) => ({ ...s, vdLimitLightingPct: v }),
  },
  {
    id: 'vd-other', label: 'Voltage drop limit, other circuits', unit: '%', min: 0.1, max: 15, step: 0.1,
    help: 'Maximum drop for all other circuits.',
    get: (s) => s.vdLimitOtherPct, set: (s, v) => ({ ...s, vdLimitOtherPct: v }),
  },
  {
    id: 'cmin', label: 'Voltage factor Cmin', unit: '', min: 0.5, max: 1.2, step: 0.01,
    help: 'Zs_max = Cmin · Uo / (k · In).',
    get: (s) => s.cmin, set: (s, v) => ({ ...s, cmin: v }),
  },
  {
    id: 'disc', label: 'Assumed disconnection time', unit: 's', min: 0.001, max: 5, step: 0.01,
    help: 'Used for the cpc fault-withstand check.',
    get: (s) => s.disconnectionS, set: (s, v) => ({ ...s, disconnectionS: v }),
  },
  {
    id: 'site-zs', label: 'Site Zs factor', unit: '×', min: 0.3, max: 1, step: 0.01,
    help: 'Measured Zs must not exceed this fraction of the design limit (ambient temperature).',
    get: (s) => s.siteZsFactor, set: (s, v) => ({ ...s, siteZsFactor: v }),
  },
  {
    id: 'ir-fail', label: 'Insulation resistance: fail below', unit: 'MΩ', min: 0.01, max: 1000, step: 0.1,
    help: 'Readings below this fail.',
    get: (s) => s.irFailMohm, set: (s, v) => ({ ...s, irFailMohm: v }),
  },
  {
    id: 'ir-adv', label: 'Insulation resistance: advisory below', unit: 'MΩ', min: 0.01, max: 1000, step: 0.1,
    help: 'Passing readings below this get an advisory. Cannot be lower than the fail limit.',
    get: (s) => s.irAdvisoryMohm, set: (s, v) => ({ ...s, irAdvisoryMohm: v }),
  },
  {
    id: 'rcd1', label: 'RCD trip time limit at 1×IΔn', unit: 'ms', min: 1, max: 1000, step: 1,
    help: 'Maximum allowed trip time at rated residual current.',
    get: (s) => s.rcd1xMaxMs, set: (s, v) => ({ ...s, rcd1xMaxMs: v }),
  },
  {
    id: 'rcd5', label: 'RCD trip time limit at 5×IΔn (≤ 30 mA)', unit: 'ms', min: 1, max: 1000, step: 1,
    help: 'Maximum allowed trip time at five times rated current.',
    get: (s) => s.rcd5xMaxMs, set: (s, v) => ({ ...s, rcd5xMaxMs: v }),
  },
];

/** Reason a value is not acceptable for a field, or undefined if it is. */
export function validateSetting(f: SettingField, v: number, current: Settings): string | undefined {
  if (!Number.isFinite(v)) return 'Enter a number';
  if (v < f.min || v > f.max) return `Must be between ${f.min} and ${f.max}`;
  if (f.id === 'ir-adv' && v < current.irFailMohm) return 'Cannot be lower than the fail limit';
  if (f.id === 'ir-fail' && v > current.irAdvisoryMohm) return 'Cannot be higher than the advisory limit';
  return undefined;
}

/** Build settings from untrusted stored data. Anything missing or out of range falls back to the default. */
export function parseSettings(raw: unknown): Settings {
  let s: Settings = DEFAULT_SETTINGS;
  if (typeof raw !== 'object' || raw === null) return s;
  const r = raw as Record<string, unknown>;
  const flat: Record<string, unknown> = {
    'hot-pvc': (r.hotMultiplier as Record<string, unknown> | undefined)?.PVC70,
    'hot-xlpe': (r.hotMultiplier as Record<string, unknown> | undefined)?.XLPE90,
    'k-pvc': (r.kFactor as Record<string, unknown> | undefined)?.PVC70,
    'k-xlpe': (r.kFactor as Record<string, unknown> | undefined)?.XLPE90,
    'vd-light': r.vdLimitLightingPct, 'vd-other': r.vdLimitOtherPct, cmin: r.cmin, disc: r.disconnectionS,
    'site-zs': r.siteZsFactor, 'ir-fail': r.irFailMohm, 'ir-adv': r.irAdvisoryMohm, rcd1: r.rcd1xMaxMs, rcd5: r.rcd5xMaxMs,
  };
  for (const f of SETTING_FIELDS) {
    const v = flat[f.id];
    if (typeof v === 'number' && validateSetting(f, v, s) === undefined) s = f.set(s, v);
  }
  return s;
}

export interface SettingChange {
  label: string;
  value: number;
  defaultValue: number;
  unit: string;
}

/** Settings that differ from the defaults, for reports. */
export function changedSettings(s: Settings): SettingChange[] {
  return SETTING_FIELDS.filter((f) => f.get(s) !== f.get(DEFAULT_SETTINGS)).map((f) => ({
    label: f.label, value: f.get(s), defaultValue: f.get(DEFAULT_SETTINGS), unit: f.unit,
  }));
}
