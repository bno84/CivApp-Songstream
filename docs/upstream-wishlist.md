# Upstream wishlist

What Civitai Radio needs from Civitai's app platform. Each item says what the
app does today, what is missing, and what would close the gap.

Current surface, with the scope `collections:read:self`:

- `GET /api/v1/blocks/collections?mode=mine` (the viewer's own collections)
- `GET /api/v1/blocks/collections/{id}` (accepted image and video items, newest added first)

and the public site routes `GET /api/v1/images`, `/api/v1/posts/{id}`,
`/api/v1/model-versions/{id}` and `/api/v1/users` for the details, titles and
avatars.

Out of scope here: audio. Civitai cannot host audio uploads today, so video is
what the app plays. Media durations on collection items are already asked for
in Collectalytics' wishlist.

Report items with `pnpm exec civitai feedback send --about <area> "<text>"`
(only with the owner's approval), then follow up with
`civitai feedback status <ref>`.

## Top priority

### 1. A page app frame that fits the screen

**Today:** on civitai.com the page app's frame runs on below the fold, under
Civitai's header, and Civitai's bottom bar is drawn over it. A full-height app
scrolls the page and hides its own controls. The host ignores resize requests
from page apps and passes no visible height. The app measures the visible part
itself with an IntersectionObserver, guesses the bottom bar's height (40px),
and cancels wheel scrolling that would move Civitai's page.

**Want:** the frame sized to the visible content area, or that height passed to
the app (in `BLOCK_INIT` and on change).

### 2. Comments

**Today:** no hook, route or scope reads or posts comments. The app shows the
count and opens the item on Civitai.

**Want:** a read route for an image's or post's comments, and later a
consent-gated scope to post one.

### 3. Autoplay in the frame

**Today:** the frame does not delegate `autoplay`, so the app needs a click
before it can play. Media keys and the lock screen work after that click. The
docs say nothing about the frame's `allow` list.

**Want:** `autoplay` (and `fullscreen`, `picture-in-picture`) delegated to app
frames, and the `allow` list documented.

## Also wanted

### 4. Playlists the app can build

**Today:** apps can follow collections but cannot create one or change its
items. Radio lets viewers star tracks in a private app document store as a
stop-gap for a Favorites playlist.

**Want:** a consent-gated scope to create a collection and add or remove items,
so viewers can save and manage Favorites on Civitai itself.

### 5. Titles and counts on collection items

**Today:** an item carries a file URL, its creator and its size. The app makes
more requests per track (image, post, each resource, the creator) to show a
title, reaction counts, generation data and an avatar.

**Want:** on each item: `postId`, the post title, and the reaction and comment
counts. In `mode=mine`, each collection's `type`, or a `type=Image` filter:
today the app asks the public collection route for every collection's type to
leave out Model, Post and Article collections. This saves requests; the app
works without it.
