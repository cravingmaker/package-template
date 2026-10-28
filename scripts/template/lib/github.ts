/**
 * Requests to the GitHub REST API, authorized with the login of the GitHub CLI.
 */

import type { Requester } from "./settings.ts";

import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { valueAt } from "./settings.ts";

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify takes the callback form of execFile, which also returns its child process.
const execute = promisify(execFile);
const timeout = 30_000;

// Stops the tool with `message`.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A repository that cannot be read must stop the tool.
  throw new Error(message);
};

/**
 * The token of the GitHub CLI's login on `hostname`. The tools send it to the GitHub API only, and never print it.
 */
const readToken = async (hostname: string): Promise<string> => {
  const { stdout } = await execute(
    "gh",
    ["auth", "token", "--hostname", hostname],
    { encoding: "utf8", timeout },
  );
  return stdout.trim();
};

/**
 * Sends each request to the GitHub REST API with `token`.
 */
const createRequester = (token: string): Requester => {
  return async (request) => {
    const response = await fetch(`https://api.github.com${request.path}`, {
      ...(typeof request.body !== "undefined" && {
        body: JSON.stringify(request.body),
      }),
      headers: new Headers([
        ["accept", request.accept ?? "application/vnd.github+json"],
        ["authorization", `Bearer ${token}`],
        ["x-github-api-version", "2022-11-28"],
      ]),
      method: request.method,
      signal: AbortSignal.timeout(timeout),
    });
    const text = await response.text();
    const data: unknown = text === "" ? {} : JSON.parse(text);
    return { data, status: response.status };
  };
};

/**
 * The parsed content of the JSON file `file` on the default branch of the repository `slug`.
 */
const readRepositoryJson = async (
  request: Requester,
  slug: string,
  file: string,
): Promise<unknown> => {
  // The raw media type returns the file itself, which the requester parses as JSON.
  const response = await request({
    accept: "application/vnd.github.raw+json",
    method: "GET",
    path: `/repos/${slug}/contents/${file}`,
  });
  return response.status === 200
    ? response.data
    : fail(`Cannot read ${file} of ${slug}: HTTP ${String(response.status)}`);
};

/**
 * The value of `key` in the repository `slug`, such as `default_branch`.
 */
const readRepositoryValue = async (
  request: Requester,
  slug: string,
  key: string,
): Promise<unknown> => {
  const response = await request({ method: "GET", path: `/repos/${slug}` });
  return response.status === 200
    ? valueAt(response.data, key)
    : fail(`Cannot read ${slug}: HTTP ${String(response.status)}`);
};

export { createRequester, readRepositoryJson, readRepositoryValue, readToken };
