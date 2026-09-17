import { SparkProxyClient, renderListingGrid } from 'spark-mls-client/vanilla';

const root = document.getElementById('app');
const controls = document.getElementById('controls');

const cardClassNames = {
  root: 'listing-card',
  photoPlaceholder: 'listing-card__photo-placeholder',
  price: 'listing-card__price',
  address: 'listing-card__address',
  meta: 'listing-card__meta',
  status: 'listing-card__status',
  remarks: 'listing-card__remarks',
};

// The `show` map is `ListingCardVisibility` — passed straight through as
// `cardOptions.show` so unchecking a box hides that part on every card.
const TOGGLES = [
  { key: 'status', label: 'Status' },
  { key: 'price', label: 'Price' },
  { key: 'address', label: 'Address' },
  { key: 'meta', label: 'Beds/baths/sqft' },
  { key: 'remarks', label: 'Public remarks' },
];
const show = Object.fromEntries(TOGGLES.map(({ key }) => [key, true]));

let listings = [];

function renderCards() {
  root.replaceChildren(
    renderListingGrid(listings, {
      classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
      cardOptions: { classNames: cardClassNames, show },
      emptyContent: 'No listings found.',
    }),
  );
}

function renderControls() {
  const fieldset = document.createElement('fieldset');
  fieldset.className = 'field-toggles';
  const legend = document.createElement('legend');
  legend.textContent = 'Show fields';
  fieldset.appendChild(legend);

  for (const { key, label } of TOGGLES) {
    const wrapper = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = show[key];
    input.addEventListener('change', () => {
      show[key] = input.checked;
      renderCards();
    });
    wrapper.append(input, label);
    fieldset.appendChild(wrapper);
  }

  controls.replaceChildren(fieldset);
}

try {
  // Browser-safe: points at your backend's Spark proxy API (e.g. a running
  // spark-api-micro instance), which holds the real access token server-side.
  const client = new SparkProxyClient({ baseUrl: import.meta.env.VITE_SPARK_API_BASE_URL });

  const { results } = await client.listings.search({
    filter: "StandardStatus Eq 'Active'",
    limit: 12,
  });

  listings = results;
  renderControls();
  renderCards();
} catch (err) {
  root.textContent = `Error: ${err.message}`;
  root.className = 'error';
}
