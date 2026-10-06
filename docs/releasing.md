# Releasing

A release is a version tag. Pushing one runs
[`.github/workflows/release.yml`](../.github/workflows/release.yml), which
checks the tag against `package.json`, runs the type-check, unit tests and
build, and attaches `radicand-<version>.zip` to the GitHub release –
creating the release if it does not exist yet. That zip is what goes to
the Chrome Web Store.

1. Make sure CI is green on `main`.
2. Bump the version – the manifest takes it from `package.json`:

   ```bash
   npm version 1.0.1 -m "chore: release %s"
   ```

   This commits the change and creates the tag `v1.0.1`.
3. Push the commit and the tag:

   ```bash
   git push origin main --follow-tags
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

## Release notes

Every release's notes, on GitHub and in the store's update description,
end with the accessibility statement, so nobody reads "targets WCAG 2.2
AA" as a conformance claim:

> Radicand targets WCAG 2.2 AA and is checked by an automated audit and
> keyboard tests on every change. Known issues remain, chiefly in the
> equation field the MathLive library provides, and are being worked on.
> Radicand changes quickly and has not had an independent accessibility
> audit; reports from people who use assistive technology are welcome.

Update the statement when either half stops being true: when the known
issues are fixed, or when an independent audit is done.
