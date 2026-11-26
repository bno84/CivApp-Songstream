# Songstream

Play Civitai video collections like music playlists. Tune in to Music Focus,
pick one of your own collections, or paste a public collection link. Shuffle
the queue, star tracks for later, and control playback with your media keys.

**Status:** in development, tried inside Civitai through the dev tunnel.

## Features

- **Collection playlists.** The Music Focus collection is
  selected on your first visit (press Play to start); your own collections sit
  beside it, and any public collection opens from its link. A collection longer
  than 5,000 items plays its first 5,000.
- **Favorites.** Use the star in Now Playing or the queue to save a track to
  your private Favorites playlist. Click a filled star to remove it.
- **Player:** play and pause, previous and next, seek, volume, shuffle, and
  repeat all, one or off.
- **Queue:** one list in play order. What already played is darkened, and any
  item plays with a click.
- **Details:** the prompt, settings and resources the creator shared, as on
  Civitai's own image page.
- **Reactions and comments:** see counts and open the item on Civitai. Tap a
  reaction to grant permission, then see, add or remove your Civitai reactions
  on eligible videos.
- **Media keys and lock screen** (Media Session API) where the browser allows
  them inside the app frame, plus keyboard shortcuts: Space plays and pauses,
  ←/→ seek, Shift+←/→ skip.

- **Remembers** your volume, shuffle and repeat, the playlist you had on, and
  up to eight collections you opened by link (hover one to forget it). Only you
  can see them.

Browsing and saving Favorites need no consent prompt. Songstream asks for
`social:react:self` when you first tap a reaction. Remembering starts working
once Civitai approves the app. Until then, favorites and settings last for the
current visit.

## Limits

- **Videos.** Civitai hosts images and videos, not audio, so the app plays the
  videos in a collection and skips its images.
- **One click to start.** Civitai's frame does not allow autoplay. After that
  click, media keys and the lock screen work.
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

The mock host and the dev tunnel use an in-memory document store checked
against the local manifest. Start the tunnel's Vite server with
`pnpm run dev:tunnel`. Favorites and player settings reset when the preview
reloads.

## License

Copyright (C) 2026 bno84 and contributors.

Songstream is free software under the
[GNU Affero General Public License v3.0 or later](LICENSE). If you run a
modified version for others, including as a Civitai App, you must offer
those users its source under the same license.
