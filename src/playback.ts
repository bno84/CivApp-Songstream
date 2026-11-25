// SPDX-License-Identifier: AGPL-3.0-or-later
// What the player is doing, as a reducer: the queue, whether the viewer wants
// it playing, and which tracks would not load. React-free and tested.
//
// Every change is applied to the latest state, never to a copy taken at render
// time, so a page that lands while the viewer presses Next is never lost.

import {
  advance, appendItems, back, createQueue, current, jump, nextRepeat, removeItem, setRepeat, setShuffle, type Queue, type Repeat,
} from './queue.js';
import type { Track } from './track.js';
import type { StationId } from './memory.js';

export interface PlaybackState {
  queue: Queue<Track>;
  station: StationId | null;
  pending: Queue<Track> | null;
  pendingStation: StationId | null;
  cached: ReadonlyMap<StationId, Queue<Track>>;
  defaultShuffle: boolean;
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
  | { type: 'load'; tracks: readonly Track[]; station?: StationId; complete?: boolean }
  | { type: 'cancelPending' }
  | { type: 'append'; tracks: readonly Track[] }
  | { type: 'remove'; id: number }
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
  return {
    queue: createQueue<Track>([], { shuffle, repeat }), station: null, pending: null, pendingStation: null,
    cached: new Map(), defaultShuffle: shuffle, playing: false, restarts: 0, failed: new Set(), stuck: false,
  };
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

function cacheQueue(state: PlaybackState, station: StationId | null, queue: Queue<Track>): ReadonlyMap<StationId, Queue<Track>> {
  return station == null ? state.cached : new Map(state.cached).set(station, queue);
}

function startPending(state: PlaybackState, pending: Queue<Track>): PlaybackState {
  return {
    ...moveTo(state, pending), station: state.pendingStation, pending: null, pendingStation: null,
    cached: cacheQueue(state, state.station, advance(state.queue) ?? state.queue),
    failed: new Set(), stuck: false,
    playing: state.playing && pending.order.length > 0,
  };
}

export function playbackReducer(state: PlaybackState, action: PlaybackAction): PlaybackState {
  const { queue, pending, failed } = state;
  switch (action.type) {
    case 'load': {
      const station = action.station ?? null;
      const alreadyActive = station != null && station === state.station;
      const cached = alreadyActive ? queue : station == null ? undefined : state.cached.get(station);
      let incoming = cached
        ? appendItems(setRepeat(cached, queue.repeat), action.tracks)
        : createQueue(action.tracks, { shuffle: state.defaultShuffle, repeat: queue.repeat });
      if (cached && action.complete) {
        const keep = new Set(action.tracks.map(track => track.id));
        for (const track of cached.items) {
          if (!keep.has(track.id)) incoming = removeItem(incoming, track.id);
        }
      }
      if (alreadyActive) return incoming === queue ? state : { ...state, queue: incoming };
      const id = currentId(queue);
      if (state.playing && id != null && !failed.has(id)) return { ...state, pending: incoming, pendingStation: station };
      return {
        ...state, queue: incoming, station, pending: null, pendingStation: null,
        cached: cacheQueue(state, state.station, queue), failed: new Set(), stuck: false,
      };
    }
    case 'cancelPending':
      return pending ? {
        ...state, cached: cacheQueue(state, state.pendingStation, pending), pending: null, pendingStation: null,
      } : state;
    case 'append': {
      if (pending) return { ...state, pending: appendItems(pending, action.tracks) };
      const next = appendItems(queue, action.tracks);
      return next === queue ? state : { ...state, queue: next, stuck: false };
    }
    case 'remove': {
      if (pending) return { ...state, pending: removeItem(pending, action.id) };
      const next = removeItem(queue, action.id);
      if (next === queue) return state;
      const removedCurrent = action.id === currentId(queue);
      const remainingFailures = new Set(failed);
      remainingFailures.delete(action.id);
      // If there is no following track in this order, pause on the previous one.
      return {
        ...state, queue: next, failed: remainingFailures,
        playing: state.playing && (!removedCurrent || queue.pos < next.order.length),
        stuck: !removedCurrent && state.stuck,
      };
    }
    case 'play':
      if (!state.stuck) return state.playing ? state : { ...state, playing: true };
      // Nothing would play: try them all again.
      return { ...state, playing: true, stuck: false, failed: new Set(), restarts: state.restarts + 1 };
    case 'pause':
      return state.playing ? { ...state, playing: false } : state;
    case 'next': {
      if (pending) return startPending(state, pending);
      const next = advancePlayable(queue, failed, false);
      // At the end with repeat off, the last track stays, stopped.
      return next ? moveTo(state, next) : { ...state, playing: false };
    }
    case 'ended':
      return pending ? startPending(state, pending) : moveTo(state, advancePlayable(queue, failed, true));
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
      if (pending) return startPending(state, pending);
      const next = advancePlayable(queue, failed, false);
      return next ? moveTo(state, next) : { ...state, playing: false, stuck: true };
    }
    case 'shuffle': {
      if (pending) return { ...state, pending: setShuffle(pending, !pending.shuffle) };
      return { ...state, queue: setShuffle(queue, !queue.shuffle) };
    }
    case 'repeat': {
      const repeat = nextRepeat(queue.repeat);
      return { ...state, queue: setRepeat(queue, repeat), pending: pending && setRepeat(pending, repeat) };
    }
  }
}
