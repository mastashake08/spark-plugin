import { type App, type InjectionKey, inject, provide, ref, shallowRef, watchEffect } from 'vue';
import { SparkClient, type SparkClientOptions } from '../core/client.js';
import { SparkApiError } from '../core/errors.js';
import type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';

const SPARK_CLIENT_KEY: InjectionKey<SparkClient> = Symbol('spark-client');

/** Vue plugin: `app.use(createSparkPlugin({ accessToken, userAgent }))` makes the client available to every component via `useSparkClient()`. */
export function createSparkPlugin(options: SparkClientOptions | SparkClient) {
  const client = options instanceof SparkClient ? options : new SparkClient(options);
  return {
    install(app: App) {
      app.provide(SPARK_CLIENT_KEY, client);
    },
  };
}

/** Reads the `SparkClient` provided by `createSparkPlugin`, or pass one explicitly to bypass injection. */
export function useSparkClient(client?: SparkClient): SparkClient {
  const injected = client ?? inject(SPARK_CLIENT_KEY, null);
  if (!injected) {
    throw new Error('No SparkClient found. Install it with app.use(createSparkPlugin(...)) or pass one explicitly.');
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
  client?: SparkClient,
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
  client?: SparkClient,
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

export { SparkClient, SparkApiError };
export type { SparkClientOptions } from '../core/client.js';
export type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';
