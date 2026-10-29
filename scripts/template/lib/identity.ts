/**
 * The changes of `init.ts`, which turns a copy of the template into a new package: its name and description, its README, and no template tools.
 */

import { readFile, rm, writeFile } from "node:fs/promises";

import { isRecord, valueAt } from "./settings.ts";

type Identity = {
  // One sentence, which becomes the description in `package.json` and the README's introduction.
  readonly description: string;
  // The package name without the `@cravingmaker/` scope, which is also the repository name.
  readonly name: string;
};
type Texts = {
  readonly agents: string;
  readonly contributing: string;
  readonly knip: string;
  readonly lockfile: string;
  readonly manifest: string;
  readonly readme: string;
  readonly roadmap: string;
};

const templateSlug = "cravingmaker/package-template";
// eslint-disable-next-line unicorn/string-content -- An HTML comment ends with `-->`.
const startMarker = "<!-- template:start -->";
// eslint-disable-next-line unicorn/string-content -- An HTML comment ends with `-->`.
const endMarker = "<!-- template:end -->";
// The Knip entry of the template tools, which `init.ts` removes with them.
const templateEntry = '  "entry": ["scripts/template/*.ts"],\n';
const lockfileRoot = "";
const namePattern = /^[\da-z][\d\-.a-z]*$/u;
// The paths that `init.ts` removes: the template tools and their tests.
const templatePaths = ["scripts/template/", "tests/scripts/template/"];

// The replacer that keeps every value, which leaves the indentation argument of JSON.stringify.
// eslint-disable-next-line @typescript-eslint/promise-function-async -- The value comes from parsed JSON, which holds no promise.
const keepValue = (_key: string, value: unknown): unknown => {
  return value;
};

// `value` as npm and Prettier write JSON: indented by two spaces, with a final newline.
const formatJson = (value: unknown): string => {
  return `${JSON.stringify(value, keepValue, 2)}\n`;
};

// Stops the initialization with `message`, before it writes anything.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A template that cannot be initialized must stay unchanged.
  throw new Error(message);
};

/**
 * `text` without its template blocks: each `<!-- template:start -->` with everything up to the next `<!-- template:end -->`. The text keeps one blank line between paragraphs and ends with one newline.
 */
const removeTemplateBlocks = (text: string): string => {
  const [head = "", ...blocks] = text.split(startMarker);
  const kept = [
    head,
    ...blocks.map((block) => {
      const end = block.indexOf(endMarker);
      return end === -1
        ? fail("A template block has no end marker.")
        : block.slice(end + endMarker.length);
    }),
  ].join("");
  return `${kept.replaceAll(/\n{3,}/gu, "\n\n").trimEnd()}\n`;
};

/**
 * `text` with the repository of the template, which also names the package, replaced by `cravingmaker/<name>`.
 */
const renameRepository = (text: string, name: string): string => {
  return text.replaceAll(templateSlug, () => {
    return `cravingmaker/${name}`;
  });
};

/**
 * The README of the new package: without the template blocks, with the npm badge in front of the CI badge, and with `description` as the introduction after the badges.
 */
const updateReadme = (
  readme: string,
  packageName: string,
  description: string,
): string => {
  const lines = removeTemplateBlocks(readme).split("\n");
  const badges = lines.findIndex((line) => {
    return line.startsWith("[![CI](");
  });
  const introduction = lines.findIndex((line, index) => {
    return index > badges && line.trim() !== "";
  });
  const npmBadge = `[![npm version](https://img.shields.io/npm/v/${encodeURIComponent(packageName)})](https://www.npmjs.com/package/${packageName})`;
  return badges === -1 || introduction === -1
    ? fail("The README has no CI badge with an introduction after it.")
    : lines
        .map((line, index) => {
          if (index === badges) {
            return `${npmBadge} ${line}`;
          }
          return index === introduction ? description : line;
        })
        .join("\n");
};

/**
 * The `package.json` of the new package, with its name, links, description, and keywords.
 */
const updateManifest = (text: string, identity: Readonly<Identity>): string => {
  const manifest: unknown = JSON.parse(renameRepository(text, identity.name));
  const keywords = valueAt(manifest, "keywords");
  return formatJson({
    ...(isRecord(manifest) ? manifest : fail("package.json is not an object.")),
    description: identity.description,
    keywords: (Array.isArray(keywords) ? keywords : []).filter(
      (keyword: unknown) => {
        return keyword !== "template";
      },
    ),
  });
};

