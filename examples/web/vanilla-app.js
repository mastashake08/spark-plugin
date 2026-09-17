import { renderListingGrid } from 'spark-mls-client/vanilla';

// Fetches from this dev server's own /api/listings route (see vite.config.ts),
// never from Spark directly — the access token stays server-side.
const root = document.getElementById('app');

try {
  const res = await fetch('/api/listings');
  const body = await res.json();
  if (!res.ok) throw new Error(body.error ?? `Request failed with status ${res.status}`);

  root.replaceChildren(
    renderListingGrid(body.results, {
      classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
      cardOptions: {
        classNames: {
          root: 'listing-card',
          photoPlaceholder: 'listing-card__photo-placeholder',
          price: 'listing-card__price',
          address: 'listing-card__address',
          meta: 'listing-card__meta',
          status: 'listing-card__status',
        },
      },
      emptyContent: 'No listings found.',
    }),
  );
} catch (err) {
  root.textContent = `Error: ${err.message}`;
  root.className = 'error';
}
