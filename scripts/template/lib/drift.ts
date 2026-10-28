/**
 * The comparison of `drift.ts`, which compares the owned files of the template with a repository's default branch by their git blob SHA.
 */

import { createHash } from "node:crypto";

import { valueAt } from "./settings.ts";

type Drift = {
  readonly path: string;
  readonly state: DriftState;
};
// `intended` is a difference that the repository keeps on purpose.
type DriftState = "different" | "intended" | "missing" | "same";

/**
 * The git blob SHA-1 of `bytes`, which GitHub reports for each file of a tree.
 */
const blobSha = (bytes: Uint8Array): string => {
  // eslint-disable-next-line sonarjs/hashing -- Git names a blob by its SHA-1; the hash identifies the content and protects nothing.
  return createHash("sha1")
    .update(`blob ${String(bytes.byteLength)}\0`)
    .update(bytes)
    .digest("hex");
};

/**
 * The blob SHA of each file in a response of GitHub's recursive tree API, by path.
 */
const parseTree = (data: unknown): ReadonlyMap<string, string> => {
  const entries = valueAt(data, "tree");
  return new Map(
    (Array.isArray(entries) ? entries : [])
      .filter((entry: unknown) => {
        return (
          valueAt(entry, "type") === "blob" &&
          typeof valueAt(entry, "path") === "string" &&
          typeof valueAt(entry, "sha") === "string"
        );
      })
      .map((entry: unknown): readonly [string, string] => {
        return [String(valueAt(entry, "path")), String(valueAt(entry, "sha"))];
      }),
  );
};

// The state of one owned file.
const stateOf = (
  sha: string,
  remoteSha: string | undefined,
  isIntended: boolean,
): DriftState => {
  if (remoteSha === sha) {
    return "same";
  }
  if (isIntended) {
    return "intended";
  }
  return typeof remoteSha === "undefined" ? "missing" : "different";
};

/**
 * Compares the blob SHA of each owned file of the template, `local`, with the files of a repository, `remote`. `intended` names the files that the repository keeps different on purpose.
 */
const compareOwnedFiles = (
  local: ReadonlyMap<string, string>,
  remote: ReadonlyMap<string, string>,
  intended: ReadonlySet<string>,
): readonly Drift[] => {
  return [...local].map(([path, sha]) => {
    return { path, state: stateOf(sha, remote.get(path), intended.has(path)) };
  });
};

export { blobSha, compareOwnedFiles, parseTree };
export type { Drift };
