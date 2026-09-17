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

export interface SparkMediaFields extends Record<string, unknown> {
  Uri300?: string;
  Uri640?: string;
  Uri800?: string;
  Uri1024?: string;
  UriLarge?: string;
  UriThumb?: string;
  Caption?: string;
  Primary?: boolean;
  Order?: number;
}
