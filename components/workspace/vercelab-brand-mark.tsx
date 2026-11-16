/**
 * Vercelab mark: an outlined shipping container with a loaded orange
 * container stacked above it. Shares the ink-outline + orange-fill language
 * of the Homelab Index mark. Keep in sync with `app/icon.svg`.
 */
export function VercelabBrandMark() {
  return (
    <svg className="vercelab-brand-mark" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
      <rect
        x="2.25"
        y="17.75"
        width="27.5"
        height="12"
        rx="1.75"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
      />
      <path
        d="M9.5 21v5.5M16 21v5.5M22.5 21v5.5"
        stroke="currentColor"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
      <rect x="1" y="2" width="30" height="13" rx="1.75" fill="var(--orange, #f48120)" />
      <path
        d="M9.5 5.5v6M16 5.5v6M22.5 5.5v6"
        stroke="#ffffff"
        strokeOpacity="0.55"
        strokeWidth="2.25"
        strokeLinecap="round"
      />
    </svg>
  );
}
