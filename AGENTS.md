# @cravingmaker/package-template

An ESM-only TypeScript package, published to npm. The public API is in `src/index.ts`, and tsdown bundles it into `dist/`.

<!-- template:start -->

This repository is also the template of Craving Maker's packages. `scripts/template/` holds the tools that create and check the repositories made from it, and `docs/architecture.md` lists the files that those repositories share. A change to a shared file starts here.

<!-- template:end -->

## Commands

- `npm ci`, then `npm run prepare`: install the dependencies and enable the git hooks. `.npmrc` disables install scripts, so the hooks are not set up automatically.
- `npm test`: the unit and repository tests, offline and without a build. Unit tests import `src/` directly.
- `npm run test:package`: build, pack, and install the tarball in temporary consumer projects. It needs access to the npm registry.
- `npm run validate`: everything that CI checks, the packed consumers included. Run it before pushing. It takes a few minutes; use a long command timeout.
- `npx vitest run <path>`: run one test file or directory.
- `npm run lint`, `npm run typecheck`, `npm run lint:unused`, and `npm run lint:workflows`: ESLint, TypeScript, Knip, and the pinned actionlint.

## Environment

Node.js 24.15.0 or later and npm 11.15.0 or later are required. Check `node --version` before anything else and use the contributor version in `.nvmrc`. In a Claude Code cloud session, if `/opt/node/bin/node --version` prints that version, put `/opt/node/bin` first on `PATH` for every command; otherwise, install it first as the setup script in `CONTRIBUTING.md` does. Then run `npm ci` and `npm run prepare`.

## Conventions

- ESM only. Do not add CommonJS output.
- Dependencies are pinned to exact versions that are at least seven days old (`save-exact` and `min-release-age` in `.npmrc`). Keep dependency updates in their own commits, and do not update dependencies as part of other work.
- Prettier formats; ESLint does not own layout.
- Markdown keeps each paragraph and list item on one line; never wrap prose by hand. Write pull request bodies and release notes the same way, because GitHub renders their line breaks.
- Relative imports name the `.ts` file, so Node.js runs every script directly.
- Every lint exception states its reason: `// eslint-disable-next-line <rule> -- <reason>`. Fix the code instead when the rule has a point.
- APIs are described with starred `/** ... */` documentation; implementation reasons use `//` comments with a final period. Keep each paragraph of a comment on one line.
- Pull request titles follow Conventional Commits and become the squash commit on `main`.
- Never bypass the git hooks with `--no-verify`.
- `AGENTS.md` is the only agent instructions file. Do not add `CLAUDE.md` or `CLAUDE.local.md`; `tests/repository/files.test.ts` fails when one exists.
- `ROADMAP.md` lists planned work, including the evidence required before a temporary workaround is removed.

## Releases

Do not merge Release Please pull requests, create tags, publish GitHub Releases, or approve staged npm versions. Merging a release pull request starts the publishing workflow. The maintainer does this.
