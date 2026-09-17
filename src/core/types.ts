/** Raw envelope every Spark Platform API response is wrapped in. */
export interface SparkEnvelope<T> {
  D: {
    Success: boolean;
    Message?: string;
    Code?: string;
    Errors?: Array<{ Message?: string; Code?: string; Field?: string }>;
    Results?: T;
    Pagination?: SparkPagination;
    RequestId?: string;
  };
}

export interface SparkPagination {
  currentPage: number;
  totalPages: number;
  totalRows: number;
}

/** One record as returned inside `D.Results`. */
export interface SparkResource<Fields extends Record<string, unknown> = Record<string, unknown>> {
  Id: string;
  ResourceUri?: string;
  StandardFields: Fields;
  NonStandardFields?: Record<string, unknown>;
}

/** A page of resources plus the pagination info Spark reported for it. */
export interface SparkPage<Fields extends Record<string, unknown> = Record<string, unknown>> {
  results: Array<SparkResource<Fields>>;
  pagination: SparkPagination | undefined;
  requestId: string | undefined;
}

/**
 * Some Spark resources (media/photos, unlike listings) return fields flat on
 * the record instead of nested under `StandardFields`.
 */
export type SparkFlatResource<Fields extends Record<string, unknown> = Record<string, unknown>> = Fields & {
  Id: string;
  ResourceUri?: string;
};

export interface SparkFlatPage<Fields extends Record<string, unknown> = Record<string, unknown>> {
  results: Array<SparkFlatResource<Fields>>;
  pagination: SparkPagination | undefined;
  requestId: string | undefined;
}

/**
 * Query parameters shared by Spark's list endpoints. `filter` accepts a raw
 * OData-style expression (e.g. `StandardStatus Eq 'Active'`) or an array of
 * clauses that are joined with `And`.
 */
export interface SparkListParams {
  filter?: string | string[];
  select?: string | string[];
  expand?: string | string[];
  orderBy?: string;
  limit?: number;
  page?: number;
  /** Extra `_`-prefixed query params not otherwise modeled, e.g. `{ range: 'ListPrice 250000-500000' }`. */
  extra?: Record<string, string | number | boolean | undefined>;
}

/** Minimal, commonly-used RESO fields for a Spark listing. Extend/override via the generic param on client methods. */
export interface SparkListingFields extends Record<string, unknown> {
  ListingId?: string;
  ListingKey?: string;
  StandardStatus?: string;
  ListPrice?: number;
  City?: string;
  StateOrProvince?: string;
  PostalCode?: string;
  UnparsedAddress?: string;
  BedroomsTotal?: number;
  BathroomsTotalInteger?: number;
  LivingArea?: number;
  PhotoCount?: number;
  ModificationTimestamp?: string;
}

/** Fields on a Spark media/photo record. Unlike listings, these come back flat (see `SparkFlatResource`). */
export interface SparkMediaFields extends Record<string, unknown> {
  Name?: string;
  Caption?: string;
  Primary?: boolean;
  Privacy?: string;
  CurrentPrivacy?: string;
  UriThumb?: string;
  Uri300?: string;
  Uri640?: string;
  Uri800?: string;
  Uri1024?: string;
  Uri1280?: string;
  Uri1600?: string;
  Uri2048?: string;
  UriLarge?: string;
}

/**
 * Fields on a Spark account record — agents and offices are both `/accounts`
 * entries distinguished by `UserType` ('Member' for agents, 'Office' for
 * offices). Fields come back flat, like media.
 */
export interface SparkAccountFields extends Record<string, unknown> {
  UserType?: string;
  UserLevel?: string;
  Active?: boolean;
  Name?: string;
  FirstName?: string;
  LastName?: string;
  MarketingName?: string;
  Office?: string;
  OfficeId?: string;
  Company?: string;
  CompanyId?: string;
  Mls?: string;
  MlsId?: string;
  LicenseNumber?: string;
  Phones?: Array<{ Id?: string; Type?: string; Number?: string; Primary?: boolean }>;
  Emails?: Array<{ Id?: string; Name?: string; Type?: string; Address?: string; Primary?: boolean }>;
  ModificationTimestamp?: string;
}

/** Fields on a Spark open house record. Listing-scoped (`/listings/{id}/openhouses`); fields come back flat. */
export interface SparkOpenHouseFields extends Record<string, unknown> {
  Date?: string;
  StartTime?: string;
  EndTime?: string;
  Comments?: string;
  OpenHouseStartTimestamp?: string;
  OpenHouseEndTimestamp?: string;
  Livestream?: boolean;
  LivestreamUri?: string;
}
