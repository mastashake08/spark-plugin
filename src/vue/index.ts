import { type App, type InjectionKey, inject, provide, ref, shallowRef, watchEffect } from 'vue';
import { SparkClient, type SparkClientOptions } from '../core/client.js';
import { SparkProxyClient, type SparkProxyClientOptions } from '../core/proxyClient.js';
import { ParagonClient, type ParagonClientOptions } from '../core/paragonClient.js';
import type { SparkListingsClient } from '../core/sparkClientLike.js';
import { SparkApiError, ParagonApiError } from '../core/errors.js';
import type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';

/** Anything `SparkProvider`/`createSparkPlugin` accept: a built client, or options for one of the three built-in clients. */
type SparkListingsClientInput = SparkListingsClient | SparkClientOptions | SparkProxyClientOptions | ParagonClientOptions;

const SPARK_CLIENT_KEY: InjectionKey<SparkListingsClient> = Symbol('spark-client');

function resolveClient(options: SparkListingsClientInput): SparkListingsClient {
  if (options instanceof SparkClient || options instanceof SparkProxyClient || options instanceof ParagonClient) return options;
  if ('listings' in options) return options;
  if ('loginUrl' in options) return new ParagonClient(options);
  return 'accessToken' in options ? new SparkClient(options) : new SparkProxyClient(options);
}

/**
 * Vue plugin: `app.use(createSparkPlugin({ accessToken, ... }))` makes the
 * client available to every component via `useSparkClient()`. Pass
 * `{ accessToken, ... }` (server-only — never render this in browser-shipped
 * code), `{ loginUrl, username, password }` for a `ParagonClient` (also
 * server-only), `{ baseUrl, ... }` for a browser-safe `SparkProxyClient`
 * pointed at your own backend, or an already-constructed client instance.
 */
export function createSparkPlugin(options: SparkListingsClientInput) {
  const client = resolveClient(options);
  return {
    install(app: App) {
      app.provide(SPARK_CLIENT_KEY, client);
    },
  };
}

/** Reads the client provided by `createSparkPlugin`, or pass one explicitly to bypass injection. */
export function useSparkClient(client?: SparkListingsClient): SparkListingsClient {
  const injected = client ?? inject(SPARK_CLIENT_KEY, null);
  if (!injected) {
    throw new Error('No Spark client found. Install it with app.use(createSparkPlugin(...)) or pass one explicitly.');
  }
  return injected;
}

export interface UseSparkQueryState<T> {
  data: ReturnType<typeof shallowRef<T | undefined>>;
  loading: ReturnType<typeof ref<boolean>>;
  error: ReturnType<typeof shallowRef<SparkApiError | Error | undefined>>;
  refresh: () => Promise<void>;
}

/** Reactive listing search: re-runs whenever `params` (a ref, getter, or plain object) changes. */
export function useSparkListings<Fields extends Record<string, unknown> = SparkListingFields>(
  params: SparkListParams | (() => SparkListParams) = {},
  client?: SparkListingsClient,
): UseSparkQueryState<SparkPage<Fields>> {
  const sparkClient = useSparkClient(client);
  const data = shallowRef<SparkPage<Fields>>();
  const loading = ref(false);
  const error = shallowRef<SparkApiError | Error>();

  const resolveParams = () => (typeof params === 'function' ? params() : params);

  const run = async () => {
    loading.value = true;
    error.value = undefined;
    try {
      data.value = await sparkClient.listings.search<Fields>(resolveParams());
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      loading.value = false;
    }
  };

  watchEffect(() => {
    resolveParams();
    void run();
  });

  return { data, loading, error, refresh: run };
}

/** Reactive single-listing lookup by id. */
export function useSparkListing<Fields extends Record<string, unknown> = SparkListingFields>(
  id: string | (() => string),
  client?: SparkListingsClient,
): UseSparkQueryState<SparkResource<Fields>> {
  const sparkClient = useSparkClient(client);
  const data = shallowRef<SparkResource<Fields>>();
  const loading = ref(false);
  const error = shallowRef<SparkApiError | Error>();

  const resolveId = () => (typeof id === 'function' ? id() : id);

  const run = async () => {
    loading.value = true;
    error.value = undefined;
    try {
      data.value = await sparkClient.listings.get<Fields>(resolveId());
    } catch (err) {
      error.value = err instanceof Error ? err : new Error(String(err));
    } finally {
      loading.value = false;
    }
  };

  watchEffect(() => {
    resolveId();
    void run();
  });

  return { data, loading, error, refresh: run };
}

export { ListingCard } from './ListingCard.js';
export { ListingGrid } from './ListingGrid.js';
export type { ListingCardPart, ListingCardVisibility } from '../core/format.js';

export { SparkClient, SparkProxyClient, ParagonClient, SparkApiError, ParagonApiError };
export type { ParagonClientOptions } from '../core/paragonClient.js';
export type { ParagonSearchParams, ParagonPage, ParagonListingFields, ParagonRecord, ParagonFieldMap } from '../core/paragonTypes.js';
export { PARAGON_CORE_FIELD_MAP, PARAGON_KMA_FIELD_MAP } from '../core/paragonClient.js';
export type { SparkClientOptions } from '../core/client.js';
export type { SparkProxyClientOptions } from '../core/proxyClient.js';
export type { SparkListingsClient } from '../core/sparkClientLike.js';
export type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';
