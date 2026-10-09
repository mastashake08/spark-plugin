import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server';
import { ParagonClient, ParagonApiError, SparkApiError, PARAGON_KMA_FIELD_MAP, parseCompact } from '../dist/index.js';
// Each entry point bundles its own copy of the classes (tsup `splitting: false`), so compare against the react entry's.
import { SparkProvider, useSparkClient, ParagonClient as ReactParagonClient } from '../dist/react/index.js';

const LOGIN_URL = 'https://kma-rets.paragonrels.com/rets/fnisrets.aspx/KMA/login';
const T = '\t';

// Shapes below mirror real KMA responses (login capability line, COMPACT-DECODED search, METADATA-TABLE).
const LOGIN_XML = `<RETS ReplyCode="0" ReplyText="Login Request">
<RETS-RESPONSE> Info=USERID;Character;someone Info=TimeoutSeconds;Int;5400 GetMetadata=/rets/fnisrets.aspx/KMA/getmetadata Login=${LOGIN_URL} Logout=/rets/fnisrets.aspx/KMA/logout Search=/rets/fnisrets.aspx/KMA/search </RETS-RESPONSE>
</RETS>`;

function compact(columns, rows, { count = rows.length, maxRows = false, replyCode = 0, replyText = 'Operation Successful' } = {}) {
  return [
    `<RETS ReplyCode="${replyCode}" ReplyText="${replyText}" >`,
    `<COUNT Records="${count}"/>`,
    '<DELIMITER value="09" />',
    `<COLUMNS>${T}${columns.join(T)}${T}</COLUMNS>`,
    ...rows.map((r) => `<DATA>${T}${r.join(T)}${T}</DATA>`),
    maxRows ? '<MAXROWS/>' : '',
    '</RETS>',
  ].join('\n');
}

function table(fields) {
  return compact(
    ['SystemName', 'StandardName', 'DataType', 'Interpretation'],
    fields.map(([name, type, interp = '']) => [name, '', type, interp]),
  );
}

const PROPERTY_TABLE = table([
  ['L_ListingID', 'Int'],
  ['L_DisplayId', 'Character'],
  ['L_AskingPrice', 'Int', 'Currency'],
  ['L_StatusCatID', 'Small', 'Lookup'],
  ['L_Status', 'Character', 'Lookup'],
  ['L_Address', 'Character'],
  ['L_AddressNumber', 'Character'],
  ['L_City', 'Character', 'Lookup'],
  ['L_State', 'Character'],
  ['L_Zip', 'Character'],
  ['L_IdxInclude', 'Character', 'Lookup'],
  ['LM_Int1_6', 'Small'],
  ['LM_Int1_5', 'Small'],
  ['LM_Int4_6', 'Int'],
  ['LR_remarks22', 'Character'],
  ['LMD_MP_Latitude', 'Decimal'],
]);
const PROPERTY_COLUMNS = ['L_ListingID', 'L_DisplayId', 'L_AskingPrice', 'L_StatusCatID', 'L_Status', 'L_Address', 'L_AddressNumber', 'L_City', 'L_State', 'L_Zip', 'L_IdxInclude', 'LM_Int1_6', 'LM_Int1_5', 'LM_Int4_6', 'LR_remarks22', 'LMD_MP_Latitude'];
const LISTING = ['1257881', 'HK23000403', '165900', 'Active', 'Active', '309 S Meadow Drive', '309', 'Irvington', 'KY', '40146', 'Yes', '3', '1', '1044', 'Close to schools &amp; shopping', '37.87'];
const MEDIA_TABLE = table([['L_ListingID', 'Int'], ['MED_listing_media_id', 'Int'], ['MED_listing_media_type_id', 'Int', 'Lookup'], ['MED_sequence', 'Int'], ['MED_media_url', 'Character']]);

