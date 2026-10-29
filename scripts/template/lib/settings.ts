/**
 * The repository settings that Craving Maker's package repositories share. Each setting reads its current value from the GitHub REST API, states the value that it must have, and sends the requests that apply it.
 */

import protectMain from "../rulesets/protect-main.json" with { type: "json" };
import protectReleaseTags from "../rulesets/protect-release-tags.json" with { type: "json" };
import settings from "../settings.json" with { type: "json" };

type Method = "GET" | "PATCH" | "POST" | "PUT";
type Operations = {
  // Sends the requests that give the setting its expected value, and returns their responses.
  readonly apply: (request: Requester) => Promise<readonly Response[]>;
  // The current value, in the shape of the expected value.
  readonly read: (request: Requester) => Promise<unknown>;
};
type Repository = {
  readonly description: string;
  readonly isTemplate: boolean;
  readonly keywords: readonly string[];
  // The npm package, such as `@cravingmaker/eslint-config`, whose page is the homepage.
  readonly packageName: string;
  // `owner/name`.
  readonly slug: string;
};
type Request = {
  readonly method: Method;
  readonly path: string;

  // The media type of the response, which is GitHub's JSON by default.
  readonly accept?: string;
  readonly body?: unknown;
};
type Requester = (request: Readonly<Request>) => Promise<Response>;
type Response = {
  readonly data: unknown;
  readonly status: number;
};
type Result = {
  readonly name: string;
  readonly state: "changed" | "current" | "failed" | "outdated" | "pending";

  readonly detail?: string;
};
type Setting = {
  // Every key of an object, and every item of a list, that the current value must have.
  readonly expected: unknown;
  readonly name: string;
  readonly operations: Operations;
};

const variableName = "RELEASE_PLEASE_APP_CLIENT_ID";

const isRecord = (
  value: unknown,
): value is Readonly<Record<string, unknown>> => {
  return typeof value === "object" && value !== null && !Array.isArray(value);
};

/**
 * The value of `key` in `value`, which is nothing when `value` is not an object.
 */
// eslint-disable-next-line @typescript-eslint/promise-function-async -- The value comes from parsed JSON, which holds no promise.
const valueAt = (value: unknown, key: string): unknown => {
  const entries = new Map(Object.entries(isRecord(value) ? value : {}));
  return entries.get(key);
};

/**
 * Whether `actual` has every key of `expected`, recursively, with the same values. A list must have the same length as the expected list.
 */
const isSubset = (expected: unknown, actual: unknown): boolean => {
  if (Array.isArray(expected)) {
    return (
      Array.isArray(actual) &&
      expected.length === actual.length &&
      expected.every((item: unknown, index) => {
        return isSubset(item, actual.at(index));
      })
    );
  }
  if (isRecord(expected)) {
    return (
      isRecord(actual) &&
      Object.entries(expected).every(([key, value]) => {
        return isSubset(value, valueAt(actual, key));
      })
    );
  }
  return Object.is(expected, actual);
};

/**
 * The topics for the `keywords` of a package: every keyword but the owner's name.
 */
const topicsOf = (keywords: readonly string[]): readonly string[] => {
  return keywords.filter((keyword) => {
    return keyword !== "cravingmaker";
  });
};

// The data of a GET of `path`.
const readData = async (request: Requester, path: string): Promise<unknown> => {
  const response = await request({ method: "GET", path });
  return response.data;
};

// A setting that a GET of `path` reads, and that one request with `method` sends unchanged.
const simpleSetting = (
  name: string,
  path: string,
  method: Method,
  expected: unknown,
): Setting => {
  return {
    expected,
    name,
    operations: {
      apply: async (request) => {
        return [await request({ body: expected, method, path })];
      },
      read: async (request) => {
        return await readData(request, path);
      },
    },
  };
};

// A feature that a PUT of `path` turns on, and whose GET reports `enabled`.
const featureSetting = (name: string, path: string): Setting => {
  return {
    expected: { enabled: true },
    name,
    operations: {
      apply: async (request) => {
        return [await request({ method: "PUT", path })];
      },
      read: async (request) => {
        return await readData(request, path);
      },
    },
  };
};

// The ruleset of `name`, with its rules in a stable order, or an empty object when the repository has none.
const readRuleset = async (
  request: Requester,
  base: string,
  name: string,
): Promise<Readonly<Record<string, unknown>>> => {
  const list = await readData(
    request,
    `${base}/rulesets?includes_parents=false&per_page=100`,
  );
  const rulesets: readonly unknown[] = Array.isArray(list) ? list : [];
  const id = valueAt(
    rulesets.find((ruleset) => {
      return valueAt(ruleset, "name") === name;
    }),
    "id",
  );
  if (typeof id !== "number") {
    return {};
  }
  const ruleset = await readData(request, `${base}/rulesets/${String(id)}`);
  const rules = valueAt(ruleset, "rules");
  return {
    ...(isRecord(ruleset) && ruleset),
    rules: (Array.isArray(rules) ? rules : []).toSorted(
      (left: unknown, right: unknown) => {
        return String(valueAt(left, "type")).localeCompare(
          String(valueAt(right, "type")),
        );
      },
    ),
  };
};

