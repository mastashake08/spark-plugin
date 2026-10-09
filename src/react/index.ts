import { createContext, createElement, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { SparkClient, type SparkClientOptions } from '../core/client.js';
import { SparkProxyClient, type SparkProxyClientOptions } from '../core/proxyClient.js';
import { ParagonClient, type ParagonClientOptions } from '../core/paragonClient.js';
import type { SparkListingsClient } from '../core/sparkClientLike.js';
import { SparkApiError, ParagonApiError } from '../core/errors.js';
import type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';

/** Anything `SparkProvider`/`createSparkPlugin` accept: a built client, or options for one of the three built-in clients. */
type SparkListingsClientInput = SparkListingsClient | SparkClientOptions | SparkProxyClientOptions | ParagonClientOptions;

const SparkContext = createContext<SparkListingsClient | null>(null);

export interface SparkProviderProps {
  /**
   * A `SparkClient` (server-only — never render this in browser-shipped
   * code) or a `SparkProxyClient` (browser-safe, points at your own
   * backend). Plain options objects are also accepted and constructed for
   * you, distinguished by shape: `{ loginUrl, username, password }` builds a
   * `ParagonClient` (server-only, like `SparkClient`), `{ accessToken, ... }`
   * builds a `SparkClient`, `{ baseUrl, ... }` builds a `SparkProxyClient`.
   */
  client: SparkListingsClientInput;
  children?: ReactNode;
}

function resolveClient(client: SparkListingsClientInput): SparkListingsClient {
  if (client instanceof SparkClient || client instanceof SparkProxyClient || client instanceof ParagonClient) return client;
  if ('listings' in client) return client;
  if ('loginUrl' in client) return new ParagonClient(client);
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
export type { ListingCardPart, ListingCardVisibility } from '../core/format.js';

export { SparkClient, SparkProxyClient, ParagonClient, SparkApiError, ParagonApiError };
export type { ParagonClientOptions } from '../core/paragonClient.js';
export type { ParagonSearchParams, ParagonPage, ParagonListingFields, ParagonRecord, ParagonFieldMap } from '../core/paragonTypes.js';
export { PARAGON_CORE_FIELD_MAP, PARAGON_KMA_FIELD_MAP } from '../core/paragonClient.js';
export type { SparkClientOptions } from '../core/client.js';
export type { SparkProxyClientOptions } from '../core/proxyClient.js';
export type { SparkListingsClient } from '../core/sparkClientLike.js';
export type { SparkListParams, SparkListingFields, SparkPage, SparkResource } from '../core/types.js';
