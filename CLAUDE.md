# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm install         # install dependencies
npm run build        # tsup: emits dist/ as ESM + CJS + .d.ts for all four entry points
npm run dev           # tsup --watch
npm run typecheck     # tsc --noEmit
npm test              # node --test; pretest rebuilds dist/ first — tests import from dist, not src
npm run example        # CLI example (examples/vanilla/run.mjs) against the real Spark API, reads .env
npm run example:web    # browser examples (examples/web/) via Vite; preexample:web rebuilds dist/ first
```

`tests/components.test.mjs` uses `jsdom` (vanilla DOM) and SSR (`react-dom/server`, `vue/server-renderer`) to render the `ListingCard`/`ListingGrid` components for real and assert on the output HTML — not just type-check. It caught a real bug once (Vue emitting stray `class=""`/`style=""` when a part had no override — fixed via `src/vue/utils.ts`'s `partProps`), so prefer extending it over adding assertions elsewhere when touching the component-rendering code.

Requires Node >= 18 (for global `fetch`). The dev machine may report an older Node in `node -v`; if `npm install`/`npm run build` warn with `EBADENGINE`, the commands still work but confirm the target Node version before assuming production behavior.

## Architecture

This is `spark-mls-client`, an npm package wrapping the Spark Platform (Flexmls) MLS/IDX API, published as a single package with four subpath entry points defined in `tsup.config.ts` and mirrored in `package.json#exports`:

- `spark-mls-client` → `src/index.ts` — framework-agnostic core (`SparkClient` + types), safe to import in Node (no DOM)
- `spark-mls-client/vue` → `src/vue/index.ts` — Vue 3 plugin, composables, `ListingCard`/`ListingGrid`
- `spark-mls-client/react` → `src/react/index.ts` — React context, hooks, `ListingCard`/`ListingGrid`
- `spark-mls-client/vanilla` → `src/vanilla/index.ts` — `renderListingCard`/`renderListingGrid` returning real `HTMLElement`s (browser-only; references `document`)

`vue` and `react` are `external` in `tsup.config.ts` and `peerDependencies` (both `optional: true` in `peerDependenciesMeta`) — a consumer only needs to install whichever framework they actually import. This is also why DOM-touching code lives under `vanilla/`, not the root entry — the root package must stay importable from a Node backend with no `document` global.

### Listing components (`ListingCard`/`ListingGrid`, all three UI entry points)

Unstyled by design — no CSS ships with the package. Each ships a `classNames` (and, in Vue/React, `styles`) prop keyed by the shared `ListingCardPart` union (`src/core/format.ts`: `root`, `photo`, `photoPlaceholder`, `body`, `price`, `address`, `meta`, `status`) so consumers target only the parts they want to style. Formatting (`defaultFormatPrice`/`defaultFormatAddress`/`defaultFormatMeta` in `src/core/format.ts`) is shared across all three implementations and overridable per-instance via `formatPrice`/`formatAddress`/`formatMeta` props — keep new formatting logic there rather than duplicating it per framework.

Keep the three implementations in lockstep when changing one: same part keys, same default formatting, same prop names where the framework allows it (React is generic over `Fields`; Vue's `ListingCard` isn't — `defineComponent` can't do that cleanly outside `<script setup generic="...">`, so it's typed to `SparkListingFields` and accepts wider shapes structurally). `ListingGrid` in each framework is presentation-only — it takes `listings`/`loading`/`error` as props/slots rather than fetching data itself, composing with `useSparkListings` instead of duplicating its logic.

Vue's `h()` renders an empty `class=""`/`style=""` attribute in SSR output if you pass `class: undefined` explicitly (confirmed via `tests/components.test.mjs`), rather than omitting the attribute like omitting the prop key does. Always build Vue element props through `partProps()` (`src/vue/utils.ts`) instead of inlining `{ class: ..., style: ... }` literals.

### Core client (`src/core/`)

