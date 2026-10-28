/**
 * Applies the shared settings to a repository, or with `--check` only compares them, and prints the steps that need a browser.
 *
 * Usage: `node scripts/template/configure-repository.ts <owner>/<name> [--check] [--private-key <path>]`. `--private-key` stores the private key of the release app as a secret, read from the file and never printed.
 */

import type { Repository, Requester, Result } from "./lib/settings.ts";

import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import process from "node:process";
import { parseArgs, promisify } from "node:util";

import {
  createRequester,
  readRepositoryJson,
  readRepositoryValue,
  readToken,
} from "./lib/github.ts";
import {
  applySettings,
  checkSettings,
  sharedSettings,
  valueAt,
} from "./lib/settings.ts";
import settings from "./settings.json" with { type: "json" };

type Options = {
  readonly isCheck: boolean;
  readonly slug: string;

  readonly privateKey?: string;
};

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify takes the callback form of execFile, which also returns its child process.
const execute = promisify(execFile);
const secretName = "RELEASE_PLEASE_APP_PRIVATE_KEY";
const usage =
  "Usage: node scripts/template/configure-repository.ts <owner>/<name> [--check] [--private-key <path>]";

// Stops the tool with `message`.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- Invalid input must stop the tool before it changes anything.
  throw new Error(message);
};

const parseOptions = (commandLine: readonly string[]): Options => {
  const { positionals, values } = parseArgs({
    allowPositionals: true,
    args: [...commandLine],
    options: {
      check: { type: "boolean" },
      // eslint-disable-next-line @typescript-eslint/naming-convention -- Command-line options are kebab-case.
      "private-key": { type: "string" },
    },
  });
  const [slug] = positionals;
  const privateKey = values["private-key"];
  return typeof slug === "string" &&
    positionals.length === 1 &&
    /^[\w\-.]+\/[\w\-.]+$/u.test(slug)
    ? {
        isCheck: values.check === true,
        slug,
        ...(typeof privateKey === "string" && { privateKey }),
      }
    : fail(usage);
};

// The repository's identity: its package, from the `package.json` of its default branch.
const readRepository = async (
  request: Requester,
  slug: string,
): Promise<Repository> => {
  const manifest = await readRepositoryJson(request, slug, "package.json");
  const keywords = valueAt(manifest, "keywords");
  const name = valueAt(manifest, "name");
  const description = valueAt(manifest, "description");
  const template = await readRepositoryValue(request, slug, "is_template");
  return typeof name === "string" && typeof description === "string"
    ? {
        description,
        isTemplate: template === true,
        keywords: (Array.isArray(keywords) ? keywords : []).map(String),
        packageName: name,
        slug,
      }
    : fail(`The package.json of ${slug} has no name or description.`);
};

/*
Stores the private key of the release app as a secret when `--private-key` names it. gh reads the key from standard input, so the key never appears in a command line.
*/
const storePrivateKey = async (
  options: Readonly<Options>,
  repository: Readonly<Repository>,
): Promise<"skipped" | "stored"> => {
  if (
    options.isCheck ||
    repository.isTemplate ||
    typeof options.privateKey !== "string"
  ) {
    return "skipped";
  }
  const key = await readFile(options.privateKey, "utf8");
  const storing = execute(
    "gh",
    ["secret", "set", secretName, "--repo", options.slug],
    { timeout: 30_000 },
  );
  // eslint-disable-next-line functional/no-expression-statements -- Closing standard input after the key lets gh store it.
  storing.child.stdin?.end(key);
  // eslint-disable-next-line functional/no-expression-statements -- gh prints only a confirmation, which the result line replaces.
  await storing;
  return "stored";
};

// Whether the repository has the secret of the release app, which GitHub reports without its value.
const hasSecret = async (
  request: Requester,
  slug: string,
): Promise<boolean> => {
  const response = await request({
    method: "GET",
    path: `/repos/${slug}/actions/secrets/${secretName}`,
  });
  return response.status === 200;
};

// The steps that the GitHub and npm APIs cannot take for a user.
const manualSteps = (
  repository: Readonly<Repository>,
  isSecretStored: boolean,
): readonly string[] => {
  if (repository.isTemplate) {
    return [
      "This is a template repository. Its workflows never release, so it needs no release app, secret, or npm publisher.",
    ];
  }
  return [
    `Install the release app on the repository: open ${settings.releaseApp.installations}, configure ${settings.releaseApp.slug}, and add ${repository.slug}.`,
    ...(isSecretStored
      ? []
      : [
          `Store the release app's private key: node scripts/template/configure-repository.ts ${repository.slug} --private-key <path>.`,
        ]),
    `On npmjs.com, add a trusted publisher to ${repository.packageName}: GitHub Actions, the repository ${repository.slug}, the workflow publish.yml, and the environment npm.`,
    "After the first version, allow only staged publishing for the trusted publisher, and set the publishing access to require two-factor authentication and disallow tokens.",
  ];
};

const formatResult = (result: Readonly<Result>): string => {
  return `  ${result.state.padEnd(8)} ${result.name}${typeof result.detail === "string" ? `: ${result.detail}` : ""}`;
};

/**
 * Configures or checks the repository that `commandLine` names, prints the results and the manual steps, and returns the exit status.
 */
const run = async (commandLine: readonly string[]): Promise<number> => {
  const options = parseOptions(commandLine);
  const request = createRequester(await readToken("github.com"));
  const repository = await readRepository(request, options.slug);
  const list = sharedSettings(repository);
  const results = options.isCheck
    ? await checkSettings(request, list)
    : await applySettings(request, list);
  const isNewSecret = (await storePrivateKey(options, repository)) === "stored";
  const isSecretStored =
    isNewSecret || (await hasSecret(request, options.slug));
  const isComplete = results.every((result) => {
    return result.state === "current" || result.state === "changed";
  });

  console.log(
    [
      `${repository.slug} (${options.isCheck ? "check" : "apply"})`,
      ...results.map((result) => {
        return formatResult(result);
      }),
      ...(isNewSecret ? [`  changed  Secret ${secretName}`] : []),
      "",
      "Manual steps:",
      ...manualSteps(repository, isSecretStored).map((step, index) => {
        return `  ${String(index + 1)}. ${step}`;
      }),
    ].join("\n"),
  );
  return isComplete ? 0 : 1;
};

// eslint-disable-next-line functional/immutable-data, functional/no-expression-statements -- The exit status reports outdated settings without cutting off the output, as process.exit() can.
process.exitCode = await run(process.argv.slice(2));
