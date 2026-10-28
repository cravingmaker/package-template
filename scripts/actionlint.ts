import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import reference from "./actionlint-reference.json" with { type: "json" };

type Release = (typeof reference.releases)[number];

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify takes the callback form of execFile, which also returns its child process.
const execute = promisify(execFile);
const projectDirectory = fileURLToPath(new URL("..", import.meta.url));
const timeout = 30_000;

// Stops the check with `message`; every failed verification below ends here.
const fail = (message: string, cause?: unknown): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A failed verification must stop the workflow check.
  throw new Error(message, { cause });
};

const sha256 = (bytes: Uint8Array): string => {
  return createHash("sha256").update(bytes).digest("hex");
};

const hasCode = (error: unknown, code: string): boolean => {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === code
  );
};

const pinnedRelease = (platform: string, arch: string): Release => {
  return (
    reference.releases.find((candidate) => {
      return candidate.platform === platform && candidate.arch === arch;
    }) ?? fail(`The pinned workflow tool has no binary for ${platform}/${arch}`)
  );
};

// Creates `directory` and its parents.
const makeDirectory = async (directory: string): Promise<void> => {
  // eslint-disable-next-line functional/no-expression-statements -- mkdir resolves to the first directory that it created, which no caller needs.
  await fs.mkdir(directory, { recursive: true });
};

const verify = (
  bytes: Uint8Array,
  expected: string,
  message: string,
): Uint8Array => {
  return sha256(bytes) === expected ? bytes : fail(message);
};

// The cached binary, or nothing when the cache is empty. Other read failures stop the check.
const readCache = async (binary: string): Promise<Uint8Array | undefined> => {
  try {
    return await fs.readFile(binary);
  } catch (error) {
    if (hasCode(error, "ENOENT")) {
      return;
    }
    return fail(`Cannot read cached actionlint: ${binary}`, error);
  }
};

/**
 * Whether the cache holds the pinned binary. Other content fails instead of being replaced, because the cache may hold user files.
 */
const isCached = async (binary: string, expected: string): Promise<boolean> => {
  const bytes = await readCache(binary);
  return typeof bytes === "undefined"
    ? false
    : sha256(bytes) === expected ||
        fail(
          `Cached actionlint does not match the pinned binary: ${binary}. Remove this cache directory and rerun lint:workflows.`,
        );
};

const download = async (url: string): Promise<Uint8Array> => {
  const response = await globalThis.fetch(url, {
    signal: AbortSignal.timeout(timeout),
  });
  return response.ok
    ? new Uint8Array(await response.arrayBuffer())
    : fail(
        `Download pinned actionlint: HTTP ${String(response.status)} from ${url}`,
      );
};

// The verified binary from the pinned release archive.
const extractBinary = async (
  staging: string,
  release: Readonly<Release>,
): Promise<Uint8Array> => {
  const url = `https://github.com/rhysd/actionlint/releases/download/v${reference.version}/${release.archive}`;
  const archive = verify(
    await download(url),
    release.archiveSha256,
    `Pinned actionlint archive checksum mismatch: ${release.archive}`,
  );
  // Extract the verified archive from standard input, so downloaded data is never written to a file.
  const extraction = execute(
    "tar",
    ["-xzf", "-", "-C", staging, "actionlint"],
    { maxBuffer: 1024 * 1024, timeout },
  );
  // eslint-disable-next-line functional/no-expression-statements -- Closing standard input after the archive starts the extraction.
  extraction.child.stdin?.end(archive);
  // eslint-disable-next-line functional/no-expression-statements -- tar prints nothing on success; the binary is read from disk below.
  await extraction;
  return verify(
    await fs.readFile(path.join(staging, "actionlint")),
    release.binarySha256,
    `Pinned actionlint binary checksum mismatch: ${release.archive}`,
  );
};

const writeOnce = async (target: string, bytes: Uint8Array): Promise<void> => {
  try {
    // Exclusive creation keeps the same verified binary when a concurrent run installed it first.
    await fs.writeFile(target, bytes, { flag: "wx", mode: 0o755 });
  } catch (error) {
    if (hasCode(error, "EEXIST")) {
      return;
    }
    return fail(`Cannot install actionlint: ${target}`, error);
  }
};

const install = async (
  tools: string,
  binary: string,
  release: Readonly<Release>,
): Promise<void> => {
  await makeDirectory(tools);
  const staging = await fs.mkdtemp(path.join(tools, ".actionlint-"));
  try {
    const bytes = await extractBinary(staging, release);
    await makeDirectory(path.dirname(binary));
    await writeOnce(binary, bytes);
  } finally {
    await fs.rm(staging, { force: true, recursive: true });
  }
};

/**
 * Returns the pinned actionlint binary, downloading and verifying it on first use.
 */
const ensureActionlint = async (
  root: string = projectDirectory,
): Promise<string> => {
  const release = pinnedRelease(process.platform, process.arch);
  const tools = path.join(root, ".tools");
  const binary = path.join(
    tools,
    `actionlint-${reference.version}-${process.platform}-${process.arch}`,
    "actionlint",
  );
  if (await isCached(binary, release.binarySha256)) {
    return binary;
  }
  await install(tools, binary, release);
  return (await isCached(binary, release.binarySha256))
    ? binary
    : fail(`Installed actionlint is missing: ${binary}`);
};

export { ensureActionlint, projectDirectory };
