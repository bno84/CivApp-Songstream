// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, type FormEvent } from 'react';

import { parseCollectionRef } from '../api.js';
import { Icon } from './Icon.js';
import { SourceNote } from './SourceNote.js';

export interface Station {
  id: number;
  name: string;
  /** The default station (starred), one of the viewer's own collections, or one opened by link. */
  source: 'featured' | 'mine' | 'link';
}

/** The playlists across the top: the featured one, the viewer's collections, and any opened by link. */
export function StationBar({ stations, selected, onSelect, onOpen, onForget, status }: {
  stations: Station[];
  /** Removes a station opened by link from the bar and from memory. */
  onForget: (id: number) => void;
  /** Loading or failing to load the selected playlist, when the stage cannot say so. */
  status: { text: string; error: boolean } | null;
  selected: number;
  onSelect: (id: number) => void;
  /** Adds a collection by id and plays it. */
  onOpen: (id: number) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const id = parseCollectionRef(text);
    if (id == null) {
      setError('Paste a collection link, or its number.');
      return;
    }
    onOpen(id);
    setAdding(false);
    setText('');
    setError(null);
  };

  return (
    <header className="station-bar">
      <span className="brand">civitai <b>radio</b></span>
      <nav className="stations" aria-label="Playlists">
        {stations.map(station => {
          const chip = (
            <button key={station.id} type="button" className={`chip${station.id === selected ? ' on' : ''}`}
              aria-pressed={station.id === selected} onClick={() => onSelect(station.id)}>
              {station.source === 'featured' && <span aria-hidden="true">★ </span>}
              {station.name}
            </button>
          );
          if (station.source !== 'link') return chip;
          return (
            <span key={station.id} className="chip-group">
              {chip}
              <button type="button" className="chip-forget" onClick={() => onForget(station.id)}
                aria-label={`Forget ${station.name}`} title={`Forget ${station.name}`}>×</button>
            </span>
          );
        })}
        {adding ? (
          <form className="add-station" onSubmit={submit}>
            <input autoFocus value={text} placeholder="Collection link or number" aria-label="Collection link or number"
              aria-invalid={error != null} onChange={event => { setText(event.currentTarget.value); setError(null); }}
              onKeyDown={event => { if (event.key === 'Escape') setAdding(false); }} />
            <button type="submit" className="chip on">Play</button>
            {error && <span className="form-error" role="alert">{error}</span>}
          </form>
        ) : (
          <button type="button" className="chip" onClick={() => setAdding(true)} title="Play a collection from its link">
            <Icon name="plus" size={14} /> link
          </button>
        )}
        {status && (
          <span className={`station-status${status.error ? ' error' : ''}`} role="status">{status.text}</span>
        )}
      </nav>
      <SourceNote />
    </header>
  );
}
