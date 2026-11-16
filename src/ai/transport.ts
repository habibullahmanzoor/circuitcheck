import type Anthropic from '@anthropic-ai/sdk';
import { AiError, type AiModel, type ContentIn, type Transport } from './types';

/**
 * The only module that talks to the network. It is loaded on demand, so the SDK and zod stay out of the
 * core bundle and the app works offline without ever loading them.
 *
 * The key is used directly from the browser (`dangerouslyAllowBrowser`). That is acceptable for a person using
 * their own key on their own device; it is not a pattern for a shared or public deployment.
 */
export async function createTransport(apiKey: string): Promise<Transport> {
  const [{ default: AnthropicSdk }, { zodOutputFormat }, { ExtractionSchema }] = await Promise.all([
    import('@anthropic-ai/sdk'),
    import('@anthropic-ai/sdk/helpers/zod'),
    import('./schemas'),
  ]);
  const client = new AnthropicSdk({ apiKey: apiKey.trim(), dangerouslyAllowBrowser: true, maxRetries: 1 });

  const describe = (e: unknown): string => {
    if (e instanceof AnthropicSdk.AuthenticationError) return 'The API key was rejected. Check it in Settings.';
    if (e instanceof AnthropicSdk.PermissionDeniedError) return 'This key is not allowed to use that model or feature.';
    if (e instanceof AnthropicSdk.RateLimitError) return 'Rate limited or out of credit. Try again shortly, or check your plan.';
    if (e instanceof AnthropicSdk.BadRequestError) return `The request was rejected: ${e.message}`;
    if (e instanceof AnthropicSdk.APIConnectionError) return 'Could not reach the API. Check your internet connection (AI features need one).';
    if (e instanceof AnthropicSdk.APIError) return `API error ${e.status ?? ''}: ${e.message}`;
    return e instanceof Error ? e.message : 'Unknown error';
  };
  const wrap = async <T>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); } catch (e) { throw e instanceof AiError ? e : new AiError(describe(e)); }
  };

  const toBlocks = (content: ContentIn[]): Anthropic.ContentBlockParam[] =>
    content.map((c): Anthropic.ContentBlockParam => {
      if (c.kind === 'text') return { type: 'text', text: c.text };
      if (c.kind === 'image') return { type: 'image', source: { type: 'base64', media_type: c.mediaType, data: c.dataB64 } };
      return { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: c.dataB64 } };
    });

  return {
    extract: ({ model, system, content }: { model: AiModel; system: string; content: ContentIn[] }) =>
      wrap(async () => {
        const res = await client.messages.parse({
          model,
          max_tokens: 16000,
          system,
          messages: [{ role: 'user', content: toBlocks(content) }],
          output_config: { format: zodOutputFormat(ExtractionSchema) },
        });
        if (res.stop_reason === 'refusal') throw new AiError('The model declined this request.');
        if (res.stop_reason === 'max_tokens') throw new AiError('The schedule was too long for one request. Try a smaller section.');
        return res.parsed_output;
      }),
    text: ({ model, system, user, maxTokens }: { model: AiModel; system: string; user: string; maxTokens: number }) =>
      wrap(async () => {
        const res = await client.messages.create({
          model,
          max_tokens: maxTokens,
          system,
          messages: [{ role: 'user', content: user }],
        });
        if (res.stop_reason === 'refusal') throw new AiError('The model declined this request.');
        return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      }),
  };
}
