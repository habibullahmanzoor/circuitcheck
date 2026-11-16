import { z } from 'zod';
import type { Extraction } from './types';

/** Structured-output schema. Every value is nullable so the model must say "not readable" instead of guessing. */
export const ExtractedCircuitSchema = z.object({
  ref: z.string(),
  description: z.string(),
  phases: z.enum(['1P', '3P']).nullable(),
  kind: z.enum(['lighting', 'socket', 'fixed', 'other']).nullable(),
  device: z.enum(['B', 'C', 'D']).nullable(),
  inA: z.number().nullable(),
  ibA: z.number().nullable(),
  lineCsaMm2: z.number().nullable(),
  cpcCsaMm2: z.number().nullable(),
  insulation: z.enum(['PVC70', 'XLPE90']).nullable(),
  lengthM: z.number().nullable(),
  installMethod: z.string().nullable(),
  ambientFactor: z.number().nullable(),
  groupingFactor: z.number().nullable(),
  rcdMa: z.number().nullable(),
  confidence: z.enum(['high', 'medium', 'low']),
  note: z.string(),
});

export const ExtractionSchema = z.object({
  circuits: z.array(ExtractedCircuitSchema),
  warnings: z.array(z.string()),
});

/** Compile-time check that the schema and the plain type agree. */
export const _typeCheck: Extraction = {} as z.infer<typeof ExtractionSchema>;

export function parseExtraction(x: unknown): Extraction | undefined {
  const r = ExtractionSchema.safeParse(x);
  return r.success ? r.data : undefined;
}
