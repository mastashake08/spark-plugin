import type { FetchLike } from './http.js';
import { ParagonApiError } from './errors.js';
import type { SparkListParams, SparkPage, SparkResource } from './types.js';
import type {
  ParagonFieldMap,
  ParagonListingFields,
  ParagonMetadataRow,
  ParagonPage,
  ParagonPhoto,
  ParagonRecord,
  ParagonSearchParams,
} from './paragonTypes.js';

export interface ParagonClientOptions {
  /** The RETS login URL your MLS gave you, e.g. `https://kma-rets.paragonrels.com/rets/fnisrets.aspx/KMA/login`. */
  loginUrl: string;
  /** RETS username (case-sensitive). */
  username: string;
  /** RETS password (case-sensitive). Never ship this to a browser. */
  password: string;
  /** Sent as `User-Agent`. Defaults to `spark-mls-client`. */
  userAgent?: string;
  /** Defaults to `RETS/1.8`. */
  retsVersion?: string;
  /** Property class used by `client.listings` and as the default for `property.*`. Defaults to `RF_1` (Residential/Farm). */
  listingClass?: string;
  /**
   * Spark/RESO-style aliases `client.listings` adds to `StandardFields`.
   * Merged over `PARAGON_CORE_FIELD_MAP`; pass `PARAGON_KMA_FIELD_MAP` for
   * Kentucky MLS Alliance (HKAR) feeds.
   */
  fieldMap?: ParagonFieldMap;
  /** Override fetch, e.g. to supply a polyfill on Node < 18 or to inject a mock in tests. */
  fetch?: FetchLike;
}

/** Aliases for Paragon's core `L_*` columns, which are the same on every Paragon MLS. */
export const PARAGON_CORE_FIELD_MAP: ParagonFieldMap = {
  ListingId: 'L_DisplayId',
  ListPrice: 'L_AskingPrice',
  StandardStatus: 'L_Status',
  StreetNumber: 'L_AddressNumber',
  StreetName: 'L_AddressStreet',
  City: 'L_City',
  StateOrProvince: 'L_State',
  PostalCode: 'L_Zip',
  PropertyType: 'L_Class',
  PropertySubType: 'L_Type_',
  LotSizeAcres: 'L_NumAcres',
  PhotosCount: 'L_PictureCount',
  Latitude: 'LMD_MP_Latitude',
  Longitude: 'LMD_MP_Longitude',
  ListAgentKey: 'L_ListAgent1',
  ListOfficeKey: 'L_ListOffice1',
  ListOfficeName: 'LO1_OrganizationName',
  ModificationTimestamp: 'L_UpdateDate',
};

/**
 * Kentucky MLS Alliance (KMA — HKAR's MLS) `LM_*`/`LR_*` columns for the
 * Residential/Farm class (`RF_1`), confirmed against KMA's live metadata.
 * Other classes and other Paragon MLSes use different columns.
 */
export const PARAGON_KMA_FIELD_MAP: ParagonFieldMap = {
  BedroomsTotal: 'LM_Int1_6',
  BathroomsTotalInteger: 'LM_Int1_5',
  BathroomsFull: 'LM_Int1_1',
  BathroomsHalf: 'LM_Int1_12',
  LivingArea: 'LM_Int4_6',
  YearBuilt: 'LM_Int2_17',
  PublicRemarks: 'LR_remarks22',
  CountyOrParish: 'LM_char10_67',
  SubdivisionName: 'LM_Char50_4',
};

type Params = Record<string, string | number | boolean | undefined>;

interface CompactResult {
  replyCode: number;
  replyText: string;
  count: number | undefined;
  columns: string[];
  rows: string[][];
  maxRows: boolean;
}

