import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createSSRApp, h } from 'vue';
import { renderToString } from 'vue/server-renderer';

const dom = new JSDOM('<!doctype html><html><body></body></html>');
globalThis.document = dom.window.document;
globalThis.Node = dom.window.Node;

const listing = {
  Id: '123',
  StandardFields: {
    ListPrice: 425000,
    UnparsedAddress: '101 1st DR, GREAT FALLS, MT 59405',
    BedroomsTotal: 3,
    BathroomsTotalInteger: 2,
    LivingArea: 1800,
    StandardStatus: 'Active',
    PublicRemarks: 'Great riverfront recreational site.',
  },
};

test('vanilla renderListingCard applies classNames and formats fields', async () => {
  const { renderListingCard } = await import('../dist/vanilla/index.js');
  const card = renderListingCard(listing, { classNames: { root: 'card', price: 'price' } });
  assert.equal(card.className, 'card');
  assert.match(card.outerHTML, /\$425,000/);
  assert.match(card.outerHTML, /101 1st DR, GREAT FALLS, MT 59405/);
  assert.match(card.outerHTML, /3 bd · 2 ba · 1,800 sqft/);
  assert.match(card.outerHTML, /Great riverfront recreational site\./);
  assert.match(card.outerHTML, /<div class="price">/);
});

test('vanilla renderListingCard hides parts via `show`', async () => {
  const { renderListingCard } = await import('../dist/vanilla/index.js');
  const card = renderListingCard(listing, { show: { remarks: false, meta: false } });
  assert.doesNotMatch(card.outerHTML, /Great riverfront recreational site\./);
  assert.doesNotMatch(card.outerHTML, /3 bd/);
  assert.match(card.outerHTML, /\$425,000/);
});

test('vanilla renderListingGrid renders an empty state without throwing', async () => {
  const { renderListingGrid } = await import('../dist/vanilla/index.js');
  const grid = renderListingGrid([], { emptyContent: 'No listings found' });
  assert.equal(grid.textContent, 'No listings found');
});

test('react ListingCard/ListingGrid render via SSR with no unset class="" noise', async () => {
  const { ListingCard, ListingGrid } = await import('../dist/react/index.js');

  const cardHtml = renderToStaticMarkup(createElement(ListingCard, { listing, className: 'card' }));
  assert.match(cardHtml, /class="card"/);
  assert.match(cardHtml, /\$425,000/);
  assert.match(cardHtml, /Great riverfront recreational site\./);

  const toggledHtml = renderToStaticMarkup(
    createElement(ListingCard, { listing, show: { remarks: false } }),
  );
  assert.doesNotMatch(toggledHtml, /Great riverfront recreational site\./);

  const loadingHtml = renderToStaticMarkup(
    createElement(ListingGrid, { listings: [], loading: true, loadingContent: 'Loading…' }),
  );
  assert.match(loadingHtml, /Loading…/);

  const gridHtml = renderToStaticMarkup(createElement(ListingGrid, { listings: [listing] }));
  assert.match(gridHtml, /\$425,000/);
});

test('vue ListingCard/ListingGrid render via SSR with no stray class="" attrs', async () => {
  const { ListingCard, ListingGrid } = await import('../dist/vue/index.js');

  const cardApp = createSSRApp({ render: () => h(ListingCard, { listing, class: 'card' }) });
  const cardHtml = await renderToString(cardApp);
  assert.match(cardHtml, /class="card"/);
  assert.match(cardHtml, /\$425,000/);
  assert.match(cardHtml, /Great riverfront recreational site\./);
  // Parts with no classNames override must not emit empty class/style attrs.
  assert.doesNotMatch(cardHtml, /class=""/);
  assert.doesNotMatch(cardHtml, /style=""/);

  const toggledApp = createSSRApp({ render: () => h(ListingCard, { listing, show: { remarks: false } }) });
  const toggledHtml = await renderToString(toggledApp);
  assert.doesNotMatch(toggledHtml, /Great riverfront recreational site\./);

  const gridApp = createSSRApp({ render: () => h(ListingGrid, { listings: [listing] }) });
  const gridHtml = await renderToString(gridApp);
  assert.match(gridHtml, /\$425,000/);
});
