import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SparkClient, type SparkClientOptions } from '../core/client.js';
import { SparkApiError } from '../core/errors.js';
import type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';

const SparkContext = createContext<SparkClient | null>(null);

export interface SparkProviderProps {
  client: SparkClient | SparkClientOptions;
  children?: ReactNode;
}

/** Wrap your app so `useSparkClient`/`useSparkListings`/`useSparkListing` can find the client. */
export function SparkProvider({ client, children }: SparkProviderProps) {
  const instance = useMemo(() => (client instanceof SparkClient ? client : new SparkClient(client)), [client]);
  return createElement(SparkContext.Provider, { value: instance }, children);
}

/** Reads the `SparkClient` from context, or pass one explicitly to bypass it. */
export function useSparkClient(client?: SparkClient): SparkClient {
  const contextClient = useContext(SparkContext);
  const resolved = client ?? contextClient;
  if (!resolved) {
    throw new Error('No SparkClient found. Wrap your app in <SparkProvider> or pass a client explicitly.');
  }
  return resolved;
}

export interface UseSparkQueryResult<T> {
  data: T | undefined;
  loading: boolean;
  error: SparkApiError | Error | undefined;
  refresh: () => void;
}

/** Fetches a listing search on mount and whenever `params` changes (compared by value). */
export function useSparkListings<Fields extends Record<string, unknown> = SparkListingFields>(
  params: SparkListParams = {},
  client?: SparkClient,
): UseSparkQueryResult<SparkPage<Fields>> {
  const sparkClient = useSparkClient(client);
  const [data, setData] = useState<SparkPage<Fields>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SparkApiError | Error>();
  const [tick, setTick] = useState(0);
  const paramsKey = JSON.stringify(params);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    sparkClient.listings
      .search<Fields>(JSON.parse(paramsKey))
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sparkClient, paramsKey, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

/** Fetches a single listing by id on mount and whenever `id` changes. */
export function useSparkListing<Fields extends Record<string, unknown> = SparkListingFields>(
  id: string,
  client?: SparkClient,
): UseSparkQueryResult<SparkResource<Fields>> {
  const sparkClient = useSparkClient(client);
  const [data, setData] = useState<SparkResource<Fields>>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<SparkApiError | Error>();
  const [tick, setTick] = useState(0);
  const idRef = useRef(id);
  idRef.current = id;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(undefined);

    sparkClient.listings
      .get<Fields>(idRef.current)
      .then((result) => {
        if (!cancelled) setData(result);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [sparkClient, id, tick]);

  return { data, loading, error, refresh: () => setTick((t) => t + 1) };
}

export { SparkClient, SparkApiError };
export type { SparkClientOptions } from '../core/client.js';
export type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';
