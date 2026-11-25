// SPDX-License-Identifier: AGPL-3.0-or-later
// Fits the app to the part of its frame that is on screen.
//
// Civitai sizes a page app's frame to fill its content area, ignores resize
// requests, and does not tell the app how much of the frame is visible. On
// civitai.com the frame runs on below the fold (Civitai's header sits above it),
// so a layout filling `100dvh` puts the player controls off screen and scrolls
// the page.
//
// An IntersectionObserver in a cross-origin frame reports how much of an
// element is visible in the top-level page, clipped by every scroll container
// around the frame. A fixed probe the height of the frame therefore measures
// the visible height, which is published as `--visible-height` on <html> for
// the CSS to use. The harness, where the frame is the whole window, measures
// the full height, so nothing changes there.
//
// Civitai's bottom bar is drawn over the page rather than beside it, so the
// observer cannot see it. When the frame runs past the bottom of the screen,
// which is how Civitai embeds it, the bar's height is kept clear as well.

const STEPS = 200;
/** Civitai's bottom bar (about 36px) and a little air. Not measurable from inside the frame. */
const HOST_BAR = 40;

export function fitToVisibleHeight(root: HTMLElement = document.documentElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  const probe = document.createElement('div');
  probe.setAttribute('aria-hidden', 'true');
  Object.assign(probe.style, {
    position: 'fixed', top: '0', bottom: '0', left: '0', width: '1px', pointerEvents: 'none', visibility: 'hidden',
  });
  document.body.append(probe);

  const observer = new IntersectionObserver(([entry]) => {
    if (!entry?.isIntersecting) return;
    const { top, bottom } = entry.intersectionRect;
    // Measured only while the frame's top is on screen. Once the page around
    // the frame scrolls, the last fit is kept rather than shrinking the app.
    if (top > 1) return;
    const clipped = bottom < window.innerHeight - 1;
    const height = clipped ? bottom - HOST_BAR : window.innerHeight;
    root.style.setProperty('--visible-height', `${Math.floor(height)}px`);
  }, { threshold: Array.from({ length: STEPS + 1 }, (_, i) => i / STEPS) });
  observer.observe(probe);

  return () => {
    observer.disconnect();
    probe.remove();
  };
}
