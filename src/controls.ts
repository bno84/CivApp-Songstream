// SPDX-License-Identifier: AGPL-3.0-or-later
// Ways to drive the player from outside the on-screen buttons: the media keys
// and lock screen (Media Session API) and the keyboard.
//
// Media Session inside a sandboxed, cross-origin iframe is best effort: the
// docs say nothing either way, and browsers route media keys to the frame that
// is playing. Every call is guarded, so a browser that refuses just has no
// media keys.
import { useEffect, useEffectEvent } from 'react';

import { SEEK_STEP, type Player } from './player.js';

const ACTIONS: MediaSessionAction[] = [
  'play', 'pause', 'previoustrack', 'nexttrack', 'seekbackward', 'seekforward', 'seekto', 'stop',
];

function session(): MediaSession | null {
  return typeof navigator !== 'undefined' && 'mediaSession' in navigator ? navigator.mediaSession : null;
}

export function useMediaSession(player: Player, { title, album }: { title: string; album: string | null }) {
  const { track, playing, time, duration } = player;
  const artwork = track?.still ?? null;
  const artist = track?.creator?.username ?? '';

  useEffect(() => {
    const media = session();
    if (!media || typeof MediaMetadata === 'undefined') return;
    try {
      media.metadata = track ? new MediaMetadata({
        title, artist, album: album ?? 'Songstream',
        artwork: artwork ? [{ src: artwork, sizes: '450x450' }] : [],
      }) : null;
    } catch {
      // A refused session leaves the defaults.
    }
  }, [track, title, artist, album, artwork]);

  useEffect(() => {
    const media = session();
    if (media) media.playbackState = track ? (playing ? 'playing' : 'paused') : 'none';
  }, [track, playing]);

  useEffect(() => {
    const media = session();
    if (!media?.setPositionState || duration == null) return;
    try {
      media.setPositionState({ duration, position: Math.min(time, duration), playbackRate: 1 });
    } catch {
      // Ignored: a position the browser rejects only affects the lock screen.
    }
  }, [time, duration]);

  const handle = useEffectEvent((details: MediaSessionActionDetails) => {
    switch (details.action) {
      case 'play': player.play(); break;
      case 'pause': case 'stop': player.pause(); break;
      case 'previoustrack': player.previous(); break;
      case 'nexttrack': player.next(); break;
      case 'seekbackward': player.seekBy(-(details.seekOffset ?? SEEK_STEP)); break;
      case 'seekforward': player.seekBy(details.seekOffset ?? SEEK_STEP); break;
      case 'seekto': if (details.seekTime != null) player.seek(details.seekTime); break;
    }
  });

  useEffect(() => {
    const media = session();
    if (!media) return;
    for (const action of ACTIONS) {
      try {
        media.setActionHandler(action, details => handle(details));
      } catch {
        // This browser does not support the action.
      }
    }
    return () => {
      for (const action of ACTIONS) {
        try {
          media.setActionHandler(action, null);
        } catch {
          // As above.
        }
      }
    };
  }, []);
}

/** Space plays and pauses, ←/→ seek, Shift+←/→ skip. Typing in a field or pressing a button is left alone. */
export function useKeyboard(player: Player) {
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target as HTMLElement | null;
    const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
    // A tablist handles its own arrow keys.
    if (target?.closest('[role="tablist"]') && event.key.startsWith('Arrow')) return;
    switch (event.key) {
      case 'MediaPlayPause': player.toggle(); break;
      case 'MediaTrackNext': player.next(); break;
      case 'MediaTrackPrevious': player.previous(); break;
      case ' ':
        if (typing || target?.closest('button, a, [role="tab"], [role="slider"]')) return;
        player.toggle();
        break;
      case 'ArrowLeft': case 'ArrowRight': {
        if (typing || target?.closest('[role="slider"], input')) return;
        const forward = event.key === 'ArrowRight';
        if (event.shiftKey) {
          if (forward) player.next();
          else player.previous();
        } else {
          player.seekBy(forward ? SEEK_STEP : -SEEK_STEP);
        }
        break;
      }
      default: return;
    }
    event.preventDefault();
  });

  useEffect(() => {
    const listener = (event: KeyboardEvent) => onKey(event);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);
}

