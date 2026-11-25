// SPDX-License-Identifier: AGPL-3.0-or-later
import { useLayoutEffect, useRef, useState } from 'react';

import type { InfoStore } from '../info.js';
import { formatTime } from '../media.js';
import type { Player } from '../player.js';
import { entries } from '../queue.js';
import { trackTitle } from '../track.js';
import { Details } from './Details.js';

type Tab = 'queue' | 'details';

/** The right-hand panel: the queue (played items darkened) and the current item's details. */
export function Panel({ player, infos }: { player: Player; infos: InfoStore }) {
  const [tab, setTab] = useState<Tab>('queue');
  const { queue } = player;
  const count = queue.order.length;
  return (
    <section className="panel">
      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected={tab === 'queue'} className={tab === 'queue' ? 'on' : ''}
          onClick={() => setTab('queue')}>
          Queue{count ? ` · ${queue.pos + 1} of ${count}` : ''}
        </button>
        <button type="button" role="tab" aria-selected={tab === 'details'} className={tab === 'details' ? 'on' : ''}
          onClick={() => setTab('details')}>
          Details
        </button>
      </div>
      <div className="panel-body" role="tabpanel">
        {tab === 'queue' ? <QueueList player={player} infos={infos} /> : <Details track={player.track} infos={infos} />}
      </div>
    </section>
  );
}

function QueueList({ player, infos }: { player: Player; infos: InfoStore }) {
  const listRef = useRef<HTMLOListElement>(null);
  const { queue, durations, playing } = player;
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
      {rows.map(({ item, at, state }) => {
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
            <button type="button" onClick={() => player.jumpTo(at)} title={`Play ${title}`}>
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
