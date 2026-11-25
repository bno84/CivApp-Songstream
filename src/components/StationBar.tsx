// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, type FormEvent } from 'react';

import { parseCollectionRef } from '../api.js';
import { Icon } from './Icon.js';

export interface Station {
  id: number;
  name: string;
  /** The default station, marked with a star. */
  featured?: boolean;
}

/** The playlists across the top: the featured one, the viewer's collections, and any opened by link. */
export function StationBar({ stations, selected, onSelect, onOpen }: {
  stations: Station[];
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
        {stations.map(station => (
          <button key={station.id} type="button" className={`chip${station.id === selected ? ' on' : ''}`}
            aria-pressed={station.id === selected} onClick={() => onSelect(station.id)}>
            {station.featured && <span aria-hidden="true">★ </span>}
            {station.name}
          </button>
        ))}
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
      </nav>
    </header>
  );
}
