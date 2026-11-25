// SPDX-License-Identifier: AGPL-3.0-or-later
import { useCallback, useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { useBlockAnalytics } from '@civitai/blocks-react';

import {
  ApiError, MAX_PAGES, PAGE_SIZE, playableCollections, readCollection, readMyCollections, type ApiClient, type CollectionPage,
} from '../api.js';
import { useKeyboard, useMediaSession } from '../controls.js';
import { createInfoStore } from '../info.js';
import { DEFAULT_PREFS, FAVORITES_ID, type Memory, type Prefs, type RecentPlaylist, type PlaylistId } from '../memory.js';
import { usePlayer } from '../player.js';
import { advance, current } from '../queue.js';
import { toTracks, trackTitle, type Track } from '../track.js';
import { createUsageMeter, type FavoritePlace } from '../usage.js';
import { Controls } from './Controls.js';
import { NowPlaying } from './NowPlaying.js';
import { Panel } from './Panel.js';
import { SourceNote } from './SourceNote.js';
import { Stage } from './Stage.js';
import { PlaylistBar, type Playlist } from './PlaylistBar.js';

/** The default playlist: a public collection curated for music. */
const FEATURED: Playlist = { id: 17980935, name: 'Music Focus', source: 'featured' };
const FAVORITES: Playlist = { id: FAVORITES_ID, name: 'Favorites', source: 'favorites' };

/** Shuffled pages that are held join early when fewer tracks than this are left to play. */
const LOW_WATER = 10;

/** The longest the app waits for what it remembers before starting without it. */
const MEMORY_WAIT_MS = 2000;

type Load =
  | { id: PlaylistId; status: 'loading' }
  | { id: PlaylistId; status: 'ready'; playable: number; skipped: number; done: boolean; capped?: boolean }
  | { id: PlaylistId; status: 'error'; message: string };

interface Start {
  prefs: Prefs;
  recent: RecentPlaylist[];
}

/** Waits briefly for what the viewer's last visit left, then starts the player with it. */
export function Songstream({ api, memory }: { api: ApiClient; memory: Memory }) {
  const [start, setStart] = useState<Start | null>(null);

  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<null>(resolve => { timer = setTimeout(() => resolve(null), MEMORY_WAIT_MS); });
    void Promise.race([Promise.all([memory.prefs(), memory.recent()]), timeout]).then(found => {
      if (live) setStart(found ? { prefs: found[0], recent: found[1] } : { prefs: DEFAULT_PREFS, recent: [] });
    });
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [memory]);

  if (!start) return <div className="center-note"><p>Loading…</p><SourceNote /></div>;
  return <SongstreamPlayer api={api} memory={memory} start={start} />;
}

function initialPlaylists({ prefs, recent }: Start): Playlist[] {
  const playlists: Playlist[] = [FEATURED, FAVORITES, ...recent
    .filter(({ id }) => id !== FEATURED.id)
    .map(({ id, name }): Playlist => ({ id, name, source: 'link' }))];
  // The playlist that was on, if it is not listed yet: one of the viewer's own,
  // until their list loads and names it.
  if (typeof prefs.playlist === 'number' && !playlists.some(playlist => playlist.id === prefs.playlist)) {
    playlists.splice(2, 0, { id: prefs.playlist, name: `Collection ${prefs.playlist}`, source: 'mine' });
  }
  return playlists;
}

