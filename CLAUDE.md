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
npm run example:paragon # CLI example (examples/vanilla/paragon.mjs) against the real KMA Paragon RETS server, reads .env
npm run example:web    # browser examples (examples/web/) via Vite; preexample:web rebuilds dist/ first
```

`tests/components.test.mjs` uses `jsdom` (vanilla DOM) and SSR (`react-dom/server`, `vue/server-renderer`) to render the `ListingCard`/`ListingGrid` components for real and assert on the output HTML — not just type-check. It caught a real bug once (Vue emitting stray `class=""`/`style=""` when a part had no override — fixed via `src/vue/utils.ts`'s `partProps`), so prefer extending it over adding assertions elsewhere when touching the component-rendering code.

Requires Node >= 18 (for global `fetch`); the `example*` scripts use `node --env-file`, which needs Node >= 20.6. The dev machine's default `node` is v16 — use an nvm version (`~/.nvm/versions/node/v22.18.0`). If `npm install`/`npm run build` warn with `EBADENGINE`, the commands still work but confirm the target Node version before assuming production behavior.

## Architecture

This is `spark-mls-client`, an npm package wrapping the Spark Platform (Flexmls) MLS/IDX API and Paragon RETS (ICE) feeds, published as a single package with four subpath entry points defined in `tsup.config.ts` and mirrored in `package.json#exports`:

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
- `client.ts` sends `_pagination=1` on every list request. Spark omits `D.Pagination` without it. It then converts Spark's PascalCase `{ TotalRows, CurrentPage, TotalPages, PageSize }` to camelCase `SparkPagination`, which is also what the Paragon adapter emits. Both behaviours were confirmed live.
- The default `baseUrl` is `https://replication.sparkapi.com/v1/`. The project's IDX feed key is refused on `sparkapi.com` ("This key is restricted… use replication.sparkapi.com").
- `errors.ts` — `SparkApiError` carries `status`/`code`/`details`/`requestId` pulled from the Spark error envelope.

### Resource path gotchas (learned by probing the live API, not just docs)

- Agents and offices are **not** separate `/agents`/`/offices` endpoints (those 404) — both are `/accounts` records distinguished by `UserType` (`'Member'` for agents, `'Office'` for offices). `client.agents`/`client.offices` are thin filtered wrappers over `client.accounts` (see `mergeFilters` in `client.ts`).
- Open houses are listing-scoped: `/listings/{id}/openhouses`, not a standalone `/openhouses` collection (that path exists but returned 403 on a standard IDX dev key — permission-gated, likely for broker-tour-style bulk access).
- `media`/`accounts`/`openHouses` all return flat records; only `listings` wraps fields in `StandardFields`. This was verified with real API calls — trust the live response shape over assumptions when adding new resources.

### Auth model

Spark's IDX use case uses a static **Server Access Token** (no OAuth handshake) sent as `Authorization: Bearer <token>` plus a required `X-SparkApi-User-Agent` header — both are set in `SparkClient`'s private `headers()` method. `SparkClient.setAccessToken()` allows swapping the token at runtime without recreating the client.

**`SparkClient` must never run in code shipped to a browser.** This isn't just best practice — confirmed against Spark's own docs and by testing (`examples/web/` originally called Spark directly from the browser and failed with `TypeError: Failed to fetch` in headless Chrome): Spark's docs explicitly say never to give the access token to a browser, and the API sends no CORS headers, so a direct browser → Spark request fails regardless of token validity.

