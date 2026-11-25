// SPDX-License-Identifier: AGPL-3.0-or-later
// A playable item, as the player and the queue see it. React-free.

import type { MediaItem, UserRef } from './api.js';
import { isPlayable, stillUrl, type MediaType } from './media.js';

export interface Track {
  id: number;
  type: MediaType;
  url: string;
  /** A still for the poster, the queue and the lock screen. */
  still: string | null;
  creator: UserRef | null;
  nsfwLevel: number;
}

/** The playable items of a collection page; images and items without a file are skipped. */
export function toTracks(items: readonly MediaItem[]): Track[] {
  return items.flatMap(item => (isPlayable(item.type) && item.url ? [{
    id: item.mediaId,
    type: item.type,
    url: item.url,
    still: stillUrl(item.url, item.type, 450),
    creator: item.creator,
    nsfwLevel: item.nsfwLevel,
  }] : []));
}

/** The track's post title, or a stand-in until (or unless) Civitai has one. */
export function trackTitle(track: Track, title: string | null | undefined): string {
  if (title) return title;
  const kind = track.type === 'audio' ? 'Track' : 'Video';
  return track.creator?.username ? `${kind} by ${track.creator.username}` : `${kind} #${track.id}`;
}

export const profilePath = (name: string | null | undefined) =>
  name ? `/user/${encodeURIComponent(name)}` : null;

export const imagePath = (id: number) => `/images/${id}`;
