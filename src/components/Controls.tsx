// SPDX-License-Identifier: AGPL-3.0-or-later
import type { CSSProperties } from 'react';

import { formatTime } from '../media.js';
import type { Player } from '../player.js';
import { Icon } from './Icon.js';

const REPEAT_LABEL = { all: 'Repeat all', one: 'Repeat this one', off: 'Repeat off' } as const;

/** A range input that paints its filled part through --fill. */
const fill = (value: number, max: number): CSSProperties =>
  ({ '--fill': `${max > 0 ? Math.min(100, (value / max) * 100) : 0}%` }) as CSSProperties;

export function Controls({ player }: { player: Player }) {
  const { queue, playing, time, duration, volume, muted, track } = player;
  const known = duration != null;
  const shownVolume = muted ? 0 : volume;
  return (
    <div className="controls">
      <div className="progress">
        <span className="time">{formatTime(track ? time : null)}</span>
        <input type="range" className="slider" aria-label="Position" min={0} max={duration ?? 0} step={0.1}
          value={known ? Math.min(time, duration) : 0} disabled={!known}
          style={fill(time, duration ?? 0)} onChange={event => player.seek(Number(event.currentTarget.value))} />
        <span className="time">{formatTime(duration)}</span>
      </div>
      <div className="control-row">
        <div className="keys" aria-hidden="true">
          <kbd title="Play or pause">Space</kbd>
          <kbd title="Seek; with Shift, previous or next">← →</kbd>
        </div>
        <div className="transport">
          <button type="button" className={`icon-button${queue.shuffle ? ' on' : ''}`} onClick={player.toggleShuffle}
            aria-pressed={queue.shuffle} title={queue.shuffle ? 'Shuffle on' : 'Shuffle off'} aria-label="Shuffle">
            <Icon name="shuffle" />
          </button>
          <button type="button" className="icon-button" onClick={player.previous} disabled={!track}
            title="Previous" aria-label="Previous">
            <Icon name="previous" />
          </button>
          <button type="button" className="play-button" onClick={player.toggle} disabled={!track}
            aria-label={playing ? 'Pause' : 'Play'} title={playing ? 'Pause' : 'Play'}>
            <Icon name={playing ? 'pause' : 'play'} size={22} />
          </button>
          <button type="button" className="icon-button" onClick={player.next} disabled={!track}
            title="Next" aria-label="Next">
            <Icon name="next" />
          </button>
          <button type="button" className={`icon-button repeat${queue.repeat !== 'off' ? ' on' : ''}`}
            onClick={player.cycleRepeat} title={REPEAT_LABEL[queue.repeat]} aria-label={REPEAT_LABEL[queue.repeat]}>
            <Icon name="repeat" />
            {queue.repeat === 'one' && <span className="repeat-one" aria-hidden="true">1</span>}
          </button>
        </div>
        <div className="volume">
          <button type="button" className="icon-button" onClick={player.toggleMute}
            aria-label={muted ? 'Unmute' : 'Mute'} title={muted ? 'Unmute' : 'Mute'}>
            <Icon name={muted || volume === 0 ? 'muted' : 'volume'} />
          </button>
          <input type="range" className="slider volume-slider" aria-label="Volume" min={0} max={1} step={0.02}
            value={shownVolume} style={fill(shownVolume, 1)}
            onChange={event => player.setVolume(Number(event.currentTarget.value))} />
        </div>
      </div>
    </div>
  );
}
