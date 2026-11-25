// SPDX-License-Identifier: AGPL-3.0-or-later
// What Civitai knows about a track beyond the collection item: its post's
// title, reaction counts and generation data. Loaded on demand (the current
// and the next track), cached for the visit, and shared through a tiny store so
// the queue rows can show titles as they arrive. React-free.

import type { ApiClient, ImageInfo, ImageStats } from './api.js';
import { avatarUrl } from './media.js';
import type { Track } from './track.js';

export interface Resource {
  type: string;
  name: string;
  weight: number | null;
  /** A Civitai path to the model, when known. */
  path: string | null;
}

export interface Generation {
  prompt: string | null;
  negativePrompt: string | null;
  /** Label and value pairs, in display order: sampler, steps, CFG, seed, size… */
  settings: [string, string][];
  resources: Resource[];
}

export type Info =
  | { status: 'loading' }
  | { status: 'missing' }
  | { status: 'error'; message: string }
  | {
    status: 'ready';
    title: string | null;
    postId: number | null;
    stats: ImageStats;
    generation: Generation | null;
    /** The creator's avatar, filled in last: it must never hold up the rest. */
    avatar: string | null;
  };

export interface InfoStore {
  /** What is known about a track, or `undefined` before anything was asked. */
  get: (id: number) => Info | undefined;
  /** Starts loading a track's info, once. */
  load: (track: Track) => void;
  subscribe: (listener: () => void) => () => void;
  /** Changes whenever any entry does; the snapshot for useSyncExternalStore. */
  version: () => number;
}

const MAX_RESOURCES = 8;

const SETTINGS: [key: string, label: string][] = [
  ['workflow', 'Workflow'], ['ecosystem', 'Ecosystem'], ['baseModel', 'Base model'],
  ['sampler', 'Sampler'], ['scheduler', 'Scheduler'], ['steps', 'Steps'], ['cfgScale', 'CFG'],
  ['seed', 'Seed'], ['Size', 'Size'], ['clipSkip', 'Clip skip'], ['denoise', 'Denoise'],
];

const text = (value: unknown) =>
  typeof value === 'string' ? value.trim() || null : typeof value === 'number' && Number.isFinite(value) ? String(value) : null;

const num = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) ? value : null);

interface ResourceRef { type: string; versionId: number | null; name: string | null; weight: number | null }

/** The resources a meta object names: `civitaiResources` first, else the older `resources`. */
function resourceRefs(meta: Record<string, unknown>): ResourceRef[] {
  const list = Array.isArray(meta.civitaiResources) ? meta.civitaiResources
    : Array.isArray(meta.resources) ? meta.resources : [];
  return (list as Record<string, unknown>[]).filter(entry => entry && typeof entry === 'object').map(entry => ({
    type: text(entry.type) ?? 'resource',
    versionId: num(entry.modelVersionId),
    name: text(entry.name) ?? text(entry.modelVersionName),
    weight: num(entry.weight) ?? num(entry.strength),
  })).slice(0, MAX_RESOURCES);
}

/**
 * The meta object itself. Looked up by `imageId`, the images route wraps it as
 * `{ id, meta }`; by `postId` it comes bare. Either is accepted.
 */
function unwrap(meta: ImageInfo['meta']): Record<string, unknown> | null {
  if (!meta || typeof meta !== 'object') return null;
  const keys = Object.keys(meta);
  if ('meta' in meta && keys.every(key => key === 'id' || key === 'meta')) {
    const inner = meta.meta;
    return inner && typeof inner === 'object' && !Array.isArray(inner) ? inner as Record<string, unknown> : null;
  }
  return meta;
}

/**
 * Generation data from an image, or `null` when there is none worth showing.
 * The free-form meta comes first. The image's own `baseModel` and
 * `modelVersionIds` fill in when the meta lacks them, as it often does for videos.
 */
