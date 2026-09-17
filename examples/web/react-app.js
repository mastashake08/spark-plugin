import { createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { SparkProvider, useSparkListings, ListingGrid } from 'spark-mls-client/react';

const cardClassNames = {
  root: 'listing-card',
  photoPlaceholder: 'listing-card__photo-placeholder',
  price: 'listing-card__price',
  address: 'listing-card__address',
  meta: 'listing-card__meta',
  status: 'listing-card__status',
};

// { baseUrl } builds a browser-safe SparkProxyClient (see SparkProvider's
// resolveClient) pointed at your backend's Spark proxy API — e.g. a running
// spark-api-micro instance. It holds the real access token server-side; this
// app never sees it.
function Results() {
  const { data, loading, error } = useSparkListings({
    filter: "StandardStatus Eq 'Active'",
    limit: 12,
  });

  return createElement(ListingGrid, {
    listings: data?.results ?? [],
    loading,
    error,
    classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
    cardProps: { classNames: cardClassNames },
    loadingContent: createElement('p', null, 'Loading listings…'),
    errorContent: (err) => createElement('p', { className: 'error' }, err.message),
    emptyContent: createElement('p', null, 'No listings found.'),
  });
}

createRoot(document.getElementById('root')).render(
  createElement(SparkProvider, { client: { baseUrl: import.meta.env.VITE_SPARK_API_BASE_URL } }, createElement(Results)),
);
