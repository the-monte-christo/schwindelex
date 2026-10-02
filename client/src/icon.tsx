import type { IconName } from './icons.gen.ts';

/** Hand-drawn icon from the sprite, colored with the current text color (ink or chalk). Decorative. */
export function Icon({ name, class: extra }: { name: IconName; class?: string }) {
  return <span class={`icon icon-${name}${extra ? ` ${extra}` : ''}`} aria-hidden="true" />;
}
