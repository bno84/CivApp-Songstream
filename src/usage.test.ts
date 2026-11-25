// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';

import manifest from '../block.manifest.json';
import { BUDGET, createUsageMeter, type PlayContext } from './usage.js';

type Sent = { event: string; properties: Record<string, string | number | boolean> };

const context: PlayContext = { source: 'featured', shuffle: true, repeat: 'all' };

/** A meter on a fake clock, and what it sent. */
function meter() {
  let clock = 0;
  const sent: Sent[] = [];
  const usage = createUsageMeter((event, properties) => sent.push({ event, properties }), { now: () => clock });
  const wait = (ms: number) => { clock += ms; };
  /** Starts `play` (once) and plays it from `from` for `seconds`, reporting every quarter second as the element does. */
  const playFor = (play: number, seconds: number, from = 0, at = context) => {
    usage.started(play, at);
    for (let t = 0; t <= seconds * 4; t++) {
      usage.progress(play, from + t / 4);
      if (t < seconds * 4) wait(250);
    }
  };
  const batches = () => sent.filter(entry => entry.event === 'playback');
  return { usage, sent, wait, playFor, batches };
}

const total = (sent: Sent[], property: 'plays' | 'seconds') =>
  sent.reduce((sum, { properties }) => sum + Number(properties[property] ?? 0), 0);

describe('plays', () => {
  it('counts a play once, through pauses and stalls', () => {
    const { usage, batches } = meter();
    usage.started(1, context);
    usage.halted();
    usage.started(1, context);
    usage.started(1, context);
    usage.flush();
    expect(batches().map(entry => entry.properties)).toEqual([
      { source: 'featured', shuffle: true, repeat: 'all', first_of_visit: true, plays: 1, seconds: 0 },
    ]);
  });

  it('counts the next track, and the same track played again from the top', () => {
    const { usage, batches } = meter();
    // Repeat one: the player numbers each time through as another play.
    for (const play of [1, 2, 3]) usage.started(play, context);
    usage.flush();
    expect(total(batches(), 'plays')).toBe(3);
  });

  it('counts every play of a fast skip in a handful of events', () => {
    const { usage, wait, batches } = meter();
    for (let play = 1; play <= 200; play++) {
      usage.started(play, context);
      wait(300);
    }
    usage.flush();
    expect(total(batches(), 'plays')).toBe(200);
    expect(batches().length).toBeLessThanOrEqual(5);
  });

  it('sends plays within 30 seconds early in a visit, even with nothing else happening', () => {
    const { usage, wait, batches } = meter();
    usage.started(1, context);
    wait(29_000);
    usage.started(2, context);
    expect(batches()).toHaveLength(0);
    wait(1000);
    usage.started(3, context);
    expect(total(batches(), 'plays')).toBe(3);
  });

  it('starts a new batch when the playlist kind, shuffle or repeat changes', () => {
    const { usage, batches } = meter();
    usage.started(1, context);
    usage.started(2, context);
    usage.started(3, { ...context, shuffle: false });
    usage.started(4, { ...context, shuffle: false, source: 'favorites' });
    usage.flush();
    expect(batches().map(entry => entry.properties)).toEqual([
      { source: 'featured', shuffle: true, repeat: 'all', first_of_visit: true, plays: 2, seconds: 0 },
      { source: 'featured', shuffle: false, repeat: 'all', first_of_visit: false, plays: 1, seconds: 0 },
      { source: 'favorites', shuffle: false, repeat: 'all', first_of_visit: false, plays: 1, seconds: 0 },
    ]);
  });
});

