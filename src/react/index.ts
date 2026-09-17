import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SparkClient, type SparkClientOptions } from '../core/client.js';
import { SparkProxyClient, type SparkProxyClientOptions } from '../core/proxyClient.js';
import type { SparkListingsClient } from '../core/sparkClientLike.js';
import { SparkApiError } from '../core/errors.js';
import type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';

const SparkContext = createContext<SparkListingsClient | null>(null);

export interface SparkProviderProps {
  /**
   * A `SparkClient` (server-only — never render this in browser-shipped
   * code) or a `SparkProxyClient` (browser-safe, points at your own
   * backend). Plain options objects are also accepted and constructed for
   * you, distinguished by shape: `{ accessToken, ... }` builds a
   * `SparkClient`, `{ baseUrl, ... }` builds a `SparkProxyClient`.
   */
  client: SparkListingsClient | SparkClientOptions | SparkProxyClientOptions;
  children?: ReactNode;
}

function resolveClient(client: SparkListingsClient | SparkClientOptions | SparkProxyClientOptions): SparkListingsClient {
  if (client instanceof SparkClient || client instanceof SparkProxyClient) return client;
  if ('listings' in client) return client;
  return 'accessToken' in client ? new SparkClient(client) : new SparkProxyClient(client);
}

/** Wrap your app so `useSparkClient`/`useSparkListings`/`useSparkListing` can find the client. */
export function SparkProvider({ client, children }: SparkProviderProps) {
  const instance = useMemo(() => resolveClient(client), [client]);
  return createElement(SparkContext.Provider, { value: instance }, children);
}

/** Reads the client from context, or pass one explicitly to bypass it. */
export function useSparkClient(client?: SparkListingsClient): SparkListingsClient {
  const contextClient = useContext(SparkContext);
  const resolved = client ?? contextClient;
  if (!resolved) {
    throw new Error('No Spark client found. Wrap your app in <SparkProvider> or pass a client explicitly.');
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
  client?: SparkListingsClient,
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
  client?: SparkListingsClient,
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

export { ListingCard, type ListingCardProps } from './ListingCard.js';
export { ListingGrid, type ListingGridProps } from './ListingGrid.js';
export type { ListingCardPart } from '../core/format.js';

export { SparkClient, SparkProxyClient, SparkApiError };
export type { SparkClientOptions } from '../core/client.js';
export type { SparkProxyClientOptions } from '../core/proxyClient.js';
export type { SparkListingsClient } from '../core/sparkClientLike.js';
export type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';
