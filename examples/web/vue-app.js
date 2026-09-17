import { createApp, h, onMounted, ref } from 'vue';
import { ListingGrid } from 'spark-mls-client/vue';

const cardClassNames = {
  root: 'listing-card',
  photoPlaceholder: 'listing-card__photo-placeholder',
  price: 'listing-card__price',
  address: 'listing-card__address',
  meta: 'listing-card__meta',
  status: 'listing-card__status',
};

// Fetches from this dev server's own /api/listings route (see vite.config.ts),
// never from Spark directly — the access token stays server-side.
const App = {
  setup() {
    const data = ref();
    const loading = ref(true);
    const error = ref();

    onMounted(async () => {
      try {
        const res = await fetch('/api/listings');
        const body = await res.json();
        if (!res.ok) throw new Error(body.error ?? `Request failed with status ${res.status}`);
        data.value = body;
      } catch (err) {
        error.value = err;
      } finally {
        loading.value = false;
      }
    });

    return () =>
      h(
        ListingGrid,
        {
          listings: data.value?.results ?? [],
          loading: loading.value,
          error: error.value,
          classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
          cardProps: { classNames: cardClassNames },
        },
        {
          loading: () => 'Loading listings…',
          empty: () => 'No listings found.',
          error: ({ error }) => h('p', { class: 'error' }, error.message),
        },
      );
  },
};

createApp(App).mount('#app');
