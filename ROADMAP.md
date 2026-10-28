# Roadmap

Planned work, and the temporary workarounds that the package carries. Each item says why it is open and what evidence closes it.

## Waiting on upstream

- **TypeScript 7.** typescript-eslint accepts only `>=4.8.4 <6.1.0`, so TypeScript stays on 6.0. Move to TypeScript 7 when typescript-eslint accepts it.
- **npm 12.** Node.js 26.13.0 bundles npm 11.20.0. When the contributor Node.js bundles npm 12, replace `ignore-scripts=true` with npm 12's policy for install scripts, and check how `publish.yml` reads `npm pack --json`, whose output npm 12 changed.
- **Workflow lockfiles.** GitHub's `actions.lock` is in public preview. Adopt it next to the full-SHA pins when it is generally available.
- **`eslint.config.ts`.** ESLint loads a TypeScript config file only through jiti or an unstable flag. Consider one when native loading is stable.
- **Prettier 4.** Evaluate it in prettier-config first, when a stable release ships.
- **Node.js 27.** Add its line to the CI matrix when 27.0.0 ships in April 2027, and make it the contributor version when it becomes LTS in October 2027.
- **Dependabot and `.nvmrc`.** Dependabot cannot update `.nvmrc`, so the weekly pins workflow checks it. Drop that check when Dependabot supports Node.js version files.

<!-- template:start -->

## Template

- **Code scanning results as a merge rule.** Since 2026-10-29, "Protect main" of this repository requires CodeQL results without high or critical alerts. If it blocks no pull request without reason by 2026-11-30, add the rule to `scripts/template/rulesets/protect-main.json` for every repository. zizmor stays out, because its workflow runs only when `.github/` changes, so most pull requests have no zizmor results.
- **Back-ports.** eslint-config and prettier-config adopt the template in pull requests per topic, and `node scripts/template/drift.ts cravingmaker/eslint-config cravingmaker/prettier-config` lists what remains. prettier-config moves to staged publishing after its 0.4.0 release.
- **`.ts` import specifiers.** `eslint.config.js` overrides `import-x/extensions`, because @cravingmaker/eslint-config expects `.js` specifiers. Remove the override when eslint-config has an option for `.ts` specifiers.
- **Reusable workflows.** The repositories share copies of their workflows. With four or more repositories, move the shared jobs to reusable workflows.

<!-- template:end -->
