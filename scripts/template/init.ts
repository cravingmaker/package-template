/**
 * Turns this copy of the template into a new package.
 *
 * Usage: `node scripts/template/init.ts --name <name> --description "<one sentence>"`. It sets the package's name, links, description, and README, removes the template blocks and tools, and lists the files that it changed.
 */

import process from "node:process";
import { parseArgs } from "node:util";

import { initialize } from "./lib/identity.ts";

const { values } = parseArgs({
  options: { description: { type: "string" }, name: { type: "string" } },
});
const changed = await initialize(new URL("../..", import.meta.url), {
  description: values.description ?? "",
  name: values.name ?? "",
});

console.log(
  [
    `Initialized @cravingmaker/${values.name ?? ""}. Changed or removed:`,
    ...changed.map((file) => {
      return `  ${file}`;
    }),
    "",
    "Next: replace src/index.ts, its tests, and the README examples, then run npm run validate.",
  ].join("\n"),
);
// eslint-disable-next-line functional/immutable-data, functional/no-expression-statements -- A completed initialization exits normally, also when an earlier tool set another status.
process.exitCode = 0;
