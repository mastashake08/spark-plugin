import { SparkApiError } from './errors.js';
import type { SparkEnvelope } from './types.js';

export type FetchLike = typeof fetch;

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export function buildUrl(baseUrl: string, path: string, query?: RequestOptions['query']): string {
  const url = new URL(path.replace(/^\/+/, ''), baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined) continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

export async function sparkFetch<T>(
  fetchImpl: FetchLike,
  baseUrl: string,
  path: string,
  options: RequestOptions = {},
): Promise<{ envelope: SparkEnvelope<T>; response: Response }> {
  const url = buildUrl(baseUrl, path, options.query);

  let response: Response;
  try {
    response = await fetchImpl(url, {
      method: options.method ?? 'GET',
      headers: options.headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: options.signal,
    });
  } catch (cause) {
    throw new SparkApiError('Network request to Spark API failed.', {
      status: 0,
      cause,
    });
  }

  let envelope: SparkEnvelope<T> | undefined;
  try {
    envelope = (await response.json()) as SparkEnvelope<T>;
  } catch {
    envelope = undefined;
  }

  if (!response.ok || !envelope?.D?.Success) {
    const message =
      envelope?.D?.Message ??
      envelope?.D?.Errors?.[0]?.Message ??
      `Spark API request failed with status ${response.status}.`;

    throw new SparkApiError(message, {
      status: response.status,
      code: envelope?.D?.Code,
      details: envelope?.D?.Errors?.map((e) => ({ code: e.Code, message: e.Message, field: e.Field })),
      requestId: envelope?.D?.RequestId,
    });
  }

  return { envelope, response };
}