// A ruleset that `definition` describes, created when it is missing and replaced when it differs.
const rulesetSetting = (
  base: string,
  definition: Readonly<Record<string, unknown>>,
): Setting => {
  const name = String(valueAt(definition, "name"));
  return {
    expected: definition,
    name: `Ruleset "${name}"`,
    operations: {
      apply: async (request) => {
        const current = await readRuleset(request, base, name);
        const id = valueAt(current, "id");
        const isExisting = typeof id === "number";
        return [
          await request({
            body: definition,
            method: isExisting ? "PUT" : "POST",
            path: isExisting
              ? `${base}/rulesets/${String(id)}`
              : `${base}/rulesets`,
          }),
        ];
      },
      read: async (request) => {
        return await readRuleset(request, base, name);
      },
    },
  };
};

// The deployment policies of the environment at `path`, by name and type.
const readPolicies = async (
  request: Requester,
  path: string,
): Promise<readonly unknown[]> => {
  const policies = valueAt(
    await readData(request, `${path}/deployment-branch-policies`),
    "branch_policies",
  );
  return (Array.isArray(policies) ? policies : []).map((policy: unknown) => {
    return { name: valueAt(policy, "name"), type: valueAt(policy, "type") };
  });
};

// The `npm` environment, which only `v*` tags can deploy to.
const environmentSetting = (base: string): Setting => {
  const path = `${base}/environments/npm`;
  return {
    expected: {
      environment: settings.environment,
      policies: [settings.environmentPolicy],
    },
    name: 'Environment "npm" for v* tags',
    operations: {
      apply: async (request) => {
        const environment = await request({
          body: settings.environment,
          method: "PUT",
          path,
        });
        const policies = await readPolicies(request, path);
        return isSubset([settings.environmentPolicy], policies)
          ? [environment]
          : [
              environment,
              await request({
                body: settings.environmentPolicy,
                method: "POST",
                path: `${path}/deployment-branch-policies`,
              }),
            ];
      },
      read: async (request) => {
        return {
          environment: await readData(request, path),
          policies: await readPolicies(request, path),
        };
      },
    },
  };
};

// The public client ID of the release app, which the Release Please workflow reads.
const variableSetting = (base: string): Setting => {
  const path = `${base}/actions/variables/${variableName}`;
  const value = settings.releaseApp.clientId;
  return {
    expected: { value },
    name: `Variable ${variableName}`,
    operations: {
      apply: async (request) => {
        const updated = await request({
          body: { value },
          method: "PATCH",
          path,
        });
        return [
          updated.status === 404
            ? await request({
                body: { name: variableName, value },
                method: "POST",
                path: `${base}/actions/variables`,
              })
            : updated,
        ];
      },
      read: async (request) => {
        return await readData(request, path);
      },
    },
  };
};

// A value that is the repository's own, such as its description: set from the package when the repository has none.
const identitySetting = (
  name: string,
  write: Readonly<Request>,
  isMissing: (current: unknown) => boolean,
): Setting => {
  return {
    expected: true,
    name,
    operations: {
      apply: async (request) => {
        return isMissing(await readData(request, write.path))
          ? [await request(write)]
          : [];
      },
      read: async (request) => {
        return !isMissing(await readData(request, write.path));
      },
    },
  };
};

// The merge settings, the links, and the description and topics of the package.
const repositorySettings = (
  base: string,
  repository: Readonly<Repository>,
): readonly Setting[] => {
  return [
    // A template is never published, so it has no npm page for a homepage.
    simpleSetting("Merge settings and features", base, "PATCH", {
      ...settings.repository,
      ...(!repository.isTemplate && {
        homepage: `https://www.npmjs.com/package/${repository.packageName}`,
      }),
    }),
    identitySetting(
      "Description",
      {
        body: { description: repository.description },
        method: "PATCH",
        path: base,
      },
      (current) => {
        const description = valueAt(current, "description");
        return description === "" || typeof description !== "string";
      },
    ),
    identitySetting(
      "Topics",
      {
        body: { names: topicsOf(repository.keywords) },
        method: "PUT",
        path: `${base}/topics`,
      },
      (current) => {
        const names = valueAt(current, "names");
        return !Array.isArray(names) || names.length === 0;
      },
    ),
  ];
};

