// SPDX-License-Identifier: AGPL-3.0-or-later
// The play queue: a playlist in play order, where we are in it, shuffle and
// repeat. Pure and React-free; every change returns a new queue.
//
// `order` holds indices into `items` (the playlist's own order). Everything in
// `order` before `pos` has played; the queue list shows those darkened.

export type Repeat = 'off' | 'all' | 'one';

export interface Queue<T extends { id: number }> {
  /** The playlist, in its own order. */
  readonly items: readonly T[];
  /** Play order: indices into `items`. */
  readonly order: readonly number[];
  /** The current entry in `order`, or -1 while the playlist is empty. */
  readonly pos: number;
  readonly shuffle: boolean;
  readonly repeat: Repeat;
}

export type Random = () => number;

function shuffled<V>(values: readonly V[], random: Random): V[] {
  const out = [...values];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i);

export function createQueue<T extends { id: number }>(items: readonly T[],
  { shuffle = false, repeat = 'all' }: { shuffle?: boolean; repeat?: Repeat } = {},
  random: Random = Math.random): Queue<T> {
  const unique = dedupe([], items);
  const natural = range(0, unique.length);
  return {
    items: unique,
    order: shuffle ? shuffled(natural, random) : natural,
    pos: unique.length ? 0 : -1,
    shuffle,
    repeat,
  };
}

function dedupe<T extends { id: number }>(existing: readonly T[], more: readonly T[]): T[] {
  const seen = new Set(existing.map(item => item.id));
  return more.filter(item => !seen.has(item.id) && seen.add(item.id));
}

/**
 * Adds items that arrived later (the next page of a collection). Shuffled, each
 * lands at a random place among what has not played yet; otherwise at the end.
 */
export function appendItems<T extends { id: number }>(queue: Queue<T>, more: readonly T[],
  random: Random = Math.random): Queue<T> {
  const fresh = dedupe(queue.items, more);
  if (!fresh.length) return queue;
  const added = range(queue.items.length, queue.items.length + fresh.length);
  let order: number[];
  if (queue.shuffle) {
    order = [...queue.order];
    for (const index of added) {
      // Never before the current item: what has played stays played.
      const lowest = queue.pos + 1;
      order.splice(lowest + Math.floor(random() * (order.length - lowest + 1)), 0, index);
    }
  } else {
    order = [...queue.order, ...added];
  }
  return { ...queue, items: [...queue.items, ...fresh], order, pos: queue.pos < 0 ? 0 : queue.pos };
}

export function current<T extends { id: number }>(queue: Queue<T>): T | null {
  return queue.pos < 0 ? null : queue.items[queue.order[queue.pos]] ?? null;
}

/** The entries in play order, each marked as played, current or upcoming. */
export function entries<T extends { id: number }>(queue: Queue<T>):
  { item: T; at: number; state: 'played' | 'current' | 'upcoming' }[] {
  return queue.order.map((index, at) => ({
    item: queue.items[index],
    at,
    state: at < queue.pos ? 'played' : at === queue.pos ? 'current' : 'upcoming',
  }));
}

/**
 * The next item. `auto` is the end of a track, where repeat-one plays it again;
 * the Next button always moves on. Returns `null` at the end of the queue when
 * repeat is off.
 */
export function advance<T extends { id: number }>(queue: Queue<T>, { auto = false } = {}): Queue<T> | null {
  if (queue.pos < 0) return null;
  if (auto && queue.repeat === 'one') return queue;
  if (queue.pos + 1 < queue.order.length) return { ...queue, pos: queue.pos + 1 };
  return queue.repeat === 'off' ? null : { ...queue, pos: 0 };
}

/** The previous item; from the first, the last when repeating, else stays. */
export function back<T extends { id: number }>(queue: Queue<T>): Queue<T> {
  if (queue.pos > 0) return { ...queue, pos: queue.pos - 1 };
  if (queue.pos === 0 && queue.repeat !== 'off') return { ...queue, pos: queue.order.length - 1 };
  return queue;
}

/** Plays the entry at `at` in play order. */
export function jump<T extends { id: number }>(queue: Queue<T>, at: number): Queue<T> {
  return at >= 0 && at < queue.order.length ? { ...queue, pos: at } : queue;
}

/**
 * Shuffle on shuffles what has not played yet. Shuffle off keeps what has
 * played and continues in playlist order from the current item, wrapping round
 * to the unplayed items before it.
 */
export function setShuffle<T extends { id: number }>(queue: Queue<T>, on: boolean,
  random: Random = Math.random): Queue<T> {
  if (on === queue.shuffle) return queue;
  const head = queue.order.slice(0, queue.pos + 1);
  let rest: number[];
  if (on) {
    rest = shuffled(queue.order.slice(queue.pos + 1), random);
  } else {
    const inHead = new Set(head);
    const n = queue.items.length;
    const from = queue.pos < 0 ? -1 : queue.order[queue.pos];
    rest = range(0, n).filter(index => !inHead.has(index))
      .sort((a, b) => ((a - from - 1 + n) % n) - ((b - from - 1 + n) % n));
  }
  return { ...queue, order: [...head, ...rest], shuffle: on };
}

export function setRepeat<T extends { id: number }>(queue: Queue<T>, repeat: Repeat): Queue<T> {
  return queue.repeat === repeat ? queue : { ...queue, repeat };
}

/** The Repeat button's cycle: all → one → off → all. */
export const nextRepeat = (repeat: Repeat): Repeat => (repeat === 'all' ? 'one' : repeat === 'one' ? 'off' : 'all');
