// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from 'react';

import { useOpen } from '../open.js';

/**
 * A link to a Civitai page, opened by the host in a new tab. It is a button,
 * not an `<a>`: the sandbox cannot navigate anywhere itself. A middle click
 * opens it too, as it would a link, and does not start the browser's autoscroll.
 */
export function CivitaiLink({ path, className, title, ariaLabel, children }: {
  path: string;
  className?: string;
  title?: string;
  ariaLabel?: string;
  children: ReactNode;
}) {
  const open = useOpen();
  return (
    <button
      type="button"
      className={className}
      title={title}
      aria-label={ariaLabel}
      onClick={() => open(path)}
      onMouseDown={event => { if (event.button === 1) event.preventDefault(); }}
      onAuxClick={event => {
        if (event.button !== 1) return;
        event.preventDefault();
        open(path);
      }}
    >
      {children}
    </button>
  );
}
