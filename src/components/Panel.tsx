// SPDX-License-Identifier: AGPL-3.0-or-later
import { memo, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';

import type { InfoStore } from '../info.js';
import { formatTime } from '../media.js';
import { entries, type Queue } from '../queue.js';
import { trackTitle, type Track } from '../track.js';
import { Details } from './Details.js';
import { FavoriteButton } from './FavoriteButton.js';

type Tab = 'queue' | 'details';
const TABS: Tab[] = ['queue', 'details'];

interface PanelProps {
  queue: Queue<Track>;
  track: Track | null;
  durations: ReadonlyMap<number, number>;
  playing: boolean;
  jumpTo: (id: number) => void;
  infos: InfoStore;
  /** The store's version: the panel shows titles from it, so it renders again when it changes. */
  infosVersion: number;
  favoriteIds: ReadonlySet<number>;
  toggleFavorite: ((track: Track) => void) | undefined;
}

/**
 * The right-hand panel: the queue (played items darkened) and the current
 * item's details. Memoised: it does not render again on every time update,
 * which would rebuild thousands of queue rows a few times a second.
 */
export const Panel = memo(function Panel({ queue, track, durations, playing, jumpTo, infos, favoriteIds, toggleFavorite }: PanelProps) {
  const [tab, setTab] = useState<Tab>('queue');
  const count = queue.order.length;

  // Arrow keys move between the tabs, as a tablist should. Handled here, they
  // never reach the window's seek shortcuts.
  const onKeyDown = (event: KeyboardEvent) => {
    const at = TABS.indexOf(tab);
    const to = event.key === 'ArrowRight' ? TABS[(at + 1) % TABS.length]
      : event.key === 'ArrowLeft' ? TABS[(at + TABS.length - 1) % TABS.length]
        : event.key === 'Home' ? TABS[0]
          : event.key === 'End' ? TABS[TABS.length - 1] : null;
    if (!to) return;
    event.preventDefault();
    setTab(to);
    document.getElementById(`tab-${to}`)?.focus();
  };

  const tabProps = (id: Tab) => ({
    id: `tab-${id}`,
    role: 'tab',
    type: 'button' as const,
    'aria-selected': tab === id,
    'aria-controls': `tabpanel-${id}`,
    tabIndex: tab === id ? 0 : -1,
    className: tab === id ? 'on' : '',
    onClick: () => setTab(id),
  });

  return (
    <section className="panel">
      <div className="tabs" role="tablist" aria-label="Queue and details" onKeyDown={onKeyDown}>
        <button {...tabProps('queue')}>Queue{count ? ` · ${queue.pos + 1} of ${count}` : ''}</button>
        <button {...tabProps('details')}>Details</button>
      </div>
      <div className="panel-body" role="tabpanel" id={`tabpanel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'queue'
          ? <QueueList queue={queue} durations={durations} playing={playing} jumpTo={jumpTo} infos={infos}
              favoriteIds={favoriteIds} toggleFavorite={toggleFavorite} />
          : <Details track={track} infos={infos} />}
      </div>
    </section>
  );
});

function QueueList({ queue, durations, playing, jumpTo, infos, favoriteIds, toggleFavorite }:
  Pick<PanelProps, 'queue' | 'durations' | 'playing' | 'jumpTo' | 'infos' | 'favoriteIds' | 'toggleFavorite'>) {
  const listRef = useRef<HTMLOListElement>(null);
  const rows = entries(queue);

  // Keep the current item in view, with a played one or two above it. The list
  // is scrolled by hand: scrollIntoView could scroll the page around the app too.
  useLayoutEffect(() => {
    const list = listRef.current;
    const row = list?.querySelector<HTMLElement>('[aria-current="true"]');
    if (!list || !row) return;
    const top = row.offsetTop - list.offsetTop;
    if (top < list.scrollTop || top + row.offsetHeight > list.scrollTop + list.clientHeight) {
      list.scrollTop = Math.max(0, top - row.offsetHeight * 2);
    }
  }, [queue.pos, queue.order]);

  if (!rows.length) return <p className="panel-note">Nothing queued yet.</p>;
  return (
    <ol className="queue" ref={listRef}>
      {rows.map(({ item, state }) => {
        const info = infos.get(item.id);
        const known = info?.status === 'ready' ? info.title : null;
        const title = trackTitle(item, known);
        const creator = item.creator?.username ?? 'Unknown creator';
        // Untitled rows lead with the creator, so the list stays scannable. A
        // row whose details have not loaded is not called untitled yet.
        const kind = item.type === 'audio' ? 'Track' : 'Video';
        const [main, sub] = known ? [known, creator] : [creator, info?.status === 'ready' ? title : kind];
        const duration = durations.get(item.id);
        return (
          <li key={item.id} className={`queue-row ${state}`} aria-current={state === 'current'}>
            <button type="button" className="queue-play" onClick={() => jumpTo(item.id)} title={`Play ${title}`}>
              <Thumb still={item.still} id={item.id} />
              <span className="queue-text">
                <span className="ellipsis">{main}</span>
                <span className="queue-sub ellipsis">
                  {sub}
                  {duration != null && ` · ${formatTime(duration)}`}
                </span>
              </span>
              {state === 'current' && <span className="now-badge">{playing ? '▶ now' : '❚❚'}</span>}
            </button>
            <FavoriteButton title={known ?? creator} starred={favoriteIds.has(item.id)}
              onToggle={toggleFavorite && (() => toggleFavorite(item))} />
          </li>
        );
      })}
    </ol>
  );
}

/** A still, or a gradient from the id while there is none (or it fails). */
export function Thumb({ still, id }: { still: string | null; id: number }) {
  const [failed, setFailed] = useState(false);
  const hue = (id * 47) % 360;
  return (
    <span className="thumb" style={{ background: `linear-gradient(135deg, hsl(${hue} 60% 45%), hsl(${(hue + 70) % 360} 50% 25%))` }}>
      {still && !failed && <img src={still} alt="" loading="lazy" onError={() => setFailed(true)} />}
    </span>
  );
}
