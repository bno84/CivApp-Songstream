# Civitai Radio

A Civitai app that feels like a music player.
Media control button support, playlists, shuffle.

**Status:** in development. The player works against a mock host; it has not
yet run inside Civitai.

## Features

- **Playlists are Civitai collections.** The Music Focus collection plays by
  default; your own collections sit beside it, and any public collection opens
  from its link.
- **Player:** play and pause, previous and next, seek, volume, shuffle, and
  repeat all, one or off.
- **Queue:** one list in play order. What already played is darkened, and any
  item plays with a click.
- **Details:** the prompt, settings and resources the creator shared, as on
  Civitai's own image page.
- **Reactions and comments:** counts, with links to the item on Civitai.
- **Media keys and lock screen** (Media Session API) where the browser allows
  them inside the app frame, plus keyboard shortcuts: Space plays and pauses,
  ←/→ seek, Shift+←/→ skip.

It asks only for `collections:read:self`, so there is no consent prompt.

## Limits

- **Videos only.** Collections hold images and videos, not audio yet. Images
  are skipped.
- **Titles, reactions and durations arrive late.** Collection items carry none
  of them, so the app looks each track up as it plays.
- **Comments open on Civitai.** Apps cannot read them.
- **Playback stops when you leave the app page.** A background tab keeps
  playing.

What Civitai would need to add is in
[docs/upstream-wishlist.md](docs/upstream-wishlist.md).

## Develop

```bash
pnpm install
pnpm run dev:harness   # mock host and sample playlists at http://localhost:5186
pnpm run lint
pnpm test
pnpm run build
pnpm exec civitai app validate
```

## License

Copyright (C) 2026 bno84 and contributors.

Civitai Radio is free software under the
[GNU Affero General Public License v3.0 or later](LICENSE). If you run a
modified version for others, including as a Civitai App, you must offer
those users its source under the same license.
