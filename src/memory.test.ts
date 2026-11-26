// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { createFakeStorage } from '@civitai/sdk/testing';

import manifest from '../block.manifest.json';
import { DEFAULT_PREFS, FAVORITES_ID, RECENT_LIMIT, asPrefs, createMemory } from './memory.js';
import type { Track } from './track.js';

const track = (id: number): Track => ({
  id, type: 'video', url: `https://image.civitai.com/sample/${id}/original=true/video.mp4`,
  still: null, creator: null, nsfwLevel: 1,
});

/** Several visits by one viewer: one memory per visit, over the same store. */
function visits() {
  // A second between writes, so `updatedAt` orders them as a viewer's clicks would.
  let clock = Date.parse('2026-11-01T00:00:00Z');
  const fake = createFakeStorage({ manifest, viewer: { username: 'alice' }, now: () => (clock += 1000) });
  return () => createMemory(fake.storage);
}

describe('createMemory', () => {
  it('starts from the defaults, and brings settings back next visit', async () => {
    const visit = visits();
    const first = visit();
    expect(await first.prefs()).toEqual(DEFAULT_PREFS);
    first.savePrefs({ volume: 0.4 });
    first.savePrefs({ playlist: 101, shuffle: false });
    expect(await first.prefs()).toMatchObject({ volume: 0.4, playlist: 101, shuffle: false });
    await first.flush();

    expect(await visit().prefs()).toEqual({ ...DEFAULT_PREFS, volume: 0.4, playlist: 101, shuffle: false });
  });

  it('keeps a change made before the settings had loaded', async () => {
    const visit = visits();
    const first = visit();
    first.savePrefs({ repeat: 'one' });
    expect((await first.prefs()).repeat).toBe('one');
  });

  it('lists collections opened by link, newest first, one entry each, capped', async () => {
    const visit = visits();
    const first = visit();
    for (let id = 1; id <= RECENT_LIMIT + 2; id++) await first.remember({ id, name: `Collection ${id}` });
    await first.remember({ id: 3, name: 'Renamed' });

    const recent = await visit().recent();
    expect(recent[0]).toEqual({ id: 3, name: 'Renamed' });
    expect(recent).toHaveLength(RECENT_LIMIT);
    expect(new Set(recent.map(entry => entry.id)).size).toBe(RECENT_LIMIT);
  });

  it('forgets a collection for good', async () => {
    const visit = visits();
    const first = visit();
    await first.remember({ id: 7, name: 'Seven' });
    await first.forget(7);
    expect(await first.recent()).toEqual([]);
    expect(await visit().recent()).toEqual([]);
  });

  it('restores Favorites, including saved tracks on later pages, in newest-first order', async () => {
    const visit = visits();
    const first = visit();
    for (let id = 1; id <= 51; id++) expect(await first.setFavorite(track(id), true)).toBe(true);
    first.savePrefs({ playlist: FAVORITES_ID });
    await first.flush();

    const next = visit();
    expect((await next.prefs()).playlist).toBe(FAVORITES_ID);
    expect((await next.favorites()).map(({ id }) => id)).toEqual(Array.from({ length: 51 }, (_, i) => 51 - i));
  });

  it('keeps the last star change when a viewer toggles a track quickly', async () => {
    const visit = visits();
    const first = visit();
    expect(await Promise.all([
      first.setFavorite(track(1), true),
      first.setFavorite(track(1), false),
      first.setFavorite(track(2), true),
    ])).toEqual([true, true, true]);
    expect((await first.favorites()).map(({ id }) => id)).toEqual([2]);
    expect((await visit().favorites()).map(({ id }) => id)).toEqual([2]);
  });

  it('ignores stored favorites with untrusted media URLs', async () => {
    const visit = visits();
    await visit().setFavorite({ ...track(1), url: 'https://example.org/video.mp4' }, true);
    expect(await visit().favorites()).toEqual([]);
  });

  it('keeps stars for the visit when they cannot be saved', async () => {
    const memory = createMemory(null);
    expect(await memory.setFavorite(track(1), true)).toBe(false);
    expect(await memory.favorites()).toEqual([track(1)]);
    expect(await memory.setFavorite(track(1), false)).toBe(false);
    expect(await memory.favorites()).toEqual([]);
  });

  it('works for the visit when the store refuses', async () => {
    const memory = createMemory(Promise.reject(new Error('not approved')));
    memory.savePrefs({ muted: true });
    await memory.remember({ id: 1, name: 'One' });
    expect((await memory.prefs()).muted).toBe(true);
    expect(await memory.recent()).toEqual([{ id: 1, name: 'One' }]);
  });
});

it('asPrefs falls back field by field', () => {
  expect(asPrefs({ volume: 7, muted: 'yes', repeat: 'sometimes', playlist: -1, shuffle: false })).toEqual({ ...DEFAULT_PREFS, shuffle: false });
  expect(asPrefs(null)).toEqual(DEFAULT_PREFS);
});
