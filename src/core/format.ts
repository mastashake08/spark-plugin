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
  // Prefer the field names confirmed on a live Spark Platform response; fall
  // back to the RESO Data Dictionary names for MLSs that report those instead.
  const beds = fields.BedsTotal ?? fields.BedroomsTotal;
  const baths = fields.BathsTotal ?? fields.BathroomsTotalInteger;
  const area = fields.BuildingAreaTotal ?? fields.LivingArea;
  if (typeof beds === 'number') parts.push(`${beds} bd`);
  if (typeof baths === 'number') parts.push(`${baths} ba`);
  if (typeof area === 'number') parts.push(`${area.toLocaleString()} sqft`);
  return parts.join(' · ');
}

export function defaultFormatRemarks(fields: SparkListingFields): string {
  return (fields.PublicRemarks as string | undefined) ?? '';
}

/** Named parts of a ListingCard, used as keys for `classNames`/`styles` overrides. */
export const LISTING_CARD_PARTS = [
  'root',
  'photo',
  'photoPlaceholder',
  'body',
  'price',
  'address',
  'meta',
  'status',
  'remarks',
] as const;
export type ListingCardPart = (typeof LISTING_CARD_PARTS)[number];

/** Which optional parts to render, keyed by `ListingCardPart`. Omitted or `undefined` entries default to shown; pass `false` to hide a part at runtime. */
export type ListingCardVisibility = Partial<Record<ListingCardPart, boolean>>;

export function joinClassNames(...values: Array<string | undefined | false>): string | undefined {
  const joined = values.filter(Boolean).join(' ');
  return joined.length ? joined : undefined;
}
