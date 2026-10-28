/**
 * The peer versions that the packed-consumer tests install. The `current` scenario installs the versions that this repository develops with, and `minimum` installs the floor of each peer range, which the CI job of the minimum peers selects through `PACKAGE_PEER_SCENARIO`.
 */

type PeerManifest = {
  readonly devDependencies?: Readonly<Record<string, string>>;
  readonly peerDependencies?: Readonly<Record<string, string>>;
};
type PeerScenario = "current" | "minimum";

// Stops the tests with `message`, so that a peer without a version to test is never skipped.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A peer without a version to test must stop the tests.
  throw new Error(message);
};

const scenarios = new Map<string, PeerScenario>([
  ["current", "current"],
  ["minimum", "minimum"],
]);
const floorPattern = /^>=(?<floor>\d+\.\d+\.\d+)(?:\s|$)/u;

/**
 * The scenario that `value`, the value of `PACKAGE_PEER_SCENARIO`, names. Without a value, the scenario is `current`.
 */
const parseScenario = (value: string | undefined): PeerScenario => {
  return (
    scenarios.get(value ?? "current") ??
    fail(`Unknown peer scenario: ${String(value)}. Use current or minimum.`)
  );
};

/**
 * The `name@version` of each peer in `manifest` for `scenario`. Every peer range needs an explicit floor, such as `>=1.2.0 <2`, and every peer needs a development dependency at the version that the tests use.
 */
const peerSpecs = (
  manifest: Readonly<PeerManifest>,
  scenario: PeerScenario,
): readonly string[] => {
  const tested = new Map(Object.entries(manifest.devDependencies ?? {}));
  return Object.entries(manifest.peerDependencies ?? {}).map(
    ([name, range]) => {
      const floor =
        floorPattern.exec(range)?.groups?.floor ??
        fail(
          `Declare an explicit floor for the peer ${name}, such as ">=1.2.0 <2": ${range}`,
        );
      const version =
        scenario === "minimum"
          ? floor
          : (tested.get(name) ??
            fail(
              `Add the peer ${name} to devDependencies at the version that the tests use.`,
            ));
      return `${name}@${version}`;
    },
  );
};

export { parseScenario, peerSpecs };
