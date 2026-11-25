// SPDX-License-Identifier: AGPL-3.0-or-later
import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';

import { App } from './App.js';
import './index.css';

// No injectBlocksStyles(): Civitai Radio has its own look rather than the
// design-system pack's. blocks-react is used for the host bridge only.

async function mount(): Promise<ReactNode> {
  // `pnpm run dev:harness`: a mock host, never in production.
  if (import.meta.env.DEV && import.meta.env.VITE_DEV_HARNESS === 'true') {
    const { HarnessApp } = await import('./dev/harness.js');
    return <HarnessApp />;
  }
  return <App />;
}

const container = document.getElementById('root');
if (!container) throw new Error('#root missing from index.html');
void mount().then(node => createRoot(container).render(<StrictMode>{node}</StrictMode>));
