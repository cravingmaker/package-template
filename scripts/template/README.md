# Template tools

These tools exist only in the template. `init.ts` removes this directory, with `tests/scripts/template/`, from a new package. Each tool reads the token of the GitHub CLI, `gh auth token`, sends it only to the GitHub API, and never prints it.

## `init.ts`

```bash
node scripts/template/init.ts --name <name> --description "<one sentence>"
```

Run it once in a new repository made from the template, after `npm ci`. It renames the package to `@cravingmaker/<name>` in `package.json`, the lockfile, the README, `AGENTS.md`, `CONTRIBUTING.md`, and `ROADMAP.md`. It sets the description in `package.json` and as the README's introduction, adds the npm badge, and removes the `<!-- template:start -->` blocks, the Knip entry of the tools, and the tools themselves.

## `configure-repository.ts`

```bash
node scripts/template/configure-repository.ts <owner>/<name> [--check] [--private-key <path>]
```

GitHub copies a template's files, not its settings. This tool applies the shared settings of [settings.json](settings.json) and [rulesets/](rulesets/), and with `--check`, it only compares them:

- squash merges only, auto-merge, branches deleted after merge, and no wiki, projects, or discussions;
- the npm page as the homepage, except in a template repository, and the package's description and keywords when the repository has none;
- secret scanning with push protection, private vulnerability reporting, and Dependabot alerts and security updates;
- CodeQL default setup with the extended suite;
- actions pinned to full commit SHAs, a read-only workflow token, and approval for the workflow runs of all outside contributors;
- immutable releases, the "Protect main" and "Protect release tags" rulesets, and the `npm` environment for `v*` tags;
- the `RELEASE_PLEASE_APP_CLIENT_ID` variable of the release app, except in a template repository.

`--private-key` stores the release app's private key as the `RELEASE_PLEASE_APP_PRIVATE_KEY` secret. gh reads the key from standard input, so it never appears in a command line. The tool ends with the steps that need a browser: installing the release app on the repository, and the trusted publisher and publishing access on npmjs.com.

The exit status is 1 when a setting is outdated after the run, and with `--check`, when any setting differs.

## `drift.ts`

```bash
node scripts/template/drift.ts <owner>/<name>...
```

It compares each file of [owned-files.json](owned-files.json) with the default branch of each repository, by git blob SHA, and lists the files that differ or are missing. `intended` in the same file names the differences that a repository keeps on purpose. The exit status is 1 when any other owned file differs.