/** Paragon's "no records found" reply — an empty result, not an error. */
const NO_RECORDS = 20201;
const NUMERIC_TYPES = new Set(['Int', 'Small', 'Tiny', 'Long', 'Decimal']);
/** Matches every listing; RETS Search requires a query. */
const MATCH_ALL_LISTINGS = '(L_ListingID=0+)';
const DEFAULT_PAGE_SIZE = 25;
/** Street-level fields dropped (with the `LMD_MP_*` map-pin columns) when a listing is "Yes Without Address". */
const ADDRESS_FIELDS = new Set([
  'L_Address',
  'L_AddressNumber',
  'L_AddressSearchNumber',
  'L_AddressDirection',
  'L_AddressStreet',
  'L_Address2',
  'StreetNumber',
  'StreetName',
  'Latitude',
  'Longitude',
]);

function decodeXml(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, entity: string) => {
    if (entity[0] === '#') {
      return String.fromCodePoint(entity[1] === 'x' || entity[1] === 'X' ? parseInt(entity.slice(2), 16) : Number(entity.slice(1)));
    }
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()] ?? '';
  });
}

function attr(tag: string, name: string): string | undefined {
  const match = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(tag);
  return match?.[1] !== undefined ? decodeXml(match[1]) : undefined;
}

/** Splits a COMPACT `<COLUMNS>`/`<DATA>` body, which starts and ends with the delimiter. */
function splitCompact(body: string, delimiter: string): string[] {
  const parts = body.split(delimiter);
  return parts.slice(1, -1).map(decodeXml);
}

/**
 * Parses a RETS COMPACT / COMPACT-DECODED response (searches and metadata).
 * Metadata responses may hold several `<COLUMNS>`/`<DATA>` blocks; this reads
 * the first `<COLUMNS>` and every `<DATA>` row, which is enough for the
 * single-table requests this client makes.
 */
export function parseCompact(xml: string): CompactResult {
  const retsTag = /<RETS\b[^>]*>/i.exec(xml)?.[0];
  if (!retsTag) throw new ParagonApiError('Response was not a RETS document.', { status: 0, details: [{ message: xml.slice(0, 200) }] });

  const delimiterHex = attr(/<DELIMITER\b[^>]*>/i.exec(xml)?.[0] ?? '', 'value') ?? '09';
  const delimiter = String.fromCharCode(parseInt(delimiterHex, 16));
  const countTag = /<COUNT\b[^>]*>/i.exec(xml)?.[0];
  const columnsBody = /<COLUMNS>([\s\S]*?)<\/COLUMNS>/i.exec(xml)?.[1];

  return {
    replyCode: Number(attr(retsTag, 'ReplyCode') ?? NaN),
    replyText: attr(retsTag, 'ReplyText') ?? '',
    count: countTag ? Number(attr(countTag, 'Records')) : undefined,
    columns: columnsBody ? splitCompact(columnsBody, delimiter) : [],
    rows: [...xml.matchAll(/<DATA>([\s\S]*?)<\/DATA>/gi)].map((m) => splitCompact(m[1] ?? '', delimiter)),
    maxRows: /<MAXROWS\s*\/?>/i.test(xml),
  };
}

/** Reads the `key=value` capability lines from a login response's `<RETS-RESPONSE>` body. */
function parseLoginResponse(xml: string): Record<string, string> {
  const body = /<RETS-RESPONSE>([\s\S]*?)<\/RETS-RESPONSE>/i.exec(xml)?.[1] ?? '';
  const out: Record<string, string> = {};
  // Paragon puts entries on one line separated by spaces; the spec uses newlines. Split on whitespace before `Key=`.
  for (const entry of body.split(/\s+(?=[A-Za-z][\w-]*=)/)) {
    const eq = entry.indexOf('=');
    if (eq > 0) out[entry.slice(0, eq).trim()] = decodeXml(entry.slice(eq + 1).trim());
  }
  return out;
}

function toList(value: string | string[] | undefined): string[] {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : value.split(',').map((s) => s.trim()).filter(Boolean);
}

function toQuery(query: string | string[] | undefined, fallback: string): string {
  const clauses = ([] as string[]).concat(query ?? []).filter(Boolean);
  return clauses.length ? clauses.join(',') : fallback;
}

