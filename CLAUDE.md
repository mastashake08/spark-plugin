# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```
npm install         # install dependencies
npm run build        # tsup: emits dist/ as ESM + CJS + .d.ts for all three entry points
npm run dev           # tsup --watch
npm run typecheck     # tsc --noEmit (no test suite exists yet)
```

There is no test runner configured yet. `npm run typecheck` is currently the only correctness gate — run it after any change to `src/`.

Requires Node >= 18 (for global `fetch`). The dev machine may report an older Node in `node -v`; if `npm install`/`npm run build` warn with `EBADENGINE`, the commands still work but confirm the target Node version before assuming production behavior.

## Architecture

This is `spark-mls-client`, an npm package wrapping the Spark Platform (Flexmls) MLS/IDX API, published as a single package with three subpath entry points defined in `tsup.config.ts` and mirrored in `package.json#exports`:

- `spark-mls-client` → `src/index.ts` — framework-agnostic core
- `spark-mls-client/vue` → `src/vue/index.ts` — Vue 3 plugin + composables
- `spark-mls-client/react` → `src/react/index.ts` — React context + hooks

`vue` and `react` are `external` in `tsup.config.ts` and `peerDependencies` (both `optional: true` in `peerDependenciesMeta`) — a consumer only needs to install whichever framework they actually import.

### Core client (`src/core/`)

- `client.ts` — `SparkClient` is the only stateful object. It holds the access token, base URL, `userAgent`, and injected `fetch`. Resource methods live as readonly object properties (e.g. `client.listings.search/get/media`) rather than separate classes; add new Spark resources (open houses, offices, agents) following that pattern, or reach them ad hoc via `client.request(path, options)`.
- `http.ts` — `sparkFetch` is the single place that calls `fetch`, parses the Spark envelope, and throws `SparkApiError` on transport failure or `D.Success === false`. All resource methods route through this — do not call `fetch` directly elsewhere.
- `types.ts` — models Spark's response envelope (`SparkEnvelope<T>` → `D.Results`/`D.Pagination`/`D.Success`) and the `SparkResource<Fields>` shape (`Id` + `StandardFields` + `NonStandardFields`). `SparkListingFields`/`SparkMediaFields` are intentionally partial, commonly-used subsets — client methods are generic (`client.listings.search<MyFields>(...)`) so consumers extend them for their MLS's actual RESO field set instead of this package trying to model every field.
- `errors.ts` — `SparkApiError` carries `status`/`code`/`details`/`requestId` pulled from the Spark error envelope.

### Auth model

Spark's IDX use case uses a static **Server Access Token** (no OAuth handshake) sent as `Authorization: Bearer <token>` plus a required `X-SparkApi-User-Agent` header — both are set in `SparkClient`'s private `headers()` method. `SparkClient.setAccessToken()` allows swapping the token at runtime without recreating the client.

### Framework bindings (`src/vue/`, `src/react/`)

Both wrap the same two operations — `listings.search` and `listings.get` — as reactive queries (`useSparkListings`, `useSparkListing`), and both re-export the core `SparkClient`/`SparkApiError`/types so consumers can `import` everything from the subpath alone. Keep the two implementations symmetric (same hook names, same `{ data, loading, error, refresh }` return shape) when adding new query hooks — Vue's version takes a getter/ref for reactivity (`watchEffect`), React's version takes a plain object and re-runs on a `JSON.stringify`-based dependency key.

There is no build-time coupling between the two: each is a thin adapter over `SparkClient`, so new core functionality (e.g. a new resource) should be added once in `src/core/client.ts` and then exposed from both binding files if a reactive hook is warranted.
