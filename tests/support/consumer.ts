/**
 * The packed-consumer harness. It packs the build as npm publishes it and installs the tarball in a temporary project with this repository's install policy, as a consumer installs the package from the registry.
 */

import { execFile } from "node:child_process";
import { mkdir, mkdtemp, realpath, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import packageJson from "../../package.json" with { type: "json" };
import { parseScenario, peerSpecs } from "./peers.ts";

type CommandResult = {
  readonly exitCode: number;
  readonly stderr: string;
  readonly stdout: string;
};
type Consumer = {
  // The consumer project, which has the package in `node_modules`.
  readonly directory: string;
  // The temporary directory that holds the project and the tarball, outside the project.
  readonly root: string;
};

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify takes the callback form of execFile, which also returns its child process.
const execute = promisify(execFile);
const projectDirectory = fileURLToPath(new URL("../..", import.meta.url));
// eslint-disable-next-line n/no-process-env -- CI runs the consumer programs on the Node.js of its matrix, and npm on the contributor Node.js.
const consumerNode = process.env.PACKAGE_CONSUMER_NODE ?? process.execPath;
// The peers of the scenario that `PACKAGE_PEER_SCENARIO` selects.
const scenarioPeers = peerSpecs(
  packageJson,
  // eslint-disable-next-line n/no-process-env -- The CI job of the minimum peers selects its scenario.
  parseScenario(process.env.PACKAGE_PEER_SCENARIO),
);
// The versions of TypeScript and the Node.js types that this repository checks with.
const testedVersions = new Map(Object.entries(packageJson.devDependencies));
// The install policy of this repository's `.npmrc`, without the audit and funding messages.
const npmrc = [
  "audit=false",
  "fund=false",
  "ignore-scripts=true",
  "min-release-age=7",
  "allow-git=none",
  "allow-remote=none",
  "",
].join("\n");
// The strict settings that a consumer can choose, so that the declarations work for all of them.
const tsconfig = {
  compilerOptions: {
    exactOptionalPropertyTypes: true,
    module: "nodenext",
    noEmit: true,
    noUncheckedIndexedAccess: true,
    strict: true,
    target: "es2025",
    types: ["node"],
    verbatimModuleSyntax: true,
  },
  include: ["*.ts"],
};

/**
 * A new directory in the system's temporary directory, with a name that starts with `prefix`, as its real path. The temporary directory can be a symbolic link, as it is on macOS, and a child process reports its working directory, and the files that it resolves from it, by their real paths.
 */
const createTemporaryDirectory = async (prefix: string): Promise<string> => {
  const directory = await mkdtemp(path.join(os.tmpdir(), prefix));
  return await realpath(directory);
};

/**
 * Runs a command in `directory` and returns its exit code and what it prints, also when it fails. A command that cannot start, or that a signal stops, has no exit code, which reads as `NaN`.
 */
const runCommand = async (
  command: string,
  commandArguments: readonly string[],
  directory: string,
): Promise<CommandResult> => {
  try {
    const { stderr, stdout } = await execute(command, [...commandArguments], {
      cwd: directory,
      encoding: "utf8",
      maxBuffer: 16 * 1024 * 1024,
      timeout: 120_000,
    });
    return { exitCode: 0, stderr, stdout };
  } catch (error) {
    // The error of a command that ran holds its exit code and output as own properties. A command that did not start has an empty standard error, so the error itself explains it.
    const failure: Readonly<Record<string, unknown>> =
      typeof error === "object" && error !== null ? { ...error } : {};
    return {
      exitCode: typeof failure.code === "number" ? failure.code : NaN,
      stderr:
        typeof failure.code === "number" && typeof failure.stderr === "string"
          ? failure.stderr
          : String(error),
      stdout: typeof failure.stdout === "string" ? failure.stdout : "",
    };
  }
};

// Stops the tests with `message`.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A failed setup command must stop the tests with its output.
  throw new Error(message);
};

