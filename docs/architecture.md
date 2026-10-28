# Architecture and change guide

## File ownership

The repositories made from the template share part of their files. Each file has one of four roles:

- **Owned.** The same bytes in every repository. A change starts in the template and is copied to the others: `.editorconfig`, `.gitattributes`, `.gitignore`, `.npmrc`, `.nvmrc`, `.husky/`, `.github/CODEOWNERS`, the workflows other than `ci.yml`, `CODING_PRINCIPLES.md`, `LICENSE`, `release-please-config.json`, `tsdown.config.ts`, `scripts/` without `scripts/template/`, `tests/support/`, `tests/repository/`, and `tests/scripts/` without `tests/scripts/template/`.
- **Seeded.** Copied once, then the repository's own, with the shared parts kept in line by hand: `.prettierignore`, `.github/dependabot.yml`, `.github/workflows/ci.yml`, `.release-please-manifest.json`, `AGENTS.md`, `CONTRIBUTING.md`, `README.md`, `ROADMAP.md`, this guide, `eslint.config.js`, `knip.json`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `src/`, `tests/index.test.ts`, `tests/package/`, and `tests/vitest-config.test.ts`.
- **Template-only.** `scripts/template/` and `tests/scripts/template/`, which the template's `init.ts` removes from a new repository.
- **Generated.** `package-lock.json`, written by npm, and `CHANGELOG.md`, written by Release Please.

The template's [owned-files.json](https://github.com/cravingmaker/package-template/blob/main/scripts/template/owned-files.json) lists the owned files one by one, and its [drift check](https://github.com/cravingmaker/package-template/blob/main/scripts/template/README.md#driftts) compares them with the default branch of each repository. The account defaults of [cravingmaker/.github](https://github.com/cravingmaker/.github), such as the code of conduct, the security policy, and the issue forms, apply to every repository, so no repository has its own copy; `tests/repository/files.test.ts` checks that.

## Shared configuration

[@cravingmaker/eslint-config](https://github.com/cravingmaker/eslint-config) and [@cravingmaker/prettier-config](https://github.com/cravingmaker/prettier-config) hold the lint and format policy. A repository adds only what concerns its own files: `eslint.config.js` names its fixtures and its test rules, and `package.json` references the Prettier config. A rule change that every repository needs belongs in the shared config, not in the copies.

## Change recipes

### A shared file

Change the owned file in the template first, with its tests, then copy it to every repository in pull requests of their own. Then run `node scripts/template/drift.ts` from a checkout of the template against each repository; it reports the files that still differ.

### The contributor Node.js version

1. Set the new version in `.nvmrc`.
2. Set `NODE_VERSION` and both checksums of the setup script in `CONTRIBUTING.md`, from the release's `SHASUMS256.txt`.
3. Run `npm test`: `tests/repository/versions.test.ts` checks that both versions agree, and the weekly pins workflow checks the checksums.

### The minimum Node.js version

1. Set `engines.node` and `devEngines.runtime.version` to the new floor.
2. Start the matrix of the `test` job in `ci.yml` with the floor, and keep the newest release of each supported line.
3. Name the floor in the README's requirements, and set `@types/node` to the floor's major version.
4. Set `target` and `lib` in `tsconfig.json` to what the floor supports, run the code on it, and add the row of the new major version to `tests/repository/versions.test.ts`.

### actionlint and zizmor

The pins workflow reports a newer release of either tool. For actionlint, update the version and the eight SHA-256 values in `scripts/actionlint-reference.json` from the release's checksums file and from the extracted binaries. For zizmor, update the `version` input in `.github/workflows/zizmor.yml`.

### A CI job

Add the job to the `needs` of `CI result`, which is the only status that the repository rules require. `tests/repository/workflows.test.ts` fails when a job is missing from that list, has no name, timeout, or permissions, or when the workflow names its repository.

### A published file

Add the file to `files` in `package.json` and to the list in `tests/package/contents.test.ts`. A new entry point also needs its `exports` condition, a packed-consumer test, and its watch mapping in `vitest.config.ts`.

## CI check ownership

| Check                                                          | Owner                                                        |
| -------------------------------------------------------------- | ------------------------------------------------------------ |
| Registry signatures and provenance of the installed packages   | Static checks, and the verify job of the publishing workflow |
| Formatting, types, Knip, ESLint, actionlint, publint, and attw | Static checks (`npm run validate:static`)                    |
| Unit and repository tests                                      | Node.js matrix                                               |
| Packed consumers                                               | Node.js matrix, macOS packed consumers                       |
| Peer floors                                                    | Minimum peer versions                                        |
| Known vulnerabilities in the lockfile                          | Dependency audit                                             |
| Dependency changes of a pull request                           | Dependency Review                                            |
| One required status for the repository rules                   | CI result                                                    |
| Workflow security                                              | zizmor, and CodeQL default setup                             |
| Repository security practices                                  | Scorecard                                                    |
| Versions that Dependabot cannot update                         | Pins                                                         |
