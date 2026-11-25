// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';

import type { ApiClient } from './api.js';
import { createInfoStore, readGeneration, type Info } from './info.js';
import type { Track } from './track.js';

const track: Track = { id: 7, type: 'video', url: 'u', still: null, creator: null, nsfwLevel: 2 };

function settled(store: ReturnType<typeof createInfoStore>, id: number): Promise<Info> {
  return new Promise(resolve => {
    const check = () => {
      const info = store.get(id);
      if (info && info.status !== 'loading') resolve(info);
    };
    store.subscribe(check);
    check();
  });
}

describe('readGeneration', () => {
  it('picks the prompt, the known settings and the resources', () => {
    const generation = readGeneration({ meta: {
      prompt: ' neon rain ', steps: 30, cfgScale: 6.5, sampler: 'Euler a', unknown: 'x',
      civitaiResources: [{ type: 'checkpoint', modelVersionId: 11, weight: 1 }],
    } });
    expect(generation).toEqual({
      prompt: 'neon rain', negativePrompt: null,
      settings: [['Sampler', 'Euler a'], ['Steps', '30'], ['CFG', '6.5']],
      refs: [{ type: 'checkpoint', versionId: 11, name: null, weight: 1 }],
    });
  });

  it('reads the meta the imageId lookup wraps as { id, meta }', () => {
    // The shape civitai.com returns for /api/v1/images?imageId=…&withMeta=true (Nov 2026).
    const generation = readGeneration({
      meta: { id: 149549485, meta: { prompt: 'catgirl at the pier', workflow: 'img2vid', ecosystem: 'minimax', seed: 4 } },
      baseModel: 'MiniMax H3', modelVersionIds: [3385247],
    });
    expect(generation).toEqual({
      prompt: 'catgirl at the pier', negativePrompt: null,
      settings: [['Workflow', 'img2vid'], ['Ecosystem', 'minimax'], ['Base model', 'MiniMax H3'], ['Seed', '4']],
      refs: [{ type: 'resource', versionId: 3385247, name: null, weight: null }],
    });
  });

  it('falls back to the image\'s base model and resources when the meta is empty', () => {
    expect(readGeneration({ meta: { id: 1, meta: null }, baseModel: 'Wan 2.2', modelVersionIds: [5] })).toMatchObject({
      prompt: null, settings: [['Base model', 'Wan 2.2']], refs: [{ versionId: 5 }],
    });
  });

  it('has nothing for missing or empty meta', () => {
    expect(readGeneration({ meta: null })).toBeNull();
    expect(readGeneration({ meta: { id: 1, meta: null }, modelVersionIds: [] })).toBeNull();
    expect(readGeneration({ meta: { comfy: '{}' } })).toBeNull();
  });
});

describe('createInfoStore', () => {
  it('loads a track once, with its post title and named resources', async () => {
    let imageCalls = 0;
    const api = {
      getImage: async (id: number, level: number) => {
        imageCalls++;
        expect(level).toBe(2);
        return { id, postId: 3, stats: { heartCount: 5 }, meta: { prompt: 'p', civitaiResources: [{ type: 'lora', modelVersionId: 11, weight: 0.8 }] } };
      },
      getPost: async () => ({ id: 3, title: 'Neon Rain on Mars' }),
      getModelVersion: async () => ({ id: 11, name: 'v2', modelId: 5, model: { name: 'Synthwave Skies' } }),
    } as unknown as ApiClient;
    const store = createInfoStore(api);
    store.load(track);
    store.load(track);
    const info = await settled(store, 7);
    expect(imageCalls).toBe(1);
    expect(info).toMatchObject({ status: 'ready', title: 'Neon Rain on Mars', postId: 3, stats: { heartCount: 5 } });
    expect(info.status === 'ready' && info.generation?.resources).toEqual([
      { type: 'Lora', name: 'Synthwave Skies · v2', weight: 0.8, path: '/models/5?modelVersionId=11' },
    ]);
  });

  it('adds the creator\'s avatar last, one request per creator, hidden on items rated below it', async () => {
    const cdn = 'https://image.civitai.com/ns/abc/original=true/1.mp4';
    let userCalls = 0;
    const api = {
      getImage: async (id: number) => ({ id, postId: null, stats: {}, meta: null }),
      getUser: async (id: number) => {
        userCalls++;
        return { id, avatarUrl: id === 1 ? 'face' : 'spicy', avatarNsfw: id === 1 ? 1 : 8 };
      },
    } as unknown as ApiClient;
    const store = createInfoStore(api);
    const withAvatar = async (id: number, userId: number, nsfwLevel = track.nsfwLevel) => {
      store.load({ ...track, id, url: cdn, nsfwLevel, creator: { userId, username: 'u' } });
      await settled(store, id);
      await new Promise(resolve => setTimeout(resolve, 0));
      const info = store.get(id);
      return info?.status === 'ready' ? info.avatar : undefined;
    };
    expect(await withAvatar(1, 1)).toBe('https://image.civitai.com/ns/face/width=64/avatar.jpeg');
    expect(await withAvatar(2, 1)).toBe('https://image.civitai.com/ns/face/width=64/avatar.jpeg');
    expect(await withAvatar(3, 2)).toBeNull();
    // The same creator on a track rated as high as their avatar: shown, no new request.
    expect(await withAvatar(4, 2, 8)).toBe('https://image.civitai.com/ns/spicy/width=64/avatar.jpeg');
    expect(userCalls).toBe(2);
  });

  it('marks an image Civitai does not list as missing', async () => {
    const store = createInfoStore({ getImage: async () => null } as unknown as ApiClient);
    store.load(track);
    expect(await settled(store, 7)).toEqual({ status: 'missing' });
  });
});
