import { mkdir, mkdtemp, realpath, rm, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { afterAll, describe, expect, it, vi } from "vitest";

import {
  codeBlocks,
  createTemporaryDirectory,
  runCommand,
} from "./consumer.ts";

// The directory of this test, created without the helper that the test checks.
const parentDirectory = await mkdtemp(
  path.join(os.tmpdir(), "package-consumer-harness-"),
);
// A temporary directory that is a symbolic link, as the one of macOS is.
const linkedDirectory = path.join(parentDirectory, "linked");
await mkdir(path.join(parentDirectory, "real"));
await symlink(path.join(parentDirectory, "real"), linkedDirectory, "junction");

afterAll(async () => {
  await rm(parentDirectory, { force: true, recursive: true });
});

describe("the packed-consumer harness", () => {
  it("creates temporary directories by the path that a child process reports, also when the system's temporary directory is a symbolic link", async () => {
    vi.stubEnv("TMPDIR", linkedDirectory);

    const directory = await createTemporaryDirectory("consumer-");
    const { stdout } = await runCommand(
      process.execPath,
      ["--eval", "process.stdout.write(process.cwd())"],
      directory,
    );

    expect(stdout).toBe(directory);
    // The directory is in the temporary directory that the test set, so it went through the link.
    expect(path.dirname(directory)).toBe(await realpath(linkedDirectory));
  });

  it("returns the exit code and the output of a failed command", async () => {
    await expect(
      runCommand(
        process.execPath,
        [
          "--eval",
          "process.stdout.write('out'); process.stderr.write('error'); process.exitCode = 3;",
        ],
        parentDirectory,
      ),
    ).resolves.toEqual({ exitCode: 3, stderr: "error", stdout: "out" });
  });

  it("reads a command that cannot start as an exit code of NaN", async () => {
    const result = await runCommand(
      path.join(parentDirectory, "missing-command"),
      [],
      parentDirectory,
    );

    expect(result.exitCode).toBeNaN();
    expect(result.stderr).toContain("ENOENT");
  });

  it("extracts the fenced blocks of one language", () => {
    const markdown = [
      "# Title",
      "",
      "```ts",
      'const first = "first";',
      "```",
      "",
      "```bash",
      "npm install",
      "```",
      "",
      "```ts",
      'const second = "second";',
      "",
      "console.log(second);",
      "```",
      "",
    ].join("\n");

    expect(codeBlocks(markdown, "ts")).toEqual([
      'const first = "first";\n',
      'const second = "second";\n\nconsole.log(second);\n',
    ]);
    expect(codeBlocks(markdown, "js")).toEqual([]);
  });
});
