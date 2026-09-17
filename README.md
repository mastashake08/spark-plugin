# spark-mls-client

A JavaScript/TypeScript client for the [Spark Platform](https://sparkplatform.com/) (Flexmls) MLS/IDX API, with a
framework-agnostic core plus optional Vue 3 and React bindings.

```
npm install spark-mls-client
```

## Auth

Spark's IDX use case authenticates with a **Server Access Token** (from Settings → My Developer Account in your
Spark Platform developer account) sent as a `Bearer` token on every request — no OAuth handshake needed. Spark also
requires a `X-SparkApi-User-Agent` header identifying your application.

Never ship your access token in client-side bundles for a public site — call the Spark API from your own backend (or
an edge function) and proxy results to the browser, unless the token is scoped for public/read-only IDX display per
your MLS's data-sharing agreement.

## Vanilla JavaScript / TypeScript

```ts
import { SparkClient } from 'spark-mls-client';

const client = new SparkClient({
  accessToken: process.env.SPARK_ACCESS_TOKEN!,
  userAgent: 'YourBrokerage IDX/1.0',
});

const { results, pagination } = await client.listings.search({
  filter: ["StandardStatus Eq 'Active'", 'City Eq \'Austin\''],
  orderBy: '-ListPrice',
  limit: 25,
  page: 1,
});

const listing = await client.listings.get(results[0].Id);
const photos = await client.listings.media(results[0].Id);
const openHouses = await client.listings.openHouses(results[0].Id);

const agents = await client.agents.search({ limit: 10 });
const offices = await client.offices.search({ limit: 10 });
```

Agents and offices are both `/accounts` records under the hood, distinguished by `UserType`. `client.agents`/
`client.offices` are filtered convenience wrappers — use `client.accounts.search(...)` directly for other user types.

Any Spark resource not explicitly wrapped (neighborhoods, saved searches, etc.) is reachable via the generic escape
hatch:

```ts
const neighborhoods = await client.request('neighborhoods', { query: { _limit: 25 } });
```

## Vue 3

```ts
// main.ts
import { createApp } from 'vue';
import { createSparkPlugin } from 'spark-mls-client/vue';
import App from './App.vue';

createApp(App)
  .use(createSparkPlugin({ accessToken: import.meta.env.VITE_SPARK_ACCESS_TOKEN, userAgent: 'YourBrokerage IDX/1.0' }))
  .mount('#app');
```

```vue
<!-- ListingSearch.vue -->
<script setup lang="ts">
import { ref } from 'vue';
import { useSparkListings } from 'spark-mls-client/vue';

const city = ref('Austin');
const { data, loading, error } = useSparkListings(() => ({
  filter: [`StandardStatus Eq 'Active'`, `City Eq '${city.value}'`],
  limit: 25,
}));
</script>

<template>
  <p v-if="loading">Loading…</p>
  <p v-else-if="error">{{ error.message }}</p>
  <ul v-else>
    <li v-for="listing in data?.results" :key="listing.Id">
      {{ listing.StandardFields.UnparsedAddress }} — ${{ listing.StandardFields.ListPrice }}
    </li>
  </ul>
</template>
```

## React

```tsx
// App.tsx
import { SparkProvider } from 'spark-mls-client/react';

export function App() {
  return (
    <SparkProvider client={{ accessToken: import.meta.env.VITE_SPARK_ACCESS_TOKEN, userAgent: 'YourBrokerage IDX/1.0' }}>
      <ListingSearch />
    </SparkProvider>
  );
}
```

```tsx
// ListingSearch.tsx
import { useSparkListings } from 'spark-mls-client/react';

export function ListingSearch() {
  const { data, loading, error } = useSparkListings({
    filter: ["StandardStatus Eq 'Active'", "City Eq 'Austin'"],
    limit: 25,
  });

  if (loading) return <p>Loading…</p>;
  if (error) return <p>{error.message}</p>;

  return (
    <ul>
      {data?.results.map((listing) => (
        <li key={listing.Id}>
          {listing.StandardFields.UnparsedAddress} — ${listing.StandardFields.ListPrice}
        </li>
      ))}
    </ul>
  );
}
```

## Listing components (optional)

Each entry point also ships a `ListingCard` and `ListingGrid` — unstyled by default. No CSS is included; you either
target the parts with your own classes/Tailwind, or theme it however you like. Every part (`root`, `photo`,
`photoPlaceholder`, `body`, `price`, `address`, `meta`, `status`) can be targeted independently via `classNames` (and
`styles` in Vue/React, for inline styles).

**React:**

```tsx
import { ListingCard, ListingGrid, useSparkListings } from 'spark-mls-client/react';

function Results() {
  const { data, loading, error } = useSparkListings({ filter: "StandardStatus Eq 'Active'", limit: 25 });

  return (
    <ListingGrid
      listings={data?.results ?? []}
      loading={loading}
      error={error}
      className="listing-grid"
      cardProps={{ classNames: { root: 'listing-card', price: 'listing-card__price' } }}
      loadingContent={<p>Loading…</p>}
      errorContent={(err) => <p>{err.message}</p>}
      emptyContent={<p>No listings found.</p>}
    />
  );
}
```

Or use `ListingCard` on its own, e.g. inside a listing detail page: `<ListingCard listing={listing} photoUrl={photos[0]?.Uri800} className="listing-card" />`.

**Vue:**

```vue
<script setup lang="ts">
import { ListingGrid } from 'spark-mls-client/vue';
import { useSparkListings } from 'spark-mls-client/vue';

const { data, loading, error } = useSparkListings({ filter: "StandardStatus Eq 'Active'", limit: 25 });
</script>

<template>
  <ListingGrid
    :listings="data?.results ?? []"
    :loading="loading"
    :error="error"
    class="listing-grid"
    :cardProps="{ classNames: { root: 'listing-card' } }"
  >
    <template #loading>Loading…</template>
    <template #empty>No listings found.</template>
  </ListingGrid>
</template>
```

**Vanilla JavaScript** (builds real DOM elements — `spark-mls-client/vanilla`):

```ts
import { SparkClient } from 'spark-mls-client';
import { renderListingGrid } from 'spark-mls-client/vanilla';

const client = new SparkClient({ accessToken, userAgent: 'YourBrokerage IDX/1.0' });
const { results } = await client.listings.search({ filter: "StandardStatus Eq 'Active'", limit: 25 });

const grid = renderListingGrid(results, {
  classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
  cardOptions: { classNames: { root: 'listing-card', price: 'listing-card__price' } },
  emptyContent: 'No listings found.',
});

document.getElementById('app')!.appendChild(grid);
```

## Typed fields

`StandardFields` defaults to a small, commonly-used subset (`SparkListingFields`). Pass your own field set as a
generic to get full typing for the RESO fields your MLS exposes:

```ts
interface MyFields extends SparkListingFields {
  ListOfficeName?: string;
  ListAgentFullName?: string;
}

const { results } = await client.listings.search<MyFields>({ limit: 10 });
results[0].StandardFields.ListOfficeName; // typed
```

## Development

```
npm install
npm run build      # emits dist/ (ESM + CJS + .d.ts) for the core, ./vue, ./react, and ./vanilla entry points
npm run typecheck
npm test           # runs dist/ against real SSR/DOM rendering (rebuilds first via pretest)
```

## License

MIT
