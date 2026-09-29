# Releasing

A release is a version tag. Pushing one runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which
checks the tag against `package.json`, runs the type-check, unit tests and
build, and attaches `radicand-<version>.zip` to the GitHub release –
creating the release if it does not exist yet. That zip is what goes to
the Chrome Web Store.

1. Make sure CI is green on `main`.
2. Bump the version on a branch and merge it like any other change – the
   manifest takes the version from `package.json`:

   ```bash
   git switch -c chore/release-1.0.1
   npm version 1.0.1 --no-git-tag-version
   git commit -am "chore: release 1.0.1"
   ```

   Open a pull request titled `chore: release 1.0.1` and merge it once CI
   is green.
3. Tag the merged commit on `main`:

   ```bash
   git switch main && git pull
   git tag v1.0.1 && git push origin v1.0.1
   ```

   Without push access from the command line, publish the release on
   GitHub instead: **Releases › Draft a new release**, type the new tag
   (for example `v1.0.1`) and choose **Create new tag on publish**, target
   `main`, then **Publish release**. The tag starts the same workflow,
   which attaches the zip to that release.

4. When the workflow finishes, download the zip from the release and upload
   it in the [Chrome Web Store developer dashboard](https://chrome.google.com/webstore/devconsole)
   under **Package › Upload new package**, then submit it for review.

Chrome compares version numbers, so every upload needs a higher version
than the one before. Use patch versions for fixes, minor versions for new
features and major versions for changes that break saved data or
shortcuts.

When a release changes what the panel looks like, regenerate the store
images with `node scripts/generate-store-images.mjs` and replace them on
the listing too; [docs/store/listing.md](store/listing.md) holds the
listing text.