/** Collects `Set-Cookie` values from a response (Node 18.14+/undici `getSetCookie`, else the merged header). */
function setCookies(headers: Headers): string[] {
  const h = headers as Headers & { getSetCookie?: () => string[] };
  if (typeof h.getSetCookie === 'function') return h.getSetCookie();
  const merged = headers.get('set-cookie');
  return merged ? merged.split(/,(?=\s*[^;,=\s]+=)/) : [];
}

/**
 * Server-side client for a Paragon RETS server (ICE / Black Knight), e.g. the
 * Kentucky MLS Alliance feed HKAR members get. Logs in lazily with HTTP Basic
 * auth, keeps the RETS session cookie, re-logs in once if the session
 * expires, and parses COMPACT-DECODED XML into plain records.
 *
 * Like `SparkClient`, this must never run in browser-shipped code — the RETS
 * password would be exposed, and Paragon sends no CORS headers. Put it
 * behind your own backend and use `SparkProxyClient` in the browser;
 * `client.listings` returns the same `SparkPage`/`SparkResource` shapes that
 * `SparkProxyClient` expects.
 *
 * Call `logout()` when done (e.g. on shutdown) — Paragon may block users who
 * leave too many sessions open.
 */
export class ParagonClient {
  private readonly loginUrl: string;
  private readonly authHeader: string;
  private readonly userAgent: string;
  private readonly retsVersion: string;
  private readonly listingClass: string;
  private readonly fieldMap: ParagonFieldMap;
  private readonly fetchImpl: FetchLike;
  private readonly cookies = new Map<string, string>();
  private capabilities: Record<string, string> | undefined;
  private pendingLogin: Promise<Record<string, string>> | undefined;
  private readonly tableCache = new Map<string, Promise<Map<string, ParagonMetadataRow>>>();
  private propertyClasses: Promise<string[]> | undefined;

