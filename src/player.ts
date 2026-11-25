// SPDX-License-Identifier: AGPL-3.0-or-later
// The player: one media element driven by the playback reducer (playback.ts).
// The element is the source of truth for time and duration; the reducer holds
// the queue and the viewer's intent.
import { useCallback, useEffect, useReducer, useRef, useState, type RefObject, type SyntheticEvent } from 'react';

import { initialPlayback, playbackReducer } from './playback.js';
import { current, type Queue, type Repeat } from './queue.js';
import type { Track } from './track.js';

/** Back within this many seconds of the start goes to the previous track; later, it restarts this one. */
const RESTART_AFTER = 3;
/** A track that fails to load is skipped after this long, so the viewer sees why. */
const SKIP_FAILED_MS = 1500;
/** How far the arrow keys and the media keys' seek actions move, in seconds. */
export const SEEK_STEP = 5;

export interface Player {
  queue: Queue<Track>;
  track: Track | null;
  playing: boolean;
  time: number;
  /** The current track's duration, once the element knows it. */
  duration: number | null;
  /** Durations learned so far, by track id. Civitai does not list them up front. */
  durations: ReadonlyMap<number, number>;
  /** The current track would not load; it is about to be skipped. */
  failed: boolean;
  /** Nothing in the queue would load. Play tries them all again. */
  stuck: boolean;
  volume: number;
  muted: boolean;

  /** Replaces the queue with a new playlist, keeping shuffle and repeat. */
  load: (tracks: readonly Track[]) => void;
  /** Adds tracks that arrived later (the next page of a collection). */
  append: (tracks: readonly Track[]) => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  previous: () => void;
  /** Plays the track with this id. */
  jumpTo: (id: number) => void;
  seek: (seconds: number) => void;
  /** Seeks relative to now, in seconds. */
  seekBy: (seconds: number) => void;
  toggleShuffle: () => void;
  cycleRepeat: () => void;
  setVolume: (volume: number) => void;
  toggleMute: () => void;
  /** Spread onto the `<video>` element. */
  mediaProps: {
    onPlay: () => void;
    onPause: (event: SyntheticEvent<HTMLVideoElement>) => void;
    onEnded: () => void;
    onTimeUpdate: (event: SyntheticEvent<HTMLVideoElement>) => void;
    onDurationChange: (event: SyntheticEvent<HTMLVideoElement>) => void;
    onVolumeChange: (event: SyntheticEvent<HTMLVideoElement>) => void;
    onError: () => void;
  };
}

/** How the player starts: shuffle, repeat and volume, as remembered. */
export interface PlayerStart {
  shuffle?: boolean;
  repeat?: Repeat;
  volume?: number;
  muted?: boolean;
}

