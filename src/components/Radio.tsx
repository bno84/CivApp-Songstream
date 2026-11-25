// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { playableCollections, readCollection, readMyCollections, type ApiClient, type CollectionPage } from '../api.js';
import { useKeyboard, useMediaSession } from '../controls.js';
import { createInfoStore } from '../info.js';
import { DEFAULT_PREFS, type Memory, type Prefs, type RecentStation } from '../memory.js';
import { usePlayer } from '../player.js';
import { advance, current } from '../queue.js';
import { toTracks, trackTitle, type Track } from '../track.js';
import { Controls } from './Controls.js';
import { NowPlaying } from './NowPlaying.js';
import { Panel } from './Panel.js';
import { SourceNote } from './SourceNote.js';
import { Stage } from './Stage.js';
import { StationBar, type Station } from './StationBar.js';

/** The default station: a public collection curated for music. */
const FEATURED: Station = { id: 17980935, name: 'Music Focus', source: 'featured' };

/** The longest the app waits for what it remembers before starting without it. */
const MEMORY_WAIT_MS = 2000;

type Load =
  | { id: number; status: 'loading' }
  | { id: number; status: 'ready'; playable: number; skipped: number; done: boolean }
  | { id: number; status: 'error'; message: string };

interface Start {
  prefs: Prefs;
  recent: RecentStation[];
}

/** Waits briefly for what the viewer's last visit left, then starts the player with it. */
export function Radio({ api, memory }: { api: ApiClient; memory: Memory }) {
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

  if (!start) return <div className="center-note"><p>Tuning in…</p><SourceNote /></div>;
  return <RadioPlayer api={api} memory={memory} start={start} />;
}

function initialStations({ prefs, recent }: Start): Station[] {
  const stations: Station[] = [FEATURED, ...recent.map(({ id, name }): Station => ({ id, name, source: 'link' }))];
  // The playlist that was on, if it is not listed yet: one of the viewer's own,
  // until their list loads and names it.
  if (prefs.station != null && !stations.some(station => station.id === prefs.station)) {
    stations.splice(1, 0, { id: prefs.station, name: `Collection ${prefs.station}`, source: 'mine' });
  }
  return stations;
}

