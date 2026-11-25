// SPDX-License-Identifier: AGPL-3.0-or-later
import type { RefObject } from 'react';

import type { Player } from '../player.js';
import { Icon } from './Icon.js';

/**
 * The media element and what sits over it. The one `<video>` element stays
 * mounted across tracks (only its source changes), so the browser keeps the
 * permission to play that the viewer's first click gave it.
 */
export function Stage({ player, mediaRef, status }: {
  player: Player;
  mediaRef: RefObject<HTMLVideoElement | null>;
  status: string | null;
}) {
  const { track, failed, stuck } = player;
  return (
    <div className="stage">
      {track?.still && <div className="stage-backdrop" style={{ backgroundImage: `url(${JSON.stringify(track.still)})` }} />}
      <video
        ref={mediaRef}
        className="stage-media"
        src={track?.url}
        poster={track?.still ?? undefined}
        playsInline
        preload="auto"
        onClick={player.toggle}
        {...player.mediaProps}
      />
      {track && !player.playing && !failed && (
        <button type="button" className="stage-play" onClick={player.play}
          aria-label={stuck ? 'Try playing again' : 'Play'}>
          <Icon name="play" size={34} />
        </button>
      )}
      {failed && !stuck && player.playing && <p className="stage-note">This one would not play. Skipping…</p>}
      {stuck && <p className="stage-note stage-note-bottom">None of these would play. Press play to try again.</p>}
      {!track && <p className="stage-note">{status ?? 'Pick a playlist to start.'}</p>}
    </div>
  );
}
