import { createElement, type ReactNode } from 'react';
import { ListingCard, type ListingCardProps } from './ListingCard.js';
import { joinClassNames } from '../core/format.js';
import type { SparkListingFields, SparkResource } from '../core/types.js';

export interface ListingGridProps<Fields extends Record<string, unknown> = SparkListingFields> {
  listings: Array<SparkResource<Fields>>;
  loading?: boolean;
  error?: Error | null | undefined;
  /** Resolve a photo URL per listing, e.g. from a media lookup you've already done. */
  getPhotoUrl?: (listing: SparkResource<Fields>) => string | undefined;
  /** Shorthand for `classNames.root`. */
  className?: string;
  classNames?: { root?: string; grid?: string };
  /** Passed through to every `ListingCard` (classNames, styles, formatters, etc). */
  cardProps?: Omit<ListingCardProps<Fields>, 'listing' | 'photoUrl'>;
  loadingContent?: ReactNode;
  errorContent?: ReactNode | ((error: Error) => ReactNode);
  emptyContent?: ReactNode;
  /** Fully override how each listing renders; receives the same props ListingCard would get. */
  renderCard?: (listing: SparkResource<Fields>, photoUrl: string | undefined) => ReactNode;
}

export function ListingGrid<Fields extends Record<string, unknown> = SparkListingFields>({
  listings,
  loading,
  error,
  getPhotoUrl,
  className,
  classNames = {},
  cardProps,
  loadingContent,
  errorContent,
  emptyContent,
  renderCard,
}: ListingGridProps<Fields>): ReactNode {
  const rootClassName = joinClassNames(classNames.root, className);

  if (loading) return createElement('div', { className: rootClassName }, loadingContent ?? null);
  if (error) {
    return createElement(
      'div',
      { className: rootClassName },
      typeof errorContent === 'function' ? errorContent(error) : (errorContent ?? error.message),
    );
  }
  if (!listings.length) return createElement('div', { className: rootClassName }, emptyContent ?? null);

  return createElement(
    'div',
    { className: rootClassName },
    createElement(
      'div',
      { className: classNames.grid },
      listings.map((listing) => {
        const photoUrl = getPhotoUrl?.(listing);
        return createElement(
          'div',
          { key: listing.Id },
          renderCard ? renderCard(listing, photoUrl) : createElement(ListingCard<Fields>, { listing, photoUrl, ...cardProps }),
        );
      }),
    ),
  );
}