/** Mock RETS server: login/logout/metadata are built in; searches go to `onSearch(params)`. Records every call. */
function mockRets(onSearch, { tables = {}, loginStatus = 200 } = {}) {
  const calls = [];
  let session = 0;
  const fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    calls.push({ url: u, headers: init.headers });
    const respond = (body, status = 200, headers = {}) => new Response(body, { status, headers: { 'content-type': 'text/xml', ...headers } });
    if (u.pathname.endsWith('/login')) {
      if (loginStatus !== 200) return respond('', loginStatus);
      return respond(LOGIN_XML, 200, { 'set-cookie': `RETS-Session-ID=s${++session}; path=/` });
    }
    if (u.pathname.endsWith('/logout')) return respond('<RETS ReplyCode="0" ReplyText="Logged out"/>');
    if (u.pathname.endsWith('/getmetadata')) {
      const id = u.searchParams.get('ID');
      if (u.searchParams.get('Type') === 'METADATA-CLASS') return respond(compact(['ClassName', 'Description'], [['RF_1', 'Residential'], ['LT_2', 'Land']]));
      return respond(tables[id] ?? table([]));
    }
    return onSearch(Object.fromEntries(u.searchParams), { respond, cookie: init.headers?.Cookie });
  };
  return { fetch, calls, searches: () => calls.filter((c) => c.url.pathname.endsWith('/search')) };
}

const options = { loginUrl: LOGIN_URL, username: 'user', password: 'p@ss!' };
const tables = { 'Property:RF_1': PROPERTY_TABLE, 'Media:RF_1': MEDIA_TABLE };

test('parseCompact reads reply code, count, columns, rows (with entities) and MAXROWS', () => {
  const parsed = parseCompact(compact(['A', 'B'], [['1', 'x &amp; y'], ['2', '']], { count: 10, maxRows: true }));
  assert.equal(parsed.replyCode, 0);
  assert.equal(parsed.count, 10);
  assert.deepEqual(parsed.columns, ['A', 'B']);
  assert.deepEqual(parsed.rows, [['1', 'x & y'], ['2', '']]);
  assert.equal(parsed.maxRows, true);
});

test('logs in once with Basic auth and RETS headers, then reuses the session cookie', async () => {
  const m = mockRets((_, { respond }) => respond(compact(PROPERTY_COLUMNS, [LISTING])), { tables });
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  await Promise.all([client.property.search(), client.property.search()]);

  const logins = m.calls.filter((c) => c.url.pathname.endsWith('/login'));
  assert.equal(logins.length, 1);
  assert.equal(logins[0].headers.Authorization, `Basic ${btoa('user:p@ss!')}`);
  assert.equal(logins[0].headers['RETS-Version'], 'RETS/1.8');
  for (const s of m.searches()) assert.equal(s.headers.Cookie, 'RETS-Session-ID=s1');
});

test('search sends DMQL2/COMPACT-DECODED/Count, converts numbers from metadata, and drops empty values', async () => {
  const row = [...LISTING];
  row[13] = ''; // LM_Int4_6 empty
  const m = mockRets((_, { respond }) => respond(compact(PROPERTY_COLUMNS, [row], { count: 972 })), { tables });
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  const page = await client.property.search({ query: ['(L_StatusCatID=1)', '(L_AskingPrice=100000+)'], limit: 5, offset: 6 });

  const params = m.searches()[0].url.searchParams;
  assert.equal(params.get('SearchType'), 'Property');
  assert.equal(params.get('Class'), 'RF_1');
  assert.equal(params.get('QueryType'), 'DMQL2');
  assert.equal(params.get('Format'), 'COMPACT-DECODED');
  assert.equal(params.get('Count'), '1');
  assert.equal(params.get('Query'), '(L_StatusCatID=1),(L_AskingPrice=100000+)');
  assert.equal(params.get('Limit'), '5');
  assert.equal(params.get('Offset'), '6');

  const r = page.results[0];
  assert.equal(page.count, 972);
  assert.equal(r.L_ListingID, 1257881);
  assert.equal(r.L_AskingPrice, 165900);
  assert.equal(r.L_StatusCatID, 'Active'); // Lookup-interpreted Small stays decoded text
  assert.equal(r.LMD_MP_Latitude, 37.87);
  assert.equal(r.L_Zip, '40146'); // Character stays a string
  assert.equal(r.LR_remarks22, 'Close to schools & shopping');
  assert.equal('LM_Int4_6' in r, false);
});

