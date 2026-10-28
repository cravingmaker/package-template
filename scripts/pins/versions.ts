/**
 * The comparisons of `scripts/check-pins.ts`, which checks the pins that Dependabot cannot update: `.nvmrc`, the actionlint release, the zizmor version, and the Node.js download of the Claude Code setup script.
 */

type Pin = {
  readonly current: string;
  readonly name: string;
  readonly newest: string;
};

type SetupScript = {
  readonly checksums: Readonly<Record<string, string>>;
  readonly version: string;
};

// Stops the check with `message`, so that a pin that cannot be read never looks current.
const fail = (message: string): never => {
  // eslint-disable-next-line functional/no-throw-statements -- A pin that cannot be read must not look current.
  throw new Error(message);
};

const versionPattern = /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)$/u;

/**
 * The major, minor, and patch numbers of a release version, with or without a leading `v`.
 */
const parseVersion = (version: string): readonly number[] => {
  const groups = versionPattern.exec(version.trim())?.groups;
  return typeof groups === "undefined"
    ? fail(`Not a release version: ${version}`)
    : [groups.major, groups.minor, groups.patch].map(Number);
};

/**
 * Negative when `left` is older than `right`, positive when it is newer, and zero when they are the same release.
 */
const compareVersions = (left: string, right: string): number => {
  const rightParts = parseVersion(right);
  return (
    parseVersion(left)
      .map((part, index) => {
        return part - (rightParts.at(index) ?? 0);
      })
      .find((difference) => {
        return difference !== 0;
      }) ?? 0
  );
};

/**
 * The newest of `versions` whose major version is `major`.
 */
const newestInLine = (
  versions: readonly string[],
  major: number,
): string | undefined => {
  return versions
    .filter((version) => {
      return parseVersion(version)[0] === major;
    })
    .toSorted((left, right) => {
      return compareVersions(left, right);
    })
    .at(-1);
};

/**
 * The pins that are behind their newest release.
 */
const findOutdated = (pins: readonly Pin[]): readonly Pin[] => {
  return pins.filter((pin) => {
    return compareVersions(pin.current, pin.newest) < 0;
  });
};

/**
 * The SHA-256 of each file in a `SHASUMS256.txt` of Node.js, by file name.
 */
const parseChecksums = (text: string): ReadonlyMap<string, string> => {
  return new Map(
    // The return type types each entry as a tuple. An `as const` tuple would be sorted by
    // perfectionist/sort-arrays, which would swap the key and the value.
    text
      .split("\n")
      .flatMap((line): ReadonlyArray<readonly [string, string]> => {
        const [checksum, filename, ...rest] = line.trim().split(/\s+/u);
        return typeof checksum === "string" &&
          typeof filename === "string" &&
          rest.length === 0
          ? [[filename, checksum]]
          : [];
      }),
  );
};

// The trimmed value after `prefix` on the first line that starts with it.
const findValue = (text: string, prefix: string): string | undefined => {
  return text
    .split("\n")
    .map((line) => {
      return line.trim();
    })
    .find((line) => {
      return line.startsWith(prefix);
    })
    ?.slice(prefix.length)
    .trim();
};

/**
 * The Node.js version and the pinned archive checksums of the Claude Code setup script in `CONTRIBUTING.md`.
 */
const readSetupScript = (markdown: string): SetupScript => {
  const value = (name: string): string => {
    return (
      findValue(markdown, `${name}=`) ??
      fail(`CONTRIBUTING.md sets no ${name}.`)
    );
  };

  const version = value("NODE_VERSION");
  return {
    checksums: {
      [`node-v${version}-linux-arm64.tar.gz`]: value("NODE_SHA256_ARM64"),
      [`node-v${version}-linux-x64.tar.gz`]: value("NODE_SHA256_X64"),
    },
    version,
  };
};

/**
 * The zizmor version that the `version` input of the zizmor workflow pins.
 */
const readZizmorVersion = (workflow: string): string => {
  return (
    findValue(workflow, "version:") ??
    fail("The zizmor workflow pins no zizmor version.")
  );
};

export {
  compareVersions,
  findOutdated,
  newestInLine,
  parseChecksums,
  parseVersion,
  readSetupScript,
  readZizmorVersion,
};
export type { Pin };
