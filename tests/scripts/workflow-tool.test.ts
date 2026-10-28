import type { CommandResult } from "../support/consumer.ts";

import { cp, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import reference from "../../scripts/actionlint-reference.json" with { type: "json" };
import { createTemporaryDirectory, runCommand } from "../support/consumer.ts";

const directory = fileURLToPath(new URL("../..", import.meta.url));
// The files that the workflow check needs, which the cache test copies into its workspace.
const scripts = [
  "actionlint-reference.json",
  "actionlint.ts",
  "check-workflows.ts",
];

// Runs the workflow check from `root`, which holds the scripts and receives the `.tools/` cache.
const checkWorkflows = async (
  root: string,
  commandArguments: readonly string[],
): Promise<CommandResult> => {
  return await runCommand(
    process.execPath,
    [path.join(root, "scripts/check-workflows.ts"), ...commandArguments],
    root,
  );
};

describe("the pinned workflow tool", () => {
  it("uses the pinned binary instead of a global installation", async () => {
    const { exitCode, stdout } = await checkWorkflows(directory, ["-version"]);

    expect(exitCode).toBe(0);
    expect(stdout.split("\n", 1)[0]).toBe(reference.version);
  }, 70_000);

  it.each(["imaginary.field", "needs.absent.outputs.value"])(
    "prints the finding for the invalid workflow expression %s and fails",
    async (expression) => {
      const workspace = await createTemporaryDirectory("package-workflow-");
      try {
        const filename = path.join(workspace, "invalid.yml");
        await writeFile(
          filename,
          `name: invalid\non: push\njobs:\n  invalid:\n    runs-on: ubuntu-latest\n    steps:\n      - run: echo \${{ ${expression} }}\n`,
        );

        await expect(
          checkWorkflows(directory, [filename]),
        ).resolves.toMatchObject({
          exitCode: 1,
          stdout: expect.stringContaining(expression) as unknown,
        });
      } finally {
        await rm(workspace, { force: true, recursive: true });
      }
    },
    70_000,
  );
});

describe("the cache of the pinned workflow tool", () => {
  it("refuses altered cached tooling without replacing user content", async () => {
    const workspace = await createTemporaryDirectory("package-workflow-cache-");
    try {
      await mkdir(path.join(workspace, "scripts"));
      await Promise.all(
        scripts.map(async (script) => {
          await cp(
            path.join(directory, "scripts", script),
            path.join(workspace, "scripts", script),
          );
        }),
      );
      const cache = path.join(
        workspace,
        ".tools",
        `actionlint-${reference.version}-${process.platform}-${process.arch}`,
      );
      const binary = path.join(cache, "actionlint");
      await mkdir(cache, { recursive: true });
      await writeFile(binary, "altered cached binary");

      await expect(
        checkWorkflows(workspace, ["-version"]),
      ).resolves.toMatchObject({
        exitCode: 1,
        stderr: expect.stringContaining(
          "does not match the pinned binary",
        ) as unknown,
      });
      expect(await readFile(binary, "utf8")).toBe("altered cached binary");
      expect(await readdir(path.join(workspace, ".tools"))).toEqual([
        path.basename(cache),
      ]);
    } finally {
      await rm(workspace, { force: true, recursive: true });
    }
  });
});
