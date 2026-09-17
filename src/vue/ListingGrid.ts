import { defineComponent, h, type PropType, type VNode } from 'vue';
import { ListingCard } from './ListingCard.js';
import type { SparkListingFields, SparkResource } from '../core/types.js';
import { partProps } from './utils.js';

export const ListingGrid = defineComponent({
  name: 'ListingGrid',
  props: {
    listings: { type: Array as PropType<Array<SparkResource<SparkListingFields>>>, required: true },
    loading: { type: Boolean, default: false },
    error: { type: Object as PropType<Error | null>, default: null },
    getPhotoUrl: {
      type: Function as PropType<(listing: SparkResource<SparkListingFields>) => string | undefined>,
      default: undefined,
    },
    classNames: {
      type: Object as PropType<{ root?: string; grid?: string }>,
      default: () => ({}),
    },
    /** Passed through to every ListingCard (classNames, styles, formatters, etc). */
    cardProps: { type: Object as PropType<Record<string, unknown>>, default: () => ({}) },
  },
  setup(props, { slots }) {
    return () => {
      if (props.loading) return h('div', partProps(props.classNames.root), slots.loading?.());
      if (props.error) {
        return h('div', partProps(props.classNames.root), slots.error?.({ error: props.error }) ?? props.error.message);
      }
      if (!props.listings.length) return h('div', partProps(props.classNames.root), slots.empty?.());

      return h('div', partProps(props.classNames.root), [
        h(
          'div',
          partProps(props.classNames.grid),
          props.listings.map((listing): VNode => {
            const photoUrl = props.getPhotoUrl?.(listing);
            return slots.card
              ? (h('div', { key: listing.Id }, slots.card({ listing, photoUrl })) as VNode)
              : h(ListingCard, { key: listing.Id, listing, photoUrl, ...props.cardProps });
          }),
        ),
      ]);
    };
  },
});