// Secret scanning, vulnerability reports, Dependabot, and CodeQL.
const securitySettings = (base: string): readonly Setting[] => {
  const alerts = `${base}/vulnerability-alerts`;
  return [
    simpleSetting(
      "Secret scanning and push protection",
      base,
      "PATCH",
      settings.securityAndAnalysis,
    ),
    featureSetting(
      "Private vulnerability reporting",
      `${base}/private-vulnerability-reporting`,
    ),
    {
      // The endpoint answers 204 when the alerts are on, and 404 when they are off.
      expected: 204,
      name: "Dependabot alerts",
      operations: {
        apply: async (request) => {
          return [await request({ method: "PUT", path: alerts })];
        },
        read: async (request) => {
          const response = await request({ method: "GET", path: alerts });
          return response.status;
        },
      },
    },
    featureSetting(
      "Dependabot security updates",
      `${base}/automated-security-fixes`,
    ),
    simpleSetting(
      "CodeQL default setup with the extended suite",
      `${base}/code-scanning/default-setup`,
      "PATCH",
      settings.codeScanning,
    ),
  ];
};

// The Actions policy, the workflow token, and the approval of outside contributors.
const actionsSettings = (base: string): readonly Setting[] => {
  return [
    simpleSetting(
      "Actions pinned to full commit SHAs",
      `${base}/actions/permissions`,
      "PUT",
      settings.actions,
    ),
    simpleSetting(
      "Read-only workflow token",
      `${base}/actions/permissions/workflow`,
      "PUT",
      settings.workflowToken,
    ),
    simpleSetting(
      "Approval for all outside contributors",
      `${base}/actions/permissions/fork-pr-contributor-approval`,
      "PUT",
      settings.forkApproval,
    ),
  ];
};

/**
 * The shared settings of `repository`. A template repository leaves out the release app, because its workflows never release.
 */
const sharedSettings = (
  repository: Readonly<Repository>,
): readonly Setting[] => {
  const base = `/repos/${repository.slug}`;
  return [
    ...repositorySettings(base, repository),
    ...securitySettings(base),
    ...actionsSettings(base),
    featureSetting("Immutable releases", `${base}/immutable-releases`),
    rulesetSetting(
      base,
      // The trial of code scanning results as a merge rule runs in the template first; see ROADMAP.md. Its rule sorts first by type.
      repository.isTemplate
        ? {
            ...protectMain,
            rules: [settings.codeScanningRule, ...protectMain.rules],
          }
        : protectMain,
    ),
    rulesetSetting(
      base,
      // GitHub accepts the release app as a bypass actor only where it is installed. A template has no app and never releases, so nobody creates its tags.
      repository.isTemplate
        ? // eslint-disable-next-line @typescript-eslint/naming-convention -- GitHub's API names this key.
          { ...protectReleaseTags, bypass_actors: [] }
        : protectReleaseTags,
    ),
    environmentSetting(base),
    ...(repository.isTemplate ? [] : [variableSetting(base)]),
  ];
};

// Whether a response reports success.
const isSuccess = (response: Readonly<Response>): boolean => {
  return response.status >= 200 && response.status < 300;
};

/**
 * Compares each setting with its expected value.
 */
const checkSettings = async (
  request: Requester,
  checked: readonly Setting[],
): Promise<readonly Result[]> => {
  return await Promise.all(
    checked.map(async (setting): Promise<Result> => {
      const current = await setting.operations.read(request);
      return {
        name: setting.name,
        state: isSubset(setting.expected, current) ? "current" : "outdated",
      };
    }),
  );
};

// The result of a setting that `responses` applied.
const resultOf = async (
  request: Requester,
  setting: Readonly<Setting>,
  responses: readonly Response[],
): Promise<Result> => {
  const failure = responses.find((response) => {
    return !isSuccess(response);
  });
  if (typeof failure !== "undefined") {
    const errors = valueAt(failure.data, "errors");
    return {
      detail: [
        `HTTP ${String(failure.status)}: ${String(valueAt(failure.data, "message"))}`,
        ...(Array.isArray(errors) ? errors.map(String) : []),
      ].join(". "),
      name: setting.name,
      state: "failed",
    };
  }
  if (isSubset(setting.expected, await setting.operations.read(request))) {
    return { name: setting.name, state: "changed" };
  }
  // GitHub answers 202 when it applies a change in the background, such as the CodeQL setup.
  return responses.some((response) => {
    return response.status === 202;
  })
    ? {
        detail:
          "GitHub applies the change in the background; check again later.",
        name: setting.name,
        state: "pending",
      }
    : {
        detail: "GitHub accepted the change but still reports another value.",
        name: setting.name,
        state: "failed",
      };
};

/**
 * Applies each setting that differs from its expected value, then reads it again.
 */
const applySettings = async (
  request: Requester,
  applied: readonly Setting[],
): Promise<readonly Result[]> => {
  return await Promise.all(
    applied.map(async (setting): Promise<Result> => {
      const current = await setting.operations.read(request);
      return isSubset(setting.expected, current)
        ? { name: setting.name, state: "current" }
        : await resultOf(
            request,
            setting,
            await setting.operations.apply(request),
          );
    }),
  );
};

export {
  applySettings,
  checkSettings,
  isRecord,
  isSubset,
  sharedSettings,
  topicsOf,
  valueAt,
};
export type { Repository, Request, Requester, Response, Result };