function SongstreamPlayer({ api, memory, start }: { api: ApiClient; memory: Memory; start: Start }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const { track: send } = useBlockAnalytics();
  const meter = useMemo(() => createUsageMeter(send), [send]);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => initialPlaylists(start));
  const player = usePlayer(mediaRef, start.prefs, {
    playing: (play, { playlist: id, shuffle, repeat }) => {
      // Only the playlist's kind is counted. One no longer listed while it plays
      // was opened by link, then forgotten.
      const source = playlists.find(entry => entry.id === id)?.source ?? 'link';
      meter.started(play, { source, shuffle, repeat });
    },
    progress: meter.progress,
    halted: meter.halted,
  });
  const infos = useMemo(() => createInfoStore(api), [api]);
  const infosVersion = useSyncExternalStore(infos.subscribe, infos.version);

  const [selected, setSelected] = useState(start.prefs.playlist ?? FEATURED.id);
  const [load, setLoad] = useState<Load>({ id: start.prefs.playlist ?? FEATURED.id, status: 'loading' });
  const collectionReadRef = useRef<AbortController | null>(null);
  const [favorites, setFavorites] = useState<Track[] | null>(null);
  const [favoritesUnsaved, setFavoritesUnsaved] = useState(false);
  const [reactionTickets, setReactionTickets] = useState<ReadonlyMap<number, string>>(() => new Map());
  const favoriteIds = useMemo(() => new Set(favorites?.map(track => track.id)), [favorites]);
  const favoritesReady = favorites !== null;

  const { append, remove } = player;
  const favoritesActive = selected === FAVORITES_ID && load.status === 'ready';
  const toggleFavorite = useCallback((track: Track, place: FavoritePlace) => {
    if (!favoritesReady) return;
    const starred = !favoriteIds.has(track.id);
    meter.favorite(starred, place);
    setFavorites(tracks => starred ? [track, ...(tracks ?? [])] : tracks?.filter(item => item.id !== track.id) ?? []);
    if (favoritesActive) {
      if (starred) append([track]);
      else remove(track.id);
    }
    void memory.setFavorite(track, starred).then(saved => {
      if (!saved) setFavoritesUnsaved(true);
    });
  }, [favoriteIds, favoritesReady, favoritesActive, memory, append, remove, meter]);

  const tuneToFavorites = (tracks: Track[]) => {
    player.load(FAVORITES_ID, tracks, true);
    setLoad({ id: FAVORITES_ID, status: 'ready', playable: tracks.length, skipped: 0, done: true });
  };

  const onFavoritesLoaded = useEffectEvent((tracks: Track[]) => {
    setFavorites(tracks);
    if (selected === FAVORITES_ID) tuneToFavorites(tracks);
  });

  useEffect(() => {
    let live = true;
    void memory.favorites().then(tracks => { if (live) onFavoritesLoaded(tracks); });
    return () => { live = false; };
  }, [memory]);

  // The viewer's own collections become playlists after the featured one.
  useEffect(() => {
    const controller = new AbortController();
    // Only those that can hold videos: Model, Post and Article collections play nothing.
    readMyCollections(api, controller.signal).then(all =>
      playableCollections(api, all.filter(({ id }) => id !== FEATURED.id), controller.signal)).then(mine => {
      setPlaylists(known => mergePlaylists(known, mine.map(({ id, name }): Playlist => ({ id, name, source: 'mine' }))));
    }).catch(() => {
      // Without them the featured playlist and links still work.
    });
    return () => controller.abort();
  }, [api]);

  // Later pages join the queue as they land, at the end. Shuffled, they wait
  // and are shuffled in once the whole collection is read, so the list does not
  // reshuffle under the viewer with every page.
  const onPage = useEffectEvent((id: number, page: CollectionPage, first: boolean, held: Track[]) => {
    const tracks = toTracks(page.items);
    const tickets = page.items.flatMap(item => item.type === 'video' && item.reactTicket
      ? [[item.mediaId, item.reactTicket] as const] : []);
    if (tickets.length) setReactionTickets(known => new Map([...known, ...tickets]));
    const skipped = page.items.length - tracks.length;
    if (first) {
      player.load(id, tracks);
    } else if ((player.pending ?? player.queue).shuffle) {
      held.push(...tracks);
      // Running out before the rest is read: shuffle in what is here now.
      const q = player.pending ?? player.queue;
      if (q.order.length - q.pos - 1 < LOW_WATER) player.append(held.splice(0));
    } else {
      // In collection order: pages held while shuffle was on go first.
      if (held.length) player.append(held.splice(0));
      player.append(tracks);
    }
    const name = page.collection?.name;
    const playlist = playlists.find(entry => entry.id === id);
    if (first && name && playlist && playlist.name !== name) {
      setPlaylists(known => known.map(entry => (entry.id === id ? { ...entry, name } : entry)));
      // A collection opened by link is remembered under its real name.
      if (playlist.source === 'link') void memory.remember({ id, name });
    }
    setLoad(state => ({
      id, status: 'ready', done: false,
      playable: (first || state.status !== 'ready' ? 0 : state.playable) + tracks.length,
      skipped: (first || state.status !== 'ready' ? 0 : state.skipped) + skipped,
    }));
  });

  const appendHeld = useEffectEvent((held: Track[]) => player.append(held));

  // Read the selected collection page by page; playback starts with the first.
  useEffect(() => {
    if (selected === FAVORITES_ID) return;
    const controller = new AbortController();
    collectionReadRef.current = controller;
    let first = true;
    const held: Track[] = [];
    readCollection(api, selected, {
      signal: controller.signal,
      onPage: page => {
        onPage(selected, page, first, held);
        first = false;
      },
    }).then(({ capped }) => {
      if (controller.signal.aborted) return;
      if (held.length) appendHeld(held);
      setLoad(state => (state.id === selected && state.status === 'ready' ? { ...state, done: true, capped } : state));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      // What was read before the failure still plays.
      if (held.length) appendHeld(held);
      setLoad({ id: selected, status: 'error', message: error instanceof ApiError ? error.message : 'Could not load this playlist.' });
    });
    return () => {
      controller.abort();
      collectionReadRef.current = null;
    };
  }, [api, selected]);

  // Remember what the viewer changes. Only changes: the values this visit
  // started with are what memory already has, or the defaults if it was slow.
  const { volume, muted, queue } = player;
  const rememberedRef = useRef<Prefs>(start.prefs);
  useEffect(() => {
    const now: Prefs = {
      playlist: selected === FEATURED.id ? null : selected,
      volume, muted, shuffle: queue.shuffle, repeat: queue.repeat,
    };
    const change = Object.fromEntries((Object.keys(now) as (keyof Prefs)[])
      .filter(field => now[field] !== rememberedRef.current[field])
      .map(field => [field, now[field]])) as Partial<Prefs>;
    if (!Object.keys(change).length) return;
    rememberedRef.current = now;
    memory.savePrefs(change);
  }, [memory, selected, volume, muted, queue.shuffle, queue.repeat]);

  // A change made just before leaving is written straight away.
  useEffect(() => {
    const flush = () => {
      meter.flush();
      void memory.flush();
    };
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
      meter.flush();
    };
  }, [memory, meter]);

  const select = (id: PlaylistId) => {
    if (id === selected) return;
    collectionReadRef.current?.abort();
    player.cancelPending();
    setSelected(id);
    if (id === FAVORITES_ID && favorites) tuneToFavorites(favorites);
    else {
      if (player.cached.has(id)) player.load(id, []);
      setLoad({ id, status: 'loading' });
    }
  };

  const openById = (id: number) => {
    const known = playlists.find(playlist => playlist.id === id);
    if (!known) {
      const name = `Collection ${id}`;
      setPlaylists(list => [...list, { id, name, source: 'link' }]);
      void memory.remember({ id, name });
    } else if (known.source === 'link') {
      void memory.remember({ id, name: known.name });
    }
    select(id);
  };

  const forget = (id: number) => {
    setPlaylists(list => list.filter(playlist => playlist.id !== id || playlist.source !== 'link'));
    void memory.forget(id);
    if (id === selected) select(FEATURED.id);
  };

  // Details for the current track, and the next one so its title is ready.
  const { track } = player;
  const upcoming = useMemo(() => {
    if (player.pending) return current(player.pending);
    const following = advance(queue);
    return following ? current(following) : null;
  }, [queue, player.pending]);
  useEffect(() => {
    if (track) infos.load(track);
    if (upcoming) infos.load(upcoming);
  }, [infos, track, upcoming]);

  const info = track ? infos.get(track.id) : undefined;
  const title = track ? trackTitle(track, info?.status === 'ready' ? info.title : null) : 'Songstream';
  const playlist = playlists.find(entry => entry.id === selected);
  const playingPlaylist = playlists.find(entry => entry.id === player.playlist);
  const showingActiveQueue = selected === player.playlist;
  const selectedQueue = showingActiveQueue ? queue : player.pending;
  useMediaSession(player, { title, album: playingPlaylist?.name ?? null });
  useKeyboard(player);

  return (
    <div className="songstream">
      <PlaylistBar playlists={playlists} selected={selected} onSelect={select} onOpen={openById} onForget={forget}
        status={barStatus(load, playlist?.name ?? 'this playlist', Boolean(track)) ??
          (favoritesUnsaved ? { text: 'Some Favorites changes could only be kept for this visit.', error: true } : null)} />
      <div className="songstream-main">
        <div className="player-column">
          <Stage player={player} mediaRef={mediaRef} status={statusText(load, selected)} />
          <NowPlaying track={track} title={title} info={info} reactTicket={track ? reactionTickets.get(track.id) : undefined}
            starred={track != null && favoriteIds.has(track.id)} toggleFavorite={favoritesReady ? track => toggleFavorite(track, 'now_playing') : undefined} />
          <Controls player={player} />
        </div>
        <Panel key={selected} queue={selectedQueue} activeQueue={showingActiveQueue} track={track}
          emptyMessage={statusText(load, selected) ?? 'Nothing queued yet.'}
          durations={player.durations} playing={player.playing}
          jumpTo={player.jumpTo} infos={infos} infosVersion={infosVersion} favoriteIds={favoriteIds}
          toggleFavorite={favoritesReady ? track => toggleFavorite(track, 'queue') : undefined} />
      </div>
    </div>
  );
}

