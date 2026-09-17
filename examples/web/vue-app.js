import { createApp, h, reactive } from 'vue';
import { createSparkPlugin, useSparkListings, ListingGrid } from 'spark-mls-client/vue';

const cardClassNames = {
  root: 'listing-card',
  photoPlaceholder: 'listing-card__photo-placeholder',
  price: 'listing-card__price',
  address: 'listing-card__address',
  meta: 'listing-card__meta',
  status: 'listing-card__status',
  remarks: 'listing-card__remarks',
};

// The `show` reactive map is a `ListingCardVisibility` — passed straight
// through as `cardProps.show` so unchecking a box hides that part on every card.
const TOGGLES = [
  { key: 'status', label: 'Status' },
  { key: 'price', label: 'Price' },
  { key: 'address', label: 'Address' },
  { key: 'meta', label: 'Beds/baths/sqft' },
  { key: 'remarks', label: 'Public remarks' },
];

// { baseUrl } builds a browser-safe SparkProxyClient pointed at your
// backend's Spark proxy API — e.g. a running spark-api-micro instance. It
// holds the real access token server-side; this app never sees it.
const Results = {
  setup() {
    const { data, loading, error } = useSparkListings({
      filter: "StandardStatus Eq 'Active'",
      limit: 12,
    });
    const show = reactive(Object.fromEntries(TOGGLES.map(({ key }) => [key, true])));

    return () =>
      h('div', null, [
        h('fieldset', { class: 'field-toggles' }, [
          h('legend', null, 'Show fields'),
          ...TOGGLES.map(({ key, label }) =>
            h('label', { key }, [
              h('input', {
                type: 'checkbox',
                checked: show[key],
                onChange: (e) => {
                  show[key] = e.target.checked;
                },
              }),
              label,
            ]),
          ),
        ]),
        h(
          ListingGrid,
          {
            listings: data.value?.results ?? [],
            loading: loading.value,
            error: error.value,
            classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
            cardProps: { classNames: cardClassNames, show },
          },
          {
            loading: () => 'Loading listings…',
            empty: () => 'No listings found.',
            error: ({ error }) => h('p', { class: 'error' }, error.message),
          },
        ),
      ]);
  },
};

createApp(Results)
  .use(createSparkPlugin({ baseUrl: import.meta.env.VITE_SPARK_API_BASE_URL }))
  .mount('#app');
