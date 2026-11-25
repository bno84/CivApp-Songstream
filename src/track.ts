// SPDX-License-Identifier: AGPL-3.0-or-later
// A playable item, as the player and the queue see it. React-free.

import type { MediaItem, UserRef } from './api.js';
import { isPlayable, isTrustedMedia, stillUrl, type MediaType } from './media.js';

export interface Track {
  id: number;
  type: MediaType;
  url: string;
  /** A still for the poster, the queue and the lock screen. */
  still: string | null;
  creator: UserRef | null;
  nsfwLevel: number;
}

/** A saved favorite, checked before its media is used again. */
export function asTrack(data: unknown): Track | null {
  if (!data || typeof data !== 'object') return null;
  const { id, type, url, creator, nsfwLevel } = data as Partial<Track>;
  if (typeof id !== 'number' || !Number.isSafeInteger(id) || id <= 0 ||
    (type !== 'video' && type !== 'audio') || typeof url !== 'string' || !isTrustedMedia(url) ||
    typeof nsfwLevel !== 'number' || !Number.isSafeInteger(nsfwLevel) || nsfwLevel < 0) return null;
  const owner = creator && Number.isSafeInteger(creator.userId) && creator.userId > 0 &&
    (creator.username === null || typeof creator.username === 'string')
    ? { userId: creator.userId, username: creator.username }
    : null;
  return { id, type, url, creator: owner, nsfwLevel, still: stillUrl(url, type, 450) };
}

/**
 * The playable items of a collection page. Images, items without a file, and
 * files anywhere but on Civitai are skipped.
 */
export function toTracks(items: readonly MediaItem[]): Track[] {
  return items.flatMap(item => (isPlayable(item.type) && isTrustedMedia(item.url) ? [{
    id: item.mediaId,
    type: item.type,
    url: item.url,
    still: stillUrl(item.url, item.type, 450),
    creator: item.creator,
    nsfwLevel: item.nsfwLevel,
  }] : []));
}

/**
 * The track's post title, or a stand-in until (or unless) Civitai has one. The
 * stand-in leaves the creator out: it is always shown beside the title.
 */
export function trackTitle(track: Track, title: string | null | undefined): string {
  return title || (track.type === 'audio' ? 'Untitled track' : 'Untitled video');
}

export const profilePath = (name: string | null | undefined) =>
  name ? `/user/${encodeURIComponent(name)}` : null;

export const imagePath = (id: number) => `/images/${id}`;
