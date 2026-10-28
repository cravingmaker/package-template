import { describe, expect, it } from "vitest";

import { parseScenario, peerSpecs } from "./peers.ts";

const manifest = {
  devDependencies: { eslint: "10.12.0", typescript: "6.0.3" },
  peerDependencies: { eslint: ">=10.4.0 <11" },
};

describe("peer scenarios", () => {
  it("reads an unset variable as the current scenario", () => {
    const environment: Readonly<Record<string, string | undefined>> = {};

    expect(parseScenario(environment.PACKAGE_PEER_SCENARIO)).toBe("current");
  });

  it.each(["current", "minimum"])("reads %s as its scenario", (value) => {
    expect(parseScenario(value)).toBe(value);
  });

  it("rejects an unknown scenario", () => {
    expect(() => {
      return parseScenario("newest");
    }).toThrow("Unknown peer scenario: newest");
  });

  it("installs the tested version of each peer in the current scenario", () => {
    expect(peerSpecs(manifest, "current")).toEqual(["eslint@10.12.0"]);
  });

  it("installs the floor of each peer range in the minimum scenario", () => {
    expect(peerSpecs(manifest, "minimum")).toEqual(["eslint@10.4.0"]);
  });

  it("installs no peers for a package without peers", () => {
    expect(peerSpecs({ devDependencies: {} }, "minimum")).toEqual([]);
  });

  it.each(["^10.4.0", "10.x", "*", "<11"])(
    "rejects the range %s, which has no explicit floor",
    (range) => {
      expect(() => {
        return peerSpecs(
          { ...manifest, peerDependencies: { eslint: range } },
          "current",
        );
      }).toThrow("Declare an explicit floor for the peer eslint");
    },
  );

  it("rejects a peer that is not a development dependency", () => {
    expect(() => {
      return peerSpecs(
        { devDependencies: {}, peerDependencies: { eslint: ">=10.4.0 <11" } },
        "current",
      );
    }).toThrow("Add the peer eslint to devDependencies");
  });
});
