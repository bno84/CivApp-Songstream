// SPDX-License-Identifier: AGPL-3.0-or-later
// The one network boundary.
//
// Block routes, with the block token the host mints for this app
// (`collections:read:self`):
//
//   GET /api/v1/blocks/collections?mode=mine   the viewer's own collections
//   GET /api/v1/blocks/collections/{id}        one page of a collection's items
//
// What they return, from Civitai's source and Collectalytics (Nov 2026): `mode=mine`
// lists collections the viewer owns, not followed ones. A collection page holds
// ACCEPTED image and video items only (no audio), newest added first, without
// titles, durations or reactions. Items above the viewer's browsing level are
// left out, and a private collection answers 404.
//
// Public site routes, no token, for the Details tab:
//
//   GET /api/v1/images?imageId=…&withMeta=true  stats and generation data
//   GET /api/v1/posts/{id}                      the post's title
//   GET /api/v1/model-versions/{id}             a resource's model and version name
//
// The images route filters by browsing level, so it is asked for the item's own
// level: one the viewer already sees, since the collection route served it.

import type { MediaType } from './media.js';

export interface UserRef {
  userId: number;
  username: string | null;
}

export interface CollectionSummary {
  id: number;
  name: string;
  description: string | null;
  coverImageUrl: string | null;
  itemCount: number;
  curator: UserRef;
  isPublic: boolean;
  followed: boolean;
}

export interface CollectionDetail {
  id: number;
  name: string;
  description: string | null;
  curator: UserRef;
  isPublic: boolean;
  followed: boolean;
}

export interface MediaItem {
  mediaId: number;
  type: MediaType;
  url: string | null;
  width: number | null;
  height: number | null;
  creator: UserRef | null;
  nsfwLevel: number;
}

export interface CollectionPage {
  collection: CollectionDetail;
  items: MediaItem[];
  nextCursor?: string | number | null;
}

export interface CollectionList {
  items: CollectionSummary[];
  nextCursor?: string | number | null;
}

export interface ImageStats {
  likeCount?: number;
  heartCount?: number;
  laughCount?: number;
  cryCount?: number;
  commentCount?: number;
}

/** One item of GET /api/v1/images, the fields this app reads. */
export interface ImageInfo {
  id: number;
  postId?: number | null;
  username?: string | null;
  stats?: ImageStats | null;
  /** Free-form generation data; present only when the uploader shared it. */
  meta?: Record<string, unknown> | null;
}

export interface PostInfo {
  id: number;
  title?: string | null;
}

export interface ModelVersionInfo {
  id: number;
  name?: string | null;
  modelId?: number | null;
  model?: { name?: string | null; type?: string | null } | null;
}

export interface ApiClient {
  listMine(cursor?: string): Promise<CollectionList>;
  getPage(id: number, cursor?: string, signal?: AbortSignal): Promise<CollectionPage>;
  /** `null` when Civitai does not list the image (removed, or hidden from the API). */
  getImage(id: number, nsfwLevel: number, signal?: AbortSignal): Promise<ImageInfo | null>;
  getPost(id: number, signal?: AbortSignal): Promise<PostInfo | null>;
  getModelVersion(id: number, signal?: AbortSignal): Promise<ModelVersionInfo | null>;
}

