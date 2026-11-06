import { expect, it } from "vitest";
import { doNotTrackEnabled } from "./doNotTrack";

it("turns analytics off for any DO_NOT_TRACK but an explicit no", () => {
    for (const value of ["1", "true", "TRUE", "yes", "on", " 1 ", "2"])
        expect(doNotTrackEnabled(value), value).toBe(true);
    for (const value of [undefined, "", " ", "0", "false", "False", "no", "OFF"])
        expect(doNotTrackEnabled(value), String(value)).toBe(false);
});
