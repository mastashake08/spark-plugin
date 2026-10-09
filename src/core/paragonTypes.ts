/**
 * Paragon RETS (ICE, formerly Black Knight) serves RETS 1.8 — XML, not JSON.
 * Searches come back in COMPACT-DECODED format: a tab-delimited `<COLUMNS>`
 * row plus one `<DATA>` row per record, with lookup codes already decoded to
 * their display values (e.g. `L_Status: 'Active'`). `ParagonClient` parses
 * that into flat records keyed by Paragon *system* names (`L_ListingID`,
 * `L_AskingPrice`, `LM_Int1_6`, ...), with numeric fields converted to numbers
 * using the server's table metadata and empty values left out.
 */
export type ParagonRecord<Fields extends Record<string, unknown> = Record<string, unknown>> = Fields;

export interface ParagonPage<Fields extends Record<string, unknown> = Record<string, unknown>> {
  results: Array<ParagonRecord<Fields>>;
  /** Total matching records (Paragon always returns this, since the client sends `Count=1`). */
  count: number | undefined;
  /** True when the server cut the result set short (`<MAXROWS/>`) — fetch the next page with a higher `offset`. */
  maxRows: boolean;
}

/**
 * Parameters for a RETS Search transaction.
 *
 * `query` is raw DMQL2, e.g. `(L_StatusCatID=1)` or `(L_AskingPrice=200000-300000)`.
 * An array is joined with `,` (AND). Lookup fields are queried by their
 * lookup *value* (`L_StatusCatID=1` for Active), not the decoded display text.
 * DateTimes are UTC: `(L_UpdateDate=2026-10-01T00:00:00Z+)`.
 */
export interface ParagonSearchParams {
  /** RETS Class, e.g. `RF_1` (Residential/Farm). Defaults depend on the method. */
  class?: string;
  query?: string | string[];
  select?: string | string[];
  /** Max rows to return. Paragon also enforces a per-user server-side cap (signalled via `maxRows`). */
  limit?: number;
  /** 1-based index of the first record to return (RETS `Offset`). */
  offset?: number;
  /** Other RETS Search parameters passed through verbatim. */
  extra?: Record<string, string | number | boolean | undefined>;
}

/** One row of a RETS metadata table (e.g. `METADATA-TABLE`), keyed by its `<COLUMNS>` names. */
export type ParagonMetadataRow = Record<string, string>;

/** A listing photo, as attached to `StandardFields.Photos` by `listings.search/get({ expand: 'Photos' })`. */
export interface ParagonPhoto {
  Id: string;
  Uri: string;
  Order: number;
  Caption?: string;
  Width?: number;
  Height?: number;
}

/**
 * Maps the Spark/RESO-style names that `ListingCard`'s default formatting
 * reads (and that consumers commonly want) to Paragon system names. Used by
 * `client.listings` to add those aliases to `StandardFields` alongside the raw
 * Paragon fields. Paragon's `L_*` columns are the same on every Paragon MLS;
 * `LM_*` columns are MLS-specific, so the defaults don't include them — see
 * `PARAGON_KMA_FIELD_MAP`.
 */
export type ParagonFieldMap = Partial<Record<ParagonAliasField, string>>;

export type ParagonAliasField =
  | 'ListingId'
  | 'ListPrice'
  | 'StandardStatus'
  | 'StreetNumber'
  | 'StreetName'
  | 'City'
  | 'StateOrProvince'
  | 'PostalCode'
  | 'BedroomsTotal'
  | 'BathroomsTotalInteger'
  | 'BathroomsFull'
  | 'BathroomsHalf'
  | 'LivingArea'
  | 'YearBuilt'
  | 'PublicRemarks'
  | 'PropertyType'
  | 'PropertySubType'
  | 'CountyOrParish'
  | 'SubdivisionName'
  | 'LotSizeAcres'
  | 'PhotosCount'
  | 'Latitude'
  | 'Longitude'
  | 'ListAgentKey'
  | 'ListOfficeKey'
  | 'ListOfficeName'
  | 'ModificationTimestamp';

/** Commonly-used fields on a listing from `client.listings` (aliases plus a few raw Paragon names). Extend via the generic param. */
export interface ParagonListingFields extends Record<string, unknown> {
  ListingId?: string;
  ListPrice?: number;
  /** `"{street}, {city}, {state} {zip}"` — or just `"{city}, {state} {zip}"` when the listing's `L_IdxInclude` is "Yes Without Address". */
  UnparsedAddress?: string;
  StandardStatus?: string;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  YearBuilt?: number;
  PublicRemarks?: string;
  PhotosCount?: number;
  Latitude?: number;
  Longitude?: number;
  /** UTC, without a `Z` suffix (as Paragon sends it). */
  ModificationTimestamp?: string;
  /** Only present when requested with `expand: 'Photos'`. */
  Photos?: ParagonPhoto[];
  L_ListingID?: number;
  L_DisplayId?: string;
  L_IdxInclude?: string;
}