/**
 * Featured and Favorites first, then the viewer's own, then any
 * opened by link that are not their own.
 */
function mergePlaylists(known: Playlist[], mine: Playlist[]): Playlist[] {
  const mineIds = new Set(mine.map(playlist => playlist.id));
  return [
    ...known.filter(playlist => playlist.source === 'featured' || playlist.source === 'favorites'),
    ...mine,
    ...known.filter(playlist => playlist.source === 'link' && !mineIds.has(playlist.id)),
  ];
}

/** What the stage says while there is nothing to play. */
function statusText(load: Load, selected: PlaylistId): string | null {
  if (load.id !== selected || load.status === 'loading') return 'Loading…';
  if (load.status === 'error') return load.message;
  if (selected === FAVORITES_ID) return 'Star a track to add it to Favorites.';
  if (!load.playable) {
    if (!load.done) return 'Loading…';
    return load.skipped ? 'This collection has no videos, only images.' : 'This collection is empty.';
  }
  return null;
}

/**
 * Errors and collection limits that can matter even when a video is visible.
 */
function barStatus(load: Load, name: string, hasTrack: boolean): { text: string; error: boolean } | null {
  if (!hasTrack) return null;
  if (load.status === 'error') return { text: `${name}: ${load.message}`, error: true };
  if (load.status === 'ready' && load.capped) {
    return { text: `${name} is long: playing its first ${(MAX_PAGES * PAGE_SIZE).toLocaleString('en')} items.`, error: false };
  }
  return null;
}
