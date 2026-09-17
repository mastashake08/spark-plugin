import { SparkClient, SparkApiError } from '../../dist/index.js';

const accessToken = process.env.SPARK_ACCESS_TOKEN;
const userAgent = process.env.SPARK_USER_AGENT;

if (!accessToken) {
  console.error('Missing SPARK_ACCESS_TOKEN. Set it in .env (see .env.example).');
  process.exit(1);
}
if (!userAgent) {
  console.error('Missing SPARK_USER_AGENT. Set it in .env (see .env.example).');
  process.exit(1);
}

const client = new SparkClient({ accessToken, userAgent });

try {
  const { results, pagination } = await client.listings.search({
    filter: "StandardStatus Eq 'Active'",
    limit: 5,
  });

  console.log(`Fetched ${results.length} of ${pagination?.totalRows ?? '?'} active listings:\n`);
  for (const listing of results) {
    const f = listing.StandardFields;
    console.log(`- [${listing.Id}] ${f.UnparsedAddress ?? '(no address)'} — $${f.ListPrice ?? '?'}`);
  }

  if (results[0]) {
    console.log('\nFull raw record for the first listing (every field your MLS returned):\n');
    console.log(JSON.stringify(results[0], null, 2));
  }

  console.log('\nChecking media/photos and open houses for each fetched listing...\n');
  for (const listing of results) {
    const [photos, openHouses] = await Promise.all([
      client.listings.media(listing.Id),
      client.listings.openHouses(listing.Id),
    ]);
    console.log(`- [${listing.Id}] ${photos.results.length} photo(s), ${openHouses.results.length} open house(s)`);
    if (photos.results.length) console.log(JSON.stringify(photos.results, null, 2));
    if (openHouses.results.length) console.log(JSON.stringify(openHouses.results, null, 2));
  }

  console.log('\nOffices:\n');
  const offices = await client.offices.search({ limit: 5 });
  for (const office of offices.results) {
    console.log(`- [${office.Id}] ${office.Name}`);
  }

  console.log('\nAgents:\n');
  const agents = await client.agents.search({ limit: 5 });
  for (const agent of agents.results) {
    console.log(`- [${agent.Id}] ${agent.Name} (${agent.Office ?? 'no office'})`);
  }
} catch (err) {
  if (err instanceof SparkApiError) {
    console.error(`Spark API error (status ${err.status}${err.code ? `, code ${err.code}` : ''}): ${err.message}`);
    if (err.details.length) console.error(err.details);
  } else {
    console.error(err);
  }
  process.exit(1);
}
