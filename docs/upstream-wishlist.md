# Upstream wishlist

What Songstream needs from Civitai's app platform. Each item says what the
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

### 1. Comments

**Today:** no hook, route or scope reads or posts comments. The app shows the
count and opens the item on Civitai.

**Want:** a read route for an image's or post's comments, and later a
consent-gated scope to post one.

## Also wanted

### 2. A page app frame that fits the screen

**Today:** Songstream fits the player to the visible area. It measures the frame
with an IntersectionObserver and estimates the height of Civitai's bottom bar.
The estimate can leave small layout and scrolling issues. The host ignores
resize requests from page apps and passes no visible height.

**Want:** the frame sized to the visible content area, or that height passed to
the app (in `BLOCK_INIT` and on change).

### 3. Autoplay in the frame

**Today:** the frame does not delegate `autoplay`, so the app needs a click
before it can play. Media keys and the lock screen work after that click. The
docs say nothing about the frame's `allow` list.

**Want:** `autoplay` (and `fullscreen`, `picture-in-picture`) delegated to app
frames, and the `allow` list documented.

### 4. Playlists the app can build

**Today:** apps can follow collections but cannot create one or change its
items. Songstream lets viewers star tracks in a private app document store as a
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

### 6. Public generation resource credits

**Today:** Songstream can show resources listed in public image metadata.
Civitai's item page can show additional credits from its generation-data
service. For example, video 148146593 shows two checkpoints and a workflow on
its item page, while the public images endpoint returns an empty
`modelVersionIds` list for it.

**Want:** expose the item page's visible resource credits through the public or
App API, including resources the creator added by hand.

### 7. Document-store previews with the React host bridge

**Today:** tunnel tokens omit storage scopes. The SDK's built-in local preview
needs the host's `storageMode` from its own bridge, which `blocks-react` does
not expose. Songstream uses one host bridge and supplies a manifest-backed fake
store in the tunnel.

**Want:** expose the preview mode through `blocks-react` and support the SDK's
local preview store from that bridge.

### 8. Source and support links from the manifest at submit

**Today:** `civitai app submit` fills the new draft listing's name, tagline,
description and category from `block.manifest.json`, but leaves "Source
repository" and "Issue tracker" empty, although the manifest declares
`repository` and `bugs`. The CLI refuses to set the source link for an on-site
app ("comes from the `repository` key in block.manifest.json") and has no
command for the issue tracker, while the web listing editor offers both as
editable fields. The docs say both reach the listing on approval. Songstream
0.2.0's draft needed them filled in by hand in the web editor.

**Want:** `repository` and `bugs` copied into the draft at submit like the
other manifest fields, one owner for them (manifest or editor, the same in the
CLI and the web UI), and docs saying when each manifest field reaches the
listing. Reported as `324-de9b088f`.

### 9. A reaction error code for "reactions from apps are off"

**Today:** with reactions from apps switched off site-wide, the host's
`blocks.getReactionsForApp` call answers 403 "reactions from apps are not
enabled", and `useReactions` reports it as `entity-unavailable`, the same code
as a single image the viewer cannot react to. Songstream can only say "not
taking reactions from apps on this video right now", and keeps the reaction
buttons in place on every video.

**Want:** a distinct code (for example `disabled`) in `ENTITY_REACTION_ERRORS`,
or a flag the app can read up front, so an app can hide or explain the
reaction controls once instead of failing per video.
