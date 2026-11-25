// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';

import { avatarUrl, formatCount, formatTime, isTrustedMedia, stillUrl } from './media.js';

const CDN = 'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/0b1c2d3e-uuid/original=true/123456.mp4';

describe('stillUrl', () => {
  it('asks the CDN for a transcoded first frame of a video', () => {
    expect(stillUrl(CDN, 'video', 320)).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/0b1c2d3e-uuid/anim=false,transcode=true,width=320/123456.jpeg');
  });

  it('resizes an image and keeps a link off the CDN as it is', () => {
    expect(stillUrl(CDN.replace('.mp4', '.jpeg'), 'image', 200)).toContain('/width=200/123456.jpeg');
    expect(stillUrl('https://example.com/a.png', 'image')).toBe('https://example.com/a.png');
  });

  it('has no still for audio, a missing link or a video off the CDN', () => {
    expect(stillUrl(CDN, 'audio')).toBeNull();
    expect(stillUrl(null, 'video')).toBeNull();
    expect(stillUrl('https://example.com/a.mp4', 'video')).toBeNull();
  });
});

describe('formatTime', () => {
  it('reads minutes and hours', () => {
    expect(formatTime(0)).toBe('0:00');
    expect(formatTime(221.7)).toBe('3:41');
    expect(formatTime(3723)).toBe('1:02:03');
  });

  it('shows a placeholder for unknown values', () => {
    expect(formatTime(NaN)).toBe('–:––');
    expect(formatTime(Infinity)).toBe('–:––');
    expect(formatTime(null)).toBe('–:––');
  });
});

it('formatCount shortens large counts', () => {
  expect(formatCount(18)).toBe('18');
  expect(formatCount(1234)).toBe('1.2k');
  expect(formatCount(214000)).toBe('214k');
  expect(formatCount(3_400_000)).toBe('3.4M');
});

describe('avatarUrl', () => {
  it('builds a CDN link from a key, in the namespace of a known media URL', () => {
    expect(avatarUrl('6046154e-6d32-4500-8772-602edb4a4600', CDN, 64)).toBe(
      'https://image.civitai.com/xG1nkqKTMzGDvpLrqFT7WA/6046154e-6d32-4500-8772-602edb4a4600/width=64/avatar.jpeg');
  });

  it('keeps a full URL and refuses what it cannot place', () => {
    expect(avatarUrl('https://image.civitai.com/x/me.png', null)).toBe('https://image.civitai.com/x/me.png');
    expect(avatarUrl('https://example.com/me.png', null)).toBeNull();
    expect(avatarUrl('abc', null)).toBeNull();
    expect(avatarUrl('abc', 'https://example.com/a/b.mp4')).toBeNull();
    expect(avatarUrl('../x', CDN)).toBeNull();
    expect(avatarUrl(null, CDN)).toBeNull();
  });
});

it('isTrustedMedia allows https on Civitai\'s domains only', () => {
  expect(isTrustedMedia(CDN)).toBe(true);
  expect(isTrustedMedia('https://image.civitai.red/a.mp4')).toBe(true);
  expect(isTrustedMedia('http://image.civitai.com/a.mp4')).toBe(false);
  expect(isTrustedMedia('https://civitai.com.evil.example/a.mp4')).toBe(false);
  expect(isTrustedMedia('https://example.com/a.mp4')).toBe(false);
  expect(isTrustedMedia('not a url')).toBe(false);
  expect(isTrustedMedia(null)).toBe(false);
});