- `client.ts` — `SparkClient` is the only stateful object. It holds the access token, base URL, `userAgent`, and injected `fetch`. Resource methods live as readonly object properties (`client.listings.search/get/media/openHouses`, `client.accounts.search/get`, `client.agents.*`, `client.offices.*`) rather than separate classes; add new Spark resources following that pattern, or reach them ad hoc via `client.request(path, options)`.
- `http.ts` — `sparkFetch` is the single place that calls `fetch`, parses the Spark envelope, and throws `SparkApiError` on transport failure or `D.Success === false`. All resource methods route through this — do not call `fetch` directly elsewhere.
- `types.ts` — models Spark's response envelope (`SparkEnvelope<T>` → `D.Results`/`D.Pagination`/`D.Success`) plus **two distinct record shapes**, confirmed against the live API (not assumed): `SparkResource<Fields>` (`Id` + `StandardFields` + `NonStandardFields` — used by `listings`) and `SparkFlatResource<Fields>` (fields flat on the record, no wrapper — used by `media`, `openHouses`, `accounts`). Don't assume a new resource follows either shape without checking a real response; Spark is inconsistent about this across resources. `SparkListingFields`/`SparkMediaFields`/`SparkAccountFields`/`SparkOpenHouseFields` are intentionally partial, commonly-used subsets — client methods are generic (`client.listings.search<MyFields>(...)`) so consumers extend them for their MLS's actual RESO field set instead of this package trying to model every field.
- `errors.ts` — `SparkApiError` carries `status`/`code`/`details`/`requestId` pulled from the Spark error envelope.

### Resource path gotchas (learned by probing the live API, not just docs)

- Agents and offices are **not** separate `/agents`/`/offices` endpoints (those 404) — both are `/accounts` records distinguished by `UserType` (`'Member'` for agents, `'Office'` for offices). `client.agents`/`client.offices` are thin filtered wrappers over `client.accounts` (see `mergeFilters` in `client.ts`).
- Open houses are listing-scoped: `/listings/{id}/openhouses`, not a standalone `/openhouses` collection (that path exists but returned 403 on a standard IDX dev key — permission-gated, likely for broker-tour-style bulk access).
- `media`/`accounts`/`openHouses` all return flat records; only `listings` wraps fields in `StandardFields`. This was verified with real API calls — trust the live response shape over assumptions when adding new resources.

### Auth model

Spark's IDX use case uses a static **Server Access Token** (no OAuth handshake) sent as `Authorization: Bearer <token>` plus a required `X-SparkApi-User-Agent` header — both are set in `SparkClient`'s private `headers()` method. `SparkClient.setAccessToken()` allows swapping the token at runtime without recreating the client.

**`SparkClient` (and by extension `useSparkListings`/`useSparkClient`/`SparkProvider`) must never run in code shipped to a browser.** This isn't just best practice — confirmed against Spark's own docs and by testing (`examples/web/` originally called Spark directly from the browser and failed with `TypeError: Failed to fetch` in headless Chrome): Spark's docs explicitly say never to give the access token to a browser, and the API sends no CORS headers, so a direct browser → Spark request fails regardless of token validity. `ListingCard`/`ListingGrid` are deliberately presentation-only (take `listings` as data, not a client) specifically so they still work in a browser context when fed data from your own backend. `vite.config.ts`'s `sparkApiProxy` plugin is the reference implementation of that split — a same-origin `/api/listings` route holds the real `SparkClient`, and the three `examples/web/*-app.js` files only ever call `fetch('/api/listings')`. Preserve that split in any future web example; don't reintroduce a browser-side `SparkClient`.

### Framework bindings (`src/vue/`, `src/react/`)

Both wrap the same two operations — `listings.search` and `listings.get` — as reactive queries (`useSparkListings`, `useSparkListing`), and both re-export the core `SparkClient`/`SparkApiError`/types so consumers can `import` everything from the subpath alone. Keep the two implementations symmetric (same hook names, same `{ data, loading, error, refresh }` return shape) when adding new query hooks — Vue's version takes a getter/ref for reactivity (`watchEffect`), React's version takes a plain object and re-runs on a `JSON.stringify`-based dependency key.

There is no build-time coupling between the two: each is a thin adapter over `SparkClient`, so new core functionality (e.g. a new resource) should be added once in `src/core/client.ts` and then exposed from both binding files if a reactive hook is warranted.