export function usePlayer(mediaRef: RefObject<HTMLVideoElement | null>,
  { shuffle = true, repeat = 'all', volume: startVolume = 1, muted: startMuted = false }: PlayerStart = {}): Player {
  const [state, dispatch] = useReducer(playbackReducer, { shuffle, repeat }, initialPlayback);
  const { queue, playing, restarts, failed, stuck } = state;
  const [time, setTime] = useState(0);
  const [durations, setDurations] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [volume, setVolume] = useState(startVolume);
  const [muted, setMuted] = useState(startMuted);

  // The element starts at full volume; give it the remembered one, once.
  const [start] = useState({ volume: startVolume, muted: startMuted });
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = start.volume;
    media.muted = start.muted;
  }, [mediaRef, start]);

  const track = current(queue);
  const trackId = track?.id ?? null;

  /** A refused play() means the browser wants a click first: show Play again. */
  const onRefused = useCallback((error: unknown) => {
    // AbortError: the source changed under the request; the effect below retries.
    if (error instanceof DOMException && error.name === 'NotAllowedError') dispatch({ type: 'pause' });
  }, []);

  // Keep the element in step with the track and the intent.
  const shownRef = useRef<{ id: number; url: string; restarts: number } | null>(null);
  useEffect(() => {
    const media = mediaRef.current;
    if (!media) return;
    if (!track) {
      // Nothing to play: stop, and drop what the element still holds.
      shownRef.current = null;
      media.pause();
      if (media.currentSrc) {
        media.removeAttribute('src');
        media.load();
      }
      return;
    }
    const shown = shownRef.current;
    if (shown && shown.id !== track.id && shown.url === track.url) {
      // Another track, the same file: React leaves the element alone, so start
      // it over, which also announces its duration for this track.
      media.load();
    } else if (shown?.id === track.id && shown.restarts !== restarts) {
      media.currentTime = 0;
    }
    shownRef.current = { id: track.id, url: track.url, restarts };
    if (playing && media.paused) media.play().catch(onRefused);
    else if (!playing && !media.paused) media.pause();
  }, [mediaRef, track, playing, restarts, onRefused]);

  // A new track starts at zero on screen too.
  const [timeFor, setTimeFor] = useState(trackId);
  if (timeFor !== trackId) {
    setTimeFor(trackId);
    setTime(0);
  }

  // A failed track is skipped while playing, after a moment.
  const isFailed = trackId != null && failed.has(trackId);
  useEffect(() => {
    if (!isFailed || !playing || trackId == null) return;
    const timer = setTimeout(() => dispatch({ type: 'skipFailed', id: trackId }), SKIP_FAILED_MS);
    return () => clearTimeout(timer);
  }, [isFailed, playing, trackId]);

  /**
   * Play. Called from a click or key press, it also starts the element right
   * there, inside the gesture, as stricter browsers require.
   */
  const play = useCallback(() => {
    dispatch({ type: 'play' });
    const media = mediaRef.current;
    if (media && media.paused && media.currentSrc && !stuck) media.play().catch(onRefused);
  }, [mediaRef, stuck, onRefused]);

  const pause = useCallback(() => dispatch({ type: 'pause' }), []);

  const seek = useCallback((seconds: number) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.min(Math.max(0, seconds), media.duration);
    setTime(media.currentTime);
  }, [mediaRef]);

  const previous = useCallback(() => {
    const media = mediaRef.current;
    if (media && media.currentTime > RESTART_AFTER) {
      media.currentTime = 0;
      return;
    }
    dispatch({ type: 'back' });
  }, [mediaRef]);

  const changeVolume = useCallback((value: number) => {
    const media = mediaRef.current;
    if (!media) return;
    media.volume = Math.min(1, Math.max(0, value));
    media.muted = media.volume === 0;
  }, [mediaRef]);

  return {
    queue,
    track,
    playing,
    time,
    duration: trackId == null ? null : durations.get(trackId) ?? null,
    durations,
    failed: isFailed,
    stuck,
    volume,
    muted,

    load: tracks => dispatch({ type: 'load', tracks }),
    append: tracks => dispatch({ type: 'append', tracks }),
    play,
    pause,
    toggle: () => (playing ? pause() : play()),
    next: () => dispatch({ type: 'next' }),
    previous,
    jumpTo: useCallback((id: number) => dispatch({ type: 'jump', id }), []),
    seek,
    seekBy: seconds => seek((mediaRef.current?.currentTime ?? 0) + seconds),
    toggleShuffle: () => dispatch({ type: 'shuffle' }),
    cycleRepeat: () => dispatch({ type: 'repeat' }),
    setVolume: changeVolume,
    toggleMute: () => {
      const media = mediaRef.current;
      if (!media) return;
      media.muted = !media.muted;
      if (!media.muted && media.volume === 0) media.volume = 0.5;
    },
    mediaProps: {
      onPlay: () => dispatch({ type: 'play' }),
      // The element pauses itself just before `ended`; that is not the viewer pausing.
      onPause: event => {
        if (!event.currentTarget.ended) dispatch({ type: 'pause' });
      },
      onEnded: () => dispatch({ type: 'ended' }),
      onTimeUpdate: event => setTime(event.currentTarget.currentTime),
      onDurationChange: event => {
        const { duration } = event.currentTarget;
        if (trackId == null || !Number.isFinite(duration) || duration <= 0) return;
        setDurations(known => (known.get(trackId) === duration ? known : new Map(known).set(trackId, duration)));
      },
      onVolumeChange: event => {
        setVolume(event.currentTarget.volume);
        setMuted(event.currentTarget.muted);
      },
      onError: () => {
        if (trackId != null) dispatch({ type: 'failed', id: trackId });
      },
    },
  };
}
