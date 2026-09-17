import { createElement, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { SparkProvider, useSparkListings, ListingGrid } from 'spark-mls-client/react';

const cardClassNames = {
  root: 'listing-card',
  photoPlaceholder: 'listing-card__photo-placeholder',
  price: 'listing-card__price',
  address: 'listing-card__address',
  meta: 'listing-card__meta',
  status: 'listing-card__status',
  remarks: 'listing-card__remarks',
};

// The `show` state below is a `ListingCardVisibility` map — passed straight
// through as `cardProps.show` so unchecking a box hides that part on every card.
const TOGGLES = [
  { key: 'status', label: 'Status' },
  { key: 'price', label: 'Price' },
  { key: 'address', label: 'Address' },
  { key: 'meta', label: 'Beds/baths/sqft' },
  { key: 'remarks', label: 'Public remarks' },
];

function FieldToggles({ show, onToggle }) {
  return createElement(
    'fieldset',
    { className: 'field-toggles' },
    createElement('legend', null, 'Show fields'),
    TOGGLES.map(({ key, label }) =>
      createElement('label', { key }, [
        createElement('input', {
          key: 'input',
          type: 'checkbox',
          checked: show[key],
          onChange: (e) => onToggle(key, e.target.checked),
        }),
        label,
      ]),
    ),
  );
}

// { baseUrl } builds a browser-safe SparkProxyClient (see SparkProvider's
// resolveClient) pointed at your backend's Spark proxy API — e.g. a running
// spark-api-micro instance. It holds the real access token server-side; this
// app never sees it.
function Results() {
  const { data, loading, error } = useSparkListings({
    filter: "StandardStatus Eq 'Active'",
    limit: 12,
  });
  const [show, setShow] = useState(() => Object.fromEntries(TOGGLES.map(({ key }) => [key, true])));

  return createElement('div', null, [
    createElement(FieldToggles, {
      key: 'toggles',
      show,
      onToggle: (key, checked) => setShow((prev) => ({ ...prev, [key]: checked })),
    }),
    createElement(ListingGrid, {
      key: 'grid',
      listings: data?.results ?? [],
      loading,
      error,
      classNames: { root: 'listing-grid', grid: 'listing-grid__items' },
      cardProps: { classNames: cardClassNames, show },
      loadingContent: createElement('p', null, 'Loading listings…'),
      errorContent: (err) => createElement('p', { className: 'error' }, err.message),
      emptyContent: createElement('p', null, 'No listings found.'),
    }),
  ]);
}

createRoot(document.getElementById('root')).render(
  createElement(SparkProvider, { client: { baseUrl: import.meta.env.VITE_SPARK_API_BASE_URL } }, createElement(Results)),
);
