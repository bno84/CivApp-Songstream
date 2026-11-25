// SPDX-License-Identifier: AGPL-3.0-or-later
// Inline stroke icons (24×24, currentColor), so the controls need no icon font.

const PATHS = {
  play: <path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" />,
  pause: <><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" stroke="none" /></>,
  previous: <><path d="M18 6v12L9 12z" fill="currentColor" stroke="none" /><path d="M6 6v12" /></>,
  next: <><path d="M6 6v12l9-6z" fill="currentColor" stroke="none" /><path d="M18 6v12" /></>,
  shuffle: <><path d="M4 7h3.5c2 0 3.2 1 4.3 2.6l2.4 4.8C15.3 16 16.5 17 18.5 17H20" /><path d="M4 17h3.5c1.4 0 2.4-.5 3.2-1.4" /><path d="M14.3 8.4C15.1 7.5 16.1 7 17.5 7H20" /><path d="m17.5 4.5 2.5 2.5-2.5 2.5" /><path d="m17.5 14.5 2.5 2.5-2.5 2.5" /></>,
  repeat: <><path d="M4 11V9a3 3 0 0 1 3-3h12" /><path d="m16 3 3 3-3 3" /><path d="M20 13v2a3 3 0 0 1-3 3H5" /><path d="m8 21-3-3 3-3" /></>,
  volume: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></>,
  muted: <><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" fill="currentColor" stroke="none" /><path d="m16 9.5 5 5" /><path d="m21 9.5-5 5" /></>,
  external: <><path d="M14 5h5v5" /><path d="M19 5l-8 8" /><path d="M17 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1h4" /></>,
  comment: <path d="M5 6.5A1.5 1.5 0 0 1 6.5 5h11A1.5 1.5 0 0 1 19 6.5v8a1.5 1.5 0 0 1-1.5 1.5H10l-4 3.5V16h.5" />,
  plus: <><path d="M12 5v14" /><path d="M5 12h14" /></>,
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      {PATHS[name]}
    </svg>
  );
}