function RadioPlayer({ api, memory, start }: { api: ApiClient; memory: Memory; start: Start }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const player = usePlayer(mediaRef, start.prefs);
  const infos = useMemo(() => createInfoStore(api), [api]);
  const infosVersion = useSyncExternalStore(infos.subscribe, infos.version);

  const [stations, setStations] = useState<Station[]>(() => initialStations(start));
  const [selected, setSelected] = useState(start.prefs.station ?? FEATURED.id);
  const [load, setLoad] = useState<Load>({ id: start.prefs.station ?? FEATURED.id, status: 'loading' });

  // The viewer's own collections become stations after the featured one.
  useEffect(() => {
    const controller = new AbortController();
    // Only those that can hold videos: Model, Post and Article collections play nothing.
    readMyCollections(api, controller.signal).then(all => playableCollections(api, all, controller.signal)).then(mine => {
      setStations(known => mergeStations(known, mine.map(({ id, name }): Station => ({ id, name, source: 'mine' }))));
    }).catch(() => {
      // Without them the featured station and links still work.
    });
    return () => controller.abort();
  }, [api]);

  // Later pages join the queue as they land, at the end. Shuffled, they wait
  // and are shuffled in once the whole collection is read, so the list does not
  // reshuffle under the viewer with every page.
  const onPage = useEffectEvent((id: number, page: CollectionPage, first: boolean, held: Track[]) => {
    const tracks = toTracks(page.items);
    const skipped = page.items.length - tracks.length;
    if (first) player.load(tracks);
    else if (player.queue.shuffle) held.push(...tracks);
    else player.append(tracks);
    const name = page.collection?.name;
    const station = stations.find(entry => entry.id === id);
    if (first && name && station && station.name !== name) {
      setStations(known => known.map(entry => (entry.id === id ? { ...entry, name } : entry)));
      // A collection opened by link is remembered under its real name.
      if (station.source === 'link') void memory.remember({ id, name });
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
    const controller = new AbortController();
    let first = true;
    const held: Track[] = [];
    readCollection(api, selected, {
      signal: controller.signal,
      onPage: page => {
        onPage(selected, page, first, held);
        first = false;
      },
    }).then(() => {
      if (held.length) appendHeld(held);
      setLoad(state => (state.id === selected && state.status === 'ready' ? { ...state, done: true } : state));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      // What was read before the failure still plays.
      if (held.length) appendHeld(held);
      setLoad({ id: selected, status: 'error', message: error instanceof Error ? error.message : 'Could not load this playlist.' });
    });
    return () => controller.abort();
  }, [api, selected]);

  // Remember what the viewer changes. Only changes: the values this visit
  // started with are what memory already has, or the defaults if it was slow.
  const { volume, muted, queue } = player;
  const rememberedRef = useRef<Prefs>(start.prefs);
  useEffect(() => {
    const now: Prefs = {
      station: selected === FEATURED.id ? null : selected,
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
    const flush = () => void memory.flush();
    const onHidden = () => { if (document.visibilityState === 'hidden') flush(); };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHidden);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHidden);
    };
  }, [memory]);

  const select = (id: number) => {
    if (id === selected) return;
    setSelected(id);
    setLoad({ id, status: 'loading' });
  };

  const openById = (id: number) => {
    const known = stations.find(station => station.id === id);
    if (!known) {
      const name = `Collection ${id}`;
      setStations(list => [...list, { id, name, source: 'link' }]);
      void memory.remember({ id, name });
    } else if (known.source === 'link') {
      void memory.remember({ id, name: known.name });
    }
    select(id);
  };

  const forget = (id: number) => {
    setStations(list => list.filter(station => station.id !== id || station.source !== 'link'));
    void memory.forget(id);
    if (id === selected) select(FEATURED.id);
  };

  // Details for the current track, and the next one so its title is ready.
  const { track } = player;
  const upcoming = useMemo(() => {
    const following = advance(queue);
    return following ? current(following) : null;
  }, [queue]);
  useEffect(() => {
    if (track) infos.load(track);
    if (upcoming) infos.load(upcoming);
  }, [infos, track, upcoming]);

  const info = track ? infos.get(track.id) : undefined;
  const title = track ? trackTitle(track, info?.status === 'ready' ? info.title : null) : 'Civitai Radio';
  const station = stations.find(entry => entry.id === selected);
  useMediaSession(player, { title, album: station?.name ?? null });
  useKeyboard(player);

  return (
    <div className="radio">
      <StationBar stations={stations} selected={selected} onSelect={select} onOpen={openById} onForget={forget}
        status={barStatus(load, station?.name ?? 'this playlist', Boolean(track))} />
      <div className="radio-main">
        <div className="player-column">
          <Stage player={player} mediaRef={mediaRef} status={statusText(load, selected)} />
          <NowPlaying track={track} title={title} info={info} />
          <Controls player={player} />
        </div>
        <Panel queue={queue} track={track} durations={player.durations} playing={player.playing}
          jumpTo={player.jumpTo} infos={infos} infosVersion={infosVersion} />
      </div>
    </div>
  );
}

/**
 * Featured first, then the viewer's own (as Civitai lists them now), then any
 * opened by link that are not their own.
 */
function mergeStations(known: Station[], mine: Station[]): Station[] {
  const mineIds = new Set(mine.map(station => station.id));
  return [
    ...known.filter(station => station.source === 'featured'),
    ...mine,
    ...known.filter(station => station.source === 'link' && !mineIds.has(station.id)),
  ];
}

/** What the stage says while there is nothing to play. */
function statusText(load: Load, selected: number): string | null {
  if (load.id !== selected || load.status === 'loading') return 'Tuning in…';
  if (load.status === 'error') return load.message;
  if (!load.playable) {
    if (!load.done) return 'Tuning in…';
    return load.skipped ? 'This collection has no videos, only images.' : 'This collection is empty.';
  }
  return null;
}

/**
 * The top bar's note, only while it matters: tuning in to another playlist, or
 * why it failed, while the stage still shows what was playing before.
 */
function barStatus(load: Load, name: string, playing: boolean): { text: string; error: boolean } | null {
  if (!playing) return null;
  if (load.status === 'loading') return { text: `Tuning in to ${name}…`, error: false };
  if (load.status === 'error') return { text: `${name}: ${load.message}`, error: true };
  return null;
}
