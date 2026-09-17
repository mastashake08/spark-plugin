import type { SparkListingFields } from './types.js';

export function defaultFormatPrice(price: unknown): string {
  if (typeof price !== 'number') return '';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(
    price,
  );
}

export function defaultFormatAddress(fields: SparkListingFields): string {
  return (fields.UnparsedAddress as string | undefined) ?? '';
}

export function defaultFormatMeta(fields: SparkListingFields): string {
  const parts: string[] = [];
  if (typeof fields.BedroomsTotal === 'number') parts.push(`${fields.BedroomsTotal} bd`);
  if (typeof fields.BathroomsTotalInteger === 'number') parts.push(`${fields.BathroomsTotalInteger} ba`);
  if (typeof fields.LivingArea === 'number') parts.push(`${fields.LivingArea.toLocaleString()} sqft`);
  return parts.join(' · ');
}

/** Named parts of a ListingCard, used as keys for `classNames`/`styles` overrides. */
export const LISTING_CARD_PARTS = ['root', 'photo', 'photoPlaceholder', 'body', 'price', 'address', 'meta', 'status'] as const;
export type ListingCardPart = (typeof LISTING_CARD_PARTS)[number];

export function joinClassNames(...values: Array<string | undefined | false>): string | undefined {
  const joined = values.filter(Boolean).join(' ');
  return joined.length ? joined : undefined;
}
