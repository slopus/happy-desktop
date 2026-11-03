import { expect, it } from "vitest";
import { happyExternalLinkFormat, happyExternalLinkParse } from "./happyInstanceLink.js";
import {
    formatHappyReferenceUrl,
    parseHappyLinks,
    parseHappyUrl,
    replaceHappyLinks,
} from "./happyTabLinks.js";

it("gives new and historical tab links the same resource identity", () => {
    expect(parseHappyUrl("happy://tabs/notes")).toEqual(parseHappyUrl("happy://surfaces/notes"));
    expect(formatHappyReferenceUrl({ kind: "surface", id: "notes" })).toBe("happy://tabs/notes");
    const instance = "a12345678901234567890123";
    const url = happyExternalLinkFormat(instance, "happy://surfaces/notes");
    expect(url).toBe(`happy://${instance}/tabs/notes`);
    expect(happyExternalLinkParse(url)).toMatchObject({
        kind: "instance",
        instanceId: instance,
        url: "happy://tabs/notes",
    });
});

it("uses the same strict grammar for tab links", () => {
    for (const url of [
        "happy://tabs/",
        "happy://tabs/a/b",
        "happy://tabs/a?version=2",
        "happy://tabs/../notes",
        "happy://wrong/tabs/notes",
    ])
        expect(parseHappyUrl(url)).toBeUndefined();
});

it("resolves Markdown tabs while preserving labels, source, code and streaming rules", () => {
    const text = "[New](happy://tabs/one) and [Old](happy://surfaces/two) `[](happy://tabs/code)`";
    expect(parseHappyLinks(text).filter((segment) => segment.type === "link")).toMatchObject([
        {
            label: "New",
            source: "[New](happy://tabs/one)",
            link: { reference: { kind: "surface", id: "one" } },
        },
        { label: "Old", link: { reference: { kind: "surface", id: "two" } } },
    ]);
    expect(
        replaceHappyLinks(text, (match) =>
            match.link?.type === "reference" ? match.link.reference.id : "missing",
        ),
    ).toBe("one and two `[](happy://tabs/code)`");
    expect(parseHappyLinks("hello [](happy://tabs/no", { streaming: true })).toEqual([
        { type: "text", text: "hello " },
    ]);
});
