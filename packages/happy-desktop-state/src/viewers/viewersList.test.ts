import { describe, expect, it } from "vitest";
import {
    viewerTierOf,
    viewersListAnswered,
    viewersListChanged,
    viewersNextChangeAt,
} from "./viewersList.js";

const MINUTE = 60_000;
const NOW = 1_700_000_000_000;

describe("viewerTierOf", () => {
    it("is here while the person views it, however long ago they came", () => {
        expect(viewerTierOf({ here: true, lastSeenAt: NOW - 60 * MINUTE }, NOW)).toBe("here");
    });

    it("is recent up to and including ten minutes after they left", () => {
        expect(viewerTierOf({ here: false, lastSeenAt: NOW - 4 * MINUTE }, NOW)).toBe("recent");
        expect(viewerTierOf({ here: false, lastSeenAt: NOW - 10 * MINUTE }, NOW)).toBe("recent");
    });

    it("is seen from just past ten minutes", () => {
        expect(viewerTierOf({ here: false, lastSeenAt: NOW - 10 * MINUTE - 1 }, NOW)).toBe("seen");
        expect(viewerTierOf({ here: false, lastSeenAt: NOW - 13 * 24 * 60 * MINUTE }, NOW)).toBe(
            "seen",
        );
    });
});

describe("viewersListAnswered", () => {
    it("counts nobody as arriving the first time the window looks", () => {
        expect(
            viewersListAnswered(undefined, [
                { userId: "anna", here: true, lastSeenAt: NOW },
                { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE },
            ]),
        ).toEqual([
            { userId: "anna", here: true, lastSeenAt: NOW, arrived: false },
            { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE, arrived: false },
        ]);
    });

    it("marks someone who came between two answers as arriving, at the front", () => {
        const first = viewersListAnswered(undefined, [
            { userId: "anna", here: true, lastSeenAt: NOW },
        ]);
        expect(
            viewersListAnswered(first, [
                { userId: "anna", here: true, lastSeenAt: NOW + 15_000 },
                { userId: "kirill", here: true, lastSeenAt: NOW + 15_000 },
            ]),
        ).toEqual([
            { userId: "kirill", here: true, lastSeenAt: NOW + 15_000, arrived: true },
            { userId: "anna", here: true, lastSeenAt: NOW + 15_000, arrived: false },
        ]);
    });

    it("keeps people here in the order they came when the server reorders them", () => {
        const first = viewersListAnswered(undefined, [
            { userId: "anna", here: true, lastSeenAt: NOW },
            { userId: "kirill", here: true, lastSeenAt: NOW },
        ]);
        const next = viewersListAnswered(first, [
            { userId: "kirill", here: true, lastSeenAt: NOW + 15_000 },
            { userId: "anna", here: true, lastSeenAt: NOW + 15_000 },
        ]);
        expect(next.map((entry) => entry.userId)).toEqual(["anna", "kirill"]);
    });

    it("returns the same list when the answer says nothing new", () => {
        const first = viewersListAnswered(undefined, [
            { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE },
        ]);
        expect(
            viewersListAnswered(first, [
                { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE },
            ]),
        ).toBe(first);
    });

    it("keeps at most fifty people", () => {
        const viewers = Array.from({ length: 60 }, (_, index) => ({
            userId: `user-${String(index).padStart(2, "0")}`,
            here: false,
            lastSeenAt: NOW - index * MINUTE,
        }));
        const list = viewersListAnswered(undefined, viewers);
        expect(list.length).toBe(50);
        expect(list[49]?.userId).toBe("user-49");
    });
});

describe("viewersListChanged", () => {
    const start = viewersListAnswered(undefined, [
        { userId: "anna", here: true, lastSeenAt: NOW },
        { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE },
        { userId: "lee", here: false, lastSeenAt: NOW - 3 * MINUTE },
    ]);

    it("puts an arriving person first among those here, marked as arriving", () => {
        expect(viewersListChanged(start, { userId: "max", here: true, lastSeenAt: NOW })).toEqual([
            { userId: "max", here: true, lastSeenAt: NOW, arrived: true },
            { userId: "anna", here: true, lastSeenAt: NOW, arrived: false },
            { userId: "lee", here: false, lastSeenAt: NOW - 3 * MINUTE, arrived: false },
        ]);
    });

    it("moves a leaving person to the front of the recent ones", () => {
        expect(
            viewersListChanged(start, { userId: "anna", here: false, lastSeenAt: NOW + MINUTE }),
        ).toEqual([
            { userId: "anna", here: false, lastSeenAt: NOW + MINUTE, arrived: false },
            { userId: "lee", here: false, lastSeenAt: NOW - 3 * MINUTE, arrived: false },
            { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE, arrived: false },
        ]);
    });

    it("adds someone it had never heard of", () => {
        expect(
            viewersListChanged(start, { userId: "kirill", here: true, lastSeenAt: NOW }).map(
                (entry) => [entry.userId, entry.arrived],
            ),
        ).toEqual([
            ["kirill", true],
            ["anna", false],
            ["lee", false],
            ["max", false],
        ]);
    });
});

describe("viewersNextChangeAt", () => {
    it("is the next whole minute since the most recent departure", () => {
        const list = viewersListAnswered(undefined, [
            { userId: "lee", here: false, lastSeenAt: NOW - 3 * MINUTE - 20_000 },
            { userId: "anna", here: false, lastSeenAt: NOW - 30_000 },
        ]);
        expect(viewersNextChangeAt([list], NOW)).toBe(NOW + 30_000);
    });

    it("lands on the moment someone stops being recent", () => {
        const list = viewersListAnswered(undefined, [
            { userId: "lee", here: false, lastSeenAt: NOW - 9 * MINUTE - 59_000 },
        ]);
        expect(viewersNextChangeAt([list], NOW)).toBe(NOW + 1_000);
        expect(viewerTierOf(list[0]!, NOW + 1_000)).toBe("recent");
        expect(viewersNextChangeAt([list], NOW + 1_000)).toBe(NOW + 1_001);
        expect(viewerTierOf(list[0]!, NOW + 1_001)).toBe("seen");
        expect(viewersNextChangeAt([list], NOW + 1_001)).toBeUndefined();
    });

    it("is undefined when nobody's tier or label changes with time", () => {
        const list = viewersListAnswered(undefined, [
            { userId: "anna", here: true, lastSeenAt: NOW },
            { userId: "max", here: false, lastSeenAt: NOW - 20 * MINUTE },
        ]);
        expect(viewersNextChangeAt([list], NOW)).toBeUndefined();
    });
});
