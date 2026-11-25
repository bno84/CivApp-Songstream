// SPDX-License-Identifier: AGPL-3.0-or-later
// Development only: the SDK's mock host (BLOCK_INIT, a signed-in viewer, theme)
// and an in-memory stand-in for Civitai's routes, shaped like them.
//
// The sample media are MDN's CC0 example clips, fetched from MDN when played.
// They sit off Civitai's CDN, so the queue shows gradients instead of stills.
import { getTransport } from '@civitai/blocks-react';
import { Harness } from '@civitai/blocks-react/testing';

import { App } from '../App.js';
import { ApiError, type ApiClient, type CollectionDetail, type ImageInfo, type MediaItem } from '../api.js';

// The mock host answers from this origin; the transport drops anything else.
getTransport({ allowedParentOrigins: [window.location.origin] });

const CLIPS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/friday.mp4',
];

const CREATORS = ['driftcat', 'tidewright', 'hushmoth', 'fernhollow', 'saltglass', 'emberloom', 'oakandash', 'lunaforge'];
const TITLES = ['Neon Rain on Mars', 'Lo-fi lighthouse', 'Paper moons', 'Static garden', 'Glass harbour', 'Ember waltz',
  'Moth radio', 'Copper skies', 'Tidal hymn', 'Pixel dusk', 'Quiet circuit', 'Juniper byte',
  // Titles that test the layout: a pasted prompt, no break opportunities, emoji only.
  'An extremely long post title that keeps going well past the width of the column, because some creators paste their whole prompt into the title field',
  'ThisTitleHasNoSpacesAtAllAndJustKeepsGoingWithoutAnyBreakOpportunity_v2_final_FINAL',
  '🎸🎶✨ 🔥🔥🔥'];

function sample(count: number, seed: number, imageShare = 0): MediaItem[] {
  return Array.from({ length: count }, (_, i) => {
    const id = seed * 1000 + i;
    const image = (i * 7 + seed) % 10 < imageShare * 10;
    return {
      mediaId: id, type: image ? 'image' : 'video', url: image ? null : CLIPS[i % CLIPS.length],
      width: 1280, height: 720, nsfwLevel: 1,
      // Every 11th item has no creator, as a deleted account would.
      creator: i % 11 === 10 ? null : { userId: 500 + (i % CREATORS.length), username: CREATORS[(i + seed) % CREATORS.length] },
    };
  });
}

const curator = { userId: 1, username: 'dev-viewer' };
const detail = (id: number, name: string, owner = curator): CollectionDetail =>
  ({ id, name, description: null, curator: owner, isPublic: true, followed: false });

const COLLECTIONS: { detail: CollectionDetail; items: MediaItem[]; mine: boolean }[] = [
  // Large enough to page, so "loading more…" and appending can be seen.
  { detail: detail(17980935, 'Music Focus 🎸', { userId: 9, username: 'civitai-music' }), items: sample(230, 17, 0.1), mine: false },
  { detail: detail(101, 'My chill'), items: sample(14, 1), mine: true },
  { detail: detail(102, 'Road trip'), items: sample(40, 2, 0.3), mine: true },
  { detail: detail(103, 'Cozy interiors'), items: sample(12, 3, 1), mine: true },
  // Reachable only by link: try 201.
  { detail: detail(201, 'Neon cities', { userId: 77, username: 'skyline_kat' }), items: sample(25, 4), mine: false },
];

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

function fakeImage(id: number): ImageInfo | null {
  if (id % 13 === 5) return null;
  const n = id % 97;
  return {
    id, postId: id + 1_000_000, username: null,
    stats: { likeCount: n * 3, heartCount: n * 2 + 1, laughCount: n % 4, cryCount: n % 3, commentCount: n % 9 },
    // Wrapped as { id, meta }, as the real route does when asked by imageId.
    baseModel: 'Wan 2.2', modelVersionIds: [9001, 9002],
    meta: id % 4 === 3 ? { id, meta: null } : { id, meta: {
      prompt: `${TITLES[id % TITLES.length].toLowerCase()}, cinematic lighting, slow camera pan, synthwave palette`,
      negativePrompt: id % 2 ? 'blurry, low quality, watermark' : undefined,
      sampler: 'Euler a', steps: 30, cfgScale: 6.5, seed: 2381904412 + id, Size: '1280x720',
      civitaiResources: [{ type: 'checkpoint', modelVersionId: 9001, weight: 1 }, { type: 'lora', modelVersionId: 9002, weight: 0.8 }],
    } },
  };
}

const fakeApi: ApiClient = {
  async listMine() {
    await delay(200);
    return {
      items: COLLECTIONS.filter(entry => entry.mine).map(({ detail: d, items }) => ({
        ...d, coverImageUrl: null, itemCount: items.length,
      })),
    };
  },
  async getPage(id, cursor) {
    await delay(cursor ? 600 : 250);
    const found = COLLECTIONS.find(entry => entry.detail.id === id);
    if (!found) throw new ApiError(404, 'That collection does not exist, or it is private.');
    const start = cursor ? Number(cursor) : 0;
    const end = start + 100;
    return {
      collection: found.detail,
      items: found.items.slice(start, end),
      nextCursor: end < found.items.length ? String(end) : undefined,
    };
  },
  async getImage(id) {
    await delay(300);
    return fakeImage(id);
  },
  async getPost(id) {
    await delay(150);
    const imageId = id - 1_000_000;
    return imageId % 7 === 2 ? { id, title: null } : { id, title: TITLES[imageId % TITLES.length] };
  },
  async getUser(id) {
    await delay(400);
    // The sample media sit off Civitai's CDN, so there is no avatar to build.
    return { id, avatarUrl: null, avatarNsfw: 1 };
  },
  async getModelVersion(id) {
    await delay(150);
    return id === 9001
      ? { id, name: 'v1.0', modelId: 4001, model: { name: 'Wan 2.2 T2V' } }
      : { id, name: 'v2', modelId: 4002, model: { name: 'Synthwave Skies' } };
  },
};

// The harness pads its page by 56px for its message log, which scrolls a
// full-height app; the real host has no log. `?log` brings it back.
const showLog = new URLSearchParams(window.location.search).has('log');

export function HarnessApp() {
  return (
    <Harness showLog={showLog}>
      <App api={fakeApi} />
    </Harness>
  );
}
