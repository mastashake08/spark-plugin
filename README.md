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

**This is not optional.** Spark's own docs state: *"Never provide your `access_token`, `refresh_token` or
`client_secret` to a web browser or other end-user agent."* The API also has no CORS support, so a direct
browser → Spark request fails outright regardless. `SparkClient` and `client.request(...)` are meant to run somewhere
the token is safe — a Node backend, an edge function, SSR, React Server Components, etc.

For anything browser-rendered, use **`SparkProxyClient`** instead — same resource shape (`listings`, `accounts`,
`agents`, `offices`), but it points at *your own backend* (via `baseUrl`) instead of Spark directly, and never
touches the token:

```ts
import { SparkProxyClient } from 'spark-mls-client';

const client = new SparkProxyClient({ baseUrl: 'https://api.yourbrokerage.com/api' });
const { results } = await client.listings.search({ filter: "StandardStatus Eq 'Active'", limit: 25 });
```

Your backend (a small proxy holding the real `SparkClient` + token — e.g. a Laravel app exposing `/api/listings`
etc., or any backend built the same way) is what actually calls Spark and returns plain JSON.
`useSparkListings`/`useSparkClient`/`SparkProvider`/`createSparkPlugin`
(Vue/React) accept either client — pass `{ accessToken, ... }` for a server-only `SparkClient` or `{ baseUrl, ... }`
for a browser-safe `SparkProxyClient` — see [Web examples](#web-examples) below for a full working setup.

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

The snippets below (Vue 3, React, and the `useSparkListings`/`SparkProvider` examples in "Listing components") call
Spark directly and are written for brevity — they only work somewhere the token is safe to hold (SSR, an API route, a
React Server Component). For an actual client-rendered browser page, skip straight to
[Web examples](#web-examples), which shows the real pattern: your backend calls Spark, the browser calls your
backend.

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

## Web examples

`examples/web/` has runnable browser demos of `ListingGrid` in React, Vue, and vanilla JS — same component API, same
data, three frameworks, side by side:

```
npm run example:web
```

Opens a dev server at `http://localhost:5173` with links to each demo. This is also the reference implementation of
the proxy pattern from the [Auth](#auth) section: `vite.config.ts` adds a same-origin `/api/listings` route that
holds your `SparkClient`/token server-side (read from `.env`, see `.env.example`) and returns plain JSON; each
example page just does `fetch('/api/listings')` and passes the result into `ListingGrid` — it never touches
`SparkClient` or the token at all. Copy that split (an API route backed by `SparkClient`, a frontend that only
`fetch`es your own route) into your actual app.

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
