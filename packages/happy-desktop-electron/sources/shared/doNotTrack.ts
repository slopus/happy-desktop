/** The environment variable that turns analytics off for one run. */
export const doNotTrackEnvironment = "DO_NOT_TRACK";

/** What `DO_NOT_TRACK` may say to leave analytics as Settings has it. */
const DO_NOT_TRACK_UNSET: ReadonlySet<string> = new Set(["", "0", "false", "no", "off"]);

/**
 * Whether `DO_NOT_TRACK` asks for no analytics. The convention is `1`, but any
 * value except an explicit no (`0`, `false`, `no`, `off`, or empty, in any
 * case) counts, so a spelling we did not expect never sends anything.
 */
export function doNotTrackEnabled(value: string | undefined): boolean {
    return value !== undefined && !DO_NOT_TRACK_UNSET.has(value.trim().toLowerCase());
}
