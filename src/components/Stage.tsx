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
  const { track, failed } = player;
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
        <button type="button" className="stage-play" onClick={player.play} aria-label="Play">
          <Icon name="play" size={34} />
        </button>
      )}
      {failed != null && <p className="stage-note">This one would not play. Skipping…</p>}
      {!track && <p className="stage-note">{status ?? 'Pick a playlist to start.'}</p>}
    </div>
  );
}
