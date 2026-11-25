// SPDX-License-Identifier: AGPL-3.0-or-later
// What the player is doing, as a reducer: the queue, whether the viewer wants
// it playing, and which tracks would not load. React-free and tested.
//
// Every change is applied to the latest state, never to a copy taken at render
// time, so a page that lands while the viewer presses Next is never lost.

import {
  advance, appendItems, back, createQueue, current, jump, nextRepeat, setRepeat, setShuffle, type Queue, type Repeat,
} from './queue.js';
import type { Track } from './track.js';

export interface PlaybackState {
  queue: Queue<Track>;
  /** The viewer's intent; it survives a track change. */
  playing: boolean;
  /** Bumped to replay the current track from the top (repeat one, or a queue of one). */
  restarts: number;
  /** Tracks that would not load in this playlist. They are skipped until clicked again. */
  failed: ReadonlySet<number>;
  /** Nothing left in the queue will play. */
  stuck: boolean;
}

export type PlaybackAction =
  | { type: 'load'; tracks: readonly Track[] }
  | { type: 'append'; tracks: readonly Track[] }
  | { type: 'play' }
  | { type: 'pause' }
  | { type: 'next' }
  /** The end of a track: repeat-one plays it again. */
  | { type: 'ended' }
  | { type: 'back' }
  | { type: 'jump'; id: number }
  | { type: 'failed'; id: number }
  /** Moves past a failed track, if it is still the current one. */
  | { type: 'skipFailed'; id: number }
  | { type: 'shuffle' }
  | { type: 'repeat' };

export function initialPlayback({ shuffle = true, repeat = 'all' }: { shuffle?: boolean; repeat?: Repeat } = {}): PlaybackState {
  return { queue: createQueue<Track>([], { shuffle, repeat }), playing: false, restarts: 0, failed: new Set(), stuck: false };
}

const currentId = (queue: Queue<Track>) => current(queue)?.id ?? null;

/** The next track that has not failed, or `null` when none is left. */
function advancePlayable(queue: Queue<Track>, failed: ReadonlySet<number>, auto: boolean): Queue<Track> | null {
  let at: Queue<Track> | null = queue;
  for (let tries = 0; tries <= queue.order.length; tries++) {
    // Repeat-one only replays a track that did play: a failed one moves on.
    at = advance(at, { auto: auto && tries === 0 && !failed.has(currentId(at) ?? -1) });
    if (!at) return null;
    if (!failed.has(currentId(at)!)) return at;
  }
  return null;
}

/** Moves to `next`: the same track again restarts it; `null` stops. */
function moveTo(state: PlaybackState, next: Queue<Track> | null): PlaybackState {
  if (!next) return { ...state, playing: false };
  if (currentId(next) === currentId(state.queue)) return { ...state, queue: next, restarts: state.restarts + 1 };
  return { ...state, queue: next };
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  const { queue, failed } = state;
  switch (action.type) {
    case 'load':
      return { ...state, queue: createQueue(action.tracks, { shuffle: queue.shuffle, repeat: queue.repeat }), failed: new Set(), stuck: false };
    case 'append': {
      const next = appendItems(queue, action.tracks);
      return next === queue ? state : { ...state, queue: next, stuck: false };
    }
    case 'play':
      if (!state.stuck) return state.playing ? state : { ...state, playing: true };
      // Nothing would play: try them all again.
      return { ...state, playing: true, stuck: false, failed: new Set(), restarts: state.restarts + 1 };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'next': {
      const next = advancePlayable(queue, failed, false);
      // At the end with repeat off, the last track stays, stopped.
      return next ? moveTo(state, next) : { ...state, playing: false };
    }
    case 'ended':
      return moveTo(state, advancePlayable(queue, failed, true));
    case 'back': {
      let at = queue;
      for (let tries = 0; tries < queue.order.length; tries++) {
        const before = back(at);
        if (before === at) break;
        at = before;
        if (!failed.has(currentId(at)!)) break;
      }
      return at === queue ? { ...state, restarts: state.restarts + 1 } : moveTo(state, at);
    }
    case 'jump': {
      const at = queue.order.findIndex(index => queue.items[index].id === action.id);
      if (at < 0) return state;
      // A click is a retry: a failed track gets another go.
      const retried = new Set(failed);
      retried.delete(action.id);
      return { ...state, queue: jump(queue, at), playing: true, stuck: false, failed: retried };
    }
    case 'failed':
      if (action.id !== currentId(queue) || failed.has(action.id)) return state;
      return { ...state, failed: new Set(failed).add(action.id) };
    case 'skipFailed': {
      if (action.id !== currentId(queue)) return state;
      const next = advancePlayable(queue, failed, false);
      return next ? moveTo(state, next) : { ...state, playing: false, stuck: true };
    }
    case 'shuffle':
      return { ...state, queue: setShuffle(queue, !queue.shuffle) };
    case 'repeat':
      return { ...state, queue: setRepeat(queue, nextRepeat(queue.repeat)) };
  }
}
