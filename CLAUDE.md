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

### Framework bindings (`src/vue/`, `src/react/`)

Both wrap the same two operations — `listings.search` and `listings.get` — as reactive queries (`useSparkListings`, `useSparkListing`), and both re-export the core `SparkClient`/`SparkApiError`/types so consumers can `import` everything from the subpath alone. Keep the two implementations symmetric (same hook names, same `{ data, loading, error, refresh }` return shape) when adding new query hooks — Vue's version takes a getter/ref for reactivity (`watchEffect`), React's version takes a plain object and re-runs on a `JSON.stringify`-based dependency key.

There is no build-time coupling between the two: each is a thin adapter over `SparkClient`, so new core functionality (e.g. a new resource) should be added once in `src/core/client.ts` and then exposed from both binding files if a reactive hook is warranted.