export class ApiError extends Error {
  readonly status: number;
  readonly retryAfterMs?: number;

  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export const PAGE_SIZE = 100;
// 5,000 items. A larger collection plays what was read.
export const MAX_PAGES = 50;
const REQUEST_TIMEOUT_MS = 20000;
const RATE_LIMIT_RETRIES = 3;

interface HttpOptions {
  origin: string;
  getToken: () => string | undefined;
  /** Mints a fresh block token and returns it. */
  refreshToken: () => Promise<{ raw?: string } | undefined>;
}

type Query = Record<string, string | number | boolean | undefined>;

export function createHttpClient({ origin, getToken, refreshToken }: HttpOptions): ApiClient {
  async function attempt(url: URL, token: string | undefined, signal?: AbortSignal): Promise<Response> {
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    try {
      return await fetch(url, {
        headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      throw new ApiError(0, timeout.aborted ? 'Civitai took too long to answer.' : 'Could not reach Civitai.');
    }
  }

  async function request<T>(path: string, query: Query, { signal, auth = true }:
    { signal?: AbortSignal; auth?: boolean } = {}): Promise<T> {
    const url = new URL(path, origin);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== '') url.searchParams.set(key, String(value));
    }
    let token = auth ? getToken() : undefined;
    let refreshed = !auth;
    for (let tries = 0; ; tries++) {
      const response = await attempt(url, token, signal);
      if (response.ok) {
        try {
          return (await response.json()) as T;
        } catch {
          throw new ApiError(response.status, 'Civitai sent an unexpected answer.');
        }
      }
      // The block token is short-lived; a 401 usually means it just expired. The
      // retry uses the token the refresh returned, not whatever React holds yet.
      if (response.status === 401 && !refreshed) {
        refreshed = true;
        const fresh = await refreshToken().catch(() => undefined);
        if (signal?.aborted) throw signal.reason;
        token = fresh?.raw || getToken();
        continue;
      }
      const error = await toError(response);
      if (error.status !== 429 || tries >= RATE_LIMIT_RETRIES) throw error;
      await sleep(error.retryAfterMs ?? 2000 * (tries + 1), signal);
    }
  }

  /** A public lookup: `null` for a 404 rather than an error. */
  async function lookup<T>(path: string, query: Query, signal?: AbortSignal): Promise<T | null> {
    try {
      return await request<T>(path, query, { signal, auth: false });
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  }

  return {
    listMine: cursor => request<CollectionList>('/api/v1/blocks/collections',
      { mode: 'mine', limit: 100, cursor }),
    getPage: (id, cursor, signal) => request<CollectionPage>(`/api/v1/blocks/collections/${id}`,
      { limit: PAGE_SIZE, cursor }, { signal }),
    getImage: async (id, nsfwLevel, signal) => {
      const page = await lookup<{ items?: ImageInfo[] }>('/api/v1/images',
        { imageId: id, withMeta: true, browsingLevel: nsfwLevel > 0 ? nsfwLevel : undefined, limit: 1 }, signal);
      return page?.items?.find(item => item.id === id) ?? null;
    },
    getPost: (id, signal) => lookup<PostInfo>(`/api/v1/posts/${id}`, {}, signal),
    getModelVersion: (id, signal) => lookup<ModelVersionInfo>(`/api/v1/model-versions/${id}`, {}, signal),
  };
}

/** Retry-After as delta-seconds or an HTTP date, in ms; undefined when absent or unreadable. */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value?.trim()) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.min(60000, Math.max(0, seconds * 1000));
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.min(60000, Math.max(0, date - Date.now())) : undefined;
}

async function toError(response: Response): Promise<ApiError> {
  let message = '';
  try {
    const body = (await response.json()) as { error?: unknown; message?: unknown };
    const value = body.error ?? body.message;
    message = typeof value === 'string' ? value : '';
  } catch {
    // Classified on status alone.
  }
  switch (response.status) {
    case 401:
      return new ApiError(401, 'Your Civitai session expired. Reload the page to sign in again.');
    case 403:
      return new ApiError(403, message || 'Civitai refused this app access to collections.');
    case 404:
      return new ApiError(404, 'That collection does not exist, or it is private. Civitai Radio plays public collections and your own public ones.');
    case 429:
      return new ApiError(429, 'Civitai asked the app to slow down. Try again in a moment.',
        parseRetryAfter(response.headers.get('Retry-After')));
    default:
      return new ApiError(response.status, message || `Civitai answered with an error (${response.status}).`);
  }
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  return new Promise((resolve, reject) => {
    const onAbort = () => { clearTimeout(timer); reject(signal!.reason); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const MAX_LIST_PAGES = 50;

/** Every one of the viewer's own collections, sorted by name. */
export async function readMyCollections(api: ApiClient, signal?: AbortSignal): Promise<CollectionSummary[]> {
  const found = new Map<number, CollectionSummary>();
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_LIST_PAGES; page++) {
    const result = await api.listMine(cursor);
    if (signal?.aborted) throw signal.reason;
    for (const item of result.items ?? []) found.set(item.id, item);
    if (result.nextCursor == null) break;
    const next = String(result.nextCursor);
    if (seen.has(next)) break;
    seen.add(next);
    cursor = next;
  }
  return [...found.values()].sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Reads a collection page by page, handing each page to `onPage` as it lands so
 * playback can start before the whole collection is in. Ends at a missing or
 * repeated cursor, or at the page cap.
 */
export async function readCollection(api: ApiClient, id: number,
  { signal, onPage }: { signal?: AbortSignal; onPage: (page: CollectionPage) => void }): Promise<void> {
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < MAX_PAGES; page++) {
    const result = await api.getPage(id, cursor, signal);
    if (signal?.aborted) throw signal.reason;
    onPage(result);
    if (result.nextCursor == null) return;
    const next = String(result.nextCursor);
    if (seen.has(next)) return;
    seen.add(next);
    cursor = next;
  }
}

/** A collection id from a number or a Civitai collection link. */
export function parseCollectionRef(text: string): number | null {
  const trimmed = text.trim();
  const match = trimmed.match(/^(\d+)$/) ?? trimmed.match(/\/collections\/(\d+)/);
  const id = match ? Number(match[1]) : NaN;
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
