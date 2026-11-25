// SPDX-License-Identifier: AGPL-3.0-or-later
import { createFakeStorage } from '@civitai/sdk/testing';

import manifest from '../../block.manifest.json';

/** One manifest-checked, in-memory store per dev frame. */
export function createDevStorage() {
  return createFakeStorage({ manifest, viewer: { username: 'dev-viewer' } }).storage;
}
