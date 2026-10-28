/**
 * Compares the owned files of the template with the default branch of each repository that it names, and prints the files that differ.
 *
 * Usage: `node scripts/template/drift.ts <owner>/<name>...`. The exit status is 1 when an owned file differs or is missing, apart from the differences that `owned-files.json` names as intended.
 */

import type { Drift } from "./lib/drift.ts";
import type { Requester } from "./lib/settings.ts";

import { readFile } from "node:fs/promises";
import process from "node:process";

import { blobSha, compareOwnedFiles, parseTree } from "./lib/drift.ts";
import {
  createRequester,
  readRepositoryValue,
  readToken,
} from "./lib/github.ts";
import ownedFiles from "./owned-files.json" with { type: "json" };

const projectDirectory = new URL("../..", import.meta.url);
const intendedDifferences = new Map(Object.entries(ownedFiles.intended));

// Stops the tool with `message`.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A repository that cannot be compared must stop the tool.
  throw new Error(message);
};

// The blob SHA of each of `files` in this checkout.
const readLocalFiles = async (
  files: readonly string[],
): Promise<ReadonlyMap<string, string>> => {
  return new Map(
    await Promise.all(
      files.map(async (path): Promise<readonly [string, string]> => {
        return [path, blobSha(await readFile(new URL(path, projectDirectory)))];
      }),
    ),
  );
};

// The drift of one repository.
const compareRepository = async (
  request: Requester,
  local: ReadonlyMap<string, string>,
  slug: string,
): Promise<readonly Drift[]> => {
  const branch = await readRepositoryValue(request, slug, "default_branch");
  const tree = await request({
    method: "GET",
    path: `/repos/${slug}/git/trees/${typeof branch === "string" ? branch : fail(`${slug} has no default branch.`)}?recursive=1`,
  });
  return compareOwnedFiles(
    local,
    parseTree(tree.data),
    new Set(intendedDifferences.get(slug)),
  );
};

/**
 * Compares the repositories that `slugs` name, prints the result, and returns the exit status.
 */
const run = async (slugs: readonly string[]): Promise<number> => {
  const request = createRequester(await readToken("github.com"));
  const local = await readLocalFiles(ownedFiles.owned);
  const reports = await Promise.all(
    (slugs.length === 0
      ? fail("Name at least one <owner>/<name>.")
      : slugs
    ).map(async (slug) => {
      return { drifts: await compareRepository(request, local, slug), slug };
    }),
  );
  const lines = reports.flatMap(({ drifts, slug }) => {
    const changed = drifts.filter((drift) => {
      return drift.state !== "same";
    });
    return [
      `${slug}: ${String(drifts.length - changed.length)} of ${String(drifts.length)} owned files are the same`,
      ...changed.map((drift) => {
        return `  ${drift.state.padEnd(9)} ${drift.path}`;
      }),
    ];
  });

  console.log(lines.join("\n"));
  return reports.every(({ drifts }) => {
    return drifts.every((drift) => {
      return drift.state === "same" || drift.state === "intended";
    });
  })
    ? 0
    : 1;
};

// eslint-disable-next-line functional/immutable-data, functional/no-expression-statements -- The exit status reports drift without cutting off the output, as process.exit() can.
process.exitCode = await run(process.argv.slice(2));
