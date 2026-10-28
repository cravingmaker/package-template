import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import packageJson from "../../package.json" with { type: "json" };
import { peerSpecs } from "../support/peers.ts";

type Dependencies = Readonly<Record<string, string>>;
type LockedPackage = {
  readonly dependencies?: Dependencies;
  readonly devDependencies?: Dependencies;
  readonly engines?: Dependencies;
  readonly integrity?: string;
  readonly link?: boolean;
  readonly name?: string;
  readonly optionalDependencies?: Dependencies;
  readonly peerDependencies?: Dependencies;
  readonly peerDependenciesMeta?: PeerMeta;
  readonly resolved?: string;
  readonly version?: string;
};
type Lockfile = {
  readonly lockfileVersion: number;
  readonly name: string;
  readonly packages: Readonly<Record<string, LockedPackage>>;
  readonly version: string;
};
type Manifest = {
  readonly devDependencies: Dependencies;
  readonly engines: Dependencies;
  readonly name: string;
  readonly version: string;

  readonly dependencies?: Dependencies;
  readonly optionalDependencies?: Dependencies;
  readonly peerDependencies?: Dependencies;
  readonly peerDependenciesMeta?: PeerMeta;
};
type PeerMeta = Readonly<Record<string, { readonly optional?: boolean }>>;

const manifest: Manifest = packageJson;
// eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion, unicorn/prefer-json-import -- A JSON import would make TypeScript infer a type for every locked package. The tests below check the parts of this shape that they read.
const lockfile = JSON.parse(
  await readFile(new URL("../../package-lock.json", import.meta.url), "utf8"),
) as Lockfile;
const lockedPackages = new Map(Object.entries(lockfile.packages));
const root = lockedPackages.get("");
const exactVersion = /^\d+\.\d+\.\d+$/u;

describe("the package manifest", () => {
  it("describes an ESM-only package of dist/ without side effects", () => {
    expect(packageJson).toMatchObject({
      files: ["dist"],
      main: "./dist/index.mjs",
      private: false,
      sideEffects: false,
      type: "module",
      types: "./dist/index.d.mts",
    });
    expect(Object.keys(packageJson.exports)).toEqual([".", "./package.json"]);
    expect(packageJson.exports["./package.json"]).toBe("./package.json");
    // TypeScript reads the first condition that matches, so `types` comes first.
    expect(Object.entries(packageJson.exports["."])).toEqual([
      ["types", "./dist/index.d.mts"],
      ["import", "./dist/index.mjs"],
      ["default", "./dist/index.mjs"],
    ]);
  });

  it("publishes publicly to the npm registry", () => {
    expect(packageJson.publishConfig).toEqual({
      access: "public",
      registry: "https://registry.npmjs.org/",
    });
  });

  it("requires a contributor npm that supports staged publishing and the install policy", () => {
    expect(packageJson.devEngines.packageManager).toEqual({
      name: "npm",
      onFail: "error",
      version: ">=11.15.0",
    });
    expect(packageJson.devEngines.runtime).toMatchObject({
      name: "node",
      onFail: "error",
    });
  });
});

describe("the dependencies", () => {
  it.each([
    { entries: manifest.dependencies, field: "dependencies" },
    { entries: manifest.devDependencies, field: "devDependencies" },
    { entries: manifest.optionalDependencies, field: "optionalDependencies" },
  ])("pin every entry of $field exactly", ({ entries }) => {
    expect(
      Object.entries(entries ?? {}).filter(([, version]) => {
        return !exactVersion.test(version);
      }),
    ).toEqual([]);
  });

  it("give every peer an explicit floor, a tested version, and metadata", () => {
    expect(() => {
      return [
        ...peerSpecs(manifest, "current"),
        ...peerSpecs(manifest, "minimum"),
      ];
    }).not.toThrow();
    expect(new Set(Object.keys(manifest.peerDependenciesMeta ?? {}))).toEqual(
      new Set(Object.keys(manifest.peerDependencies ?? {})),
    );
  });
});

describe("the lockfile", () => {
  it("is a version 3 lockfile of this package", () => {
    expect(lockfile).toMatchObject({
      lockfileVersion: 3,
      name: manifest.name,
      version: manifest.version,
    });
    expect(root).toMatchObject({
      name: manifest.name,
      version: manifest.version,
    });
  });

  it.each([
    {
      declared: manifest.dependencies,
      field: "dependencies",
      locked: root?.dependencies,
    },
    {
      declared: manifest.devDependencies,
      field: "devDependencies",
      locked: root?.devDependencies,
    },
    { declared: manifest.engines, field: "engines", locked: root?.engines },
    {
      declared: manifest.optionalDependencies,
      field: "optionalDependencies",
      locked: root?.optionalDependencies,
    },
    {
      declared: manifest.peerDependencies,
      field: "peerDependencies",
      locked: root?.peerDependencies,
    },
    {
      declared: manifest.peerDependenciesMeta,
      field: "peerDependenciesMeta",
      locked: root?.peerDependenciesMeta,
    },
  ])("records the $field of package.json", ({ declared, locked }) => {
    expect(locked ?? {}).toEqual(declared ?? {});
  });
});

describe("the locked packages", () => {
  it("come from the npm registry with an integrity hash", () => {
    expect(
      [...lockedPackages]
        .filter(([location, locked]) => {
          return (
            location !== "" &&
            (locked.link === true ||
              typeof locked.integrity !== "string" ||
              !(locked.resolved ?? "").startsWith(
                "https://registry.npmjs.org/",
              ))
          );
        })
        .map(([location]) => {
          return location;
        }),
    ).toEqual([]);
  });
});