describe('listening time', () => {
  it('counts a single short video', () => {
    const { usage, playFor, batches } = meter();
    playFor(1, 10);
    usage.flush();
    expect(batches().map(entry => entry.properties)).toEqual([
      { source: 'featured', shuffle: true, repeat: 'all', first_of_visit: true, plays: 1, seconds: 10 },
    ]);
  });

  it('sends every 30 seconds at first, then every minute, then every five', () => {
    const { playFor, batches } = meter();
    playFor(1, 5 * 60);
    expect(batches()).toHaveLength(10);
    playFor(1, 25 * 60, 5 * 60);
    expect(batches()).toHaveLength(35);
    playFor(1, 60 * 60, 30 * 60);
    expect(batches()).toHaveLength(47);
    expect(new Set(batches().slice(-12).map(entry => entry.properties.seconds))).toEqual(new Set([300]));
    expect(total(batches(), 'seconds')).toBe(90 * 60);
    expect(total(batches(), 'plays')).toBe(1);
  });

  it('adds up short videos across tracks', () => {
    const { usage, playFor, batches } = meter();
    for (let play = 1; play <= 7; play++) playFor(play, 10);
    usage.flush();
    expect(total(batches(), 'seconds')).toBe(70);
    expect(total(batches(), 'plays')).toBe(7);
  });

  it('rounds a flush to the nearest second, and takes a round up off what plays next', () => {
    const { usage, playFor, batches } = meter();
    playFor(1, 7.5);
    usage.flush();
    expect(batches().map(entry => entry.properties.seconds)).toEqual([8]);
    usage.flush();
    expect(batches()).toHaveLength(1);
    // Half a second was sent early: 2.25 more makes 9.75 in all, so 2 more.
    playFor(1, 2.25, 7.5);
    usage.flush();
    expect(total(batches(), 'seconds')).toBe(10);
    // The quarter second sent early is played now: nothing is left to send.
    playFor(1, 0.25, 9.75);
    usage.flush();
    expect(batches()).toHaveLength(2);
  });

  it('does not count a seek forward, a seek back or a restart as time played', () => {
    const { usage, wait, playFor, batches } = meter();
    playFor(1, 20);
    // Arrow key: five seconds ahead in a quarter second.
    wait(250);
    usage.progress(1, 25.25);
    // Dragged far ahead.
    wait(250);
    usage.progress(1, 500);
    // And back to the start.
    wait(250);
    usage.progress(1, 0);
    playFor(1, 10, 0);
    usage.flush();
    expect(total(batches(), 'seconds')).toBe(30);
  });

  it('does not count time spent paused', () => {
    const { usage, wait, playFor, batches } = meter();
    playFor(1, 20);
    usage.halted();
    wait(10 * 60_000);
    playFor(1, 10, 20);
    usage.flush();
    expect(total(batches(), 'seconds')).toBe(30);
  });

  it('counts playback in a background tab, where updates come less often', () => {
    const { usage, wait, batches } = meter();
    usage.started(1, context);
    for (let second = 0; second <= 120; second += 4) {
      usage.progress(1, second);
      wait(4000);
    }
    usage.flush();
    expect(total(batches(), 'seconds')).toBe(120);
  });

  it('keeps a batch the rate limit held back, and sends it later', () => {
    const { usage, wait, playFor, batches } = meter();
    playFor(1, 29);
    // Eight stars in one second use up the rate as the batch fills.
    for (let i = 0; i < 8; i++) usage.favorite(i % 2 === 0, 'queue');
    for (const position of [29.25, 29.5, 29.75, 30]) {
      wait(200);
      usage.progress(1, position);
    }
    expect(batches()).toHaveLength(0);
    wait(1000);
    usage.flush();
    expect(total(batches(), 'seconds')).toBe(30);
    expect(total(batches(), 'plays')).toBe(1);
  });
});

describe('favorites', () => {
  it('counts stars and unstars, with where they were clicked', () => {
    const { usage, sent } = meter();
    usage.favorite(true, 'now_playing');
    usage.favorite(false, 'queue');
    expect(sent).toEqual([
      { event: 'favorite_changed', properties: { action: 'add', place: 'now_playing' } },
      { event: 'favorite_changed', properties: { action: 'remove', place: 'queue' } },
    ]);
  });
});

describe('the manifest declaration', () => {
  const declared: Record<string, { properties: Record<string, { type: string; values?: string[] }> }> =
    manifest.analytics.events;

  it('declares every event and property sent, with the right types', () => {
    const { usage, wait, playFor, sent } = meter();
    let play = 0;
    for (const source of ['featured', 'favorites', 'mine', 'link'] as const) {
      for (const repeat of ['off', 'all', 'one'] as const) {
        playFor(++play, 45, 0, { source, shuffle: repeat === 'all', repeat });
        wait(1000);
      }
    }
    for (let i = 0; i < 120; i++) usage.started(++play, context);
    playFor(play, 40 * 60);
    usage.favorite(true, 'now_playing');
    usage.favorite(false, 'queue');
    usage.flush();
    expect(new Set(sent.map(entry => entry.event))).toEqual(new Set(Object.keys(declared)));
    for (const { event, properties } of sent) {
      const spec = declared[event].properties;
      for (const [name, value] of Object.entries(properties)) {
        expect(spec).toHaveProperty(name);
        const { type, values } = spec[name];
        if (type === 'enum') expect(values).toContain(value);
        else expect(typeof value).toBe(type);
      }
    }
  });

  it('keeps the shares within the host limit of 500 per mount', () => {
    expect(Object.values(BUDGET).reduce((sum, n) => sum + n, 0)).toBeLessThan(500);
    expect(Object.keys(BUDGET).sort()).toEqual(Object.keys(declared).sort());
  });
});
