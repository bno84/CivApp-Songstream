// SPDX-License-Identifier: AGPL-3.0-or-later
import { describe, expect, it } from 'vitest';

import {
  advance, appendItems, back, createQueue, current, entries, jump, nextRepeat, setShuffle, type Queue,
} from './queue.js';

const items = (...ids: number[]) => ids.map(id => ({ id }));
const ids = (queue: Queue<{ id: number }>) => queue.order.map(index => queue.items[index].id);

/** A seeded generator, so shuffles are the same on every run. */
function seeded(seed = 1) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

describe('createQueue', () => {
  it('plays in playlist order and starts at the first item', () => {
    const queue = createQueue(items(1, 2, 3));
    expect(ids(queue)).toEqual([1, 2, 3]);
    expect(current(queue)).toEqual({ id: 1 });
  });

  it('drops repeated items and is empty without any', () => {
    expect(ids(createQueue(items(1, 2, 1)))).toEqual([1, 2]);
    const empty = createQueue(items());
    expect(empty.pos).toBe(-1);
    expect(current(empty)).toBeNull();
    expect(advance(empty)).toBeNull();
  });

  it('shuffles every item exactly once', () => {
    const queue = createQueue(items(1, 2, 3, 4, 5, 6), { shuffle: true }, seeded());
    expect([...ids(queue)].sort()).toEqual([1, 2, 3, 4, 5, 6]);
    expect(ids(queue)).not.toEqual([1, 2, 3, 4, 5, 6]);
  });
});

describe('advance and back', () => {
  it('stops at the end with repeat off and wraps with repeat all', () => {
    const last = jump(createQueue(items(1, 2), { repeat: 'off' }), 1);
    expect(advance(last)).toBeNull();
    expect(current(advance({ ...last, repeat: 'all' })!)).toEqual({ id: 1 });
  });

  it('repeats one item only at the end of a track, not on Next', () => {
    const queue = createQueue(items(1, 2), { repeat: 'one' });
    expect(current(advance(queue, { auto: true })!)).toEqual({ id: 1 });
    expect(current(advance(queue)!)).toEqual({ id: 2 });
  });

  it('goes back, wrapping to the last item only when repeating', () => {
    const queue = createQueue(items(1, 2, 3), { repeat: 'off' });
    expect(back(queue)).toBe(queue);
    expect(current(back({ ...queue, repeat: 'all' }))).toEqual({ id: 3 });
    expect(current(back(jump(queue, 2)))).toEqual({ id: 2 });
  });
});

describe('entries', () => {
  it('marks what has played, the current item and what is next', () => {
    const states = entries(jump(createQueue(items(1, 2, 3)), 1)).map(entry => entry.state);
    expect(states).toEqual(['played', 'current', 'upcoming']);
  });
});

describe('setShuffle', () => {
  it('shuffles only what has not played', () => {
    const queue = setShuffle(jump(createQueue(items(1, 2, 3, 4, 5, 6)), 2), true, seeded(7));
    expect(ids(queue).slice(0, 3)).toEqual([1, 2, 3]);
    expect([...ids(queue).slice(3)].sort()).toEqual([4, 5, 6]);
  });

  it('turned off, continues in playlist order after the current item and wraps round', () => {
    // Shuffled play order 4, 2, 5, 1, 3; we are on 2, after 4 played.
    const queue: Queue<{ id: number }> = {
      items: items(1, 2, 3, 4, 5), order: [3, 1, 4, 0, 2], pos: 1, shuffle: true, repeat: 'all',
    };
    expect(ids(setShuffle(queue, false))).toEqual([4, 2, 3, 5, 1]);
  });
});

describe('appendItems', () => {
  it('adds new items at the end, skipping ones it already has', () => {
    const queue = appendItems(createQueue(items(1, 2)), items(2, 3));
    expect(ids(queue)).toEqual([1, 2, 3]);
  });

  it('shuffled, never places a new item before the current one', () => {
    let queue = jump(createQueue(items(1, 2, 3, 4), { shuffle: true }, seeded(3)), 2);
    const played = ids(queue).slice(0, 3);
    queue = appendItems(queue, items(5, 6, 7, 8), seeded(4));
    expect(ids(queue).slice(0, 3)).toEqual(played);
    expect([...ids(queue)].sort()).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  it('gives an empty queue a current item', () => {
    expect(current(appendItems(createQueue(items()), items(9)))).toEqual({ id: 9 });
  });
});

it('cycles repeat all → one → off → all', () => {
  expect(nextRepeat('all')).toBe('one');
  expect(nextRepeat('one')).toBe('off');
  expect(nextRepeat('off')).toBe('all');
});
