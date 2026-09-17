import { sparkFetch, type FetchLike, type RequestOptions } from './http.js';
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

export interface SparkClientOptions {
  /**
   * Server Access Token from your Spark API developer account (Settings ->
   * My Developer Account -> Access Tokens). Passed as `Authorization: Bearer
   * <accessToken>` on every request.
   */
  accessToken: string;
  /** Defaults to Spark's standard v1 endpoint. Use the replication host if your account is provisioned for it. */
  baseUrl?: string;
  /** Identifies your application to Spark, e.g. `"YourBrokerage IDX/1.0"`. Required by the API. */
  userAgent: string;
  /** Override fetch, e.g. to supply a polyfill on Node < 18 or to inject a mock in tests. */
  fetch?: FetchLike;
}

function toDelimited(value: string | string[] | undefined, separator: string): string | undefined {
  if (value === undefined) return undefined;
  return Array.isArray(value) ? value.join(separator) : value;
}

function mergeFilters(base: string, extra?: string | string[]): string | string[] {
  if (!extra) return base;
  return Array.isArray(extra) ? [base, ...extra] : [base, extra];
}

function listParamsToQuery(params: SparkListParams = {}): RequestOptions['query'] {
  const filter = Array.isArray(params.filter)
    ? params.filter.map((clause) => `(${clause})`).join(' And ')
    : params.filter;

  return {
    _filter: filter,
    _select: toDelimited(params.select, ','),
    _expand: toDelimited(params.expand, ','),
    _orderby: params.orderBy,
    _limit: params.limit,
    _page: params.page,
    ...params.extra,
  };
}

export class SparkClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: FetchLike;
  private accessToken: string;
  private readonly userAgent: string;

  constructor(options: SparkClientOptions) {
    if (!options.accessToken) throw new Error('SparkClient requires an accessToken.');
    if (!options.userAgent) throw new Error('SparkClient requires a userAgent identifying your application.');

    this.accessToken = options.accessToken;
    this.userAgent = options.userAgent;
    this.baseUrl = options.baseUrl ?? 'https://replication.sparkapi.com/v1/';

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error(
        'No fetch implementation available. Pass `fetch` explicitly (e.g. from `node-fetch`) when running on Node < 18.',
      );
    }
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  /** Swap the access token at runtime, e.g. after your backend rotates it. */
  setAccessToken(accessToken: string): void {
    this.accessToken = accessToken;
  }

  private headers(extra?: Record<string, string>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.accessToken}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-SparkApi-User-Agent': this.userAgent,
      ...extra,
    };
  }

  /**
   * Escape hatch for any Spark resource not wrapped below (e.g.
   * `/openhouses`, `/offices`, `/agents`). Returns the raw envelope results.
   */
  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { envelope } = await sparkFetch<T>(this.fetchImpl, this.baseUrl, path, {
      ...options,
      headers: this.headers(options.headers),
    });
    return envelope.D.Results as T;
  }

  private async list<Fields extends Record<string, unknown>>(
    path: string,
    params?: SparkListParams,
  ): Promise<SparkPage<Fields>> {
    const { envelope } = await sparkFetch<Array<SparkResource<Fields>>>(this.fetchImpl, this.baseUrl, path, {
      query: listParamsToQuery(params),
      headers: this.headers(),
    });
    return {
      results: envelope.D.Results ?? [],
      pagination: envelope.D.Pagination,
      requestId: envelope.D.RequestId,
    };
  }

  /** Like `list`, but for resources (e.g. media/photos) whose fields come back flat instead of under `StandardFields`. */
  private async listFlat<Fields extends Record<string, unknown>>(
    path: string,
    params?: SparkListParams,
  ): Promise<SparkFlatPage<Fields>> {
    const { envelope } = await sparkFetch<Array<SparkFlatResource<Fields>>>(this.fetchImpl, this.baseUrl, path, {
      query: listParamsToQuery(params),
      headers: this.headers(),
    });
    return {
      results: envelope.D.Results ?? [],
      pagination: envelope.D.Pagination,
      requestId: envelope.D.RequestId,
    };
  }

  /** Single-record fetch for flat resources (accounts). Spark still wraps the result in a one-element array. */
  private async getFlatOne<Fields extends Record<string, unknown>>(path: string): Promise<SparkFlatResource<Fields>> {
    const { envelope } = await sparkFetch<Array<SparkFlatResource<Fields>>>(this.fetchImpl, this.baseUrl, path, {
      headers: this.headers(),
    });
    const result = envelope.D.Results?.[0];
    if (!result) {
      throw new Error(`Spark API returned no record for "${path}".`);
    }
    return result;
  }

  readonly listings = {
    /** GET /listings */
    search: <Fields extends Record<string, unknown> = SparkListingFields>(params?: SparkListParams) =>
      this.list<Fields>('listings', params),

    /** GET /listings/{id} */
    get: async <Fields extends Record<string, unknown> = SparkListingFields>(
      id: string,
      params?: Pick<SparkListParams, 'select' | 'expand'>,
    ): Promise<SparkResource<Fields>> => {
      const { envelope } = await sparkFetch<Array<SparkResource<Fields>>>(
        this.fetchImpl,
        this.baseUrl,
        `listings/${encodeURIComponent(id)}`,
        {
          query: {
            _select: toDelimited(params?.select, ','),
            _expand: toDelimited(params?.expand, ','),
          },
          headers: this.headers(),
        },
      );
      const result = envelope.D.Results?.[0];
      if (!result) {
        throw new Error(`Spark API returned no listing for id "${id}".`);
      }
      return result;
    },

    /** GET /listings/{id}/photos */
    media: <Fields extends Record<string, unknown> = SparkMediaFields>(id: string) =>
      this.listFlat<Fields>(`listings/${encodeURIComponent(id)}/photos`),

    /** GET /listings/{id}/openhouses */
    openHouses: <Fields extends Record<string, unknown> = SparkOpenHouseFields>(id: string) =>
      this.listFlat<Fields>(`listings/${encodeURIComponent(id)}/openhouses`),
  };

  /**
   * Agents and offices are both `/accounts` records, distinguished by
   * `UserType` ('Member' for agents, 'Office' for offices). Use this
   * directly for other user types (e.g. 'Company'); `agents`/`offices`
   * below are filtered convenience wrappers over the same resource.
   */
  readonly accounts = {
    /** GET /accounts */
    search: <Fields extends Record<string, unknown> = SparkAccountFields>(params?: SparkListParams) =>
      this.listFlat<Fields>('accounts', params),

    /** GET /accounts/{id} */
    get: <Fields extends Record<string, unknown> = SparkAccountFields>(id: string) =>
      this.getFlatOne<Fields>(`accounts/${encodeURIComponent(id)}`),
  };

  readonly agents = {
    /** GET /accounts?_filter=UserType Eq 'Member' */
    search: <Fields extends Record<string, unknown> = SparkAccountFields>(params: SparkListParams = {}) =>
      this.accounts.search<Fields>({ ...params, filter: mergeFilters("UserType Eq 'Member'", params.filter) }),

    get: this.accounts.get,
  };

  readonly offices = {
    /** GET /accounts?_filter=UserType Eq 'Office' */
    search: <Fields extends Record<string, unknown> = SparkAccountFields>(params: SparkListParams = {}) =>
      this.accounts.search<Fields>({ ...params, filter: mergeFilters("UserType Eq 'Office'", params.filter) }),

    get: this.accounts.get,
  };
}