export function readGeneration(image: Pick<ImageInfo, 'meta' | 'baseModel' | 'modelVersionIds'>):
  Omit<Generation, 'resources'> & { refs: ResourceRef[] } | null {
  const meta: Record<string, unknown> = { ...unwrap(image.meta) };
  meta.baseModel ??= image.baseModel;
  const prompt = text(meta.prompt);
  const negativePrompt = text(meta.negativePrompt);
  const settings = SETTINGS.flatMap(([key, label]): [string, string][] => {
    const value = text(meta[key]);
    return value ? [[label, value]] : [];
  });
  let refs = resourceRefs(meta);
  if (!refs.length && Array.isArray(image.modelVersionIds)) {
    refs = image.modelVersionIds.filter(id => Number.isSafeInteger(id)).slice(0, MAX_RESOURCES)
      .map(versionId => ({ type: 'resource', versionId, name: null, weight: null }));
  }
  if (!prompt && !negativePrompt && !settings.length && !refs.length) return null;
  return { prompt, negativePrompt, settings, refs };
}

const capitalise = (value: string) => value.charAt(0).toUpperCase() + value.slice(1);

export function createInfoStore(api: ApiClient): InfoStore {
  const entries = new Map<number, Info>();
  // Avatars by creator id: one request per creator for the visit.
  const avatars = new Map<number, Promise<string | null>>();
  const listeners = new Set<() => void>();
  let version = 0;

  function set(id: number, info: Info) {
    entries.set(id, info);
    version++;
    for (const listener of listeners) listener();
  }

  async function resolve(ref: ResourceRef): Promise<Resource> {
    const base = { type: capitalise(ref.type), weight: ref.weight };
    if (ref.versionId == null) return { ...base, name: ref.name ?? 'Unknown resource', path: null };
    const version = await api.getModelVersion(ref.versionId).catch(() => null);
    // A resource listed only by id takes its type from the model.
    if (ref.type === 'resource' && version?.model?.type) base.type = capitalise(version.model.type);
    const model = version?.model?.name;
    const name = model && version?.name ? `${model} · ${version.name}` : model ?? ref.name ?? `Version ${ref.versionId}`;
    const path = version?.modelId ? `/models/${version.modelId}?modelVersionId=${ref.versionId}` : null;
    return { ...base, name, path };
  }

  function avatarFor(track: Track): Promise<string | null> {
    const userId = track.creator?.userId;
    if (userId == null) return Promise.resolve(null);
    let found = avatars.get(userId);
    if (!found) {
      found = api.getUser(userId).then(user => {
        // An avatar rated above what the viewer is seeing in this item stays hidden.
        if (!user || (user.avatarNsfw ?? 1) > Math.max(1, track.nsfwLevel)) return null;
        return avatarUrl(user.avatarUrl, track.url, 64);
      }).catch(() => null);
      avatars.set(userId, found);
    }
    return found;
  }

  async function fetchInfo(track: Track) {
    try {
      const image = await api.getImage(track.id, track.nsfwLevel);
      if (!image) {
        set(track.id, { status: 'missing' });
        return;
      }
      const [post, generation] = await Promise.all([
        image.postId ? api.getPost(image.postId).catch(() => null) : null,
        (async () => {
          const read = readGeneration(image);
          if (!read) return null;
          const { refs, ...rest } = read;
          return { ...rest, resources: await Promise.all(refs.map(resolve)) };
        })(),
      ]);
      set(track.id, {
        status: 'ready',
        title: text(post?.title),
        postId: image.postId ?? null,
        stats: image.stats ?? {},
        generation,
        avatar: null,
      });
      const avatar = await avatarFor(track);
      const latest = entries.get(track.id);
      if (avatar && latest?.status === 'ready') set(track.id, { ...latest, avatar });
    } catch (error) {
      set(track.id, { status: 'error', message: error instanceof Error ? error.message : 'Could not load the details.' });
    }
  }

  return {
    get: id => entries.get(id),
    load: track => {
      if (entries.has(track.id)) return;
      set(track.id, { status: 'loading' });
      void fetchInfo(track);
    },
    subscribe: listener => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    version: () => version,
  };
}
