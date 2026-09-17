import { createElement, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ListingGrid } from 'spark-mls-client/react';

const cardClassNames = {
  root: 'listing-card',
  photoPlaceholder: 'listing-card__photo-placeholder',
  price: 'listing-card__price',
  address: 'listing-card__address',
  meta: 'listing-card__meta',
  status: 'listing-card__status',
};

// Fetches from this dev server's own /api/listings route (see vite.config.ts),
// never from Spark directly — the access token stays server-side. This is the
// same shape a real app's data-fetching would take (an internal API route, a
// server component, etc.) feeding an already-fetched page into ListingGrid.
function useListings() {
  const [data, setData] = useState();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState();

  useEffect(() => {
    fetch('/api/listings')
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed with status ${res.status}`);
        return body;
      })
      .then(setData)
      .catch(setError)
      .finally(() => setLoading(false));
  }, []);

  return { data, loading, error };
}

function App() {
  const { data, loading, error } = useListings();

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

createRoot(document.getElementById('root')).render(createElement(App));
