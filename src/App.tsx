// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';

import { useBlockContext, useBlockResize, useRequestSignIn } from '@civitai/blocks-react';

import type { ApiClient } from './api.js';
import { Radio } from './components/Radio.js';

const SOURCE_URL = 'https://github.com/bno84/CivApp-CivRadio';

export function App({ api }: { api: ApiClient }) {
  const { ready, viewer, theme } = useBlockContext();
  const { requestSignIn } = useRequestSignIn();
  const rootRef = useRef<HTMLElement>(null);
  useBlockResize(rootRef);

  // The page behind the app follows the host's theme; index.html seeds it pre-paint.
  useEffect(() => {
    if (ready) document.documentElement.dataset.theme = theme;
  }, [ready, theme]);

  let body;
  if (!ready) {
    body = <p className="center-note">Tuning in…</p>;
  } else if (!viewer) {
    body = (
      <div className="center-note">
        <p>Sign in to Civitai to play collections.</p>
        <button type="button" className="chip on" onClick={() => requestSignIn()}>Sign in</button>
      </div>
    );
  } else {
    body = <Radio api={api} />;
  }

  return (
    <main ref={rootRef} className="app" data-theme={theme}>
      {body}
      {/* AGPL-3.0 §13: offer the source to everyone who uses the app. The
          sandbox allows no popups, so the URL is plain selectable text. */}
      <footer className="footer">
        Free software under AGPL-3.0-or-later. Source: <span className="source-url">{SOURCE_URL}</span>
      </footer>
    </main>
  );
}