**`SparkProxyClient`** (`src/core/proxyClient.ts`) is the browser-safe alternative — it takes a `baseUrl` pointing at *your own backend* (a small server that holds a real `SparkClient` + token and re-exposes Spark's data as plain, already-unwrapped JSON — e.g. a `spark-api-micro`-style Laravel app) instead of talking to Spark directly. It mirrors `SparkClient`'s full resource surface (`listings.search/get/media/openHouses`, `accounts.search/get`, `agents.*`, `offices.*`) and reuses `SparkApiError` for error handling, but its wire format is genuinely different — no `D` envelope, no auth headers, camelCase query params (`filter`/`select`/`limit`/`page`, not Spark's `_`-prefixed ones) — so it has its own `listParamsToQuery`/fetch logic in `proxyClient.ts`, not a shared code path with `client.ts`. If you build a backend proxy for this, match its exact response shapes: list endpoints return `{ results, pagination, requestId }` (matches `SparkPage`/`SparkFlatPage` as-is), single-record endpoints return the raw resource directly (matches `SparkResource`/`SparkFlatResource` as-is), errors return `{ error, code, details }` with the real HTTP status — this was verified end-to-end against a real Laravel implementation, not assumed.

`useSparkListings`/`useSparkListing`/`useSparkClient`/`SparkProvider`/`createSparkPlugin` accept either client via the shared `SparkListingsClient` structural interface (`src/core/sparkClientLike.ts`) — deliberately minimal (just `listings.search`/`listings.get`) so both client classes satisfy it without a common base class. `SparkProvider`/`createSparkPlugin` also accept raw options objects and construct the right client: `resolveClient()` in each binding checks `instanceof SparkClient/SparkProxyClient` first, then `'listings' in x` (already-built custom client), then `'accessToken' in x` (→ `SparkClient`) vs. else (→ `SparkProxyClient`) — keep that check order if you touch it, since a `SparkListingsClient`-shaped plain object must be caught by the `'listings' in x` branch before the `accessToken` check or TypeScript can't narrow the union correctly.

`ListingCard`/`ListingGrid` stay presentation-only (take `listings` as data, not a client) regardless of which client you use — that's what makes them safe in a browser context.

`examples/web/*-app.js` all use `SparkProxyClient`/`SparkProvider`/`createSparkPlugin` with `{ baseUrl: import.meta.env.VITE_SPARK_API_BASE_URL }`, pointed at a real running backend (not a Vite dev-server middleware stand-in — that approach was replaced once a real backend existed). `vite.config.ts` needs `envDir: __dirname` set explicitly since `root: 'examples/web'` would otherwise make Vite look for `.env` in the wrong directory — this broke silently once already (env var read as `undefined`, `SparkProxyClient` threw synchronously outside any try/catch in the vanilla example, page just stuck on "Loading…" with no visible error).

### Paragon client (`src/core/paragonClient.ts`, `paragonTypes.ts`)

`ParagonClient` wraps a **Paragon RETS 1.8** server. The target feed is HKAR (Heart of Kentucky Association of REALTORS), whose MLS is the Kentucky MLS Alliance: login URL `https://kma-rets.paragonrels.com/rets/fnisrets.aspx/KMA/login`. Its history:
- A Trestle client was dropped before it was ever committed.
- A RESO Web API (OpenMLS, OAuth) version was replaced once HKAR turned out to issue only RETS username/password credentials. KMA's OpenMLS token endpoint returns `invalid_client` for them.
- ICE also runs a third product, PIC (`api.paragonapi.com`, Bridge-style static server tokens). It isn't used here.

Everything below was confirmed against the live KMA server (October 2026). Like `SparkClient`, the client is server-only.

- **Auth:** HTTP **Basic** (the server answers `WWW-Authenticate: Basic realm="KMA"`; Digest fails), sent on every request. Required headers are `RETS-Version: RETS/1.8` and `User-Agent`. Login sets a `RETS-Session-ID` cookie (plus Cloudflare's `__cf_bm`), and the client resends all cookies. It logs in lazily, dedupes concurrent logins, and re-logs in once on a 401. Always `logout()`: ICE's guide warns that too many open sessions can get a user blocked.
- **Login response:** the capability URLs (`Search=/rets/...`, `GetMetadata=`, `Logout=`) come on one line separated by spaces, not newlines. `parseLoginResponse` splits on whitespace before `Key=`.
- **Responses** are COMPACT-DECODED XML: tab-delimited `<COLUMNS>` and `<DATA>`, `<COUNT Records>` (always requested with `Count=1`), and `<MAXROWS/>` when the server capped the rows. `parseCompact` is hand-rolled with regexes, so there's no XML dependency. It's exported for tests.
- **Reply codes:** `20201` "No Records Found" is an empty page, not an error. Any other non-zero code throws `ParagonApiError` with `code` set to the ReplyCode (for example `20200` "Unknown Query Field").
- **Types:** values arrive as strings. `search()` loads `METADATA-TABLE` for each resource/class (cached) and converts `Int`/`Small`/`Tiny`/`Long`/`Decimal` to numbers, except fields with `Interpretation` `Lookup*`, which COMPACT-DECODED has already turned into display text. Empty values are dropped.
- **Server behaviour:**
  - `Offset` is **1-based**.
  - `OrderBy` is silently ignored (rows come back in `L_ListingID` order).
  - `(L_ListingID=a,b,c)` works for batch lookups.
  - DateTimes are UTC with no `Z`. An open house at 13:00 EDT is `OH_StartDateTime` `17:00:00`. Queries accept a `Z` suffix.
- **Resources:**
  - `Property` has 7 classes: `RF_1` Residential/Farm (the default `listingClass`), `LT_2`, `CO_3`, `MF_4`, `RR_5`, `CL_6`, `LL_7`.
  - `Media`, `OpenHouse` and `Tour` use the same classes, so a listing's media must be queried with that listing's class.
  - Agents are `ActiveAgent`/`ActiveAgent` (`U_AgentID`); offices are `ActiveOffice`/`ActiveOffice` (`O_OfficeID`).
  - Photos are in the `Media` resource (`MED_media_url`, ordered by `MED_sequence`). They're public `zimg.paragon.ice.com` CDN URLs that need no auth. GetObject is only for agent photos and office logos, per ICE's guide.
- **Field names** are Paragon system names. Only about 21 of RF_1's 627 fields have a RETS StandardName, and beds, baths, sqft and remarks aren't among them. `L_*` columns are the same on every Paragon MLS (`PARAGON_CORE_FIELD_MAP`, always applied). `LM_*`/`LR_*` columns are MLS- and class-specific; `PARAGON_KMA_FIELD_MAP` holds KMA RF_1's, found through `LongName` in the metadata. Lookup fields are queried by lookup *value*, e.g. `L_StatusCatID=1` for Active.
- **IDX:** `L_IdxInclude` is a lookup with values Yes/No/"Yes Without Address". The KMA feed returned no "No" rows, so it appears to be pre-filtered server-side. The `listings` adapter drops street and `LMD_MP_*` map fields for "Yes Without Address" listings, and `UnparsedAddress` becomes city/state/zip only.
- **`client.listings`** is the Spark-shaped adapter: `{ Id: String(L_ListingID), StandardFields: raw + aliases + UnparsedAddress }`. `limit`/`page` map to `Limit`/`Offset`, `pagination` comes from `Count`, `filter` is raw DMQL2, and `extra.Class` overrides the class. `expand: 'Photos'` runs one batched Media query per page. This adapter is what makes `ParagonClient` satisfy `SparkListingsClient`, so keep its output shape identical to `SparkClient.listings`.
- `resolveClient()` in each binding routes `{ loginUrl, ... }` options to `ParagonClient`. That check sits after `'listings' in x` and before `'accessToken' in x`.
- tsup runs with `splitting: false`, so each entry point inlines its own copy of every class. A `ParagonClient`/`SparkClient` from `spark-mls-client` is not `instanceof` the one in `spark-mls-client/react`. That is harmless, because `resolveClient` falls through to `'listings' in x`, but tests must compare against the same entry's class.
- **Probing the live server:** don't build curl commands from shell variables holding credentials (zsh doesn't word-split, and the error echoes the password). Use a Node script that reads `.env` and never prints the credentials.

`tests/paragon.test.mjs` covers the client against a mock RETS server built from real KMA response shapes: login and session reuse, re-login, search params, type conversion, reply codes, class fallback, MAXROWS paging, the adapter (aliases, address hiding, Photos) and provider resolution. `tests/spark.test.mjs` covers Spark pagination.

### Framework bindings (`src/vue/`, `src/react/`)

Both wrap the same two operations — `listings.search` and `listings.get` — as reactive queries (`useSparkListings`, `useSparkListing`), and both re-export the core `SparkClient`/`SparkProxyClient`/`SparkApiError`/types so consumers can `import` everything from the subpath alone. Keep the two implementations symmetric (same hook names, same `{ data, loading, error, refresh }` return shape) when adding new query hooks — Vue's version takes a getter/ref for reactivity (`watchEffect`), React's version takes a plain object and re-runs on a `JSON.stringify`-based dependency key.

There is no build-time coupling between the two: each is a thin adapter over the `SparkListingsClient` interface, so new core functionality (e.g. a new resource) should be added once in `src/core/client.ts` (and `proxyClient.ts` if it should also be reachable browser-side) and then exposed from both binding files if a reactive hook is warranted.
