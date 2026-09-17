import { SparkProxyClient, renderListingGrid } from 'spark-mls-client/vanilla';

const root = document.getElementById('app');

try {
  // Browser-safe: points at your backend's Spark proxy API (e.g. a running
  // spark-api-micro instance), which holds the real access token server-side.
  const client = new SparkProxyClient({ baseUrl: import.meta.env.VITE_SPARK_API_BASE_URL });

  const { results } = await client.listings.search({
    filter: "StandardStatus Eq 'Active'",
    limit: 12,
  });

  root.replaceChildren(
    renderListingGrid(results, {
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
