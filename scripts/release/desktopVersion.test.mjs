import assert from "node:assert/strict";
import { test } from "node:test";
import { desktopBuildVersion, desktopVersionNext, desktopVersionParse } from "./desktopVersion.mjs";

const november = new Date("2026-11-07T12:00:00Z");
const legacy = ["v0.0.103", "v0.0.104-preview.3", "v0.0.104-preview.4"];

test("the first release of a month starts its counter at 1", () => {
    assert.equal(desktopVersionNext(legacy, "stable", november), "2026.11.1");
    assert.equal(desktopVersionNext(legacy, "preview", november), "2026.11.1-preview.1");
    assert.equal(desktopVersionNext([], "preview", november), "2026.11.1-preview.1");
});

test("previews number the stable release they preview, which moves C", () => {
    const tags = [...legacy, "v2026.11.1-preview.1", "v2026.11.1-preview.2"];
    assert.equal(desktopVersionNext(tags, "preview", november), "2026.11.1-preview.3");
    assert.equal(desktopVersionNext(tags, "stable", november), "2026.11.1");
    tags.push("v2026.11.1");
    assert.equal(desktopVersionNext(tags, "preview", november), "2026.11.2-preview.1");
    assert.equal(desktopVersionNext(tags, "stable", november), "2026.11.2");
});

test("counts by number, not tag order, and ignores other months and shapes", () => {
    const tags = [
        "v2026.11.10",
        "v2026.11.9",
        "v2026.11.11-preview.9",
        "v2026.11.11-preview.10",
        "v2026.10.40",
        "v2025.11.50",
        "v2026.11.12-beta.1",
        "v2026.09.20",
        "2026.11.30",
        "happy-agent-v2026.11.30",
    ];
    assert.equal(desktopVersionNext(tags, "stable", november), "2026.11.11");
    assert.equal(desktopVersionNext(tags, "preview", november), "2026.11.11-preview.11");
});

test("months and years are UTC and reset the counter", () => {
    const tags = ["v2026.11.1", "v2026.11.2-preview.1", "v2026.12.1-preview.4"];
    assert.equal(
        desktopVersionNext(tags, "preview", new Date("2026-12-01T00:00:00Z")),
        "2026.12.1-preview.5",
    );
    assert.equal(
        desktopVersionNext(tags, "preview", new Date("2026-11-30T23:59:59-01:00")),
        "2026.12.1-preview.5",
    );
    assert.equal(
        desktopVersionNext(["v2026.12.3"], "stable", new Date("2027-01-01T00:00:00Z")),
        "2027.1.1",
    );
    assert.throws(() => desktopVersionNext([], "nightly", november), /stable or preview/);
});

test("only CalVer release versions parse", () => {
    assert.deepEqual(desktopVersionParse("2026.11.3"), {
        year: 2026,
        month: 11,
        counter: 3,
        preview: undefined,
    });
    assert.deepEqual(desktopVersionParse("2026.1.1-preview.12")?.preview, 12);
    for (const version of [
        "0.0.104",
        "0.0.104-preview.1",
        "2026.09.3",
        "2026.13.1",
        "2026.0.1",
        "2026.11.0",
        "2026.11.01",
        "2026.11.1-preview.0",
        "2026.11.1-preview.01",
        "2026.11.1-beta.1",
        "v2026.11.1",
    ])
        assert.equal(desktopVersionParse(version), undefined, version);
});

test("a build embeds a release version or the development version", () => {
    assert.equal(desktopBuildVersion("2026.11.2-preview.1", "0.0.0"), "2026.11.2-preview.1");
    assert.equal(desktopBuildVersion(undefined, "0.0.0"), "0.0.0");
    assert.equal(desktopBuildVersion("", "0.0.0"), "0.0.0");
    assert.throws(() => desktopBuildVersion("0.0.105", "0.0.0"), /YYYY\.M\.C/);
    assert.throws(() => desktopBuildVersion(undefined, "0.0.103"), /must be 0\.0\.0/);
});
