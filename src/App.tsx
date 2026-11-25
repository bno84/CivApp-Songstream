// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';

import { useBlockContext, useBlockResize } from '@civitai/blocks-react';

const SOURCE_URL = 'https://github.com/bno84/CivApp-CivRadio';

/** The app shell. The player itself lands once its visual direction is chosen. */
export function App() {
  const { ready, viewer, theme } = useBlockContext();
  const rootRef = useRef<HTMLElement>(null);
  useBlockResize(rootRef);

  // The page behind the app follows the host's theme; index.html seeds it pre-paint.
  useEffect(() => {
    if (ready) document.documentElement.dataset.theme = theme;
  }, [ready, theme]);

  return (
    <main ref={rootRef} className="app" data-theme={theme}>
      <header>
        <h1>Civitai Radio</h1>
        <p className="dimmed">
          {!ready ? 'Tuning in…' : viewer ? `Hi ${viewer.username}. The player is on its way.` : 'The player is on its way.'}
        </p>
      </header>
      {/* AGPL-3.0 §13: offer the source to everyone who uses the app. The
          sandbox allows no popups, so the URL is plain selectable text. */}
      <footer className="footer dimmed">
        Free software under AGPL-3.0-or-later. Source:{' '}
        <span className="source-url">{SOURCE_URL}</span>
      </footer>
    </main>
  );
}
