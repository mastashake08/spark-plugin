import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SparkClient } from '../dist/index.js';

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Mock fetch that answers every request with `body`, recording the URLs it was called with. */
function mockFetch(body) {
  const urls = [];
  const fetch = async (url) => {
    urls.push(new URL(String(url)));
    return json(body);
  };
  return { fetch, urls };
}

// Shape confirmed against the live replication API: Spark only sends D.Pagination when asked
// via `_pagination=1`, and its keys are PascalCase (plus PageSize, which we drop).
const envelope = {
  D: {
    Success: true,
    Results: [{ Id: 'L1', StandardFields: { ListPrice: 220000 } }],
    Pagination: { TotalRows: 273540, PageSize: 1, CurrentPage: 2, TotalPages: 273540 },
  },
};

test('list requests ask Spark for pagination and normalize it to camelCase', async () => {
  const m = mockFetch(envelope);
  const client = new SparkClient({ accessToken: 't', userAgent: 'test/1.0', fetch: m.fetch });

  const page = await client.listings.search({ limit: 1, page: 2 });

  assert.equal(m.urls[0].searchParams.get('_pagination'), '1');
  assert.deepEqual(page.pagination, { currentPage: 2, totalPages: 273540, totalRows: 273540 });
});

test('flat list resources normalize pagination the same way', async () => {
  const m = mockFetch(envelope);
  const client = new SparkClient({ accessToken: 't', userAgent: 'test/1.0', fetch: m.fetch });

  const page = await client.agents.search({ limit: 1 });

  assert.equal(m.urls[0].searchParams.get('_pagination'), '1');
  assert.equal(page.pagination.totalRows, 273540);
});

test('pagination stays undefined when Spark omits it, and extra can override _pagination', async () => {
  const m = mockFetch({ D: { Success: true, Results: [] } });
  const client = new SparkClient({ accessToken: 't', userAgent: 'test/1.0', fetch: m.fetch });

  const page = await client.listings.search({ extra: { _pagination: 0 } });

  assert.equal(m.urls[0].searchParams.get('_pagination'), '0');
  assert.equal(page.pagination, undefined);
});
