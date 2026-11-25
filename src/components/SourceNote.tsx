// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';

import { copyText } from '../clipboard.js';

const SOURCE_URL = 'https://github.com/bno84/CivApp-CivRadio';

/**
 * AGPL-3.0 §13: offer the source to everyone who uses the app.
 *
 * It cannot be a link. The sandbox has neither `allow-popups` nor
 * `allow-top-navigation`, apps at this trust tier may not ask for them, and
 * the host's navigate only opens Civitai pages. So a click copies the URL, and
 * the URL stays selectable. The store page links the same repository from the
 * manifest's `repository` field.
 */
export function SourceNote() {
  const [copied, setCopied] = useState<'yes' | 'no' | null>(null);
  const copy = async () => {
    setCopied((await copyText(SOURCE_URL)) ? 'yes' : 'no');
    setTimeout(() => setCopied(null), 2000);
  };
  return (
    <p className="source-note">
      AGPL-3.0 ·{' '}
      <button type="button" className="source-url" onClick={() => void copy()}
        title={`Free software under AGPL-3.0-or-later. Click to copy the source link: ${SOURCE_URL}`}>
        {copied === 'yes' ? 'Source link copied' : copied === 'no' ? 'Select the link to copy it' : SOURCE_URL.replace('https://', '')}
      </button>
    </p>
  );
}