test('"No Records Found" (20201) is an empty page; other reply codes throw ParagonApiError', async () => {
  const m = mockRets((p, { respond }) =>
    p.Query.includes('Bogus')
      ? respond('<RETS ReplyCode="20200" ReplyText="Unknown Query Field [Bogus]." ></RETS>')
      : respond(compact(PROPERTY_COLUMNS, [], { count: 0, replyCode: 20201, replyText: 'No Records Found.' })),
    { tables },
  );
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  const empty = await client.property.search({ query: '(L_StatusCatID=999)' });
  assert.deepEqual(empty.results, []);
  assert.equal(empty.count, 0);

  await assert.rejects(client.property.search({ query: '(Bogus=1)' }), (err) => {
    assert.ok(err instanceof ParagonApiError && err instanceof SparkApiError);
    assert.equal(err.code, '20200');
    assert.equal(err.message, 'Unknown Query Field [Bogus].');
    return true;
  });
});

test('bad credentials surface as a 401 ParagonApiError', async () => {
  const m = mockRets(() => assert.fail('should not search'), { loginStatus: 401 });
  const client = new ParagonClient({ ...options, fetch: m.fetch });
  await assert.rejects(client.property.search(), (err) => err instanceof ParagonApiError && err.status === 401);
});

test('an expired session (401 on search) re-logs in once and retries', async () => {
  let n = 0;
  const m = mockRets((_, { respond }) => (n++ === 0 ? respond('', 401) : respond(compact(PROPERTY_COLUMNS, [LISTING]))), { tables });
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  const page = await client.property.search();

  assert.equal(page.results.length, 1);
  assert.equal(m.calls.filter((c) => c.url.pathname.endsWith('/login')).length, 2);
  assert.equal(m.searches().at(-1).headers.Cookie, 'RETS-Session-ID=s2');
});

test('property.get falls back across classes and 404s when none match', async () => {
  const m = mockRets((p, { respond }) =>
    p.Class === 'LT_2' && p.Query === '(L_ListingID=42)'
      ? respond(compact(['L_ListingID'], [['42']]))
      : respond(compact(['L_ListingID'], [], { count: 0, replyCode: 20201, replyText: 'No Records Found.' })),
    { tables },
  );
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  const found = await client.property.get(42);
  assert.equal(found.class, 'LT_2');
  assert.deepEqual(m.searches().map((s) => s.url.searchParams.get('Class')), ['RF_1', 'LT_2']);

  await assert.rejects(client.property.get(7), (err) => err instanceof ParagonApiError && err.status === 404);
});

test('media pages through MAXROWS with 1-based offsets and sorts by listing then sequence', async () => {
  const cols = ['L_ListingID', 'MED_listing_media_id', 'MED_sequence', 'MED_media_url'];
  const m = mockRets((p, { respond }) =>
    p.Offset === '1' || p.Offset === undefined
      ? respond(compact(cols, [['2', '20', '1', 'u21'], ['1', '10', '1', 'u11']], { count: 3, maxRows: true }))
      : respond(compact(cols, [['1', '9', '0', 'u10']], { count: 3 })),
    { tables },
  );
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  const media = await client.property.media([1, 2]);

  assert.deepEqual(media.map((x) => x.MED_media_url), ['u10', 'u11', 'u21']);
  assert.deepEqual(m.searches().map((s) => s.url.searchParams.get('Offset')), ['1', '3']);
  assert.equal(m.searches()[0].url.searchParams.get('Query'), '(L_ListingID=1,2)');
});

