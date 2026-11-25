// SPDX-License-Identifier: AGPL-3.0-or-later
import { version } from '../../block.manifest.json';

const SOURCE_URL = 'https://github.com/bno84/CivApp-CivRadio';

/**
 * AGPL-3.0 §13: offer the source to everyone who uses the app. The sandbox
 * allows no popups, so the URL is plain selectable text, with the full URL in
 * the tooltip.
 */
export function SourceNote() {
  return (
    <p className="source-note" title={`Free software under AGPL-3.0-or-later. Source: ${SOURCE_URL}`}>
      v{version} · AGPL-3.0 · <span className="source-url">{SOURCE_URL.replace('https://', '')}</span>
    </p>
  );
}
