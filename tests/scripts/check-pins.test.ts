import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  compareVersions,
  findOutdated,
  newestInLine,
  parseChecksums,
  parseVersion,
  readSetupScript,
  readZizmorVersion,
} from "../../scripts/pins/versions.ts";

const readText = async (file: string): Promise<string> => {
  return await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
};

describe("the pin comparisons", () => {
  it.each([
    ["v26.12.1", [26, 12, 1]],
    ["1.7.12", [1, 7, 12]],
  ])("read %s as its release numbers", (version, parts) => {
    expect(parseVersion(version)).toEqual(parts);
  });

  it.each(["26", "26.12", "26.12.1-rc.1", "latest"])(
    "reject %s, which is not a release version",
    (version) => {
      expect(() => {
        return parseVersion(version);
      }).toThrow("Not a release version");
    },
  );

  it.each([
    ["1.7.12", "1.7.9", 1],
    ["1.7.9", "1.10.0", -1],
    ["v26.12.1", "26.12.1", 0],
  ])("compare %s with %s by number", (left, right, sign) => {
    expect(Math.sign(compareVersions(left, right))).toBe(sign);
  });

  it("find the newest release of one major line", () => {
    expect(
      newestInLine(["v27.0.0", "v26.9.0", "v26.12.1", "v24.22.1"], 26),
    ).toBe("v26.12.1");
    expect(newestInLine(["v24.22.1"], 26)).toBeUndefined();
  });

  it("report only the pins behind their newest release", () => {
    const pins = [
      { current: "1.7.12", name: "current", newest: "1.7.12" },
      { current: "1.7.11", name: "behind", newest: "1.7.12" },
      { current: "1.8.0", name: "ahead", newest: "1.7.12" },
    ];

    expect(findOutdated(pins)).toEqual([pins[1]]);
  });

  it("key the checksums of SHASUMS256.txt by file name", () => {
    const checksums = parseChecksums(
      "abc123  node-v26.12.1-linux-x64.tar.gz\ndef456  node-v26.12.1-linux-arm64.tar.gz\n\nmalformed line here\n",
    );

    expect([...checksums]).toEqual([
      ["node-v26.12.1-linux-x64.tar.gz", "abc123"],
      ["node-v26.12.1-linux-arm64.tar.gz", "def456"],
    ]);
  });
});

describe("the pins of this repository", () => {
  it("include the Node.js release and both archive checksums of the cloud setup script", async () => {
    const [contributing, nvmrc] = await Promise.all([
      readText("CONTRIBUTING.md"),
      readText(".nvmrc"),
    ]);
    const setupScript = readSetupScript(contributing);

    expect(setupScript.version).toBe(nvmrc.trim());
    expect(Object.keys(setupScript.checksums)).toEqual([
      `node-v${setupScript.version}-linux-arm64.tar.gz`,
      `node-v${setupScript.version}-linux-x64.tar.gz`,
    ]);
    expect(Object.values(setupScript.checksums)).toEqual([
      expect.stringMatching(/^[\da-f]{64}$/u),
      expect.stringMatching(/^[\da-f]{64}$/u),
    ]);
  });

  it("include an exact zizmor version", async () => {
    expect(
      readZizmorVersion(await readText(".github/workflows/zizmor.yml")),
    ).toMatch(/^\d+\.\d+\.\d+$/u);
  });
});
