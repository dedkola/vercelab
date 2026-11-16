import { clsx, type ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

// `text-2xs` and `text-body` are custom font sizes from app/globals.css. Without
// registering them, tailwind-merge treats them as text colors and drops classes
// such as `text-white` or `text-[var(--blue)]` that appear earlier in the list.
const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['2xs', 'body'],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