/**
 * The lockfile with the name of the new package, in the format that npm writes.
 */
const updateLockfile = (text: string, packageName: string): string => {
  const lockfile: unknown = JSON.parse(text);
  const packages = valueAt(lockfile, "packages");
  const root = valueAt(packages, lockfileRoot);
  return formatJson({
    ...(isRecord(lockfile)
      ? lockfile
      : fail("package-lock.json is not an object.")),
    name: packageName,
    packages: {
      ...(isRecord(packages) && packages),
      [lockfileRoot]: { ...(isRecord(root) && root), name: packageName },
    },
  });
};

// The Knip configuration without the entry of the template tools.
const removeTemplateEntry = (text: string): string => {
  return text.includes(templateEntry)
    ? text.replace(templateEntry, "")
    : fail("knip.json has no entry for scripts/template/.");
};

// Whether `identity` names a valid package: a lowercase name and a description of one line.
const isValidIdentity = (identity: Readonly<Identity>): boolean => {
  const description = identity.description.trim();
  return (
    identity.name !== "package-template" &&
    description !== "" &&
    namePattern.test(identity.name) &&
    !/[\n\r]/u.test(description)
  );
};

// The files that `init.ts` writes, by path, from the texts of the template.
const planOutputs = (
  texts: Readonly<Texts>,
  identity: Readonly<Identity>,
): ReadonlyArray<readonly [string, string]> => {
  if (valueAt(JSON.parse(texts.manifest), "name") !== `@${templateSlug}`) {
    return fail(
      "This copy is already initialized: its package is not @cravingmaker/package-template.",
    );
  }
  const packageName = `@cravingmaker/${identity.name}`;
  return isValidIdentity(identity)
    ? [
        ["package.json", updateManifest(texts.manifest, identity)],
        ["package-lock.json", updateLockfile(texts.lockfile, packageName)],
        ["knip.json", removeTemplateEntry(texts.knip)],
        [
          "README.md",
          updateReadme(
            renameRepository(texts.readme, identity.name),
            packageName,
            identity.description,
          ),
        ],
        [
          "AGENTS.md",
          removeTemplateBlocks(renameRepository(texts.agents, identity.name)),
        ],
        [
          "CONTRIBUTING.md",
          renameRepository(texts.contributing, identity.name),
        ],
        [
          "ROADMAP.md",
          removeTemplateBlocks(renameRepository(texts.roadmap, identity.name)),
        ],
      ]
    : fail(
        "Give a lowercase package name, such as my-package, and a one-line description.",
      );
};

/**
 * Initializes the copy of the template in `directory` as the package that `identity` describes, and returns the paths that it changed or removed.
 */
const initialize = async (
  directory: Readonly<URL>,
  identity: Readonly<Identity>,
): Promise<readonly string[]> => {
  const [
    manifest = "",
    lockfile = "",
    knip = "",
    readme = "",
    agents = "",
    contributing = "",
    roadmap = "",
  ] = await Promise.all(
    [
      "package.json",
      "package-lock.json",
      "knip.json",
      "README.md",
      "AGENTS.md",
      "CONTRIBUTING.md",
      "ROADMAP.md",
    ].map(async (file) => {
      return await readFile(new URL(file, directory), "utf8");
    }),
  );
  const outputs = planOutputs(
    { agents, contributing, knip, lockfile, manifest, readme, roadmap },
    identity,
  );

  // eslint-disable-next-line functional/no-expression-statements -- Each write resolves to nothing.
  await Promise.all(
    outputs.map(async ([file, text]) => {
      await writeFile(new URL(file, directory), text);
    }),
  );
  // eslint-disable-next-line functional/no-expression-statements -- Each removal resolves to nothing.
  await Promise.all(
    templatePaths.map(async (path) => {
      await rm(new URL(path, directory), { force: true, recursive: true });
    }),
  );
  return [
    ...outputs.map(([file]) => {
      return file;
    }),
    ...templatePaths,
  ];
};

export { initialize, removeTemplateBlocks };
