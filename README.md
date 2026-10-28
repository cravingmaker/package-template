# @cravingmaker/package-template

[![CI](https://github.com/cravingmaker/package-template/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/cravingmaker/package-template/actions/workflows/ci.yml) [![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/cravingmaker/package-template/badge)](https://scorecard.dev/viewer/?uri=github.com/cravingmaker/package-template) [![License: MIT](https://img.shields.io/github/license/cravingmaker/package-template)](https://github.com/cravingmaker/package-template/blob/main/LICENSE)

Craving Maker's template for ESM-only TypeScript packages, with the tooling, checks, and release process of [@cravingmaker/eslint-config](https://github.com/cravingmaker/eslint-config) and [@cravingmaker/prettier-config](https://github.com/cravingmaker/prettier-config).

<!-- template:start -->

## Using this template

The template is a working package, `@cravingmaker/package-template`, that is never published. Its placeholder module, `greet()`, shows where the code, the tests, and the README examples go.

- **Supply chain.** Exact versions at least seven days old, no install scripts, registry-only installs, verified signatures, and staged publishing with provenance from a job that runs no dependency code.
- **Checks in one place.** `npm run validate` runs formatting, types, Knip, ESLint, actionlint, publint, Are the Types Wrong?, the tests, and packed consumers, as CI does on Node.js 24.15.0, the newest 24, and the newest 26.
- **Settings as code.** A script applies and checks the repository settings that GitHub does not copy from a template, and another compares the shared files with every repository that uses them.

To start a package:

1. **Create.** Run `gh repo create cravingmaker/<name> --public --template cravingmaker/package-template --clone`, then `npm ci` and `npm run prepare` in the new checkout.
2. **Initialize.** Run `node scripts/template/init.ts --name <name> --description "<one sentence>"`. It renames the package in the manifest, the lockfile, and the documentation, removes this section and the template tools, and adds the npm badge.
3. **Configure.** From a checkout of the template, run `node scripts/template/configure-repository.ts cravingmaker/<name>`. It applies the merge settings, the security features, the Actions policy, both rulesets, and the `npm` environment, and prints the steps that need a browser.
4. **Publish the first version.** Add the trusted publisher on npmjs.com for `publish.yml` and the `npm` environment, then merge a `feat:` pull request and the release pull request that follows it. A new package's first version cannot be staged, so it publishes directly.
5. **Require approval.** Switch the trusted publisher to staged publishing only, and set the publishing access to require two-factor authentication and disallow tokens. Every later version waits for your approval on npmjs.com.
6. **Check.** Run `node scripts/template/configure-repository.ts cravingmaker/<name> --check` and `node scripts/template/drift.ts cravingmaker/<name>`.

[scripts/template/README.md](https://github.com/cravingmaker/package-template/blob/main/scripts/template/README.md) describes the tools, and [docs/architecture.md](https://github.com/cravingmaker/package-template/blob/main/docs/architecture.md) says which files are shared and how to change them.

<!-- template:end -->

## Contents

- [Requirements](#requirements)
- [Installation](#installation)
- [Usage](#usage)
- [Versioning](#versioning)
- [Contributing and security](#contributing-and-security)
- [License](#license)

## Requirements

- Node.js 24.15.0 or later.
- ES modules. The package is ESM-only.

## Installation

```bash
npm install --save-exact @cravingmaker/package-template
```

Pin the exact version, as `--save-exact` does, so that the package changes only when you update it; see [Versioning](#versioning).

## Usage

```ts
import { greet } from "@cravingmaker/package-template";

console.log(greet("Ada")); // Hello, Ada!
```

## Versioning

The package follows [Semantic Versioning](https://semver.org/). Before 1.0.0, breaking changes come in minor versions.

The [changelog](https://github.com/cravingmaker/package-template/blob/main/CHANGELOG.md) and the [releases](https://github.com/cravingmaker/package-template/releases) describe each version.

## Contributing and security

See [CONTRIBUTING.md](https://github.com/cravingmaker/package-template/blob/main/CONTRIBUTING.md) for contribution and pull request guidance, and follow the [Code of Conduct](https://github.com/cravingmaker/.github/blob/main/CODE_OF_CONDUCT.md) when participating in the project. Report vulnerabilities privately as described in the [security policy](https://github.com/cravingmaker/.github/blob/main/SECURITY.md).

## License

MIT © [cravingmaker](https://github.com/cravingmaker)
