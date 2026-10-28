import { access, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import ownedFiles from "../../../scripts/template/owned-files.json" with { type: "json" };

const directory = fileURLToPath(new URL("../../..", import.meta.url));
// The owned files at the root and in `.github/`.
const ownedRootFiles = [
  ".editorconfig",
  ".gitattributes",
  ".github/CODEOWNERS",
  ".gitignore",
  ".npmrc",
  ".nvmrc",
  "CODING_PRINCIPLES.md",
  "LICENSE",
  "release-please-config.json",
  "tsdown.config.ts",
];
// The directories whose files are all owned, apart from the paths below.
const ownedDirectories = [
  ".github/workflows",
  ".husky",
  "scripts",
  "tests/repository",
  "tests/scripts",
  "tests/support",
];
// The seeded CI workflow, Husky's generated files, and the template tools.
const excluded = [
  ".github/workflows/ci.yml",
  ".husky/_/",
  "scripts/template/",
  "tests/scripts/template/",
];

const isExcluded = (file: string): boolean => {
  return excluded.some((prefix) => {
    return file.startsWith(prefix);
  });
};

// The files of `relativeDirectory`, by their paths from the repository root.
const listFiles = async (
  relativeDirectory: string,
): Promise<readonly string[]> => {
  const entries = await readdir(path.join(directory, relativeDirectory), {
    recursive: true,
    withFileTypes: true,
  });
  return entries
    .filter((entry) => {
      return entry.isFile();
    })
    .map((entry) => {
      return path
        .relative(directory, path.join(entry.parentPath, entry.name))
        .split(path.sep)
        .join("/");
    });
};

describe("the owned files of the template", () => {
  it("are the files that docs/architecture.md names as owned", async () => {
    const listed = await Promise.all(
      ownedDirectories.map(async (relativeDirectory) => {
        return await listFiles(relativeDirectory);
      }),
    );
    const files = listed.flat().filter((file) => {
      return !isExcluded(file);
    });

    const rootFiles = new Set(ownedRootFiles);

    expect(new Set(ownedFiles.owned)).toEqual(rootFiles.union(new Set(files)));
  });

  it.each(ownedFiles.owned)("include %s, which exists", async (file) => {
    await expect(access(path.join(directory, file))).resolves.toBeUndefined();
  });
});
