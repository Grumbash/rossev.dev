// The one OpenRouter client for CI scripts (the perf watchdog, the Publora sync). One bounded
// chat completion, no tools: callers pass untrusted text as messages, so the model can only answer,
// never act. The key goes only in the Authorization header and never into an error or log line.
//
// Usage: import { callOpenRouter, redact } from './openrouter'.

const ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export type Msg = { role: 'system' | 'user' | 'assistant'; content: string };

/** `s` with every secret (4+ chars) replaced by ***. */
export const redact = (s: string, secrets: (string | undefined)[]) =>
  secrets.reduce<string>((out, k) => (k && k.length >= 4 ? out.split(k).join('***') : out), s);

/**
 * One bounded chat completion, no tools. `model` may be a comma-separated list: OpenRouter tries
 * them in order on an error or rate limit. Throws on any failure; the error never holds the key.
 */
export async function callOpenRouter(o: {
  apiKey: string;
  model: string;
  messages: Msg[];
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxTokens?: number;
  temperature?: number;
  responseFormat?: unknown; // e.g. { type: 'json_schema', json_schema: { name, strict: true, schema } }
  title?: string; // X-Title, how the call shows up on openrouter.ai
}) {
  const models = o.model.split(',').map((m) => m.trim()).filter(Boolean);
  const res = await (o.fetchImpl ?? fetch)(ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${o.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'https://rossev.dev',
      'X-Title': o.title ?? 'rossev.dev perf watchdog',
    },
    body: JSON.stringify({
      model: models[0],
      ...(models.length > 1 ? { models } : {}),
      messages: o.messages,
      max_tokens: o.maxTokens ?? 1500,
      temperature: o.temperature ?? 0.2,
      // Low effort, reasoning not returned: a thinking model must leave room in max_tokens for the answer.
      reasoning: { effort: 'low', exclude: true },
      ...(o.responseFormat ? { response_format: o.responseFormat } : {}),
      usage: { include: true },
    }),
    signal: AbortSignal.timeout(o.timeoutMs ?? 90_000),
  });
  const raw = await res.text();
  const detail = redact(raw.slice(0, 300), [o.apiKey]);
  if (!res.ok) throw new Error(`OpenRouter HTTP ${res.status}`, { cause: detail });
  let data: any;
  try {
    data = JSON.parse(raw);
  } catch {
    throw new Error('OpenRouter returned non-JSON', { cause: detail });
  }
  const text = data?.choices?.[0]?.message?.content;
  if (data?.error || typeof text !== 'string' || !text.trim()) throw new Error('OpenRouter returned no answer', { cause: detail });
  return {
    text,
    costUsd: typeof data.usage?.cost === 'number' ? (data.usage.cost as number) : undefined,
    model: typeof data.model === 'string' ? (data.model as string) : models[0],
  };
}
