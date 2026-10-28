import { describe, expect, it } from "vitest";

import {
  blobSha,
  compareOwnedFiles,
  parseTree,
} from "../../../scripts/template/lib/drift.ts";

describe("the drift check", () => {
  it("computes the git blob SHA of a file", () => {
    const encoder = new TextEncoder();

    // `printf 'hello\n' | git hash-object --stdin`
    expect(blobSha(encoder.encode("hello\n"))).toBe(
      "ce013625030ba8dba906f756967f9e9ca394464a",
    );
  });

  it("reads the files of a tree and skips its directories", () => {
    expect(
      parseTree({
        tree: [
          { path: "scripts", sha: "1", type: "tree" },
          { path: "scripts/actionlint.ts", sha: "2", type: "blob" },
        ],
        truncated: false,
      }),
    ).toEqual(new Map([["scripts/actionlint.ts", "2"]]));
  });

  it("reports each owned file as the same, different, missing, or intended", () => {
    const local = new Map([
      [".github/workflows/scorecard.yml", "e"],
      [".github/workflows/zizmor.yml", "d"],
      ["LICENSE", "b"],
      [".nvmrc", "a"],
      ["scripts/actionlint.ts", "c"],
    ]);
    const remote = new Map([
      [".github/workflows/zizmor.yml", "changed"],
      ["LICENSE", "changed"],
      [".nvmrc", "a"],
    ]);

    expect(
      compareOwnedFiles(
        local,
        remote,
        new Set([
          ".github/workflows/scorecard.yml",
          ".github/workflows/zizmor.yml",
        ]),
      ),
    ).toEqual([
      { path: ".github/workflows/scorecard.yml", state: "intended" },
      { path: ".github/workflows/zizmor.yml", state: "intended" },
      { path: "LICENSE", state: "different" },
      { path: ".nvmrc", state: "same" },
      { path: "scripts/actionlint.ts", state: "missing" },
    ]);
  });
});
