// SPDX-License-Identifier: AGPL-3.0-or-later
import { StrictMode, useMemo, useRef, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { useBlockToken, useHostOrigin } from '@civitai/blocks-react';
import { initialize, type DocumentStorage } from '@civitai/sdk';

import { App } from './App.js';
import { createHttpClient } from './api.js';
import { createMemory } from './memory.js';
import { fitToVisibleHeight } from './viewport.js';
import './index.css';

// No injectBlocksStyles(): Civitai Radio has its own look rather than the
// design-system pack's. blocks-react is used for the host bridge only.

/** The real API, on the validated host origin, with the host-minted block token. */
function LiveApp({ previewStorage }: { previewStorage?: DocumentStorage }) {
  const origin = useHostOrigin();
  const token = useBlockToken();
  // Read at request time, so a refreshed token is used without rebuilding the
  // client. The client reads the ref only inside request callbacks, never
  // during render, so this latest-value ref is safe.
  /* eslint-disable react-hooks/refs */
  const tokenRef = useRef(token);
  tokenRef.current = token;
  const api = useMemo(() => createHttpClient({
    origin: origin ?? window.location.origin,
    getToken: () => tokenRef.current.raw || undefined,
    refreshToken: () => tokenRef.current.refresh(),
  }), [origin]);
  // Keep the tunnel's manifest-backed store local. The live document store
  // uses the same block token to avoid a second bridge and BLOCK_READY.
  const memory = useMemo(() => createMemory(previewStorage ?? initialize({
    siteUrl: `${origin ?? window.location.origin}/api/v1`,
    token: () => tokenRef.current.raw,
    refresh: async () => (await tokenRef.current.refresh()).raw,
  }).then(app => app.storage)), [origin, previewStorage]);
  /* eslint-enable react-hooks/refs */
  return <App api={api} memory={memory} />;
}

async function mount(): Promise<ReactNode> {
  // `pnpm run dev:harness`: a mock host and sample playlists, never in production.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_HARNESS === 'true') {
    const { HarnessApp } = await import('./dev/harness.js');
    return <HarnessApp />;
  }
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_TUNNEL === 'true') {
    const { createDevStorage } = await import('./dev/storage.js');
    return <LiveApp previewStorage={createDevStorage()} />;
  }
  return <LiveApp />;
}

fitToVisibleHeight();

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');
void mount().then(node => createRoot(container).render(<StrictMode>{node}</StrictMode>));
