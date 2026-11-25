// SPDX-License-Identifier: AGPL-3.0-or-later
// Media URLs on Civitai's image CDN, and small formatting helpers. React-free.

export type MediaType = 'image' | 'video' | 'audio';

/** Media Civitai Radio can play. Collections serve images and videos; images are skipped. */
export const isPlayable = (type: MediaType) => type === 'video' || type === 'audio';

const CDN_HOST = /(^|\.)civitai\.com$/;

/** Civitai's own domains: the only places media and avatars are loaded from. */
const MEDIA_HOSTS = /(^|\.)(civitai\.(com|red|green)|civit\.ai)$/;
/** The harness's CC0 sample clips. Development builds only. */
const DEV_MEDIA_HOSTS: readonly string[] = import.meta.env.DEV ? ['interactive-examples.mdn.mozilla.net'] : [];

/**
 * Is this an https URL on Civitai? Anything else from the API is dropped
 * rather than loaded, so an unexpected URL never shows the viewer's request to
 * a third party.
 */
export function isTrustedMedia(url: string | null | undefined): url is string {
  if (!url) return false;
  try {
    const { protocol, hostname } = new URL(url);
    return protocol === 'https:' && (MEDIA_HOSTS.test(hostname) || DEV_MEDIA_HOSTS.includes(hostname));
  } catch {
    return false;
  }
}

/**
 * Swaps the transform segment of a CDN link (`original=true`, `width=450`, …)
 * for `params`, and optionally the file extension. Links off the CDN, or that
 * do not parse, come back as `null`.
 */
function transform(url: string, params: string, extension?: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!CDN_HOST.test(parsed.hostname)) return null;
  const parts = parsed.pathname.split('/');
  const at = parts.findIndex((part, i) => i > 1 && i < parts.length - 1 && part.includes('='));
  if (at >= 0) parts[at] = params;
  else parts.splice(parts.length - 1, 0, params);
  if (extension) parts[parts.length - 1] = parts[parts.length - 1].replace(/\.[^.]+$/, '') + extension;
  parsed.pathname = parts.join('/');
  return parsed.toString();
}

/**
 * A still for the queue, the poster and the lock screen. The block API serves
 * `original=true` links; for a video the CDN can transcode the first frame.
 */
export function stillUrl(url: string | null, type: MediaType, width = 320): string | null {
  if (!url) return null;
  if (type === 'audio') return null;
  if (type === 'video') return transform(url, `anim=false,transcode=true,width=${width}`, '.jpeg');
  return transform(url, `width=${width}`) ?? url;
}

/**
 * A creator's avatar at `size` px. The users route gives a CDN key; the CDN's
 * namespace is taken from a media URL that came from the same CDN. Old
 * accounts may carry a full URL instead.
 */
export function avatarUrl(key: string | null | undefined, cdnSample: string | null, size = 64): string | null {
  if (!key) return null;
  if (/^https:\/\//.test(key)) return isTrustedMedia(key) ? key : null;
  if (!/^[\w-]+$/.test(key) || !cdnSample) return null;
  let sample: URL;
  try {
    sample = new URL(cdnSample);
  } catch {
    return null;
  }
  const namespace = sample.pathname.split('/')[1];
  if (!CDN_HOST.test(sample.hostname) || !namespace) return null;
  return `${sample.origin}/${namespace}/${key}/width=${size}/avatar.jpeg`;
}

/** 3:41, or 1:02:03 past an hour. Unknown or broken values read as `–:––`. */
export function formatTime(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '–:––';
  const total = Math.floor(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

/** 1.2k, 18, 3.4M. */
export function formatCount(value: number): string {
  if (value < 1000) return String(value);
  const [n, unit] = value < 1e6 ? [value / 1e3, 'k'] : [value / 1e6, 'M'];
  return `${n >= 100 ? Math.round(n) : Math.round(n * 10) / 10}${unit}`;
}
