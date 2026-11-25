// SPDX-License-Identifier: AGPL-3.0-or-later
import type { Info } from '../info.js';
import { formatCount } from '../media.js';
import { useOpen } from '../open.js';
import { imagePath, profilePath, type Track } from '../track.js';
import { Icon } from './Icon.js';

const REACTIONS = [
  ['likeCount', '👍', 'likes'],
  ['heartCount', '❤️', 'hearts'],
  ['laughCount', '😂', 'laughs'],
  ['cryCount', '😢', 'cries'],
] as const;

/** Title, creator, reaction counts and the ways out to Civitai, under the video. */
export function NowPlaying({ track, title, info }: { track: Track | null; title: string; info: Info | undefined }) {
  const open = useOpen();
  if (!track) return <div className="now-playing" />;
  const creator = track.creator?.username ?? null;
  const creatorPath = profilePath(creator);
  const stats = info?.status === 'ready' ? info.stats : null;
  return (
    <div className="now-playing">
      <div className="now-title">
        <h2 className="clamp-2" title={title}>{title}</h2>
        {creator && (
          <button type="button" className="creator" onClick={() => creatorPath && open(creatorPath)}
            title={`${creator} on Civitai`}>
            <span className="avatar" aria-hidden="true">{creator.charAt(0).toUpperCase()}</span>
            {creator}
          </button>
        )}
      </div>
      <div className="reactions">
        {/* Counts only for now: reacting needs a permission the viewer grants first. */}
        {REACTIONS.map(([key, emoji, noun]) => (
          <span key={key} className="pill" aria-label={`${stats?.[key] ?? 0} ${noun}`}
            title={stats ? `${stats[key] ?? 0} ${noun}` : 'Loading reactions'}>
            <span aria-hidden="true">{emoji}</span> {stats ? formatCount(stats[key] ?? 0) : '·'}
          </span>
        ))}
        <span className="divider" aria-hidden="true" />
        <button type="button" className="pill" onClick={() => open(imagePath(track.id))}
          title="Comments open on Civitai">
          <Icon name="comment" size={16} /> {stats ? formatCount(stats.commentCount ?? 0) : '·'}
        </button>
        <button type="button" className="pill" onClick={() => open(imagePath(track.id))}>
          Open on Civitai <Icon name="external" size={14} />
        </button>
      </div>
    </div>
  );
}
