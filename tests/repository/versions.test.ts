import { readFile } from "node:fs/promises";

import ts from "typescript";
import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import packageJson from "../../package.json" with { type: "json" };
import {
  compareVersions,
  parseVersion,
  readSetupScript,
} from "../../scripts/pins/versions.ts";

// The matrix keys use YAML names, such as `node-version`, so the test reads them by name.
type CiWorkflow = {
  readonly jobs: {
    readonly test: {
      readonly strategy: {
        readonly matrix: Readonly<Record<string, readonly unknown[]>>;
      };
    };
  };
};
type Tsconfig = {
  readonly compilerOptions: {
    readonly lib: readonly string[];
    readonly target: string;
  };
};

// The compiler target and libraries that describe each minimum Node.js major exactly. When the floor moves to a new major, add its row after running the code on that floor.
const compilerTargets = new Map([
  [
    24,
    {
      lib: ["ES2025", "ESNext.Array", "ESNext.Disposable", "ESNext.Error"],
      target: "ES2025",
    },
  ],
]);

const readText = async (file: string): Promise<string> => {
  return await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
};

const [nvmrcText, readme, contributing, tsconfigText, ciText] =
  await Promise.all([
    readText(".nvmrc"),
    readText("README.md"),
    readText("CONTRIBUTING.md"),
    readText("tsconfig.json"),
    readText(".github/workflows/ci.yml"),
  ]);
const nvmrc = nvmrcText.trim();
const floor = packageJson.engines.node.replace(/^>=/u, "");
const contributorFloor = packageJson.devEngines.runtime.version.replace(
  /^>=/u,
  "",
);
const [floorMajor] = parseVersion(floor);
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- The tests below check the parts of this shape that they read.
const ci = parse(ciText) as CiWorkflow;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- The tests below check the parts of this shape that they read.
const tsconfig = ts.parseConfigFileTextToJson("tsconfig.json", tsconfigText)
  .config as Tsconfig;

describe("the Node.js versions", () => {
  it("declare exact floors", () => {
    expect(packageJson.engines.node).toMatch(/^>=\d+\.\d+\.\d+$/u);
    expect(packageJson.devEngines.runtime.version).toMatch(
      /^>=\d+\.\d+\.\d+$/u,
    );
  });

  it("let contributors develop on the consumer floor or later", () => {
    expect(compareVersions(floor, contributorFloor)).toBeLessThanOrEqual(0);
  });

  it("pin an exact contributor release in .nvmrc that satisfies devEngines", () => {
    expect(nvmrc).toMatch(/^\d+\.\d+\.\d+$/u);
    expect(compareVersions(nvmrc, contributorFloor)).toBeGreaterThanOrEqual(0);
  });

  it("start the CI matrix at the consumer floor and include the floor's line and the contributor's line", () => {
    const matrix = (ci.jobs.test.strategy.matrix["node-version"] ?? []).map(
      String,
    );

    expect(matrix.at(0)).toBe(floor);
    expect(matrix).toContain(String(floorMajor));
    expect(matrix).toContain(String(parseVersion(nvmrc)[0]));
  });

  it("name the consumer floor in the README's requirements", () => {
    const requirements = readme.split(/^## /mu).find((section) => {
      return section.startsWith("Requirements\n");
    });

    expect(requirements).toContain(`Node.js ${floor} or later`);
  });

  it("type the code with the Node.js types of the floor's major", () => {
    expect(parseVersion(packageJson.devDependencies["@types/node"])[0]).toBe(
      floorMajor,
    );
  });

  it("install the .nvmrc release in the cloud setup script of CONTRIBUTING.md", () => {
    expect(readSetupScript(contributing).version).toBe(nvmrc);
  });

  it("compile for exactly the floor", () => {
    expect(compilerTargets.has(floorMajor ?? 0)).toBe(true);
    expect(tsconfig.compilerOptions).toMatchObject(
      compilerTargets.get(floorMajor ?? 0) ?? {},
    );
  });
});
