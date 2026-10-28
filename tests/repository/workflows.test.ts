import { readdir, readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { parse } from "yaml";

import packageJson from "../../package.json" with { type: "json" };

type Entry = {
  readonly file: string;
  readonly text: string;
  readonly workflow: Workflow;
};
// A job's keys use YAML names, such as `timeout-minutes`, so the tests read them by name.
type Job = Readonly<Record<string, unknown>>;
type Workflow = {
  readonly jobs: Readonly<Record<string, Job>>;
  readonly on: unknown;

  readonly permissions?: unknown;
};

const directory = new URL("../../.github/workflows/", import.meta.url);
const files = await readdir(directory);
const entries: readonly Entry[] = await Promise.all(
  files
    .filter((file) => {
      return file.endsWith(".yml");
    })
    .map(async (file): Promise<Entry> => {
      const text = await readFile(new URL(file, directory), "utf8");
      // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- The tests below check the parts of this shape that they read.
      return { file, text, workflow: parse(text) as Workflow };
    }),
);
// The `owner/name` of this repository, which the workflows must not name.
const repository = packageJson.repository.url
  .replace(/^git\+https:\/\/github\.com\//u, "")
  .replace(/\.git$/u, "");

const jobsOf = (file: string): ReadonlyMap<string, Job> => {
  return new Map(
    Object.entries(
      entries.find((entry) => {
        return entry.file === file;
      })?.workflow.jobs ?? {},
    ),
  );
};

// The events of a workflow's `on`, which can be a string, a list, or a map.
const eventsOf = (on: unknown): readonly string[] => {
  if (typeof on === "string") {
    return [on];
  }
  return Array.isArray(on) ? on.map(String) : Object.keys(on ?? {});
};

describe("the workflows", () => {
  it("include CI", () => {
    expect(files).toContain("ci.yml");
  });

  it.each(entries)("$file grants no permissions at the top", ({ workflow }) => {
    expect(workflow.permissions).toEqual({});
  });

  it.each(entries)(
    "$file gives every job a name, a timeout, and its own permissions",
    ({ workflow }) => {
      expect(
        Object.entries(workflow.jobs)
          .filter(([, job]) => {
            return (
              typeof job.name !== "string" ||
              typeof job["timeout-minutes"] !== "number" ||
              typeof job.permissions !== "object"
            );
          })
          .map(([id]) => {
            return id;
          }),
      ).toEqual([]);
    },
  );

  it.each(entries)(
    "$file runs no pull request code with the base repository's secrets",
    ({ workflow }) => {
      expect(eventsOf(workflow.on)).not.toContain("pull_request_target");
      expect(eventsOf(workflow.on)).not.toContain("workflow_run");
    },
  );

  it.each(entries)(
    "$file names no repository, so that it is the same in every repository",
    ({ text }) => {
      expect(text).not.toMatch(/github\.repository\s*==/u);
      expect(text).not.toContain(repository);
    },
  );
});

describe("the CI result gate", () => {
  const jobs = jobsOf("ci.yml");
  const result = jobs.get("result");
  const checks = jobs
    .keys()
    .filter((id) => {
      return id !== "result";
    })
    .toArray();

  it("needs every other CI job", () => {
    expect(result?.needs).toBeInstanceOf(Array);
    expect(new Set(Array.isArray(result?.needs) ? result.needs : [])).toEqual(
      new Set(checks),
    );
  });

  it("lets only Dependency Review skip", () => {
    expect(
      checks.filter((id) => {
        return typeof jobs.get(id)?.if === "string";
      }),
    ).toEqual(["dependency-review"]);
    expect(JSON.stringify(result?.steps)).toContain(
      String.raw`.key != \"dependency-review\"`,
    );
  });
});

describe("the release workflows", () => {
  it.each([
    { file: "publish.yml", job: "verify" },
    { file: "release-please.yml", job: "release-please" },
  ])("skip the template repository in $file", ({ file, job }) => {
    expect(jobsOf(file).get(job)?.if).toContain(
      "!github.event.repository.is_template",
    );
  });
});
