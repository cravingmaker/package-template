import type {
  Request,
  Requester,
  Response,
} from "../../../scripts/template/lib/settings.ts";

import { setImmediate } from "node:timers/promises";

import { describe, expect, it } from "vitest";

import {
  applySettings,
  checkSettings,
  isRecord,
  isSubset,
  sharedSettings,
  topicsOf,
  valueAt,
} from "../../../scripts/template/lib/settings.ts";

type Store = {
  readonly policies: unknown[];
  readonly rulesets: Map<number, unknown>;
  readonly values: Map<string, unknown>;
};

const repository = {
  description: "An example package.",
  isTemplate: false,
  keywords: ["cravingmaker", "example"],
  packageName: "@cravingmaker/example",
  slug: "cravingmaker/example",
};
const base = "/repos/cravingmaker/example";
// The endpoints that report a feature through the status of a GET.
const statusFeatures = new Set([`${base}/vulnerability-alerts`]);
// The endpoints that turn a feature on with a PUT and report it as `enabled`.
const enabledFeatures = new Set([
  `${base}/automated-security-fixes`,
  `${base}/immutable-releases`,
  `${base}/private-vulnerability-reporting`,
]);
const missing: Response = { data: { message: "Not Found" }, status: 404 };

const found = (data: unknown): Response => {
  return { data, status: 200 };
};

/* eslint-disable functional/immutable-data, functional/no-conditional-statements -- The fake GitHub keeps what each request writes, as the REST API does. */
// The rulesets: the list, one ruleset by ID, and the creation of a ruleset.
const respondRulesets = (
  store: Store,
  request: Readonly<Request>,
): Response => {
  const id = Number(/\/rulesets\/(?<id>\d+)$/u.exec(request.path)?.groups?.id);
  if (request.method === "POST") {
    store.rulesets.set(store.rulesets.size + 1, request.body);
    return found(request.body);
  }
  if (Number.isNaN(id)) {
    return found(
      [...store.rulesets].map(([key, ruleset]) => {
        return { id: key, name: valueAt(ruleset, "name") };
      }),
    );
  }
  if (request.method === "PUT") {
    store.rulesets.set(id, request.body);
  }
  return store.rulesets.has(id) ? found(store.rulesets.get(id)) : missing;
};

// The deployment policies of an environment.
const respondPolicies = (
  store: Store,
  request: Readonly<Request>,
): Response => {
  if (request.method === "POST") {
    store.policies.push(request.body);
  }
  // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub's API names this key.
  return found({ branch_policies: store.policies });
};

// A feature whose GET answers 204 when it is on.
const respondStatus = (store: Store, request: Readonly<Request>): Response => {
  if (request.method === "PUT") {
    store.values.set(request.path, true);
  }
  return store.values.has(request.path) ? { data: {}, status: 204 } : missing;
};

// A GET, a POST that creates a value under its path, or a PATCH of a variable that does not exist.
const respondLookup = (
  store: Store,
  request: Readonly<Request>,
): Response | false => {
  const { body, method, path } = request;
  if (method === "GET") {
    return store.values.has(path) ? found(store.values.get(path)) : missing;
  }
  if (method === "POST") {
    store.values.set(`${path}/${String(valueAt(body, "name"))}`, body);
    return { data: body, status: 201 };
  }
  return (
    method === "PATCH" &&
    path.includes("/variables/") &&
    !store.values.has(path) &&
    missing
  );
};

// Any other endpoint, which keeps the body of the last PUT and merges the body of each PATCH.
const respondValue = (store: Store, request: Readonly<Request>): Response => {
  const lookup = respondLookup(store, request);
  if (lookup !== false) {
    return lookup;
  }
  const { body, method, path } = request;
  const current = store.values.get(path);
  store.values.set(
    path,
    enabledFeatures.has(path)
      ? { enabled: true }
      : {
          ...(method === "PATCH" && isRecord(current) && current),
          ...(isRecord(body) && body),
        },
  );
  return found(store.values.get(path));
};
/* eslint-enable functional/immutable-data, functional/no-conditional-statements -- The rest of the file keeps no state. */

const respond = (
  store: Readonly<Store>,
  request: Readonly<Request>,
): Response => {
  if (request.path.includes("/rulesets")) {
    return respondRulesets(store, request);
  }
  if (request.path.endsWith("/deployment-branch-policies")) {
    return respondPolicies(store, request);
  }
  return statusFeatures.has(request.path)
    ? respondStatus(store, request)
    : respondValue(store, request);
};

