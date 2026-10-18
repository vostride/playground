const MAX_ANDROID_VERSION_CODE = 2100000000;
const BUILD_NUMBER_OFFSET = 1000;

function integer(value, name) {
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) value = Number(value);
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  return value;
}

/** Derive the immutable public label and native bundle versions without clock or I/O access. */
export function deriveMobileReleaseVersion({ sha, commitTimestamp, runNumber }) {
  if (typeof sha !== 'string' || !/^[a-f0-9]{40}$/.test(sha)) {
    throw new TypeError('sha must be a full 40-character lowercase hexadecimal commit SHA.');
  }
  const seconds = integer(commitTimestamp, 'commitTimestamp');
  const date = new Date(seconds * 1000);
  const year = date.getUTCFullYear();
  if (!Number.isFinite(date.getTime()) || year < 2000 || year > 2099) {
    throw new RangeError('commitTimestamp must identify a UTC date between 2000 and 2099.');
  }
  const run = integer(runNumber, 'runNumber');
  const buildNumber = BUILD_NUMBER_OFFSET + run;
  if (run < 1 || buildNumber > MAX_ANDROID_VERSION_CODE) {
    throw new RangeError('runNumber must produce an Android versionCode from 1001 to 2100000000.');
  }

  const shortYear = String(year).slice(-2);
  const month = date.getUTCMonth() + 1;
  const day = date.getUTCDate();
  const version = `${shortYear}.${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')}-${sha.slice(0, 7)}`;
  return {
    version,
    tag: `mobile-${version}`,
    nativeVersion: `${shortYear}.${month}.${day}`,
    buildNumber,
    // CFBundleVersion accepts one to three numeric components. Keep the full
    // build number instead of truncating it into a potentially colliding tuple.
    iosBuildNumber: String(buildNumber),
  };
}
