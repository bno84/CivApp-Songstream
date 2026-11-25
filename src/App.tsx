// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useRef } from 'react';

import { useBlockContext, useBlockResize, useRequestSignIn } from '@civitai/blocks-react';

import type { ApiClient } from './api.js';
import { Radio } from './components/Radio.js';
import { SourceNote } from './components/SourceNote.js';

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
    body = <div className="center-note"><p>Tuning in…</p><SourceNote /></div>;
  } else if (!viewer) {
    body = (
      <div className="center-note">
        <p>Sign in to Civitai to play collections.</p>
        <button type="button" className="chip on" onClick={() => requestSignIn()}>Sign in</button>
        <SourceNote />
      </div>
    );
  } else {
    body = <Radio api={api} />;
  }

  return (
    <main ref={rootRef} className="app" data-theme={theme}>
      {/* The player shows the source note in its top bar; the other states beside their message. */}
      {body}
    </main>
  );
}
