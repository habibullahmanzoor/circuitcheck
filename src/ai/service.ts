import type { CheckResult, Circuit } from '../engine';
import { rowFromExtracted, type ReviewRow } from './review';
import { parseExtraction } from './schemas';
import { AiError, type AiModel, type ContentIn, type MediaType, type Transport } from './types';

export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_CHARS = 20000;
const IMAGE_TYPES: readonly MediaType[] = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

export const EXTRACT_SYSTEM = `You transcribe electrical circuit schedules (distribution board charts, printed or handwritten, or a person's typed notes) into structured rows for a design-checking tool.

Rules:
- Copy only what is visible or stated. Never infer, estimate or calculate a value.
- If a value is missing, unreadable or ambiguous, return null for it and mention it in "note". Do not guess to be helpful.
- Units must match the field (amps, mm², metres, mA). If the source uses different units or a value is unclear, return null and explain in "note".
- Breaker text such as "B32" means device "B" and inA 32. "SP" or "1ph" means "1P"; "TPN" or "3ph" means "3P". Set "kind" only when the description makes it clear.
- cpcCsaMm2, ambientFactor, groupingFactor and rcdMa stay null unless stated.
- Set confidence to "low" for hard-to-read handwriting or blurry text, "medium" if any value needed interpretation, otherwise "high".
- Add a short entry to "warnings" for anything the reader must double-check (illegible rows, repeated refs, columns you could not identify).
- Do not invent circuits that are not in the source. Do not include standards clause numbers or table values.`;

export const EXPLAIN_SYSTEM = `You explain one electrical design-check result to a non-expert in plain English.
- Use ONLY the numbers present in the JSON provided. Do not calculate new numbers, estimate, or round differently.
- Do not cite regulation or clause numbers and do not say anything is "compliant" or "certified".
- Write 3 to 5 short sentences: what was checked, why it failed in everyday terms, and, if a suggested fix is given, what it changes.
- End with one sentence saying a competent person must verify the design.`;

export interface ExtractionOutcome {
  rows: ReviewRow[];
  warnings: string[];
}

function toOutcome(raw: unknown, newId: (i: number) => string): ExtractionOutcome {
  const parsed = parseExtraction(raw);
  if (!parsed) throw new AiError('The reply did not match the expected format. Try again, or use a clearer source.');
  return { rows: parsed.circuits.map((c, i) => rowFromExtracted(c, newId(i))), warnings: parsed.warnings };
}

export function fileProblem(f: { type: string; size: number }): string | undefined {
  if (f.size > MAX_FILE_BYTES) return 'The file is larger than 10 MB. Crop it or use a smaller photo.';
  if (f.type !== 'application/pdf' && !IMAGE_TYPES.includes(f.type as MediaType)) return 'Use a PNG, JPEG, WebP, GIF or PDF file.';
  return undefined;
}

export async function extractFromFile(
  t: Transport,
  model: AiModel,
  file: { mediaType: MediaType; dataB64: string },
  newId: (i: number) => string,
): Promise<ExtractionOutcome> {
  const doc: ContentIn = file.mediaType === 'application/pdf'
    ? { kind: 'pdf', dataB64: file.dataB64 }
    : { kind: 'image', mediaType: file.mediaType, dataB64: file.dataB64 };
  const raw = await t.extract({
    model,
    system: EXTRACT_SYSTEM,
    content: [doc, { kind: 'text', text: 'Transcribe every circuit in this schedule. Return null for anything not clearly readable.' }],
  });
  return toOutcome(raw, newId);
}

export async function extractFromText(t: Transport, model: AiModel, text: string, newId: (i: number) => string): Promise<ExtractionOutcome> {
  const trimmed = text.trim();
  if (trimmed === '') throw new AiError('Type or paste a description first.');
  if (trimmed.length > MAX_TEXT_CHARS) throw new AiError(`Keep the description under ${MAX_TEXT_CHARS} characters.`);
  const raw = await t.extract({
    model,
    system: EXTRACT_SYSTEM,
    content: [{ kind: 'text', text: `Turn these notes into circuit rows. Only use what is written.\n\n${trimmed}` }],
  });
  return toOutcome(raw, newId);
}

/** Only the check's own result and a short circuit summary are sent. Nothing else from the board leaves the device. */
export function explainPayload(c: Circuit, r: CheckResult): string {
  return JSON.stringify({
    circuit: {
      ref: c.ref, description: c.description, type: c.kind, phases: c.phases, breaker: `${c.device}${c.inA} A`,
      designCurrentA: c.ibA, lineCsaMm2: c.lineCsaMm2, cpcCsaMm2: c.cpcCsaMm2 ?? 'by sizing rule', lengthM: c.lengthM, insulation: c.insulation,
    },
    check: {
      title: r.title, status: r.status, message: r.message, value: r.value, limit: r.limit, unit: r.unit,
      formula: r.formula, inputs: r.inputs, suggestedFix: r.suggestion ?? null,
    },
  });
}

export async function explainFailure(t: Transport, model: AiModel, c: Circuit, r: CheckResult): Promise<string> {
  const out = await t.text({ model, system: EXPLAIN_SYSTEM, user: explainPayload(c, r), maxTokens: 2000 });
  if (out === '') throw new AiError('The model returned no text.');
  return out;
}

export async function testKey(t: Transport, model: AiModel): Promise<void> {
  const out = await t.text({ model, system: 'Reply with the single word OK.', user: 'ping', maxTokens: 1024 });
  if (out === '') throw new AiError('The key worked but the model returned no text.');
}
