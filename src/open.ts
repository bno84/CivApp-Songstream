// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback } from 'react';

import { useCivitaiNavigate } from '@civitai/blocks-react';

/**
 * Opens a Civitai page in a new tab. A sandboxed frame cannot open links
 * itself, so it goes through the host; `scope: 'site'` makes the path a
 * Civitai page rather than one inside this app. The host only allows it on the
 * public app page, and refuses silently in previews.
 */
export function useOpen(): (path: string) => void {
  const { navigate } = useCivitaiNavigate();
  return useCallback((path: string) => navigate(path, { scope: 'site', target: 'new_tab' }), [navigate]);
}
