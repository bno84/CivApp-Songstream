// SPDX-License-Identifier: AGPL-3.0-or-later
// Development only: the SDK's mock host (BLOCK_INIT, a signed-in viewer, theme).
import { getTransport } from '@civitai/blocks-react';
import { Harness } from '@civitai/blocks-react/testing';

import { App } from '../App.js';

// The mock host answers from this origin; the transport drops anything else.
getTransport({ allowedParentOrigins: [window.location.origin] });

export function HarnessApp() {
  return (
    <Harness>
      <App />
    </Harness>
  );
}
