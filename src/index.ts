export { SparkClient } from './core/client.js';
export type { SparkClientOptions } from './core/client.js';
export { SparkProxyClient } from './core/proxyClient.js';
export type { SparkProxyClientOptions } from './core/proxyClient.js';
export type { SparkListingsClient } from './core/sparkClientLike.js';
export { ParagonClient, PARAGON_CORE_FIELD_MAP, PARAGON_KMA_FIELD_MAP, parseCompact } from './core/paragonClient.js';
export type { ParagonClientOptions } from './core/paragonClient.js';
export { SparkApiError, ParagonApiError } from './core/errors.js';
export type { SparkApiErrorDetail } from './core/errors.js';
export type {
  SparkEnvelope,
  SparkPagination,
  SparkRawPagination,
  SparkResource,
  SparkPage,
  SparkFlatResource,
  SparkFlatPage,
  SparkListParams,
  SparkListingFields,
  SparkMediaFields,
  SparkAccountFields,
  SparkOpenHouseFields,
} from './core/types.js';
export type {
  ParagonRecord,
  ParagonPage,
  ParagonSearchParams,
  ParagonMetadataRow,
  ParagonPhoto,
  ParagonFieldMap,
  ParagonAliasField,
  ParagonListingFields,
} from './core/paragonTypes.js';
