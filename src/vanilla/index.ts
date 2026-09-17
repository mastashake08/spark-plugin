import {
  defaultFormatAddress,
  defaultFormatMeta,
  defaultFormatPrice,
  joinClassNames,
  type ListingCardPart,
} from '../core/format.js';
import type { SparkListingFields, SparkResource } from '../core/types.js';

export interface RenderListingCardOptions<Fields extends Record<string, unknown> = SparkListingFields> {
  photoUrl?: string;
  photoAlt?: string;
  /** Shorthand for `classNames.root`. */
  className?: string;
  /** Per-part class overrides. No classes are applied unless you pass them — unstyled by default. */
  classNames?: Partial<Record<ListingCardPart, string>>;
  formatPrice?: (price: unknown) => string;
  formatAddress?: (fields: Fields) => string;
  formatMeta?: (fields: Fields) => string;
}

function el(tag: string, className: string | undefined): HTMLElement {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}

/** Builds an unstyled listing card as a real DOM element you can append anywhere. */
export function renderListingCard<Fields extends Record<string, unknown> = SparkListingFields>(
  listing: SparkResource<Fields>,
  options: RenderListingCardOptions<Fields> = {},
): HTMLElement {
  const {
    photoUrl,
    photoAlt,
    className,
    classNames = {},
    formatPrice = defaultFormatPrice,
    formatAddress = defaultFormatAddress as (fields: Fields) => string,
    formatMeta = defaultFormatMeta as (fields: Fields) => string,
  } = options;

  const f = listing.StandardFields;
  const status = f.StandardStatus as string | undefined;

  const root = el('div', joinClassNames(classNames.root, className));

  if (status) {
    const statusEl = el('span', classNames.status);
    statusEl.textContent = status;
    root.appendChild(statusEl);
  }

  if (photoUrl) {
    const img = el('img', classNames.photo) as HTMLImageElement;
    img.src = photoUrl;
    img.alt = photoAlt ?? formatAddress(f);
    root.appendChild(img);
  } else {
    root.appendChild(el('div', classNames.photoPlaceholder));
  }

  const body = el('div', classNames.body);
  const priceEl = el('div', classNames.price);
  priceEl.textContent = formatPrice(f.ListPrice);
  const addressEl = el('div', classNames.address);
  addressEl.textContent = formatAddress(f);
  const metaEl = el('div', classNames.meta);
  metaEl.textContent = formatMeta(f);
  body.append(priceEl, addressEl, metaEl);

  root.appendChild(body);
  return root;
}

export interface RenderListingGridOptions<Fields extends Record<string, unknown> = SparkListingFields> {
  getPhotoUrl?: (listing: SparkResource<Fields>) => string | undefined;
  className?: string;
  classNames?: { root?: string; grid?: string };
  /** Passed through to every card (classNames, formatters, etc). */
  cardOptions?: Omit<RenderListingCardOptions<Fields>, 'photoUrl'>;
  /** Fully override how each listing renders. */
  renderCard?: (listing: SparkResource<Fields>, photoUrl: string | undefined) => HTMLElement;
  emptyContent?: string | Node;
}

/** Builds an unstyled grid of listing cards as a real DOM element you can append anywhere. */
export function renderListingGrid<Fields extends Record<string, unknown> = SparkListingFields>(
  listings: Array<SparkResource<Fields>>,
  options: RenderListingGridOptions<Fields> = {},
): HTMLElement {
  const { getPhotoUrl, className, classNames = {}, cardOptions, renderCard, emptyContent } = options;
  const root = el('div', joinClassNames(classNames.root, className));

  if (!listings.length) {
    if (emptyContent instanceof Node) root.appendChild(emptyContent);
    else if (typeof emptyContent === 'string') root.textContent = emptyContent;
    return root;
  }

  const grid = el('div', classNames.grid);
  for (const listing of listings) {
    const photoUrl = getPhotoUrl?.(listing);
    grid.appendChild(renderCard ? renderCard(listing, photoUrl) : renderListingCard(listing, { ...cardOptions, photoUrl }));
  }
  root.appendChild(grid);
  return root;
}

export type { ListingCardPart } from '../core/format.js';
export { SparkClient, SparkProxyClient, SparkApiError } from '../index.js';
export type {
  SparkClientOptions,
  SparkProxyClientOptions,
  SparkListingsClient,
  SparkListingFields,
  SparkPage,
  SparkResource,
} from '../index.js';
