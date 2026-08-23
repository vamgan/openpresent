# Contributing to OpenPresent

Thank you for improving OpenPresent. Keep changes focused and preserve the local-first, React-authoring architecture.

1. Use Node 20.19+ and pnpm 10.32+.
2. Run `pnpm install --frozen-lockfile`.
3. Add tests for public behavior or validator rules.
4. Update exports, docs, and the showcase when changing a primitive.
5. Run `pnpm check`; run `pnpm test:browser` for visual/runtime changes.
6. Describe the evidence you ran and any blocked environment checks.

Avoid dependencies that require accounts or cloud rendering. Never commit credentials, generated `node_modules`, package build output, or browser traces. By contributing, you agree that your work is licensed under MIT.
