// SPDX-License-Identifier: AGPL-3.0-or-later
// Aggregate usage counts for the app's Civitai analytics panel: playback
// starts, time spent playing, and Favorites changes. React-free and tested.
//
// Every event and property is declared under `analytics.events` in
// block.manifest.json. Properties are coarse categories only: never a viewer,
// video or collection id, a title, a URL or a prompt. Nothing leaves the app
// except through the host's own `track` (useBlockAnalytics).
//
// The host allows each mount 10 events a second and 500 in all, and drops the
// rest silently. One event per play would run out within the hour on short
// videos, so plays and listening time are debounced into one `playback`
// batch that carries both as numbers. Each event kind has its own share of
// the 500, and a burst is held back below the rate limit.

import type { PlaylistId } from './memory.js';
import type { Repeat } from './queue.js';

/** Sends one event. The host's `track`: fire-and-forget. */
export type Send = (event: string, properties: Record<string, string | number | boolean>) => void;

/** Where the playing playlist came from. A category, never its id. */
export type PlaylistSource = 'featured' | 'favorites' | 'mine' | 'link';

/** Where a star was clicked. */
export type FavoritePlace = 'now_playing' | 'queue';

export interface PlayContext {
  source: PlaylistSource;
  shuffle: boolean;
  repeat: Repeat;
}

/** What the player reports: one `play` is one track from the top (a repeat is another). */
export interface PlaybackListener {
  /** The element really started playing (its `playing` event). Called again after a pause or a stall. */
  playing: (play: number, at: { playlist: PlaylistId | null; shuffle: boolean; repeat: Repeat }) => void;
  /** The element's position, while it plays (its `timeupdate` event). */
  progress: (play: number, position: number) => void;
  /** Paused, ended or seeking: the next position does not follow on from the last. */
  halted: () => void;
}

export interface UsageMeter {
  /** A play really started. Counted once per play, however often it pauses and resumes. */
  started: (play: number, context: PlayContext) => void;
  /** Credits the time played since the last position of the same play. */
  progress: (play: number, position: number) => void;
  halted: () => void;
  favorite: (starred: boolean, place: FavoritePlace) => void;
  /** Sends what is not sent yet, time to the nearest second. On leaving or hiding the page. */
  flush: () => void;
}

/**
 * How long a batch collects, in seconds played or, for plays, seconds on the
 * clock, by how much this visit has played so far. Short visits are sent
 * often, so little is lost if the frame goes away unannounced; long ones less
 * often, to last the budget.
 */
export function batchSeconds(listened: number): number {
  if (listened < 5 * 60) return 30;
  if (listened < 30 * 60) return 60;
  return 5 * 60;
}
/** Each kind's share of the host's 500 events per mount, with room to spare. */
export const BUDGET = { playback: 420, favorite_changed: 60 } as const;
/** Below the host's 10 a second. */
const RATE_LIMIT = 8;
const RATE_WINDOW_MS = 1000;
/** A position this far past what the clock allows is a seek, not playback. */
const SLACK_SECONDS = 1;

export interface UsageOptions {
  /** Milliseconds; injectable for tests. */
  now?: () => number;
}

type Properties = Record<string, string | number | boolean>;

const sameContext = (a: PlayContext, b: PlayContext) =>
  a.source === b.source && a.shuffle === b.shuffle && a.repeat === b.repeat;

export function createUsageMeter(send: Send, { now = Date.now }: UsageOptions = {}): UsageMeter {
  const used: Record<keyof typeof BUDGET, number> = { playback: 0, favorite_changed: 0 };
  const recent: number[] = [];
  /** Sends if the kind's share and the rate allow; says whether it did. */
  const emit = (event: keyof typeof BUDGET, properties: Properties) => {
    const at = now();
    while (recent.length && at - recent[0] >= RATE_WINDOW_MS) recent.shift();
    if (used[event] >= BUDGET[event] || recent.length >= RATE_LIMIT) return false;
    used[event]++;
    recent.push(at);
    send(event, properties);
    return true;
  };

  let counted: number | null = null;
  let last: { play: number; position: number; at: number } | null = null;
  /** What the batch was played with: one batch, one context. */
  let context: PlayContext | null = null;
  /** Plays not sent yet, and when the first of them started. */
  let plays = 0;
  let playsSince = 0;
  /** Played and not sent yet. Can dip below zero after a flush rounded up. */
  let seconds = 0;
  /** Sent so far this visit. */
  let listened = 0;
  let anySent = false;

  /**
   * Sends the batch, in whole seconds: rounded down while playing goes on, to
   * the nearest second on a flush.
   */
  const sendBatch = (round: (seconds: number) => number) => {
    if (!context) return;
    const batch = Math.max(round(seconds), 0);
    if (!plays && !batch) return;
    if (!emit('playback', { ...context, first_of_visit: !anySent, plays, seconds: batch })) return;
    anySent = true;
    plays = 0;
    playsSince = now();
    seconds -= batch;
    listened += batch;
  };

  /** Sends the batch if it has collected long enough. */
  const sendIfDue = () => {
    const due = batchSeconds(listened);
    if (seconds >= due || (plays > 0 && now() - playsSince >= due * 1000)) {
      sendBatch(Math.floor);
    }
  };

  /** Sends everything left, to the nearest second. */
  const flushAll = () => sendBatch(Math.round);

  return {
    started(play, next) {
      if (play === counted) return;
      // Marked counted even if it cannot be sent, so a resume never counts it twice.
      counted = play;
      // A new shuffle, repeat or playlist starts a new batch.
      if (context && !sameContext(context, next)) flushAll();
      context = next;
      if (!plays) playsSince = now();
      plays++;
      sendIfDue();
    },
    progress(play, position) {
      const at = now();
      if (last && last.play === play) {
        const played = position - last.position;
        const elapsed = (at - last.at) / 1000;
        // Backwards is a seek or a restart; ahead of the clock is a seek forward.
        if (played > 0 && played <= elapsed + SLACK_SECONDS) seconds += played;
      }
      last = { play, position, at };
      sendIfDue();
    },
    halted() {
      last = null;
    },
    favorite(starred, place) {
      emit('favorite_changed', { action: starred ? 'add' : 'remove', place });
    },
    flush: flushAll,
  };
}
