/** Plain types shared by the UI and the AI service. No SDK or zod imports, so the UI can use them without loading either. */

export type Confidence = 'high' | 'medium' | 'low';

/** What the model proposes. Every field is nullable: null means "not visible or not readable". */
export interface ExtractedCircuit {
  ref: string;
  description: string;
  phases: '1P' | '3P' | null;
  kind: 'lighting' | 'socket' | 'fixed' | 'other' | null;
  device: 'B' | 'C' | 'D' | null;
  inA: number | null;
  ibA: number | null;
  lineCsaMm2: number | null;
  cpcCsaMm2: number | null;
  insulation: 'PVC70' | 'XLPE90' | null;
  lengthM: number | null;
  installMethod: string | null;
  ambientFactor: number | null;
  groupingFactor: number | null;
  rcdMa: number | null;
  confidence: Confidence;
  note: string;
}

export interface Extraction {
  circuits: ExtractedCircuit[];
  warnings: string[];
}

export type AiModel = 'claude-opus-5-5' | 'claude-sonnet-5-5' | 'claude-haiku-5-5';

export const AI_MODELS: readonly { id: AiModel; label: string; hint: string }[] = [
  { id: 'claude-opus-5-5', label: 'Claude Opus 5.5', hint: 'Most accurate; highest cost. Recommended for reading photos.' },
  { id: 'claude-sonnet-5-5', label: 'Claude Sonnet 5.5', hint: 'Balanced speed and cost.' },
  { id: 'claude-haiku-5-5', label: 'Claude Haiku 5.5', hint: 'Cheapest and fastest; check its output more carefully.' },
];

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AiError';
  }
}

export type MediaType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif' | 'application/pdf';

export type ContentIn =
  | { kind: 'text'; text: string }
  | { kind: 'image'; mediaType: Exclude<MediaType, 'application/pdf'>; dataB64: string }
  | { kind: 'pdf'; dataB64: string };

/** The only thing the service needs from the network layer, so tests can replace it. */
export interface Transport {
  extract(args: { model: AiModel; system: string; content: ContentIn[] }): Promise<unknown>;
  text(args: { model: AiModel; system: string; user: string; maxTokens: number }): Promise<string>;
}
