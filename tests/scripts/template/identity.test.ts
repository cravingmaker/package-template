import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import prettier from "prettier";
import { describe, expect, it, onTestFinished } from "vitest";

import {
  initialize,
  removeTemplateBlocks,
} from "../../../scripts/template/lib/identity.ts";
import { createTemporaryDirectory } from "../../support/consumer.ts";

const projectDirectory = fileURLToPath(new URL("../../..", import.meta.url));
// The files that `initialize()` changes, which each test copies from this repository.
const files = [
  "AGENTS.md",
  "CONTRIBUTING.md",
  "README.md",
  "ROADMAP.md",
  "knip.json",
  "package-lock.json",
  "package.json",
];
const identity = {
  description: "Formats dates for Craving Maker's projects.",
  name: "date-format",
};
const lockfileRoot = "";
// eslint-disable-next-line unicorn/string-content -- An HTML comment ends with `-->`.
const block = "<!-- template:start -->\n\nTemplate.\n\n<!-- template:end -->";

/*
A copy of this repository's files, with stand-ins for the template tools, in a temporary directory whose name starts with `prefix`. The test removes it when it finishes.
*/
const copyTemplate = async (prefix: string): Promise<string> => {
  const workspace = await createTemporaryDirectory(prefix);
  onTestFinished(async () => {
    await rm(workspace, { force: true, recursive: true });
  });
  await Promise.all(
    files.map(async (file) => {
      await cp(path.join(projectDirectory, file), path.join(workspace, file));
    }),
  );
  await Promise.all(
    ["scripts/template", "tests/scripts/template"].map(async (tools) => {
      await mkdir(path.join(workspace, tools), { recursive: true });
      await writeFile(path.join(workspace, tools, "tool.ts"), "export {};\n");
    }),
  );
  return workspace;
};

// Initializes a new copy of the template as `initialized`, and returns its directory.
const initializeCopy = async (
  initialized: Readonly<typeof identity>,
): Promise<string> => {
  const workspace = await copyTemplate("package-template-init-");
  await initialize(pathToFileURL(`${workspace}/`), initialized);
  return workspace;
};

const readText = async (workspace: string, file: string): Promise<string> => {
  return await readFile(path.join(workspace, file), "utf8");
};

describe("the removal of template blocks", () => {
  it("removes each block with its markers", () => {
    expect(removeTemplateBlocks(`Before.\n\n${block}\n\nAfter.\n`)).toBe(
      "Before.\n\nAfter.\n",
    );
  });

  it("ends the text with one newline when a block ends it", () => {
    expect(removeTemplateBlocks(`Before.\n\n${block}\n`)).toBe("Before.\n");
  });

  it("fails on a block without an end", () => {
    expect(() => {
      return removeTemplateBlocks(block.split("\n\n<!--", 1)[0] ?? "");
    }).toThrow("A template block has no end marker.");
  });
});

describe("the initialization of a new package", () => {
  it("renames the package and its links, and sets its description", async () => {
    const workspace = await initializeCopy(identity);
    const manifest: unknown = JSON.parse(
      await readText(workspace, "package.json"),
    );
    const lockfile: unknown = JSON.parse(
      await readText(workspace, "package-lock.json"),
    );

    expect(manifest).toMatchObject({
      bugs: { url: "https://github.com/cravingmaker/date-format/issues" },
      description: identity.description,
      homepage: "https://github.com/cravingmaker/date-format#readme",
      keywords: ["cravingmaker", "typescript"],
      name: "@cravingmaker/date-format",
      repository: {
        url: "git+https://github.com/cravingmaker/date-format.git",
      },
    });
    expect(lockfile).toMatchObject({
      name: "@cravingmaker/date-format",
      packages: { [lockfileRoot]: { name: "@cravingmaker/date-format" } },
    });
  });

  it("writes a README for the package, without the template section", async () => {
    const workspace = await initializeCopy(identity);
    const readme = await readText(workspace, "README.md");

    expect(readme).toMatch(
      /^# @cravingmaker\/date-format\n{2}\[!\[npm version\]/u,
    );
    expect(readme).toContain(
      "(https://img.shields.io/npm/v/%40cravingmaker%2Fdate-format)",
    );
    expect(readme).toContain(`\n\n${identity.description}\n\n`);
    expect(readme).toContain('from "@cravingmaker/date-format"');
    expect(readme).not.toContain("template:");
    expect(readme).not.toContain("package-template");
  });
});

describe("the cleanup of a new package", () => {
  it("removes the template tools, their Knip entry, and the template blocks of AGENTS.md and ROADMAP.md", async () => {
    const workspace = await initializeCopy(identity);

    await expect(
      stat(path.join(workspace, "scripts/template")),
    ).rejects.toThrow("ENOENT");
    await expect(
      stat(path.join(workspace, "tests/scripts/template")),
    ).rejects.toThrow("ENOENT");
    expect(await readText(workspace, "knip.json")).not.toContain("entry");
    expect(await readText(workspace, "AGENTS.md")).not.toContain("template:");
    expect(await readText(workspace, "ROADMAP.md")).not.toContain("template:");
  });

  it("writes files that Prettier leaves unchanged", async () => {
    const workspace = await initializeCopy(identity);
    const unformatted = await Promise.all(
      files
        .filter((file) => {
          return file !== "package-lock.json";
        })
        .map(async (file) => {
          const filepath = path.join(projectDirectory, file);
          const options = await prettier.resolveConfig(filepath);
          const isFormatted = await prettier.check(
            await readText(workspace, file),
            { ...options, filepath },
          );
          return isFormatted ? [] : [file];
        }),
    );

    expect(unformatted.flat()).toEqual([]);
  });
});

describe("the validation of a new package", () => {
  it.each([
    {
      identity: { ...identity, name: "Date Format" },
      reason: "an invalid name",
    },
    { identity: { ...identity, description: " " }, reason: "no description" },
    {
      identity: { ...identity, description: "Two\nlines." },
      reason: "a description of two lines",
    },
  ])("rejects $reason and changes nothing", async ({ identity: invalid }) => {
    const workspace = await copyTemplate("package-template-invalid-");
    const before = await readText(workspace, "package.json");

    await expect(
      initialize(pathToFileURL(`${workspace}/`), invalid),
    ).rejects.toThrow("Give a lowercase package name");
    expect(await readText(workspace, "package.json")).toBe(before);
  });

  it("accepts a name with dots and digits", async () => {
    const workspace = await initializeCopy({
      ...identity,
      name: "date.format2",
    });
    const manifest: unknown = JSON.parse(
      await readText(workspace, "package.json"),
    );

    expect(manifest).toMatchObject({ name: "@cravingmaker/date.format2" });
  });

  it("refuses a copy that is already initialized", async () => {
    const workspace = await initializeCopy(identity);

    await expect(
      initialize(pathToFileURL(`${workspace}/`), identity),
    ).rejects.toThrow("already initialized");
  });
});
