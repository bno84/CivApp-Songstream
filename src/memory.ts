// SPDX-License-Identifier: AGPL-3.0-or-later
// What the app remembers for a viewer between visits: the player's settings
// (playlist, volume, shuffle, repeat) and the collections opened by link. It
// lives in private collections of Civitai's document store (see
// block.manifest.json), which only that viewer can read.
//
// Remembering is a convenience, never a requirement. Reads fall back to the
// defaults and writes land in memory first, so a store that refuses (the app
// not approved yet, offline, over quota) only means the
// next visit starts fresh.
import type { DocumentStorage } from '@civitai/sdk';

import type { Repeat } from './queue.js';
import { asTrack, type Track } from './track.js';

export const FAVORITES_ID = 'favorites';
export type StationId = number | typeof FAVORITES_ID;

export interface Prefs {
  /** The playlist that was playing; `null` for the featured one. */
  station: StationId | null;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: Repeat;
}

/** A collection opened by link, enough to list it again. */
export interface RecentStation {
  id: number;
  name: string;
}

export interface Memory {
  /** The remembered settings, or the defaults. Never rejects. */
  prefs: () => Promise<Prefs>;
  /** Merges a change into the settings. Writes are batched, so a slider can call it freely. */
  savePrefs: (change: Partial<Prefs>) => void;
  /** Collections opened by link, most recent first. Never rejects. */
  recent: () => Promise<RecentStation[]>;
  /** Writes any settings change still waiting, now. */
  flush: () => Promise<void>;
  /** Puts a collection at the front of the recent list, or renames it there. */
  remember: (station: RecentStation) => Promise<void>;
  forget: (id: number) => Promise<void>;
  /** Starred tracks, newest first. */
  favorites: () => Promise<Track[]>;
  /** Returns whether the change was saved beyond this visit. */
  setFavorite: (track: Track, starred: boolean) => Promise<boolean>;
}

export const DEFAULT_PREFS: Prefs = { station: null, volume: 1, muted: false, shuffle: true, repeat: 'all' };

/** How many collections opened by link are kept. */
export const RECENT_LIMIT = 8;
/** Settings changes within this window share one write: the private-write limit is 120 a minute. */
const PREFS_WRITE_DELAY_MS = 1500;
const PREFS_KEY = 'player';
const REPEATS: readonly Repeat[] = ['all', 'one', 'off'];

const key = (id: number) => `c-${id}`;

/** Stored settings, checked field by field: anything malformed falls back to its default. */
export function asPrefs(data: unknown): Prefs {
  const value = (data && typeof data === 'object' ? data : {}) as Partial<Record<keyof Prefs, unknown>>;
  const volume = typeof value.volume === 'number' && value.volume >= 0 && value.volume <= 1 ? value.volume : DEFAULT_PREFS.volume;
  return {
    station: value.station === FAVORITES_ID ||
      (typeof value.station === 'number' && Number.isSafeInteger(value.station) && value.station > 0)
      ? value.station : null,
    volume,
    muted: typeof value.muted === 'boolean' ? value.muted : DEFAULT_PREFS.muted,
    shuffle: typeof value.shuffle === 'boolean' ? value.shuffle : DEFAULT_PREFS.shuffle,
    repeat: REPEATS.includes(value.repeat as Repeat) ? value.repeat as Repeat : DEFAULT_PREFS.repeat,
  };
}

function asRecent(data: unknown): RecentStation | null {
  const value = data as Partial<RecentStation> | null;
  if (!value || !Number.isSafeInteger(value.id) || (value.id as number) <= 0 || typeof value.name !== 'string') return null;
  return { id: value.id!, name: value.name.slice(0, 200) };
}

function warn(what: string, error: unknown) {
  // eslint-disable-next-line no-console -- the viewer loses nothing but persistence
  console.warn(`Songstream: could not ${what}; it is kept for this visit only.`, error);
}

/** `first` ahead of `rest`, one entry per collection, at most {@link RECENT_LIMIT}. */
function mergeRecent(first: RecentStation[], rest: RecentStation[]): RecentStation[] {
  const seen = new Set<number>();
  return [...first, ...rest].filter(entry => !seen.has(entry.id) && seen.add(entry.id)).slice(0, RECENT_LIMIT);
}

/**
 * Memory over the document store, or for the visit only when `storage` is (or
 * resolves to) `null`.
 */
