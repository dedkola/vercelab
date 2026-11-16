const BASE_ROOT_FONT_SIZE = 16;

function readRootFontSize() {
  if (typeof window === 'undefined') {
    return BASE_ROOT_FONT_SIZE;
  }

  const rootFontSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);

  return Number.isFinite(rootFontSize) && rootFontSize > 0 ? rootFontSize : BASE_ROOT_FONT_SIZE;
}

/**
 * Canvas- and terminal-rendered text cannot use rem, so scale their pixel sizes by the
 * live root font size to stay in step with the rest of the interface.
 */
export function scaledFontSize(basePx: number, rootFontSize = readRootFontSize()) {
  return Math.round(basePx * (rootFontSize / BASE_ROOT_FONT_SIZE));
}
