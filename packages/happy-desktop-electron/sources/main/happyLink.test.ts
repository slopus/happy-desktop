import { expect, it } from "vitest";
import { happyExternalLinkUrl, happyLinkUrl } from "./happyLink";

it("takes only happy:// from the system, and leaves reading it to the window", () => {
    expect(happyExternalLinkUrl("happy://c1abc/artifacts/a1")).toBe("happy://c1abc/artifacts/a1");
    expect(happyExternalLinkUrl("HAPPY://c1abc/artifacts/a1")).toBe("HAPPY://c1abc/artifacts/a1");
    // happy-file:// is not registered with the system, so it never arrives from there.
    expect(happyExternalLinkUrl("happy-file://agents/a1/Foo.tsx")).toBeUndefined();
    expect(happyExternalLinkUrl("https://example.com")).toBeUndefined();
    expect(happyExternalLinkUrl(`happy://${"x".repeat(4096)}`)).toBeUndefined();
    // Links followed inside the app keep accepting both schemes.
    expect(happyLinkUrl("happy-file://agents/a1/Foo.tsx")).toBe("happy-file://agents/a1/Foo.tsx");
});
