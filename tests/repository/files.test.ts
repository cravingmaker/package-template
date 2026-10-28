import { access } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const isPresent = async (file: string): Promise<boolean> => {
  try {
    await access(new URL(`../../${file}`, import.meta.url));
    return true;
  } catch {
    return false;
  }
};

describe("the repository files", () => {
  it("give agents their instructions in AGENTS.md", async () => {
    await expect(isPresent("AGENTS.md")).resolves.toBe(true);
  });

  it.each(["CLAUDE.md", "CLAUDE.local.md"])(
    "have no %s, so that AGENTS.md stays the only agent instructions",
    async (file) => {
      await expect(isPresent(file)).resolves.toBe(false);
    },
  );

  it.each([
    "CODE_OF_CONDUCT.md",
    "SECURITY.md",
    "SUPPORT.md",
    ".github/FUNDING.yml",
    ".github/ISSUE_TEMPLATE",
    ".github/PULL_REQUEST_TEMPLATE.md",
    ".github/pull_request_template.md",
  ])(
    "have no %s, which the account defaults of cravingmaker/.github provide",
    async (file) => {
      await expect(isPresent(file)).resolves.toBe(false);
    },
  );
});
