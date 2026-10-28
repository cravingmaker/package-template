import { execFile } from "node:child_process";
import process from "node:process";
import { promisify } from "node:util";

import { ensureActionlint, projectDirectory } from "./actionlint.ts";

// eslint-disable-next-line @typescript-eslint/strict-void-return -- promisify takes the callback form of execFile, which also returns its child process.
const execute = promisify(execFile);

// The findings that actionlint printed before it failed, if any.
const findingsOf = (error: unknown): string => {
  return Error.isError(error) &&
    "stdout" in error &&
    typeof error.stdout === "string"
    ? error.stdout.trimEnd()
    : "";
};

/**
 * Runs the pinned actionlint with `commandArguments`, prints its output, and returns the exit status. A failure prints the findings to standard output and the reason to standard error.
 */
const runActionlint = async (
  commandArguments: readonly string[],
): Promise<number> => {
  try {
    const binary = await ensureActionlint();
    const { stderr, stdout } = await execute(binary, [...commandArguments], {
      cwd: projectDirectory,
      encoding: "utf8",
      maxBuffer: 1024 * 1024,
      timeout: 30_000,
    });
    const output = `${stdout}${stderr}`.trimEnd();
    console.log(output === "" ? "actionlint found no problems." : output);
    return 0;
  } catch (error) {
    const findings = findingsOf(error);
    const reason = Error.isError(error) ? error.message : String(error);
    if (findings === "") {
      console.error(reason);
      return 1;
    }
    console.log(findings);
    console.error(reason);
    return 1;
  }
};

// eslint-disable-next-line functional/immutable-data, functional/no-expression-statements -- The exit status reports the findings without cutting off the output, as process.exit() can.
process.exitCode = await runActionlint(process.argv.slice(2));
