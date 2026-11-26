// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState, type FormEvent } from 'react';

import { parseCollectionRef } from '../api.js';
import type { FAVORITES_ID, PlaylistId } from '../memory.js';
import { Icon } from './Icon.js';
import { SourceNote } from './SourceNote.js';

export type Playlist = { id: number; name: string; source: 'featured' | 'mine' | 'link' }
  | { id: typeof FAVORITES_ID; name: string; source: 'favorites' };

/** The playlists across the top: the featured one, the viewer's collections, and any opened by link. */
export function PlaylistBar({ playlists, selected, onSelect, onOpen, onForget, status }: {
  playlists: Playlist[];
  /** Removes a playlist opened by link from the bar and from memory. */
  onForget: (id: number) => void;
  /** Loading or failing to load the selected playlist, when the stage cannot say so. */
  status: { text: string; error: boolean } | null;
  selected: PlaylistId;
  onSelect: (id: PlaylistId) => void;
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
    <header className="playlist-bar">
      <span className="brand"><b>Song</b>stream</span>
      <nav className="playlists" aria-label="Playlists">
        {playlists.map(playlist => {
          const chip = (
            <button key={playlist.id} type="button" className={`chip${playlist.id === selected ? ' on' : ''}`}
              aria-pressed={playlist.id === selected} onClick={() => onSelect(playlist.id)}>
              {playlist.source === 'favorites' && <span aria-hidden="true">★ </span>}
              {playlist.name}
            </button>
          );
          if (playlist.source !== 'link') return chip;
          return (
            <span key={playlist.id} className="chip-group">
              {chip}
              <button type="button" className="chip-forget" onClick={() => onForget(playlist.id)}
                aria-label={`Forget ${playlist.name}`} title={`Forget ${playlist.name}`}>×</button>
            </span>
          );
        })}
        {adding ? (
          <form className="add-playlist" onSubmit={submit}>
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
          <span className={`playlist-status${status.error ? ' error' : ''}`} role="status">{status.text}</span>
        )}
      </nav>
      <SourceNote />
    </header>
  );
}
