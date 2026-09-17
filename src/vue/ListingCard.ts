import { defineComponent, h, type CSSProperties, type PropType } from 'vue';
import {
  defaultFormatAddress,
  defaultFormatMeta,
  defaultFormatPrice,
  type ListingCardPart,
} from '../core/format.js';
import type { SparkListingFields, SparkResource } from '../core/types.js';
import { partProps } from './utils.js';

/**
 * Unstyled listing card. `class`/`style` on the component usage apply to the
 * root element automatically (Vue's attribute fallthrough); use `classNames`/
 * `styles` to target inner parts (photo, price, address, meta, status).
 *
 * Note: unlike the React version, this component isn't generic over your
 * custom `Fields` type — `defineComponent` doesn't support that cleanly
 * outside `<script setup generic="...">`. Extra fields on your listing are
 * still accepted structurally; only the fields this component reads
 * (ListPrice, UnparsedAddress, etc.) need to match `SparkListingFields`.
 */
export const ListingCard = defineComponent({
  name: 'ListingCard',
  props: {
    listing: { type: Object as PropType<SparkResource<SparkListingFields>>, required: true },
    photoUrl: { type: String, default: undefined },
    photoAlt: { type: String, default: undefined },
    classNames: {
      type: Object as PropType<Partial<Record<ListingCardPart, string>>>,
      default: () => ({}),
    },
    styles: {
      type: Object as PropType<Partial<Record<ListingCardPart, CSSProperties>>>,
      default: () => ({}),
    },
    formatPrice: { type: Function as PropType<(price: unknown) => string>, default: defaultFormatPrice },
    formatAddress: {
      type: Function as PropType<(fields: SparkListingFields) => string>,
      default: defaultFormatAddress,
    },
    formatMeta: {
      type: Function as PropType<(fields: SparkListingFields) => string>,
      default: defaultFormatMeta,
    },
  },
  setup(props) {
    return () => {
      const f = props.listing.StandardFields;
      const status = f.StandardStatus as string | undefined;

      return h('div', partProps(props.classNames.root, props.styles.root), [
        status ? h('span', partProps(props.classNames.status, props.styles.status), status) : null,
        props.photoUrl
          ? h('img', {
              ...partProps(props.classNames.photo, props.styles.photo),
              src: props.photoUrl,
              alt: props.photoAlt ?? props.formatAddress(f),
            })
          : h('div', partProps(props.classNames.photoPlaceholder, props.styles.photoPlaceholder)),
        h('div', partProps(props.classNames.body, props.styles.body), [
          h('div', partProps(props.classNames.price, props.styles.price), props.formatPrice(f.ListPrice)),
          h('div', partProps(props.classNames.address, props.styles.address), props.formatAddress(f)),
          h('div', partProps(props.classNames.meta, props.styles.meta), props.formatMeta(f)),
        ]),
      ]);
    };
  },
});