  constructor(options: ParagonClientOptions) {
    if (!options.loginUrl) throw new Error('ParagonClient requires a loginUrl.');
    if (!options.username) throw new Error('ParagonClient requires a username.');
    if (!options.password) throw new Error('ParagonClient requires a password.');

    this.loginUrl = options.loginUrl;
    this.authHeader = `Basic ${btoa(`${options.username}:${options.password}`)}`;
    this.userAgent = options.userAgent ?? 'spark-mls-client';
    this.retsVersion = options.retsVersion ?? 'RETS/1.8';
    this.listingClass = options.listingClass ?? 'RF_1';
    this.fieldMap = { ...PARAGON_CORE_FIELD_MAP, ...options.fieldMap };

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) {
      throw new Error(
        'No fetch implementation available. Pass `fetch` explicitly (e.g. from `node-fetch`) when running on Node < 18.',
      );
    }
    this.fetchImpl = fetchImpl.bind(globalThis);
  }

  private async http(url: string): Promise<{ status: number; text: string }> {
    const headers: Record<string, string> = {
      Authorization: this.authHeader,
      'RETS-Version': this.retsVersion,
      'User-Agent': this.userAgent,
      Accept: '*/*',
    };
    if (this.cookies.size) headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

    let response: Response;
    try {
      response = await this.fetchImpl(url, { method: 'GET', headers });
    } catch (cause) {
      throw new ParagonApiError('Network request to the Paragon RETS server failed.', { status: 0, cause });
    }
    for (const cookie of setCookies(response.headers)) {
      const pair = cookie.split(';')[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return { status: response.status, text: await response.text() };
  }

  /** Logs in (once — concurrent callers share the request) and returns the server's capability URLs. */
  async login(force = false): Promise<Record<string, string>> {
    if (!force && this.capabilities) return this.capabilities;
    if (!this.pendingLogin) {
      this.pendingLogin = this.doLogin().finally(() => {
        this.pendingLogin = undefined;
      });
    }
    return this.pendingLogin;
  }

  private async doLogin(): Promise<Record<string, string>> {
    this.cookies.clear();
    const { status, text } = await this.http(this.loginUrl);
    if (status === 401) throw new ParagonApiError('Paragon RETS login failed: invalid username or password.', { status });
    const parsed = parseCompact(text);
    if (status !== 200 || parsed.replyCode !== 0) {
      throw new ParagonApiError(parsed.replyText || `Paragon RETS login failed with status ${status}.`, {
        status,
        code: String(parsed.replyCode),
      });
    }
    this.capabilities = parseLoginResponse(text);
    return this.capabilities;
  }

  /** Ends the RETS session. Safe to call when not logged in. The next request logs in again. */
  async logout(): Promise<void> {
    const url = this.capabilities?.Logout;
    this.capabilities = undefined;
    if (url) await this.http(new URL(url, this.loginUrl).toString()).catch(() => undefined);
    this.cookies.clear();
  }

  /** Runs one RETS transaction (`Search`, `GetMetadata`, ...) and returns the parsed body. Re-logs in once on 401. */
  private async transaction(capability: string, params: Params, retried = false): Promise<CompactResult> {
    const caps = await this.login();
    const path = caps[capability];
    if (!path) throw new ParagonApiError(`This RETS server does not offer the ${capability} transaction.`, { status: 0 });

    const url = new URL(path, this.loginUrl);
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined) url.searchParams.set(key, String(value));
    }

    const { status, text } = await this.http(url.toString());
    if (status === 401 && !retried) {
      await this.login(true);
      return this.transaction(capability, params, true);
    }
    if (status !== 200) {
      throw new ParagonApiError(`Paragon RETS ${capability} failed with status ${status}.`, { status });
    }
    const parsed = parseCompact(text);
    if (parsed.replyCode !== 0 && parsed.replyCode !== NO_RECORDS) {
      throw new ParagonApiError(parsed.replyText || `Paragon RETS ${capability} failed.`, {
        status,
        code: String(parsed.replyCode),
      });
    }
    return parsed;
  }

  /**
   * Raw metadata rows, e.g. `client.metadata('METADATA-LOOKUP_TYPE', 'Property:Status')`
   * or `client.metadata('METADATA-CLASS', 'Property')`.
   */
  async metadata(type: string, id: string): Promise<ParagonMetadataRow[]> {
    const result = await this.transaction('GetMetadata', { Type: type, ID: id, Format: 'COMPACT' });
    return result.rows.map((row) => Object.fromEntries(result.columns.map((c, i) => [c, row[i] ?? ''])));
  }

  /** Field metadata for one resource/class, keyed by SystemName. Cached per client. */
  table(resource: string, cls: string): Promise<Map<string, ParagonMetadataRow>> {
    const key = `${resource}:${cls}`;
    const cached = this.tableCache.get(key);
    if (cached) return cached;
    const table = this.metadata('METADATA-TABLE', key).then(
      (rows) => new Map(rows.map((r) => [r.SystemName ?? '', r] as [string, ParagonMetadataRow])),
    );
    table.catch(() => this.tableCache.delete(key));
    this.tableCache.set(key, table);
    return table;
  }

  /**
   * Runs a RETS Search on any resource/class and returns records with numeric
   * fields converted to numbers (from the table metadata) and empty values
   * omitted. `Count=1` is always sent so `count` is populated.
   */
  async search<Fields extends Record<string, unknown> = Record<string, unknown>>(
    resource: string,
    params: ParagonSearchParams & { class: string; query: string | string[] },
  ): Promise<ParagonPage<Fields>> {
    const [table, result] = await Promise.all([
      this.table(resource, params.class),
      this.transaction('Search', {
        SearchType: resource,
        Class: params.class,
        QueryType: 'DMQL2',
        Format: 'COMPACT-DECODED',
        Count: 1,
        Query: toQuery(params.query, ''),
        Select: params.select === undefined ? undefined : toList(params.select).join(','),
        Limit: params.limit,
        Offset: params.offset,
        ...params.extra,
      }),
    ]);

    const results = result.rows.map((row) => {
      const record: Record<string, unknown> = {};
      result.columns.forEach((column, i) => {
        const raw = row[i];
        if (raw === undefined || raw === '') return;
        const meta = table.get(column);
        const numeric = meta && NUMERIC_TYPES.has(meta.DataType ?? '') && !meta.Interpretation?.startsWith('Lookup');
        const value = numeric ? Number(raw) : raw;
        record[column] = typeof value === 'number' && Number.isNaN(value) ? raw : value;
      });
      return record as ParagonRecord<Fields>;
    });

    return { results, count: result.count, maxRows: result.maxRows };
  }

  /** Like `search`, but keeps requesting the next `Offset` until the server stops reporting `MAXROWS`. */
  async searchAll<Fields extends Record<string, unknown> = Record<string, unknown>>(
    resource: string,
    params: ParagonSearchParams & { class: string; query: string | string[] },
  ): Promise<Array<ParagonRecord<Fields>>> {
    const all: Array<ParagonRecord<Fields>> = [];
    let offset = params.offset ?? 1;
    for (;;) {
      const page = await this.search<Fields>(resource, { ...params, offset });
      all.push(...page.results);
      if (!page.maxRows || page.results.length === 0) return all;
      offset += page.results.length;
    }
  }

  /** The Property resource's class names (e.g. `RF_1`, `LT_2`, ...), from metadata. Cached. */
  listingClasses(): Promise<string[]> {
    if (!this.propertyClasses) {
      this.propertyClasses = this.metadata('METADATA-CLASS', 'Property').then((rows) => rows.map((r) => r.ClassName ?? ''));
      this.propertyClasses.catch(() => {
        this.propertyClasses = undefined;
      });
    }
    return this.propertyClasses;
  }

  readonly property = {
    /** Search listings. `class` defaults to `listingClass`; `query` defaults to every listing. */
    search: <Fields extends Record<string, unknown> = Record<string, unknown>>(params: ParagonSearchParams = {}) =>
      this.search<Fields>('Property', {
        ...params,
        class: params.class ?? this.listingClass,
        query: toQuery(params.query, MATCH_ALL_LISTINGS),
      }),

    /**
     * One listing by `L_ListingID`. Without `class`, tries `listingClass`
     * first, then the server's other Property classes. Throws a 404
     * `ParagonApiError` if no class has it.
     */
    get: async <Fields extends Record<string, unknown> = Record<string, unknown>>(
      listingId: string | number,
      params: Pick<ParagonSearchParams, 'class' | 'select'> = {},
    ): Promise<ParagonRecord<Fields> & { class: string }> => {
      const classes = params.class
        ? [params.class]
        : [this.listingClass, ...(await this.listingClasses()).filter((c) => c !== this.listingClass)];
      for (const cls of classes) {
        const page = await this.search<Fields>('Property', {
          class: cls,
          query: `(L_ListingID=${listingId})`,
          select: params.select,
          limit: 1,
        });
        if (page.results[0]) return { ...page.results[0], class: cls };
      }
      throw new ParagonApiError(`No listing with L_ListingID ${listingId}.`, { status: 404 });
    },

    /** Every Media record (photos, then other media) for one or more listings, ordered by listing then `MED_sequence`. */
    media: async <Fields extends Record<string, unknown> = Record<string, unknown>>(
      listingIds: string | number | Array<string | number>,
      params: Pick<ParagonSearchParams, 'class' | 'select' | 'query'> = {},
    ): Promise<Array<ParagonRecord<Fields>>> => {
      const ids = ([] as Array<string | number>).concat(listingIds);
      if (!ids.length) return [];
      const records = await this.searchAll<Fields>('Media', {
        class: params.class ?? this.listingClass,
        query: [`(L_ListingID=${ids.join(',')})`, ...toList(params.query)],
        select: params.select,
      });
      return records.sort(
        (a, b) =>
          Number(a.L_ListingID) - Number(b.L_ListingID) || Number(a.MED_sequence ?? 0) - Number(b.MED_sequence ?? 0),
      );
    },

    /** Open houses for one listing. */
    openHouses: <Fields extends Record<string, unknown> = Record<string, unknown>>(
      listingId: string | number,
      params: Pick<ParagonSearchParams, 'class' | 'select'> = {},
    ) =>
      this.search<Fields>('OpenHouse', {
        class: params.class ?? this.listingClass,
        query: `(L_ListingID=${listingId})`,
        select: params.select,
      }),
  };

  readonly openHouses = {
    /** e.g. `{ query: '(OH_StartDateTime=2026-10-01T00:00:00Z+)' }`. `class` defaults to `listingClass`. */
    search: <Fields extends Record<string, unknown> = Record<string, unknown>>(params: ParagonSearchParams = {}) =>
      this.search<Fields>('OpenHouse', {
        ...params,
        class: params.class ?? this.listingClass,
        query: toQuery(params.query, '(OH_OpenHouseID=0+)'),
      }),
  };

  /** Active agents (`ActiveAgent` resource). Agent photos aren't in the Media resource — Paragon serves them via GetObject. */
  readonly agents = {
    search: <Fields extends Record<string, unknown> = Record<string, unknown>>(params: ParagonSearchParams = {}) =>
      this.search<Fields>('ActiveAgent', {
        ...params,
        class: params.class ?? 'ActiveAgent',
        query: toQuery(params.query, '(U_AgentID=0+)'),
      }),

    get: async <Fields extends Record<string, unknown> = Record<string, unknown>>(agentId: string | number) => {
      const page = await this.agents.search<Fields>({ query: `(U_AgentID=${agentId})`, limit: 1 });
      if (!page.results[0]) throw new ParagonApiError(`No active agent with U_AgentID ${agentId}.`, { status: 404 });
      return page.results[0];
    },
  };

  /** Active offices (`ActiveOffice` resource). */
  readonly offices = {
    search: <Fields extends Record<string, unknown> = Record<string, unknown>>(params: ParagonSearchParams = {}) =>
      this.search<Fields>('ActiveOffice', {
        ...params,
        class: params.class ?? 'ActiveOffice',
        query: toQuery(params.query, '(O_OfficeID=0+)'),
      }),

    get: async <Fields extends Record<string, unknown> = Record<string, unknown>>(officeId: string | number) => {
      const page = await this.offices.search<Fields>({ query: `(O_OfficeID=${officeId})`, limit: 1 });
      if (!page.results[0]) throw new ParagonApiError(`No active office with O_OfficeID ${officeId}.`, { status: 404 });
      return page.results[0];
    },
  };

  /**
   * Spark-shaped adapter over `property`, so a `ParagonClient` satisfies
   * `SparkListingsClient` and plugs into `SparkProvider`/`createSparkPlugin`,
   * `useSparkListings`/`useSparkListing`, and `ListingCard`/`ListingGrid`
   * unchanged. Each record becomes `{ Id: L_ListingID, StandardFields }`,
   * where `StandardFields` holds the raw Paragon fields plus the `fieldMap`
   * aliases and a composed `UnparsedAddress`. `limit`/`page` become RETS
   * `Limit`/`Offset`; `pagination` comes from RETS `Count`.
   *
   * `filter` is raw DMQL2 (`(L_StatusCatID=1)`), not Spark syntax, and
   * applies to `listingClass` only (override per call with
   * `extra: { Class: 'LT_2' }`). `orderBy` is ignored — Paragon RETS doesn't
   * sort. `expand: 'Photos'` attaches `StandardFields.Photos` using one extra
   * Media query for the whole page.
   */
  readonly listings = {
    search: async <Fields extends Record<string, unknown> = ParagonListingFields>(
      params: SparkListParams = {},
    ): Promise<SparkPage<Fields>> => {
      const { Class, ...extra } = params.extra ?? {};
      const cls = typeof Class === 'string' ? Class : this.listingClass;
      const pageSize = params.limit ?? DEFAULT_PAGE_SIZE;
      const currentPage = Math.max(params.page ?? 1, 1);

      const page = await this.property.search({
        class: cls,
        query: params.filter,
        select: this.withAliasSources(params.select),
        limit: pageSize,
        offset: (currentPage - 1) * pageSize + 1,
        extra,
      });
      const photos = toList(params.expand).includes('Photos')
        ? await this.photosFor(page.results.map((r) => r.L_ListingID as number), cls)
        : undefined;

      return {
        results: page.results.map((record) => this.toSparkResource<Fields>(record, photos)),
        pagination:
          page.count === undefined
            ? undefined
            : { currentPage, totalPages: Math.ceil(page.count / pageSize), totalRows: page.count },
        requestId: undefined,
      };
    },

    get: async <Fields extends Record<string, unknown> = ParagonListingFields>(
      id: string,
      params?: Pick<SparkListParams, 'select' | 'expand'>,
    ): Promise<SparkResource<Fields>> => {
      const { class: cls, ...record } = await this.property.get(id, { select: this.withAliasSources(params?.select) });
      const photos = toList(params?.expand).includes('Photos')
        ? await this.photosFor([record.L_ListingID as number], cls)
        : undefined;
      return this.toSparkResource<Fields>(record, photos);
    },
  };

  /** A narrowed `select` must still include the key and every column the aliases/address read. */
  private withAliasSources(select: string | string[] | undefined): string[] | undefined {
    if (select === undefined) return undefined;
    const needed = ['L_ListingID', 'L_Address', 'L_City', 'L_State', 'L_Zip', 'L_IdxInclude', ...Object.values(this.fieldMap)];
    return [...new Set([...toList(select), ...needed.filter((f): f is string => !!f)])];
  }

  private async photosFor(ids: number[], cls: string): Promise<Map<number, ParagonPhoto[]>> {
    const byListing = new Map<number, ParagonPhoto[]>();
    const media = await this.property.media(ids, {
      class: cls,
      select: ['L_ListingID', 'MED_listing_media_id', 'MED_listing_media_type_id', 'MED_sequence', 'MED_media_url', 'MED_caption', 'MED_width', 'MED_height'],
    });
    for (const m of media) {
      if (!m.MED_media_url || (m.MED_listing_media_type_id && m.MED_listing_media_type_id !== 'Image')) continue;
      const list = byListing.get(m.L_ListingID as number) ?? [];
      list.push({
        Id: String(m.MED_listing_media_id),
        Uri: m.MED_media_url as string,
        Order: Number(m.MED_sequence ?? list.length),
        Caption: m.MED_caption as string | undefined,
        Width: m.MED_width as number | undefined,
        Height: m.MED_height as number | undefined,
      });
      byListing.set(m.L_ListingID as number, list);
    }
    return byListing;
  }

  private toSparkResource<Fields extends Record<string, unknown>>(
    record: Record<string, unknown>,
    photos?: Map<number, ParagonPhoto[]>,
  ): SparkResource<Fields> {
    const fields: Record<string, unknown> = { ...record };
    for (const [alias, source] of Object.entries(this.fieldMap)) {
      if (source && record[source] !== undefined) fields[alias] = record[source];
    }

    // IDX rules: "Yes Without Address" listings may be shown, but not their street address.
    const cityLine = [record.L_City, [record.L_State, record.L_Zip].filter(Boolean).join(' ')].filter(Boolean).join(', ');
    const street = record.L_IdxInclude === 'Yes Without Address' ? undefined : record.L_Address;
    const address = [street, cityLine].filter(Boolean).join(', ');
    if (address) fields.UnparsedAddress = address;
    if (street === undefined) {
      for (const key of Object.keys(fields)) {
        if (ADDRESS_FIELDS.has(key) || key.startsWith('LMD_MP_')) delete fields[key];
      }
    }

    if (photos) fields.Photos = photos.get(record.L_ListingID as number) ?? [];
    return { Id: String(record.L_ListingID ?? ''), StandardFields: fields as Fields };
  }
}
