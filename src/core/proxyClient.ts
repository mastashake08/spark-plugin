import { buildUrl, type FetchLike, type RequestOptions } from './http.js';
import { SparkApiError } from './errors.js';
import type {
  SparkAccountFields,
  SparkFlatPage,
  SparkFlatResource,
  SparkListParams,
  SparkListingFields,
  SparkMediaFields,
  SparkOpenHouseFields,
  SparkPage,
  SparkResource,
} from './types.js';

export interface SparkProxyClientOptions {
  /**
   * Base URL of *your own backend's* Spark proxy API — e.g. a deployed
   * `spark-api-micro`-style Laravel app's `/api` routes
   * (`http://localhost:8000/api` in dev). No access token is needed here:
   * your backend holds it and this client never sees it. This is the client
   * to use anywhere your code runs in a browser.
   */
  baseUrl: string;
  /** Override fetch, e.g. to inject a mock in tests. */
  fetch?: FetchLike;
  /** Extra headers sent on every request (e.g. an auth header for your own backend, if it requires one). */
  headers?: Record<string, string>;
}

interface ProxyErrorBody {
  error?: string;
  code?: string;
  details?: Array<{ Message?: string; Code?: string; Field?: string }>;
}

function toDelimited(value: string | string[] | undefined): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(',') : value;
}

function listParamsToQuery(params: SparkListParams = {}): RequestOptions['query'] {
  const filter = Array.isArray(params.filter)
    ? params.filter.map((clause) => `(${clause})`).join(' And ')
    : params.filter;

  return {
    filter,
    select: toDelimited(params.select),
    expand: toDelimited(params.expand),
    orderBy: params.orderBy,
    limit: params.limit,
    page: params.page,
    ...params.extra,
  };
}

/**
 * Browser-safe client for a backend that proxies the Spark API on your
 * behalf (holding the real access token server-side) and returns
 * already-unwrapped JSON — e.g. a `spark-api-micro`-style Laravel app.
 * Mirrors `SparkClient`'s resource shape (`listings`, `accounts`, `agents`,
 * `offices`) so the two are close to interchangeable depending on where your
 * code runs; see the Auth section in README for why `SparkClient` itself
 * must stay server-only while this one doesn't.
 *
 * One difference: when Spark omits pagination/requestId, a well-behaved
 * backend may send an explicit `null` (your backend's JSON serializer's
 * choice, not this client's) rather than a genuinely absent key like
 * `SparkClient` sees direct from Spark. Treat `pagination`/`requestId` as
 * falsy-checkable either way — don't rely on `=== undefined` specifically.
 */
export class SparkProxyClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private readonly headers: Record<string, string>;

  constructor(options: SparkProxyClientOptions) {
    if (!options.baseUrl) throw new Error('SparkProxyClient requires a baseUrl pointing to your backend\'s Spark proxy API.');

    this.baseUrl = options.baseUrl;
    this.headers = { Accept: 'application/json', ...options.headers };

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error(
        'No fetch implementation available. Pass `fetch` explicitly (e.g. from `node-fetch`) when running on Node < 18.',
      );
    }
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  /** Escape hatch for any route your backend exposes beyond the ones wrapped below. Returns the parsed JSON body. */
  async request<T>(path: string, query?: RequestOptions['query']): Promise<T> {
    const url = buildUrl(this.baseUrl, path, query);

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', headers: this.headers });
    } catch (cause) {
      throw new SparkApiError('Network request to the Spark proxy API failed.', { status: 0, cause });
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      body = undefined;
    }

    if (!response.ok) {
      const errorBody = body as ProxyErrorBody | undefined;
      throw new SparkApiError(errorBody?.error ?? `Spark proxy API request failed with status ${response.status}.`, {
        status: response.status,
        code: errorBody?.code,
        details: errorBody?.details?.map((e) => ({ code: e.Code, message: e.Message, field: e.Field })),
      });
    }

    return body as T;
  }

  readonly listings = {
    /** GET {baseUrl}/listings */
    search: <Fields extends Record<string, unknown> = SparkListingFields>(params?: SparkListParams) =>
      this.request<SparkPage<Fields>>('listings', listParamsToQuery(params)),

    /** GET {baseUrl}/listings/{id} */
    get: <Fields extends Record<string, unknown> = SparkListingFields>(
      id: string,
      params?: Pick<SparkListParams, 'select' | 'expand'>,
    ) =>
      this.request<SparkResource<Fields>>(`listings/${encodeURIComponent(id)}`, {
        select: toDelimited(params?.select),
        expand: toDelimited(params?.expand),
      }),

    /** GET {baseUrl}/listings/{id}/photos */
    media: <Fields extends Record<string, unknown> = SparkMediaFields>(id: string) =>
      this.request<SparkFlatPage<Fields>>(`listings/${encodeURIComponent(id)}/photos`),

    /** GET {baseUrl}/listings/{id}/openhouses */
    openHouses: <Fields extends Record<string, unknown> = SparkOpenHouseFields>(id: string) =>
      this.request<SparkFlatPage<Fields>>(`listings/${encodeURIComponent(id)}/openhouses`),
  };

  readonly accounts = {
    /** GET {baseUrl}/accounts */
    search: <Fields extends Record<string, unknown> = SparkAccountFields>(params?: SparkListParams) =>
      this.request<SparkFlatPage<Fields>>('accounts', listParamsToQuery(params)),

    /** GET {baseUrl}/accounts/{id} */
    get: <Fields extends Record<string, unknown> = SparkAccountFields>(id: string) =>
      this.request<SparkFlatResource<Fields>>(`accounts/${encodeURIComponent(id)}`),
  };

  readonly agents = {
    /** GET {baseUrl}/agents */
    search: <Fields extends Record<string, unknown> = SparkAccountFields>(params?: SparkListParams) =>
      this.request<SparkFlatPage<Fields>>('agents', listParamsToQuery(params)),

    /** GET {baseUrl}/agents/{id} */
    get: <Fields extends Record<string, unknown> = SparkAccountFields>(id: string) =>
      this.request<SparkFlatResource<Fields>>(`agents/${encodeURIComponent(id)}`),
  };

  readonly offices = {
    /** GET {baseUrl}/offices */
    search: <Fields extends Record<string, unknown> = SparkAccountFields>(params?: SparkListParams) =>
      this.request<SparkFlatPage<Fields>>('offices', listParamsToQuery(params)),

    /** GET {baseUrl}/offices/{id} */
    get: <Fields extends Record<string, unknown> = SparkAccountFields>(id: string) =>
      this.request<SparkFlatResource<Fields>>(`offices/${encodeURIComponent(id)}`),
  };
}
