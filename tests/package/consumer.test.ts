import { readFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { afterAll, describe, expect, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import {
  codeBlocks,
  createConsumer,
  removeConsumer,
  runConsumer,
  typeCheckConsumer,
} from "../support/consumer.ts";

const readme = await readFile(
  new URL("../../README.md", import.meta.url),
  "utf8",
);
// Each TypeScript block of the README is a complete program, which the consumer type-checks and runs.
const examples = codeBlocks(readme, "ts");
// The output that each example prints: the comment after each `console.log()` call.
const expectedOutputs = examples.map((example) => {
  return example
    .split("\n")
    .filter((line) => {
      return line.startsWith("console.log(") && line.includes("); // ");
    })
    .map((line) => {
      return line.slice(line.lastIndexOf("); // ") + "); // ".length);
    });
});
const consumer = await createConsumer(
  new Map([
    ...examples.map((example, index): readonly [string, string] => {
      return [`readme-${String(index + 1)}.ts`, example];
    }),
    [
      "resolve.mjs",
      `console.log(import.meta.resolve(${JSON.stringify(packageJson.name)}));\n`,
    ],
    [
      "runtime.mjs",
      `import { greet } from ${JSON.stringify(packageJson.name)};\n\nconsole.log(greet("Ada"));\n`,
    ],
    [
      "types.ts",
      [
        `import { greet } from ${JSON.stringify(packageJson.name)};`,
        "",
        'const greeting: string = greet("Ada");',
        "// @ts-expect-error -- The declarations type the name as a string.",
        "greet(42);",
        "console.log(greeting);",
        "",
      ].join("\n"),
    ],
  ]),
);

afterAll(async () => {
  await removeConsumer(consumer);
});

describe("the packed package in a consumer project", () => {
  it("resolves to the installed tarball, not to this repository", async () => {
    const { stdout } = await runConsumer(consumer, "resolve.mjs");

    expect(stdout.trim()).toBe(
      pathToFileURL(
        path.join(
          consumer.directory,
          "node_modules",
          packageJson.name,
          "dist/index.mjs",
        ),
      ).href,
    );
  });

  it.each([
    { description: "the project", isOutside: false },
    { description: "an outside directory", isOutside: true },
  ])("runs from $description", async ({ isOutside }) => {
    const result = await runConsumer(
      consumer,
      "runtime.mjs",
      isOutside ? consumer.root : consumer.directory,
    );

    expect(result).toMatchObject({ exitCode: 0, stdout: "Hello, Ada!\n" });
  });

  it("type-checks with strict consumer settings, and rejects a wrong argument", async () => {
    const result = await typeCheckConsumer(consumer);

    expect(result.stdout).toBe("");
    expect(result.exitCode).toBe(0);
  });

  it("has a TypeScript example in the README", () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(
    examples.map((_example, index) => {
      return index + 1;
    }),
  )(
    "runs README example %i and prints its documented output",
    async (number) => {
      const result = await runConsumer(consumer, `readme-${String(number)}.ts`);

      expect(result.stderr).toBe("");
      expect(result.stdout.split("\n").slice(0, -1)).toEqual(
        expectedOutputs.at(number - 1),
      );
    },
  );
});