export function createMemory(storage: DocumentStorage | Promise<DocumentStorage | null> | null): Memory {
  const stores = Promise.resolve(storage).catch(error => {
    warn('reach the document store', error);
    return null;
  }).then(client => client && {
    prefs: client.collection<Prefs>('prefs'),
    recent: client.collection<RecentStation>('recent_collections'),
    favorites: client.collection<Track>('favorites'),
  });

  // Settings: loaded once, then this visit's changes win.
  let prefs: Prefs | null = null;
  let changes: Partial<Prefs> = {};
  let prefsLoad: Promise<Prefs> | null = null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  async function loadPrefs(): Promise<Prefs> {
    const store = (await stores)?.prefs;
    let stored = DEFAULT_PREFS;
    if (store) {
      try {
        stored = asPrefs((await store.get(PREFS_KEY))?.data);
      } catch (error) {
        warn('read the player settings', error);
      }
    }
    prefs = { ...stored, ...changes };
    return prefs;
  }

  async function writePrefs() {
    timer = undefined;
    const current = prefs ?? await (prefsLoad ??= loadPrefs());
    const store = (await stores)?.prefs;
    if (!store) return;
    try {
      await store.put(PREFS_KEY, current);
    } catch (error) {
      warn('save the player settings', error);
    }
  }

  // Recent links: what this visit opened or forgot, ahead of (and over) the store.
  let recent: RecentStation[] = [];
  const forgotten = new Set<number>();
  let recentLoad: Promise<void> | null = null;

  async function loadRecent(): Promise<RecentStation[]> {
    const store = (await stores)?.recent;
    if (!store) return [];
    try {
      const page = await store.list({ sort: '-updatedAt', limit: RECENT_LIMIT * 2 });
      const entries = page.items.map(doc => asRecent(doc.data)).filter(entry => entry !== null);
      // Anything past the limit was pushed out by newer opens; let it go.
      for (const doc of page.items.slice(RECENT_LIMIT)) store.delete(doc.key).catch(() => {});
      return entries.slice(0, RECENT_LIMIT);
    } catch (error) {
      warn('read the collections opened by link', error);
      return [];
    }
  }

  // One document per track, so a write in one tab cannot overwrite unrelated stars.
  const favorites = new Map<number, Track>();
  const favoriteWrites = new Map<number, Promise<boolean>>();
  let favoritesLoad: Promise<void> | null = null;

  async function loadFavorites() {
    const store = (await stores)?.favorites;
    if (!store) return;
    let cursor: string | undefined;
    try {
      do {
        const page = await store.list({ sort: 'createdAt', cursor });
        for (const doc of page.items) {
          const track = asTrack(doc.data);
          if (track && doc.key === `t-${track.id}`) favorites.set(track.id, track);
        }
        cursor = page.nextCursor ?? undefined;
      } while (cursor);
    } catch (error) {
      warn('read favorites', error);
    }
  }

  return {
    prefs: async () => {
      await (prefsLoad ??= loadPrefs());
      return { ...prefs! };
    },

    savePrefs: change => {
      // A change to what is already remembered needs no write.
      if (prefs && (Object.keys(change) as (keyof Prefs)[]).every(field => prefs![field] === change[field])) return;
      changes = { ...changes, ...change };
      if (prefs) prefs = { ...prefs, ...change };
      clearTimeout(timer);
      timer = setTimeout(() => void writePrefs(), PREFS_WRITE_DELAY_MS);
    },

    recent: async () => {
      recentLoad ??= loadRecent().then(loaded => {
        // Opens during the load are newer than anything the store had.
        recent = mergeRecent(recent, loaded.filter(entry => !forgotten.has(entry.id)));
      });
      await recentLoad;
      return [...recent];
    },

    flush: async () => {
      if (timer === undefined) return;
      clearTimeout(timer);
      await writePrefs();
    },

    remember: station => {
      forgotten.delete(station.id);
      recent = mergeRecent([station], recent);
      return stores.then(async found => {
        try {
          await found?.recent.put(key(station.id), station);
        } catch (error) {
          warn('remember the collection', error);
        }
      });
    },

    forget: id => {
      forgotten.add(id);
      recent = recent.filter(entry => entry.id !== id);
      return stores.then(async found => {
        try {
          await found?.recent.delete(key(id));
        } catch (error) {
          warn('forget the collection', error);
        }
      });
    },

    favorites: async () => {
      await (favoritesLoad ??= loadFavorites());
      return [...favorites.values()].reverse();
    },

    setFavorite: (track, starred) => {
      const updated = (favoritesLoad ??= loadFavorites()).then(() => {
        if (starred) {
          favorites.delete(track.id);
          favorites.set(track.id, track);
        } else {
          favorites.delete(track.id);
        }
      });
      const write = Promise.all([updated, favoriteWrites.get(track.id)]).then(async () => {
        const store = (await stores)?.favorites;
        if (!store) return false;
        try {
          const key = `t-${track.id}`;
          if (starred) await store.put(key, track);
          else await store.delete(key);
          return true;
        } catch (error) {
          warn('save favorites', error);
          return false;
        }
      });
      favoriteWrites.set(track.id, write);
      return write.finally(() => {
        if (favoriteWrites.get(track.id) === write) favoriteWrites.delete(track.id);
      });
    },
  };
}
