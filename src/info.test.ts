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
    const generation = readGeneration({
      prompt: ' neon rain ', steps: 30, cfgScale: 6.5, sampler: 'Euler a', unknown: 'x',
      civitaiResources: [{ type: 'checkpoint', modelVersionId: 11, weight: 1 }],
    });
    expect(generation).toEqual({
      prompt: 'neon rain', negativePrompt: null,
      settings: [['Sampler', 'Euler a'], ['Steps', '30'], ['CFG', '6.5']],
      refs: [{ type: 'checkpoint', versionId: 11, name: null, weight: 1 }],
    });
  });

  it('has nothing for missing or empty meta', () => {
    expect(readGeneration(null)).toBeNull();
    expect(readGeneration({ comfy: '{}' })).toBeNull();
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

  it('adds the creator\'s avatar last, once per creator, unless it is rated above the item', async () => {
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
    const withAvatar = async (id: number, userId: number) => {
      store.load({ ...track, id, url: cdn, creator: { userId, username: 'u' } });
      await settled(store, id);
      await new Promise(resolve => setTimeout(resolve, 0));
      const info = store.get(id);
      return info?.status === 'ready' ? info.avatar : undefined;
    };
    expect(await withAvatar(1, 1)).toBe('https://image.civitai.com/ns/face/width=64/avatar.jpeg');
    expect(await withAvatar(2, 1)).toBe('https://image.civitai.com/ns/face/width=64/avatar.jpeg');
    expect(await withAvatar(3, 2)).toBeNull();
    expect(userCalls).toBe(2);
  });

  it('marks an image Civitai does not list as missing', async () => {
    const store = createInfoStore({ getImage: async () => null } as unknown as ApiClient);
    store.load(track);
    expect(await settled(store, 7)).toEqual({ status: 'missing' });
  });
});
