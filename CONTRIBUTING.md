# Contributing to OpenPresent

Thank you for improving OpenPresent. Keep changes focused and preserve the local-first, React-authoring architecture.

1. Use Node 20.19+ and pnpm 10.32+.
2. Run `pnpm install --frozen-lockfile`.
3. Add tests for public behavior or validator rules.
4. Update exports, docs, and the showcase when changing a primitive.
5. Run `pnpm check`; run `pnpm test:browser` for visual/runtime changes.
6. Describe the evidence you ran and any blocked environment checks.

Avoid dependencies that require accounts or cloud rendering. Never commit credentials, generated `node_modules`, package build output, or browser traces. By contributing, you agree that your work is licensed under MIT.

## Releasing

Publishing runs from CI on a tag, so a release is always the exact commit that
passed its checks rather than whatever happened to be on someone's machine.

One-time setup:

1. Claim the `@openpresent` scope on npm, either by creating an organization at
   [npmjs.com/org/create](https://www.npmjs.com/org/create) (public packages are
   free) or by pointing the package names at a scope you already own.
2. Create a **Granular Access Token** with read and write access to those
   packages at [npmjs.com/settings/tokens](https://www.npmjs.com/settings/tokens).
3. Store it on the repository: `gh secret set NPM_TOKEN`.

Then, for each release:

```bash
node scripts/release.mjs 0.3.1   # verifies, bumps every manifest, commits, tags
git push --follow-tags           # CI publishes and cuts the GitHub release
```

To rehearse the whole pipeline without publishing anything, run the Release
workflow manually with **Run workflow** and leave `dry_run` checked. It performs
every check, packs the tarballs, and reports exactly what a real run would
publish.
