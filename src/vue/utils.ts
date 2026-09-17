import type { CSSProperties } from 'vue';

/** Builds `h()` props with `class`/`style` omitted entirely when unset, so Vue's SSR renderer doesn't emit empty `class=""`/`style=""` attributes. */
export function partProps(className?: string, style?: CSSProperties): Record<string, unknown> {
  const props: Record<string, unknown> = {};
  if (className !== undefined) props.class = className;
  if (style !== undefined) props.style = style;
  return props;
}
