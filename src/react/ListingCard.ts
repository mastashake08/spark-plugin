import { createElement, type CSSProperties, type ReactNode } from 'react';
import {
  defaultFormatAddress,
  defaultFormatMeta,
  defaultFormatPrice,
  defaultFormatRemarks,
  joinClassNames,
  type ListingCardPart,
  type ListingCardVisibility,
} from '../core/format.js';
import type { SparkListingFields, SparkResource } from '../core/types.js';

export interface ListingCardProps<Fields extends Record<string, unknown> = SparkListingFields> {
  listing: SparkResource<Fields>;
  /** URL for the card's photo, e.g. from `client.listings.media(listing.Id)`. Omit to render the `photoPlaceholder` part instead. */
  photoUrl?: string;
  photoAlt?: string;
  /** Shorthand for `classNames.root`. */
  className?: string;
  /** Shorthand for `styles.root`. */
  style?: CSSProperties;
  /** Per-part class overrides. No classes are applied unless you pass them — this component ships unstyled. */
  classNames?: Partial<Record<ListingCardPart, string>>;
  styles?: Partial<Record<ListingCardPart, CSSProperties>>;
  /** Toggle which parts render, e.g. `{ remarks: false }`. Omitted parts default to shown. */
  show?: ListingCardVisibility;
  formatPrice?: (price: unknown) => string;
  formatAddress?: (fields: Fields) => string;
  formatMeta?: (fields: Fields) => string;
  formatRemarks?: (fields: Fields) => string;
}

export function ListingCard<Fields extends Record<string, unknown> = SparkListingFields>({
  listing,
  photoUrl,
  photoAlt,
  className,
  style,
  classNames = {},
  styles = {},
  show = {},
  formatPrice = defaultFormatPrice,
  formatAddress = defaultFormatAddress as (fields: Fields) => string,
  formatMeta = defaultFormatMeta as (fields: Fields) => string,
  formatRemarks = defaultFormatRemarks as (fields: Fields) => string,
}: ListingCardProps<Fields>): ReactNode {
  const f = listing.StandardFields;
  const status = f.StandardStatus as string | undefined;

  return createElement(
    'div',
    { className: joinClassNames(classNames.root, className), style: { ...styles.root, ...style } },
    [
      status && show.status !== false
        ? createElement('span', { key: 'status', className: classNames.status, style: styles.status }, status)
        : null,
      show.photo !== false
        ? photoUrl
          ? createElement('img', {
              key: 'photo',
              className: classNames.photo,
              style: styles.photo,
              src: photoUrl,
              alt: photoAlt ?? formatAddress(f),
            })
          : createElement('div', {
              key: 'photo-placeholder',
              className: classNames.photoPlaceholder,
              style: styles.photoPlaceholder,
            })
        : null,
      createElement('div', { key: 'body', className: classNames.body, style: styles.body }, [
        show.price !== false
          ? createElement('div', { key: 'price', className: classNames.price, style: styles.price }, formatPrice(f.ListPrice))
          : null,
        show.address !== false
          ? createElement('div', { key: 'address', className: classNames.address, style: styles.address }, formatAddress(f))
          : null,
        show.meta !== false
          ? createElement('div', { key: 'meta', className: classNames.meta, style: styles.meta }, formatMeta(f))
          : null,
        show.remarks !== false
          ? createElement('div', { key: 'remarks', className: classNames.remarks, style: styles.remarks }, formatRemarks(f))
          : null,
      ]),
    ],
  );
}
