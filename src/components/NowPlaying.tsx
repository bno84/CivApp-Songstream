// SPDX-License-Identifier: AGPL-3.0-or-later
import { useState } from 'react';

import {
  ReactionError, useBlockToken, useConsentUnavailable, useReactions, useRequestConsent,
  type BlockEntityReactionErrorCode,
} from '@civitai/blocks-react';

import type { Info } from '../info.js';
import { formatCount } from '../media.js';
import { imagePath, profilePath, type Track } from '../track.js';
import { CivitaiLink } from './CivitaiLink.js';
import { FavoriteButton } from './FavoriteButton.js';
import { Icon } from './Icon.js';

const REACTIONS = [
  ['Like', 'likeCount', '👍', 'likes'],
  ['Heart', 'heartCount', '❤️', 'hearts'],
  ['Laugh', 'laughCount', '😂', 'laughs'],
  ['Cry', 'cryCount', '😢', 'cries'],
] as const;
const REACT_SCOPE = 'social:react:self';
// What each reaction error code means to a viewer. The host also answers
// `entity-unavailable` when reactions from apps are switched off site-wide.
const REACTION_ERRORS: Record<BlockEntityReactionErrorCode, string> = {
  'invalid-request': 'Civitai did not accept this reaction request.',
  'sign-in-required': 'Sign in to Civitai to react.',
  'review-mode': 'Reactions are off while the app is in review.',
  'not-ready': 'Civitai reactions are not ready yet. Try again in a moment.',
  'needs-consent': 'Allow Civitai reactions to react from here.',
  'entity-unavailable': 'Civitai is not taking reactions from apps on this video right now.',
  'rate-limited': 'Civitai’s reaction limit has been reached. Try again later.',
};

/** Title, creator, reaction counts and the ways out to Civitai, under the video. */
export function NowPlaying({ track, title, info, reactTicket, starred, toggleFavorite }: {
  track: Track | null;
  title: string;
  info: Info | undefined;
  reactTicket: string | undefined;
  starred: boolean;
  toggleFavorite: ((track: Track) => void) | undefined;
}) {
  const { scopes } = useBlockToken();
  const { requestConsent } = useRequestConsent();
  const { refusal } = useConsentUnavailable();
  const granted = scopes.includes(REACT_SCOPE);
  const permissionUnavailable = !granted && refusal?.reason === 'ungrantable';
  const reactId = track?.id;
  const reactions = useReactions('image', granted && reactId && reactTicket ? [reactId] : [],
    { tickets: reactId && reactTicket ? { [reactId]: reactTicket } : {} });
  const [failure, setFailure] = useState<{ id: number; text: string } | null>(null);
  if (!track) return <div className="now-playing" />;
  const creator = track.creator?.username ?? null;
  const creatorPath = profilePath(creator);
  const stats = info?.status === 'ready' ? info.stats : null;
  const reactionState = granted && reactTicket ? reactions.byId[track.id] : undefined;
  const reactionCounts = reactionState?.statsUnknown ? undefined : reactionState?.counts;
  const requestPermission = () => requestConsent({ scopes: [REACT_SCOPE] });
  const error = failure?.id === track.id ? failure.text : null;
  const unavailableReason = permissionUnavailable ? 'Civitai cannot grant reaction permission in this session'
    : granted && !reactionState && reactTicket
      ? reactions.loading ? 'Loading your Civitai reactions'
        : reactions.error?.code ? REACTION_ERRORS[reactions.error.code]
          : 'Civitai did not return your reactions for this video'
      : null;
  return (
    <div className="now-playing">
      <div className="now-title">
        <div className="now-heading">
          <h2 className="clamp-2" title={title}>{title}</h2>
          <FavoriteButton title={title} starred={starred} onToggle={toggleFavorite && (() => toggleFavorite(track))} />
        </div>
        {creator && (
          <CivitaiLink path={creatorPath ?? imagePath(track.id)} className="creator" title={`${creator} on Civitai`}>
            <Avatar key={info?.status === 'ready' ? info.avatar : null} name={creator}
              src={info?.status === 'ready' ? info.avatar : null} />
            {creator}
          </CivitaiLink>
        )}
      </div>
      <div className="reactions">
        {REACTIONS.map(([reaction, key, emoji, noun]) => {
          const count = reactionCounts?.[reaction] ?? (stats ? stats[key] ?? 0 : null);
          const label = count == null ? reaction : `${count} ${noun}`;
          const contents = <><span aria-hidden="true">{emoji}</span> {count == null ? '·' : formatCount(count)}</>;
          if (!reactTicket) {
            return <span key={key} className="pill" aria-label={label}
              title={`${label}. Civitai did not supply a reaction ticket for this video.`}>{contents}</span>;
          }
          const reacted = reactionState?.viewerReactions.includes(reaction);
          return (
            <button key={key} type="button" className="pill" aria-label={`${reaction} on Civitai (${label})`}
              aria-pressed={reacted} title={unavailableReason ?? (granted ? label : 'Allow Civitai reactions')}
              disabled={permissionUnavailable || (granted && (!reactionState || reactions.pending(track.id, reaction)))}
              onClick={() => {
                setFailure(null);
                if (!granted) {
                  requestPermission();
                  return;
                }
                void reactions.toggle(track.id, reaction, !reacted).catch((reason: unknown) => {
                  if (reason instanceof ReactionError && reason.needsConsent) requestPermission();
                  else setFailure({ id: track.id, text: reason instanceof ReactionError && reason.code
                    ? REACTION_ERRORS[reason.code] : 'Could not update your reaction.' });
                });
              }}>
              {contents}
            </button>
          );
        })}
        <span className="divider" aria-hidden="true" />
        <CivitaiLink path={imagePath(track.id)} className="pill" title="Comments open on Civitai">
          <Icon name="comment" size={16} /> {stats ? formatCount(stats.commentCount ?? 0) : '·'}
        </CivitaiLink>
        <CivitaiLink path={imagePath(track.id)} className="pill open-on-civitai"
          title="Open on Civitai" ariaLabel="Open on Civitai">
          <span>Open on Civitai</span><Icon name="external" size={14} />
        </CivitaiLink>
      </div>
      {error && <span className="reaction-error" role="status">{error}</span>}
    </div>
  );
}

/**
 * The creator's initial, covered by their avatar once it loads. Low priority:
 * the video comes first.
 */
function Avatar({ name, src }: { name: string; src: string | null }) {
  const [failed, setFailed] = useState(false);
  return (
    <span className="avatar" aria-hidden="true">
      {name.charAt(0).toUpperCase()}
      {src && !failed && (
        <img src={src} alt="" loading="lazy" decoding="async" fetchPriority="low" onError={() => setFailed(true)} />
      )}
    </span>
  );
}
