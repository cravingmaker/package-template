import type { Pin } from "./pins/versions.ts";

import { readFile } from "node:fs/promises";
import process from "node:process";

import {
  findOutdated,
  newestInLine,
  parseChecksums,
  parseVersion,
  readSetupScript,
  readZizmorVersion,
} from "./pins/versions.ts";

const projectDirectory = new URL("..", import.meta.url);
// eslint-disable-next-line n/no-process-env -- The workflow passes its token, which raises the GitHub API rate limit.
const token = process.env.GITHUB_TOKEN ?? "";

const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A release that cannot be read must not look current.
  throw new Error(message);
};

const readText = async (relativePath: string): Promise<string> => {
  return await readFile(new URL(relativePath, projectDirectory), "utf8");
};

const fetchText = async (url: string): Promise<string> => {
  const response = await fetch(url, {
    headers:
      token !== "" && url.startsWith("https://api.github.com/")
        ? { authorization: `Bearer ${token}` }
        : {},
    signal: AbortSignal.timeout(30_000),
  });
  return response.ok
    ? await response.text()
    : fail(`HTTP ${String(response.status)} from ${url}`);
};

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null;
};

// The tag of the newest release of a GitHub repository, without its leading `v`.
const latestRelease = async (repository: string): Promise<string> => {
  const release: unknown = JSON.parse(
    await fetchText(
      `https://api.github.com/repos/${repository}/releases/latest`,
    ),
  );
  return isRecord(release) && typeof release.tag_name === "string"
    ? release.tag_name.replace(/^v/u, "")
    : fail(`The newest release of ${repository} has no tag.`);
};

const nodeVersions = async (indexUrl: string): Promise<readonly string[]> => {
  const releases: unknown = JSON.parse(await fetchText(indexUrl));
  return Array.isArray(releases)
    ? releases.map((release: unknown) => {
        return isRecord(release) && typeof release.version === "string"
          ? release.version.replace(/^v/u, "")
          : fail(
              "The Node.js release index lists a release without a version.",
            );
      })
    : fail("The Node.js release index is not a list.");
};

const [nvmrc, actionlintReference, zizmorWorkflow, contributing] =
  await Promise.all([
    readText(".nvmrc"),
    readText("scripts/actionlint-reference.json"),
    readText(".github/workflows/zizmor.yml"),
    readText("CONTRIBUTING.md"),
  ]);
const node = nvmrc.trim();
const actionlintPin: unknown = JSON.parse(actionlintReference);
const actionlint =
  isRecord(actionlintPin) && typeof actionlintPin.version === "string"
    ? actionlintPin.version
    : fail("scripts/actionlint-reference.json pins no version.");
const setupScript = readSetupScript(contributing);

const [versions, newestActionlint, newestZizmor, checksums] = await Promise.all(
  [
    nodeVersions("https://nodejs.org/dist/index.json"),
    latestRelease("rhysd/actionlint"),
    latestRelease("zizmorcore/zizmor"),
    fetchText(`https://nodejs.org/dist/v${setupScript.version}/SHASUMS256.txt`),
  ],
);

const pins: readonly Pin[] = [
  {
    current: node,
    name: ".nvmrc",
    newest: newestInLine(versions, parseVersion(node)[0] ?? 0) ?? node,
  },
  {
    current: actionlint,
    name: "scripts/actionlint-reference.json",
    newest: newestActionlint,
  },
  {
    current: readZizmorVersion(zizmorWorkflow),
    name: "the zizmor version in .github/workflows/zizmor.yml",
    newest: newestZizmor,
  },
];
const published = parseChecksums(checksums);
const problems = [
  ...findOutdated(pins).map((pin) => {
    return `${pin.name} pins ${pin.current}; the newest release is ${pin.newest}.`;
  }),
  ...(setupScript.version === node
    ? []
    : [
        `The setup script in CONTRIBUTING.md installs Node.js ${setupScript.version}, but .nvmrc pins ${node}.`,
      ]),
  ...Object.entries(setupScript.checksums)
    .filter(([archive, checksum]) => {
      return published.get(archive) !== checksum;
    })
    .map(([archive]) => {
      return `The setup script's SHA-256 of ${archive} does not match SHASUMS256.txt of Node.js.`;
    }),
];

console.log(
  problems.length === 0
    ? "Every hand-maintained pin is current."
    : problems.join("\n"),
);
// eslint-disable-next-line functional/immutable-data, functional/no-expression-statements -- The exit status reports outdated pins without cutting off the output, as process.exit() can.
process.exitCode = problems.length === 0 ? 0 : 1;
