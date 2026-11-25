// SPDX-License-Identifier: AGPL-3.0-or-later
// The player: one media element, the queue, and what the viewer asked for
// (playing or not). The element is the source of truth for time and duration;
// `playing` is the viewer's intent, which survives a track change.
import { useCallback, useEffect, useState, type RefObject, type SyntheticEvent } from 'react';

import {
  advance, appendItems, back, createQueue, current, jump, nextRepeat, setRepeat, setShuffle, type Queue, type Repeat,
} from './queue.js';
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
  /** The id of a track that failed to load, while it is current. */
  failed: number | null;
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
  jumpTo: (at: number) => void;
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

export function usePlayer(mediaRef: RefObject<HTMLVideoElement | null>,
  { shuffle = true, repeat = 'all' }: { shuffle?: boolean; repeat?: Repeat } = {}): Player {
  const [queue, setQueue] = useState<Queue<Track>>(() => createQueue<Track>([], { shuffle, repeat }));
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [durations, setDurations] = useState<ReadonlyMap<number, number>>(() => new Map());
  const [failed, setFailed] = useState<number | null>(null);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);

  const track = current(queue);
  const trackId = track?.id ?? null;

  // Keep the element in step with the intent. A new track starts from the top;
  // play() is refused until the viewer has clicked inside the app once.
  useEffect(() => {
    const media = mediaRef.current;
    if (!media || trackId == null) return;
    if (playing && media.paused) {
      media.play().catch((error: unknown) => {
        // AbortError: the source changed under the request; the next run retries.
        if (error instanceof DOMException && error.name === 'NotAllowedError') setPlaying(false);
      });
    } else if (!playing && !media.paused) {
      media.pause();
    }
  }, [mediaRef, playing, trackId]);

  // A failed track is skipped while playing, after a moment.
  useEffect(() => {
    if (failed == null || !playing) return;
    const timer = setTimeout(() => {
      setQueue(q => (current(q)?.id === failed ? advance(q) ?? q : q));
    }, SKIP_FAILED_MS);
    return () => clearTimeout(timer);
  }, [failed, playing]);

  const resetTrackState = useCallback(() => {
    setTime(0);
    setFailed(null);
  }, []);

  const changeQueue = useCallback((update: (q: Queue<Track>) => Queue<Track> | null) => {
    setQueue(q => {
      const next = update(q);
      return next ?? q;
    });
    resetTrackState();
  }, [resetTrackState]);

  const restart = useCallback(() => {
    const media = mediaRef.current;
    if (!media) return;
    media.currentTime = 0;
    setPlaying(true);
    void media.play().catch(() => {});
  }, [mediaRef]);

  const next = useCallback(() => {
    const following = advance(queue);
    if (!following) {
      // The end of the queue with repeat off: stay on the last track, stopped.
      setPlaying(false);
      return;
    }
    if (current(following)?.id === trackId) restart();
    else changeQueue(() => following);
  }, [queue, trackId, restart, changeQueue]);

  const previous = useCallback(() => {
    const media = mediaRef.current;
    if (media && media.currentTime > RESTART_AFTER) {
      media.currentTime = 0;
      return;
    }
    const before = back(queue);
    if (current(before)?.id === trackId) {
      if (media) media.currentTime = 0;
    } else {
      changeQueue(() => before);
    }
  }, [mediaRef, queue, trackId, changeQueue]);

  const seek = useCallback((seconds: number) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(media.duration)) return;
    media.currentTime = Math.min(Math.max(0, seconds), media.duration);
    setTime(media.currentTime);
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
    failed: failed === trackId ? failed : null,
    volume,
    muted,

    load: tracks => {
      setQueue(q => createQueue(tracks, { shuffle: q.shuffle, repeat: q.repeat }));
      resetTrackState();
    },
    append: tracks => setQueue(q => appendItems(q, tracks)),
    play: () => setPlaying(true),
    pause: () => setPlaying(false),
    toggle: () => setPlaying(on => !on),
    next,
    previous,
    jumpTo: at => {
      changeQueue(q => jump(q, at));
      setPlaying(true);
    },
    seek,
    seekBy: seconds => seek((mediaRef.current?.currentTime ?? 0) + seconds),
    toggleShuffle: () => setQueue(q => setShuffle(q, !q.shuffle)),
    cycleRepeat: () => setQueue(q => setRepeat(q, nextRepeat(q.repeat))),
    setVolume: changeVolume,
    toggleMute: () => {
      const media = mediaRef.current;
      if (!media) return;
      media.muted = !media.muted;
      if (!media.muted && media.volume === 0) media.volume = 0.5;
    },
    mediaProps: {
      onPlay: () => setPlaying(true),
      // The element pauses itself just before `ended`; that is not the viewer pausing.
      onPause: event => {
        if (!event.currentTarget.ended) setPlaying(false);
      },
      onEnded: () => {
        const following = advance(queue, { auto: true });
        if (!following) setPlaying(false);
        else if (current(following)?.id === trackId) restart();
        else changeQueue(() => following);
      },
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
      onError: () => setFailed(trackId),
    },
  };
}

