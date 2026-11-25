// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';

import { initialPlayback, playbackReducer, type PlaybackAction, type PlaybackState } from './playback.js';
import { current } from './queue.js';
import type { Track } from './track.js';

const track = (id: number): Track => ({ id, type: 'video', url: `u${id}`, still: null, creator: null, nsfwLevel: 1 });
const tracks = (...ids: number[]) => ids.map(track);

function run(state: PlaybackState, ...actions: PlaybackAction[]): PlaybackState {
  return actions.reduce(playbackReducer, state);
}

/** A playing, unshuffled queue of `ids`, repeat as given. */
function playing(ids: number[], repeat: 'all' | 'one' | 'off' = 'all') {
  return run(initialPlayback({ shuffle: false, repeat }), { type: 'load', tracks: tracks(...ids) }, { type: 'play' });
}

const now = (state: PlaybackState) => current(state.queue)?.id ?? null;

describe('playbackReducer', () => {
  it('keeps the current video and queues later pages for the incoming playlist', () => {
    const state = run(initialPlayback({ shuffle: false, repeat: 'one' }),
      { type: 'load', station: 1, tracks: tracks(1, 2) }, { type: 'play' },
      { type: 'load', station: 'favorites', tracks: tracks(3) }, { type: 'append', tracks: tracks(4) });
    expect(now(state)).toBe(1);
    expect(state.queue.items.map(track => track.id)).toEqual([1, 2]);
    const switched = run(state, { type: 'ended' });
    expect(now(switched)).toBe(3);
    expect(switched.queue.items.map(track => track.id)).toEqual([3, 4]);
    expect(switched.playing).toBe(true);
  });

  it('keeps both shuffle orders when switching away and back before the video ends', () => {
    const first = run(initialPlayback(), { type: 'load', station: 1, tracks: tracks(1, 2, 3) }, { type: 'play' },
      { type: 'load', station: 'favorites', tracks: tracks(4, 5, 6) });
    const back = run(first, { type: 'cancelPending' }, { type: 'load', station: 1, tracks: tracks(1, 2, 3) });
    expect(back.queue).toBe(first.queue);
    expect(back.pending).toBeNull();
    const favorites = run(back, { type: 'load', station: 'favorites', tracks: tracks(4, 5, 6), complete: true });
    expect(favorites.pending).toBe(first.pending);
    const unshuffled = run(favorites, { type: 'shuffle' });
    expect(unshuffled.pending?.shuffle).toBe(false);
    expect(unshuffled.queue).toBe(first.queue);
    expect(run(unshuffled, { type: 'next' }).queue).toBe(unshuffled.pending);
  });

  it('refreshes cached favorites without putting unstarred tracks back in the queue', () => {
    const state = run(initialPlayback({ shuffle: false }),
      { type: 'load', station: 'favorites', tracks: tracks(1, 2, 3), complete: true },
      { type: 'load', station: 10, tracks: tracks(10) },
      { type: 'load', station: 'favorites', tracks: tracks(4, 3, 2), complete: true });
    expect(state.queue.items.map(track => track.id)).toEqual([2, 3, 4]);
  });

  it('keeps a page that landed before Next was handled', () => {
    // Both are queued against the same render: the append must survive the move.
    const state = run(playing([1, 2]), { type: 'append', tracks: tracks(3) }, { type: 'next' }, { type: 'next' });
    expect(now(state)).toBe(3);
  });

  it('keeps the current track playing when a different favorite is removed', () => {
    const state = run(playing([1, 2, 3, 4]), { type: 'next' },
      { type: 'remove', id: 1 }, { type: 'remove', id: 3 });
    expect(now(state)).toBe(2);
    expect(state.playing).toBe(true);
    expect(now(run(state, { type: 'next' }))).toBe(4);
  });

  it('advances after removing the current favorite and stops when the queue empties', () => {
    const state = run(playing([1, 2]), { type: 'remove', id: 1 });
    expect(now(state)).toBe(2);
    expect(state.playing).toBe(true);
    const empty = run(state, { type: 'remove', id: 2 });
    expect(now(empty)).toBeNull();
    expect(empty.playing).toBe(false);
  });

  it('jumps by track id, so a row moved by a shuffled append still plays itself', () => {
    let state = run(initialPlayback({ shuffle: true }), { type: 'load', tracks: tracks(1, 2, 3) });
    state = run(state, { type: 'append', tracks: tracks(4, 5, 6) }, { type: 'jump', id: 2 });
    expect(now(state)).toBe(2);
    expect(state.playing).toBe(true);
  });

  it('restarts the same track for repeat-one and a queue of one, rather than doing nothing', () => {
    expect(run(playing([1, 2], 'one'), { type: 'ended' }).restarts).toBe(1);
    expect(run(playing([1]), { type: 'next' }).restarts).toBe(1);
  });

  it('stops at the end with repeat off, keeping the last track', () => {
    const state = run(playing([1, 2], 'off'), { type: 'ended' }, { type: 'ended' });
    expect(now(state)).toBe(2);
    expect(state.playing).toBe(false);
  });

  it('skips a failed track, and passes over it from then on', () => {
    let state = run(playing([1, 2, 3]), { type: 'failed', id: 1 }, { type: 'skipFailed', id: 1 });
    expect(now(state)).toBe(2);
    state = run(state, { type: 'next' }, { type: 'next' });
    expect(now(state)).toBe(2);
  });

  it('stops, stuck, when no track will play, instead of looping', () => {
    let state = playing([1, 2]);
    state = run(state, { type: 'failed', id: 1 }, { type: 'skipFailed', id: 1 });
    state = run(state, { type: 'failed', id: 2 }, { type: 'skipFailed', id: 2 });
    expect(state.stuck).toBe(true);
    expect(state.playing).toBe(false);
  });

  it('stops when the last track fails with repeat off', () => {
    const state = run(playing([1, 2], 'off'), { type: 'next' }, { type: 'failed', id: 2 }, { type: 'skipFailed', id: 2 });
    expect(state.stuck).toBe(true);
    expect(state.playing).toBe(false);
  });

  it('retries everything on Play when stuck, and a failed track on a click', () => {
    let state = run(playing([1]), { type: 'failed', id: 1 }, { type: 'skipFailed', id: 1 });
    expect(state.stuck).toBe(true);
    state = run(state, { type: 'play' });
    expect(state).toMatchObject({ stuck: false, playing: true });
    expect(state.failed.size).toBe(0);

    state = run(playing([1, 2]), { type: 'failed', id: 1 }, { type: 'skipFailed', id: 1 }, { type: 'jump', id: 1 });
    expect(now(state)).toBe(1);
    expect(state.failed.has(1)).toBe(false);
  });

  it('ignores a failure or skip for a track that is no longer current', () => {
    const state = playing([1, 2]);
    expect(run(state, { type: 'failed', id: 2 })).toBe(state);
    expect(run(state, { type: 'skipFailed', id: 2 })).toBe(state);
  });

  it('goes back past failed tracks', () => {
    const state = run(playing([1, 2, 3]), { type: 'next' }, { type: 'failed', id: 2 }, { type: 'skipFailed', id: 2 }, { type: 'back' });
    expect(now(state)).toBe(1);
  });

  it('starts a new playlist with a clean slate, keeping shuffle and repeat', () => {
    let state = run(playing([1], 'one'), { type: 'failed', id: 1 }, { type: 'skipFailed', id: 1 });
    state = run(state, { type: 'load', tracks: tracks(5, 6) });
    expect(state).toMatchObject({ stuck: false });
    expect(state.failed.size).toBe(0);
    expect(state.queue.repeat).toBe('one');
  });
});