// A GitHub repository in memory with `description`. A path that nothing wrote answers 404.
const createFakeGitHub = (description: string): Requester => {
  const store: Store = {
    policies: [],
    rulesets: new Map(),
    values: new Map([[base, { description }]]),
  };

  return async (request) => {
    // Answer on a later turn of the event loop, as the network does.
    await setImmediate();
    return respond(store, request);
  };
};

// A repository that answers every change with 403, as GitHub does without admin rights.
const rejectingGitHub: Requester = async ({ method }) => {
  await setImmediate();
  return method === "GET"
    ? { data: {}, status: 200 }
    : { data: { message: "Must have admin rights" }, status: 403 };
};

const settingNames = (isTemplate: boolean): readonly string[] => {
  return sharedSettings({ ...repository, isTemplate }).map((setting) => {
    return setting.name;
  });
};

describe("the comparison of settings", () => {
  it.each([
    { actual: { a: 1, b: 2 }, expected: { a: 1 }, isMatch: true },
    { actual: { a: { b: 1, c: 2 } }, expected: { a: { b: 1 } }, isMatch: true },
    { actual: { a: 2 }, expected: { a: 1 }, isMatch: false },
    { actual: {}, expected: { a: 1 }, isMatch: false },
    { actual: [{ a: 1, b: 2 }], expected: [{ a: 1 }], isMatch: true },
    { actual: [1, 2], expected: [1], isMatch: false },
    { actual: "1", expected: 1, isMatch: false },
  ])(
    "matches $actual against $expected: $isMatch",
    ({ actual, expected, isMatch }) => {
      expect(isSubset(expected, actual)).toBe(isMatch);
    },
  );

  it("takes the topics from the keywords, without the owner's name", () => {
    expect(topicsOf(["cravingmaker", "eslint", "typescript"])).toEqual([
      "eslint",
      "typescript",
    ]);
  });

  it("leave the homepage of a template repository alone", () => {
    const [merge] = sharedSettings({ ...repository, isTemplate: true });

    expect(merge?.expected).not.toHaveProperty("homepage");
  });

  it("leave the release app out of a template repository", () => {
    expect(settingNames(false)).toContain(
      "Variable RELEASE_PLEASE_APP_CLIENT_ID",
    );
    expect(settingNames(true)).not.toContain(
      "Variable RELEASE_PLEASE_APP_CLIENT_ID",
    );
  });
});

describe("the shared settings", () => {
  it("are outdated in a new repository, and current after they are applied", async () => {
    const request = createFakeGitHub("");
    const settings = sharedSettings(repository);

    const before = await checkSettings(request, settings);
    const applied = await applySettings(request, settings);
    const after = await checkSettings(request, settings);

    expect(
      before.filter((result) => {
        return result.state === "current";
      }),
    ).toEqual([]);
    expect(
      applied.filter((result) => {
        return result.state !== "changed";
      }),
    ).toEqual([]);
    expect(
      after.filter((result) => {
        return result.state !== "current";
      }),
    ).toEqual([]);
  });

  it("change nothing in a repository that has them", async () => {
    const request = createFakeGitHub("");
    const settings = sharedSettings(repository);

    await applySettings(request, settings);
    const results = await applySettings(request, settings);

    expect(
      results.map((result) => {
        return result.state;
      }),
    ).toEqual(
      settings.map(() => {
        return "current";
      }),
    );
  });

  it("report a failed request with its status and message", async () => {
    const [result] = await applySettings(
      rejectingGitHub,
      sharedSettings(repository),
    );

    expect(result).toEqual({
      detail: "HTTP 403: Must have admin rights",
      name: "Merge settings and features",
      state: "failed",
    });
  });
});

describe("the identity of a repository", () => {
  it("comes from the package when the repository has no description and no topics", async () => {
    const request = createFakeGitHub("");

    await applySettings(request, sharedSettings(repository));

    await expect(request({ method: "GET", path: base })).resolves.toMatchObject(
      {
        data: {
          description: repository.description,
          homepage: "https://www.npmjs.com/package/@cravingmaker/example",
        },
      },
    );
    await expect(
      request({ method: "GET", path: `${base}/topics` }),
    ).resolves.toMatchObject({ data: { names: ["example"] } });
  });

  it("keeps the description that the repository has", async () => {
    const request = createFakeGitHub("Chosen by hand.");

    await applySettings(request, sharedSettings(repository));

    await expect(request({ method: "GET", path: base })).resolves.toMatchObject(
      {
        data: { description: "Chosen by hand." },
      },
    );
  });
});
