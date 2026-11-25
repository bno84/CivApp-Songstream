# Upstream wishlist

What Civitai Radio needs from Civitai's app platform. Each item says what the
app does today, what is missing, and what would close the gap.

Current surface, with the scope `collections:read:self`:

- `GET /api/v1/blocks/collections?mode=mine` (the viewer's own collections)
- `GET /api/v1/blocks/collections/{id}` (accepted image and video items, newest added first)

and the public site routes `GET /api/v1/images`, `/api/v1/posts/{id}` and
`/api/v1/model-versions/{id}` for the Details tab.

Report items with `pnpm exec civitai feedback send --about <area> "<text>"`
(only with the owner's approval), then follow up with
`civitai feedback status <ref>`.

## Top priority

### 1. Audio in collections

**Today:** collection pages hold images and videos only. The images route
already filters by `type=audio`, but there is no way to put audio in a playlist.

**Want:** audio items in `GET /blocks/collections/{id}`, with their cover art.

**Why:** a music player that cannot play music. Video posts stand in for now.

### 2. Media details on collection items

**Today:** an item carries a file URL, its creator and its size, nothing else.
The app makes three more requests per track (image, post, each resource's model
version) to show a title, reaction counts and generation data. Durations are
unknown until a track loads, so the queue cannot show them up front.

**Want:** on each item: `postId`, the post title, `durationMs` and `mimeType`
for video and audio, and the reaction and comment counts.

### 3. Comments

**Today:** no hook, route or scope reads or posts comments. The app shows the
count and opens the item on Civitai.

**Want:** a read route for an image's or post's comments, and later a
consent-gated scope to post one.

## Also wanted

### 4. Playlists the app can build

**Today:** apps can follow collections but not create one or add items, so a
playlist has to be built on Civitai itself. The document store could hold
app-owned lists, but only as a stop-gap.

**Want:** a consent-gated scope to create a collection and add or remove items.

### 5. Followed collections in `mode=mine`

**Today:** the viewer's own collections are listed; followed ones only open by
link.

**Want:** `mode=followed`, or followed collections marked in `mode=mine`.

### 6. Media playback in the iframe, documented

**Today:** the docs say nothing about autoplay, the Media Session API (media
keys, lock screen), fullscreen or picture-in-picture in the app iframe. The app
needs a click before it can play, and its media keys are best effort.

**Want:** the iframe's `allow` list documented, with `autoplay`,
`fullscreen` and `picture-in-picture` delegated if possible.

### 7. Reactions on video

**Today:** `useReactions` documents `entityType: 'image'` only, and needs a
`reactTicket` that no hook supplies yet.

**Want:** confirmation that videos react as images, and tickets on collection
items.