// Runs npm with `commandArguments`, which must succeed, and returns its standard output.
const runNpm = async (
  commandArguments: readonly string[],
  directory: string,
): Promise<string> => {
  const result = await runCommand("npm", commandArguments, directory);
  return result.exitCode === 0
    ? result.stdout
    : fail(
        `npm ${commandArguments.join(" ")} exited with ${String(result.exitCode)}:\n${result.stdout}${result.stderr}`,
      );
};

/**
 * Packs the build into a new temporary directory and installs the tarball in a consumer project there, with TypeScript, the Node.js types, and `peers`: by default, the peers of the scenario that `PACKAGE_PEER_SCENARIO` selects. A test of an optional peer passes the others, as `name@version`. `files` maps the names of more project files to their content; the project already has a `tsconfig.json` with strict settings.
 */
const createConsumer = async (
  files: ReadonlyMap<string, string>,
  peers: readonly string[] = scenarioPeers,
): Promise<Consumer> => {
  const root = await createTemporaryDirectory("package-consumer-");
  const packed = await runNpm(
    ["pack", "--ignore-scripts", "--json", "--pack-destination", root],
    projectDirectory,
  );
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion -- `npm pack --json` prints this shape.
  const [{ filename }] = JSON.parse(packed) as readonly [
    { readonly filename: string },
  ];
  const directory = path.join(root, "consumer");
  const projectFiles: ReadonlyArray<readonly [string, string]> = [
    [".npmrc", npmrc],
    [
      "package.json",
      `${JSON.stringify({ name: "consumer", private: true, type: "module" })}\n`,
    ],
    ["tsconfig.json", `${JSON.stringify(tsconfig)}\n`],
    ...files,
  ];
  await mkdir(directory);
  // eslint-disable-next-line functional/no-expression-statements -- Each write resolves to nothing.
  await Promise.all(
    projectFiles.map(async ([name, content]) => {
      await writeFile(path.join(directory, name), content);
    }),
  );
  // eslint-disable-next-line functional/no-expression-statements -- The install succeeds or stops the tests; what it prints is not needed.
  await runNpm(
    [
      "install",
      "--prefer-offline",
      "--save-exact",
      path.join(root, filename),
      ...["typescript", "@types/node"].map((name) => {
        return `${name}@${testedVersions.get(name) ?? "missing"}`;
      }),
      ...peers,
    ],
    directory,
  );
  return { directory, root };
};

/**
 * Removes the temporary directory of `consumer`.
 */
const removeConsumer = async (consumer: Readonly<Consumer>): Promise<void> => {
  await rm(consumer.root, { force: true, recursive: true });
};

/**
 * Runs `script`, a file of the consumer project, on the consumer Node.js from `directory`.
 */
const runConsumer = async (
  consumer: Readonly<Consumer>,
  script: string,
  directory: string = consumer.directory,
): Promise<CommandResult> => {
  return await runCommand(
    consumerNode,
    [path.join(consumer.directory, script)],
    directory,
  );
};

/**
 * Type-checks the TypeScript files of the consumer project with its strict `tsconfig.json`.
 */
const typeCheckConsumer = async (
  consumer: Readonly<Consumer>,
): Promise<CommandResult> => {
  return await runCommand(
    consumerNode,
    [
      path.join(consumer.directory, "node_modules/typescript/bin/tsc"),
      "--project",
      consumer.directory,
    ],
    consumer.directory,
  );
};

/**
 * The code of each fenced block in `markdown` whose info string is `language`.
 */
const codeBlocks = (markdown: string, language: string): readonly string[] => {
  return markdown
    .split(/^```/mu)
    .filter((_block, index) => {
      return index % 2 === 1;
    })
    .map((block) => {
      return block.split("\n");
    })
    .filter(([info = ""]) => {
      return info.trim() === language;
    })
    .map(([, ...lines]) => {
      return lines.join("\n");
    });
};

export {
  codeBlocks,
  createConsumer,
  createTemporaryDirectory,
  removeConsumer,
  runCommand,
  runConsumer,
  typeCheckConsumer,
};
export type { CommandResult };
