// SPDX-License-Identifier: AGPL-3.0-or-later
import { useEffect, useEffectEvent, useMemo, useRef, useState, useSyncExternalStore } from 'react';

import { readCollection, readMyCollections, type ApiClient, type CollectionPage } from '../api.js';
import { useKeyboard, useMediaSession } from '../controls.js';
import { createInfoStore } from '../info.js';
import { usePlayer } from '../player.js';
import { advance, current } from '../queue.js';
import { toTracks, trackTitle } from '../track.js';
import { Controls } from './Controls.js';
import { NowPlaying } from './NowPlaying.js';
import { Panel } from './Panel.js';
import { Stage } from './Stage.js';
import { StationBar, type Station } from './StationBar.js';

/** The default station: a public collection curated for music. */
const FEATURED: Station = { id: 17980935, name: 'Music Focus', featured: true };

type Load =
  | { id: number; status: 'loading' }
  | { id: number; status: 'ready'; playable: number; skipped: number; done: boolean }
  | { id: number; status: 'error'; message: string };

export function Radio({ api }: { api: ApiClient }) {
  const mediaRef = useRef<HTMLVideoElement>(null);
  const player = usePlayer(mediaRef);
  const infos = useMemo(() => createInfoStore(api), [api]);
  useSyncExternalStore(infos.subscribe, infos.version);

  const [stations, setStations] = useState<Station[]>([FEATURED]);
  const [selected, setSelected] = useState(FEATURED.id);
  const [load, setLoad] = useState<Load>({ id: FEATURED.id, status: 'loading' });

  // The viewer's own collections become stations after the featured one.
  useEffect(() => {
    const controller = new AbortController();
    readMyCollections(api, controller.signal).then(mine => {
      setStations(known => mergeStations(known, mine.map(({ id, name }) => ({ id, name }))));
    }).catch(() => {
      // Without them the featured station and links still work.
    });
    return () => controller.abort();
  }, [api]);

  const onPage = useEffectEvent((id: number, page: CollectionPage, first: boolean) => {
    const tracks = toTracks(page.items);
    const skipped = page.items.length - tracks.length;
    if (first) player.load(tracks);
    else player.append(tracks);
    setStations(known => known.map(station =>
      station.id === id && page.collection?.name ? { ...station, name: page.collection.name } : station));
    setLoad(state => ({
      id, status: 'ready', done: false,
      playable: (first || state.status !== 'ready' ? 0 : state.playable) + tracks.length,
      skipped: (first || state.status !== 'ready' ? 0 : state.skipped) + skipped,
    }));
  });

  // Read the selected collection page by page; playback starts with the first.
  useEffect(() => {
    const controller = new AbortController();
    let first = true;
    readCollection(api, selected, {
      signal: controller.signal,
      onPage: page => {
        onPage(selected, page, first);
        first = false;
      },
    }).then(() => {
      setLoad(state => (state.id === selected && state.status === 'ready' ? { ...state, done: true } : state));
    }).catch((error: unknown) => {
      if (controller.signal.aborted) return;
      setLoad({ id: selected, status: 'error', message: error instanceof Error ? error.message : 'Could not load this playlist.' });
    });
    return () => controller.abort();
  }, [api, selected]);

  const select = (id: number) => {
    if (id === selected) return;
    setSelected(id);
    setLoad({ id, status: 'loading' });
  };

  const openById = (id: number) => {
    setStations(known => (known.some(station => station.id === id) ? known : [...known, { id, name: `Collection ${id}` }]));
    select(id);
  };

  // Details for the current track, and the next one so its title is ready.
  const { track, queue } = player;
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
      <StationBar stations={stations} selected={selected} onSelect={select} onOpen={openById} />
      <div className="radio-main">
        <div className="player-column">
          <Stage player={player} mediaRef={mediaRef} status={statusText(load, selected)} />
          <NowPlaying track={track} title={title} info={info} />
          <Controls player={player} />
          <p className={`load-note${load.status === 'error' ? ' error' : ''}`} aria-live="polite">
            {loadNote(load, station?.name ?? 'this playlist')}
          </p>
        </div>
        <Panel player={player} infos={infos} />
      </div>
    </div>
  );
}

function mergeStations(known: Station[], mine: Station[]): Station[] {
  const ids = new Set(known.map(station => station.id));
  const fresh = mine.filter(station => !ids.has(station.id));
  // Featured first, then the viewer's own, then any opened by link.
  const featured = known.filter(station => station.featured);
  return [...featured, ...fresh, ...known.filter(station => !station.featured)];
}

/** What the stage says while there is nothing to play. */
function statusText(load: Load, selected: number): string | null {
  if (load.id !== selected || load.status === 'loading') return 'Tuning in…';
  if (load.status === 'error') return load.message;
  if (!load.playable) {
    if (!load.done) return 'Tuning in…';
    return load.skipped ? 'This collection has no videos or audio, only images.' : 'This collection is empty.';
  }
  return null;
}

/** The line under the controls: progress, or why the selected playlist is not playing. */
function loadNote(load: Load, name: string): string {
  if (load.status === 'loading') return `Tuning in to ${name}…`;
  if (load.status === 'error') return `${name}: ${load.message}`;
  const parts = [`${load.playable} to play`];
  if (load.skipped) parts.push(`${load.skipped} image${load.skipped === 1 ? '' : 's'} skipped`);
  if (!load.done) parts.push('loading more…');
  return parts.join(' · ');
}