test('listings adapter: Spark shape, aliases, composed address, pagination, and batched Photos', async () => {
  const mediaCols = ['L_ListingID', 'MED_listing_media_id', 'MED_listing_media_type_id', 'MED_sequence', 'MED_media_url'];
  const m = mockRets(
    (p, { respond }) =>
      p.SearchType === 'Media'
        ? respond(compact(mediaCols, [['1257881', '5', 'Image', '1', 'https://img/b.jpg'], ['1257881', '4', 'Image', '0', 'https://img/a.jpg']]))
        : respond(compact(PROPERTY_COLUMNS, [LISTING], { count: 42 })),
    { tables },
  );
  const client = new ParagonClient({ ...options, fieldMap: PARAGON_KMA_FIELD_MAP, fetch: m.fetch });

  const page = await client.listings.search({ filter: '(L_StatusCatID=1)', limit: 10, page: 3, expand: 'Photos' });

  const search = m.searches()[0].url.searchParams;
  assert.equal(search.get('Limit'), '10');
  assert.equal(search.get('Offset'), '21');
  assert.deepEqual(page.pagination, { currentPage: 3, totalPages: 5, totalRows: 42 });

  const { Id, StandardFields: f } = page.results[0];
  assert.equal(Id, '1257881');
  assert.equal(f.ListingId, 'HK23000403');
  assert.equal(f.ListPrice, 165900);
  assert.equal(f.StandardStatus, 'Active');
  assert.equal(f.BedroomsTotal, 3);
  assert.equal(f.BathroomsTotalInteger, 1);
  assert.equal(f.LivingArea, 1044);
  assert.equal(f.PublicRemarks, 'Close to schools & shopping');
  assert.equal(f.UnparsedAddress, '309 S Meadow Drive, Irvington, KY 40146');
  assert.equal(f.L_AskingPrice, 165900); // raw fields kept too
  assert.deepEqual(f.Photos.map((p) => p.Uri), ['https://img/a.jpg', 'https://img/b.jpg']);
  assert.equal(m.searches().filter((s) => s.url.searchParams.get('SearchType') === 'Media').length, 1);
});

test('listings adapter hides street address and map pin for "Yes Without Address" listings', async () => {
  const row = [...LISTING];
  row[10] = 'Yes Without Address';
  const m = mockRets((_, { respond }) => respond(compact(PROPERTY_COLUMNS, [row])), { tables });
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  const { StandardFields: f } = (await client.listings.search()).results[0];

  assert.equal(f.UnparsedAddress, 'Irvington, KY 40146');
  for (const key of ['L_Address', 'L_AddressNumber', 'StreetNumber', 'LMD_MP_Latitude', 'Latitude']) assert.equal(key in f, false, key);
});

test('a narrowed select still includes the key and alias source fields', async () => {
  const m = mockRets((_, { respond }) => respond(compact(PROPERTY_COLUMNS, [LISTING])), { tables });
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  await client.listings.search({ select: 'L_AskingPrice' });

  const select = m.searches()[0].url.searchParams.get('Select').split(',');
  for (const f of ['L_AskingPrice', 'L_ListingID', 'L_Address', 'L_IdxInclude', 'L_DisplayId']) assert.ok(select.includes(f), f);
});

test('logout calls the Logout capability and the next request logs in again', async () => {
  const m = mockRets((_, { respond }) => respond(compact(PROPERTY_COLUMNS, [LISTING])), { tables });
  const client = new ParagonClient({ ...options, fetch: m.fetch });

  await client.property.search();
  await client.logout();
  await client.property.search();

  assert.equal(m.calls.filter((c) => c.url.pathname.endsWith('/logout')).length, 1);
  assert.equal(m.calls.filter((c) => c.url.pathname.endsWith('/login')).length, 2);
});

test('SparkProvider builds a ParagonClient from { loginUrl, username, password } options', () => {
  let seen;
  const Probe = () => {
    seen = useSparkClient();
    return null;
  };
  renderToString(createElement(SparkProvider, { client: { ...options, fetch: async () => new Response('') } }, createElement(Probe)));
  assert.ok(seen instanceof ReactParagonClient);
});
