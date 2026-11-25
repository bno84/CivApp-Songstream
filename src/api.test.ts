// SPDX-License-Identifier: AGPL-3.0-or-later
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  createHttpClient, parseCollectionRef, parseRetryAfter, readCollection, type ApiClient, type CollectionPage,
} from './api.js';

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });

const client = (token = 't') =>
  createHttpClient({ origin: 'https://civitai.com', getToken: () => token, refreshToken: async () => ({ raw: 'fresh' }) });

afterEach(() => vi.unstubAllGlobals());

describe('createHttpClient', () => {
  it('retries a 401 with the token the refresh returned', async () => {
    const seen: (string | null)[] = [];
    vi.stubGlobal('fetch', vi.fn(async (_url: URL, init: RequestInit) => {
      const auth = new Headers(init.headers).get('Authorization');
      seen.push(auth);
      return auth === 'Bearer fresh' ? json({ items: [] }) : json({ error: 'expired' }, 401);
    }));
    await expect(client('stale').listMine()).resolves.toEqual({ items: [] });
    expect(seen).toEqual(['Bearer stale', 'Bearer fresh']);
  });

  it('waits out a 429 and then answers', async () => {
    let calls = 0;
    vi.stubGlobal('fetch', vi.fn(async () => (++calls === 1 ? json({}, 429, { 'Retry-After': '0' }) : json({ items: [] }))));
    await expect(client().listMine()).resolves.toEqual({ items: [] });
    expect(calls).toBe(2);
  });

  it('looks an image up on the public route at its own level, without the block token', async () => {
    let seen: { url: URL; auth: string | null } | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: URL, init: RequestInit) => {
      seen = { url, auth: new Headers(init.headers).get('Authorization') };
      return json({ items: [{ id: 7, postId: 3, meta: { prompt: 'p' } }] });
    }));
    await expect(client().getImage(7, 4)).resolves.toEqual({ id: 7, postId: 3, meta: { prompt: 'p' } });
    expect(seen?.auth).toBeNull();
    expect(seen?.url.pathname).toBe('/api/v1/images');
    expect(Object.fromEntries(seen!.url.searchParams)).toMatchObject({ imageId: '7', withMeta: 'true', browsingLevel: '4' });
  });

  it('answers null for an image, post or version Civitai does not have', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: URL) =>
      (url.pathname === '/api/v1/images' ? json({ items: [] }) : json({ error: 'nope' }, 404))));
    await expect(client().getImage(7, 1)).resolves.toBeNull();
    await expect(client().getPost(3)).resolves.toBeNull();
    await expect(client().getModelVersion(9)).resolves.toBeNull();
  });
});

describe('parseRetryAfter', () => {
  it('reads seconds and dates, and nothing from an absent header', () => {
    expect(parseRetryAfter(null)).toBeUndefined();
    expect(parseRetryAfter('')).toBeUndefined();
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter(new Date(Date.now() + 5000).toUTCString())).toBeGreaterThan(3000);
  });
});

describe('readCollection', () => {
  const page = (cursor?: string): CollectionPage => ({
    collection: { id: 1, name: 'c', description: null, curator: { userId: 1, username: 'u' }, isPublic: true, followed: false },
    items: [{ mediaId: Number(cursor ?? 0) + 1, type: 'video', url: null, width: 1, height: 1, creator: null, nsfwLevel: 1 }],
    nextCursor: cursor === '1' ? '1' : String(Number(cursor ?? 0) + 1),
  });

  it('hands over each page and stops at a repeated cursor', async () => {
    const api = { getPage: async (_id: number, cursor?: string) => page(cursor) } as unknown as ApiClient;
    const pages: CollectionPage[] = [];
    await readCollection(api, 1, { onPage: result => pages.push(result) });
    expect(pages.map(result => result.items[0].mediaId)).toEqual([1, 2]);
  });
});

it('parseCollectionRef reads an id or a collection link on any Civitai domain', () => {
  expect(parseCollectionRef('17980935')).toBe(17980935);
  expect(parseCollectionRef('https://civitai.red/collections/17980935?sort=Recently+Added')).toBe(17980935);
  expect(parseCollectionRef('https://civitai.com/models/1')).toBeNull();
  expect(parseCollectionRef('0')).toBeNull();
});
