import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runCommand } from "../support/consumer.ts";

// The files that `npm pack` puts in the tarball. A new entry point or asset is added here on purpose.
const expectedFiles = [
  "LICENSE",
  "README.md",
  "dist/index.d.mts",
  "dist/index.mjs",
  "package.json",
];

const projectDirectory = new URL("../..", import.meta.url);
const { stdout } = await runCommand(
  "npm",
  ["pack", "--dry-run", "--ignore-scripts", "--json"],
  fileURLToPath(projectDirectory),
);
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- `npm pack --json` prints this shape.
const [{ files }] = JSON.parse(stdout) as readonly [
  { readonly files: ReadonlyArray<{ readonly path: string }> },
];

describe("the package contents", () => {
  it("are exactly the build, the manifest, the README, and the license", () => {
    expect(
      new Set(
        files.map((file) => {
          return file.path;
        }),
      ),
    ).toEqual(new Set(expectedFiles));
  });

  it.each(
    expectedFiles.filter((file) => {
      return file.startsWith("dist/");
    }),
  )("include %s without a source map reference", async (file) => {
    const content = await readFile(new URL(file, projectDirectory), "utf8");

    expect(content).not.toContain("sourceMappingURL");
  });
});
