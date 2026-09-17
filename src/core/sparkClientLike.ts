import type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from './types.js';

/**
 * The minimal shape `useSparkListings`/`useSparkListing`/`SparkProvider`/
 * `createSparkPlugin` actually need. Both `SparkClient` (talks to Spark
 * directly, server-only) and `SparkProxyClient` (talks to your own backend,
 * browser-safe) satisfy this — pass whichever is appropriate for where your
 * code runs.
 */
export interface SparkListingsClient {
  listings: {
    search<Fields extends Record<string, unknown> = SparkListingFields>(
      params?: SparkListParams,
    ): Promise<SparkPage<Fields>>;
    get<Fields extends Record<string, unknown> = SparkListingFields>(
      id: string,
      params?: Pick<SparkListParams, 'select' | 'expand'>,
    ): Promise<SparkResource<Fields>>;
  };
}
