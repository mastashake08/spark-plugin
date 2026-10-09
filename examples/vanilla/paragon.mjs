import { ParagonClient, ParagonApiError, PARAGON_KMA_FIELD_MAP } from '../../dist/index.js';

const { PARAGON_LOGIN_URL, PARAGON_USERNAME, PARAGON_PASSWORD } = process.env;

for (const [name, value] of Object.entries({ PARAGON_LOGIN_URL, PARAGON_USERNAME, PARAGON_PASSWORD })) {
  if (!value) {
    console.error(`Missing ${name}. Set it in .env (see .env.example).`);
    process.exit(1);
  }
}

const client = new ParagonClient({
  loginUrl: PARAGON_LOGIN_URL,
  username: PARAGON_USERNAME,
  password: PARAGON_PASSWORD,
  fieldMap: PARAGON_KMA_FIELD_MAP,
});

try {
  const caps = await client.login();
  console.log(`Logged in. Capabilities: ${Object.keys(caps).filter((k) => /^[A-Z]/.test(k) && caps[k].startsWith('/')).join(', ')}`);

  const classes = await client.metadata('METADATA-CLASS', 'Property');
  console.log(`Property classes: ${classes.map((c) => `${c.ClassName} (${c.Description})`).join(', ')}`);

  // Spark-shaped adapter: what SparkProvider / useSparkListings / ListingCard consume.
  const { results, pagination } = await client.listings.search({ filter: '(L_StatusCatID=1)', limit: 5, expand: 'Photos' });
  console.log(`\nlistings.search: ${results.length} of ${pagination?.totalRows ?? '?'} active Residential/Farm listings:\n`);
  for (const { Id, StandardFields: f } of results) {
    console.log(
      `- [${Id}] ${f.UnparsedAddress} — $${f.ListPrice} · ${f.BedroomsTotal ?? '?'} bd · ${f.BathroomsTotalInteger ?? '?'} ba · ` +
        `${f.LivingArea ?? '?'} sqft · ${f.Photos.length} photo(s)${f.Photos[0] ? ` · ${f.Photos[0].Uri.slice(0, 60)}…` : ''}`,
    );
  }

  const page2 = await client.listings.search({ filter: '(L_StatusCatID=1)', limit: 5, page: 2, select: 'L_AskingPrice' });
  console.log(`\npage 2 ids: ${page2.results.map((r) => r.Id).join(', ')} ${JSON.stringify(page2.pagination)}`);

  if (results[0]) {
    const one = await client.listings.get(results[0].Id);
    console.log(`listings.get round-trip: ${one.Id === results[0].Id ? 'OK' : 'MISMATCH'} (${one.StandardFields.ListingId})`);
    const aliases = Object.fromEntries(Object.entries(one.StandardFields).filter(([k]) => !/^(L|LM|LR|LFD|LA\d|SA\d|LO\d|SO\d|LMD|LV)_/.test(k)));
    console.log('\nAlias fields on the first listing:\n', aliases);
  }

  const openHouses = await client.openHouses.search({ query: `(OH_StartDateTime=${new Date().toISOString().slice(0, 19)}Z+)`, limit: 3 });
  console.log(`\nUpcoming open houses: ${openHouses.count} — ${openHouses.results.map((o) => `${o.L_Address} @ ${o.OH_StartDateTime}Z`).join('; ')}`);

  const agents = await client.agents.search({ limit: 3, select: 'U_AgentID,U_UserFirstName,U_UserLastName' });
  console.log(`Agents (${agents.count}): ${agents.results.map((a) => `${a.U_UserFirstName} ${a.U_UserLastName}`).join(', ')}`);
  const offices = await client.offices.search({ limit: 3, select: 'O_OfficeID,O_OrganizationName' });
  console.log(`Offices (${offices.count}): ${offices.results.map((o) => o.O_OrganizationName).join(', ')}`);
} catch (err) {
  if (err instanceof ParagonApiError) {
    console.error(`Paragon RETS error (status ${err.status}${err.code ? `, code ${err.code}` : ''}): ${err.message}`);
  } else {
    console.error(err);
  }
  process.exitCode = 1;
} finally {
  await client.logout();
  console.log('\nLogged out.');
}
