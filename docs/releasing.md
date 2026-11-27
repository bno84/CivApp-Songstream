# Releasing

Every step that leaves this machine (push, tag push, submit, withdraw,
platform feedback) needs the owner's explicit approval.

## A normal release

1. Bump `version` in both `package.json` and `block.manifest.json`, in a
   `chore(release): bump version to X.Y.Z` commit.
2. Run the checks: `pnpm install --frozen-lockfile`, `pnpm run lint`,
   `pnpm test`, `pnpm run build`, `pnpm exec civitai app validate`.
3. Submit from a clean tree: `pnpm exec civitai app submit --yes`. It packages
   the source, not `dist/`, and reports `HEAD` as the source commit.
   `--package-only -o <path>` writes the zip without sending it, to check
   what goes out first.
4. Once the submit is accepted, tag the commit with a signed annotated tag,
   `git tag -s vX.Y.Z -m "Songstream vX.Y.Z"`, and push `main` and the tag.
5. Follow it with `pnpm exec civitai app status`. The approved version stays
   live until the new one is approved.

Only one submission per app can be pending. A second submit is refused with
400 until the first is approved, rejected or withdrawn. Withdrawing a
pending submission keeps the store listing as long as an earlier version was
approved; withdrawing a first-version submission deletes the listing's media.

## Platform updates from Civitai staff

Civitai staff can push a "platform update" to the app, for example the SDK
bump `apu_01M8FJDMT4CG6CSNYP7CVE79FW` in November 2026. None of this is in
the developer docs or the CLI help (checked with CLI 0.1.155). This is what
Songstream 0.2.1 and 0.2.2 ran into:

- The update is a commit on a `platform-update/<apu id>` branch of the app's
  platform repository on `forgejo.civitai.com` (for Songstream, the source
  repository `civitai-apps-src/songstream`). The repositories are private;
  `pnpm exec civitai app pull <dir> --app songstream` clones them with your
  Civitai login.
- Until a version containing the update is **approved**, every submit is
  refused with 409 "this bundle does not contain a platform update from
  Civitai staff that has not shipped yet", naming the files it misses.
- The check compares those files whole. A lockfile that resolves the same
  versions plus other bumps is still refused. Being submitted is not enough
  either: with the update pending, a later bundle without its files is
  refused too.
- The error suggests `--allow-unmerged-platform-update`, but CLI 0.1.154 and
  0.1.155 do not have that flag.

What worked is to ship the update on its own first, then the rest:

```bash
# Fetch the staff commit from a scratch clone of the platform repository.
pnpm exec civitai app pull /tmp/platform --app songstream
git fetch /tmp/platform refs/remotes/origin/platform-update/<apu id>:refs/platform-update/apu

# Release branch off the live version, in a worktree so main stays as it is.
git worktree add -b release/X.Y.Z ../CivApp-Songstream-X.Y.Z vLIVE
cd ../CivApp-Songstream-X.Y.Z
git cherry-pick refs/platform-update/apu   # keep it unchanged
# bump the version, run the checks, submit, tag

# Back on main: merge the release, keep main's own files where they conflict,
# then bump main past it.
git merge --no-ff release/X.Y.Z
```

The later version can only be submitted once the platform-update release is
approved. That takes two review rounds, one after the other. The gap is item
10 of the [upstream wishlist](upstream-wishlist.md), reported as
`332-0cff4496`.
