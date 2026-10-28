# Contributing

Please follow the [Code of Conduct](https://github.com/cravingmaker/.github/blob/main/CODE_OF_CONDUCT.md) in all project interactions.

- [Setup](#setup)
- [Making changes](#making-changes)
- [How the package is built](#how-the-package-is-built)
- [Commands](#commands)
- [Validation](#validation)
- [Variants](#variants)
- [Releases](#releases)
- [Reporting issues](#reporting-issues)

## Setup

Development requires Node.js 24.15.0 or later and npm 11.15.0 or later. `devEngines` in `package.json` makes npm stop with an error on older versions. Use the contributor version pinned in [.nvmrc](.nvmrc), which bundles a newer npm. With nvm, run:

```bash
nvm install
nvm use
```

From a local checkout, run:

```bash
npm ci
npm run prepare
```

[.npmrc](.npmrc) disables installation scripts, so run `npm run prepare` once per checkout to activate the Husky hooks. The same file installs only versions that are at least seven days old, saves exact versions, and refuses git and remote-tarball dependencies, as npm 12 does by default.

### Claude Code cloud sessions

To install the contributor Node.js version in a Claude Code cloud environment, paste this into the **Setup script** field of the environment at [claude.ai/code](https://claude.ai/code). It runs as root before Claude Code starts, and its result is cached for later sessions:

```bash
#!/bin/bash
set -euo pipefail

# Keep in sync with .nvmrc. The weekly pins workflow compares both checksums with the SHASUMS256.txt of Node.js.
NODE_VERSION=26.13.0
NODE_SHA256_ARM64=439e9c438acdf6a6ffe47418da709153d66c4bed812e30a473faacb107dd2791
NODE_SHA256_X64=5848553868b402d3fabb5b09270649977780a390f832155721025a08b5104455

case "$(uname -m)" in
  x86_64) NODE_ARCH=x64 NODE_SHA256="${NODE_SHA256_X64}" ;;
  aarch64) NODE_ARCH=arm64 NODE_SHA256="${NODE_SHA256_ARM64}" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

archive="$(mktemp)"
trap 'rm -f "${archive}"' EXIT
curl --fail --silent --show-error --location --proto '=https' --output "${archive}" \
  "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.gz"
echo "${NODE_SHA256}  ${archive}" | sha256sum --check --strict
mkdir -p /opt/node
tar -xzf "${archive}" --strip-components=1 -C /opt/node
```

The script installs the archive only when its SHA-256 matches the pinned one. It does not change the default `node`, which stays first on `PATH`, so [AGENTS.md](AGENTS.md) tells Claude to put `/opt/node/bin` first on `PATH` in every command. After the dependencies are installed, run `npm run prepare` in the checkout to enable the hooks.

## Making changes

Use the [coding principles](CODING_PRINCIPLES.md) to choose code style, architecture, linter rules, formatter settings, and scripts, and apply their goals in the stated priority order.

Create a branch from the latest `main` and keep each pull request focused. Give it a [Conventional Commits](https://www.conventionalcommits.org/) title, such as `fix: ...`, `feat: ...`, or `docs: ...`. Squash merges turn the title and the body of the pull request into the commit on `main`, and Release Please writes the release notes from them.

Add a regression test for each behavior change. Unit tests import `src/` directly. The packed-consumer tests in `tests/package/` install the built tarball as a consumer does, so add one when a change affects the published files, the types, or the README examples.

Write Markdown with one line per paragraph or list item, and let the editor wrap it. GitHub renders a line break inside a paragraph as a break in pull request bodies and release notes, which come from the same text.

## How the package is built

- **Source.** `src/index.ts` is the entry point. Relative imports name the `.ts` file, so Node.js runs every script and test helper directly through its type stripping.
- **Build.** tsdown bundles `src/` into `dist/index.mjs` and `dist/index.d.mts`, without source maps; see [tsdown.config.ts](tsdown.config.ts).
- **Package.** `files` publishes `dist/` only. `exports` lists `types` first, then `import` and `default`, and adds `"./package.json"`. `main` and `types` remain for tools that do not read `exports`.
- **Types.** `tsconfig.json` checks `src/`, `tests/`, `scripts/`, and the config files without emitting. `target` and `lib` describe the minimum Node.js, 24.15.0.
- **Versions in one place.** `tests/repository/versions.test.ts` keeps `.nvmrc`, `engines`, `devEngines`, the CI matrix, the README's requirements, `@types/node`, the cloud setup script, and the compiler target in line.

[docs/architecture.md](docs/architecture.md) lists which files are shared with other repositories and how to change them.

## Commands

| Command                                                            | Purpose                                                                                                                   |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- |
| `npm run build`                                                    | Remove `dist/` and bundle `src/` into it.                                                                                 |
| `npm test`                                                         | Unit and repository tests, offline and without a build. The pre-push hook runs it.                                        |
| `npm run test:package`                                             | Build, pack, and install the tarball in temporary consumer projects. It needs access to the npm registry.                 |
| `npm run test:watch`, `npm run test:ui`, `npm run test:package:ui` | Watch the tests, or browse them in [Vitest UI](https://vitest.dev/guide/ui).                                              |
| `npm run typecheck`                                                | Type-check the repository.                                                                                                |
| `npm run lint`                                                     | ESLint with `@cravingmaker/eslint-config`, and no warnings allowed.                                                       |
| `npm run lint:unused`                                              | Knip, then Knip in production mode, which also reports exports and dependencies that only tests use.                      |
| `npm run lint:workflows`                                           | actionlint from its pinned release, verified by SHA-256 and cached in `.tools/`.                                          |
| `npm run lint:package`, `npm run typecheck:package`                | Build, then check the package with publint and Are the Types Wrong?                                                       |
| `npm run format`, `npm run format:check`                           | Prettier with `@cravingmaker/prettier-config`.                                                                            |
| `npm run lint:inspect`, `npm run deps:inspect`                     | ESLint Config Inspector and Node Modules Inspector on `127.0.0.1`; the `:build` variants write to `node_modules/.cache/`. |
| `npm run validate`                                                 | Everything that CI checks; see [Validation](#validation).                                                                 |
| `npm run release:check`                                            | `npm audit`, `npm run validate`, and a dry run of the tarball.                                                            |

Each script that reads `dist/` builds first, and its `:built` variant uses the existing build.

## Validation

Before opening a pull request, run:

```bash
npm run validate
```

It runs `npm run validate:static`, then the tests. The static phase checks formatting, types, unused code, lint, the workflows, and the built package. The tests then run offline, and the packed-consumer tests install the tarball from a temporary directory, with TypeScript and the peers from the npm registry.

The pre-commit hook runs lint-staged: ESLint fixes, then Prettier, on the staged files that ESLint lints, and Prettier alone on the others. The pre-push hook runs `npm test`. Never bypass the hooks with `--no-verify`.

Vitest fails on focused tests, also locally, and on tests without an assertion. Before each test, it restores spies, stubbed environment variables, and stubbed globals. The watch mappings in `vitest.config.ts` rerun the tests that read files outside the import graph, such as the README and the workflows, and `tests/vitest-config.test.ts` checks them.

CI runs these jobs on pull requests and on pushes to `main`:

| Job                     | Checks                                                                                                                                     |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Static checks           | Registry signatures and provenance, then `npm run validate:static` on the `.nvmrc` version.                                                |
| Node.js 24.15.0, 24, 26 | `npm test` on the minimum and on the newest release of each supported line, then the packed consumers, whose programs run on that version. |
| macOS packed consumers  | The packed consumers on macOS, whose temporary directory is a symbolic link.                                                               |
| Minimum peer versions   | The packed consumers with the floor of every peer range.                                                                                   |
| Dependency audit        | `npm audit --audit-level=low` on the lockfile, in a job of its own so that a new advisory does not hide the other results.                 |
| Dependency Review       | The dependency changes of a pull request.                                                                                                  |
| CI result               | Fails unless every job above succeeds. Only Dependency Review may skip, outside pull requests. The repository rules require it.            |

The zizmor workflow audits the workflows when they change and weekly, and reports to code scanning. Suppress a finding only with an inline `zizmor: ignore[...]` comment that explains why the code is safe. The weekly pins workflow checks the versions that Dependabot cannot update: `.nvmrc`, actionlint, zizmor, and the checksums of the cloud setup script.

## Variants

The template has one build, one Node.js floor, and no peers. These recipes cover the variants of the existing packages.

### No build step

For a package of JavaScript with hand-written declarations, as prettier-config is:

1. Replace `src/` with `index.mjs` and `index.d.ts`, and set `files`, `exports`, `main`, and `types` to them.
2. Remove `tsdown.config.ts`, tsdown, and the `build` and `clean` scripts. The `:built` scripts then run directly, and `validate:static` drops the build.
3. Set `checkJs` and `allowJs` in `tsconfig.json`, so that TypeScript checks the JavaScript against the declarations.
4. Update the file list in `tests/package/contents.test.ts` and the watch mappings of the build output in `vitest.config.ts`.

### A consumer floor below the development floor

For a package whose consumers run on an older Node.js than its tools need, as prettier-config's consumers run on Node.js 22.12:

1. Set `engines.node` to the consumer floor, and keep `devEngines.runtime` at the contributor floor.
2. Start the CI matrix at the consumer floor. The matrix job already installs and builds on the contributor Node.js, runs `node --run test` on the matrix version, and runs the consumer programs on it through `PACKAGE_CONSUMER_NODE`.
3. Lower `target` and `lib` to the floor, add its row to `tests/repository/versions.test.ts`, and set `@types/node` to the floor's major version.
4. Run the tests that need the contributor Node.js, such as checks of development tools, in the static job only.

### Optional peers

For a package with peers that consumers may leave out, as both existing packages have:

1. Add each peer to `peerDependencies` with an explicit floor, such as `>=1.2.0 <2`, and to `peerDependenciesMeta`, with `optional: true` for optional peers and `optional: false` for required ones.
2. Add each peer to `devDependencies` at the version that the tests use. The packed consumers install these versions, and the "Minimum peer versions" job installs the floors.
3. Add a consumer that leaves the optional peer out: pass the other peers, as `name@version`, to `createConsumer()` in `tests/support/consumer.ts`.

## Releases

[Release Please](https://github.com/googleapis/release-please) prepares each release. On every push to `main`, the [Release Please workflow](.github/workflows/release-please.yml) opens or updates the release pull request, `chore(main): release X.Y.Z`, from the commits since the last release. Each commit is a squashed pull request, so a `BREAKING CHANGE:` footer in the body of a pull request counts. Before 1.0.0, a breaking change or a feature raises the minor version, and a fix the patch version.

To change the entry of a merged pull request in the notes, add this block to its body, with the type, the scope, and the subject that the entry needs. Release Please uses it instead of the commit message on its next run:

```text
BEGIN_COMMIT_OVERRIDE
feat: describe the change for consumers (#123)

BREAKING CHANGE: Say what breaks and how to migrate.
END_COMMIT_OVERRIDE
```

Keep each paragraph of the notes on one line, because the GitHub Release renders every line break. The README describes the current version only, so migration guidance goes in the notes.

Only the maintainer merges the release pull request, after `npm run release:check` passes on its branch. Release Please then creates the `vX.Y.Z` tag and the GitHub Release, which starts the [publishing workflow](.github/workflows/publish.yml):

1. **Verify.** A job without publishing rights checks that the tag matches `package.json`, that the tagged commit is on `main`, and that the version is unpublished. It installs without a cache, verifies registry signatures, runs the release check, packs the tarball once, and records its SHA-256.
2. **Stage.** A job in the `npm` environment, which only `v*` tags can use, runs no dependency code. It verifies the tarball's SHA-256 and stages it with npm trusted publishing, which adds provenance.
3. **Approve.** The maintainer approves the staged version on npmjs.com with two-factor authentication. Until then, nobody can install it.

A package's first version cannot be staged, so the workflow publishes it directly. Prereleases do not publish.

## Reporting issues

For bugs, open a [GitHub issue](https://github.com/cravingmaker/package-template/issues) with a minimal reproduction, the expected and the actual result, and the versions of the package and Node.js.

Report vulnerabilities privately as described in the [security policy](https://github.com/cravingmaker/.github/blob/main/SECURITY.md).
