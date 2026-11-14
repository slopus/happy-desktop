import { expect, it } from "vitest";
import { happyExternalLinkUrl, happyLinkUrl, happyUniversalLinkUrl } from "./happyLink";

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

it("takes a link.happy.page Universal Link, and leaves reading its fragment to the window", () => {
    const web = "NSUserActivityTypeBrowsingWeb";
    const share =
        "https://link.happy.page/#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/t7bgxjt05aexj73frl6ul37e";
    expect(happyUniversalLinkUrl(web, { webpageURL: share })).toBe(share);
    expect(happyUniversalLinkUrl(web, { webpageURL: `${share}?as=task` })).toBe(`${share}?as=task`);
    // The host as the system may spell it, read as the window's grammar expects it.
    expect(
        happyUniversalLinkUrl(web, {
            webpageURL: share.replace("link.happy.page", "LINK.happy.page"),
        }),
    ).toBe(share);
    // A fragment the grammar refuses still reaches the window, which says it can't open it.
    expect(happyUniversalLinkUrl(web, { webpageURL: "https://link.happy.page/#2/x" })).toBe(
        "https://link.happy.page/#2/x",
    );
    // Handoff and other activities are not links.
    expect(
        happyUniversalLinkUrl("com.slopus.happy.handoff", { webpageURL: share }),
    ).toBeUndefined();
    expect(happyUniversalLinkUrl(web, {})).toBeUndefined();
    for (const webpageURL of [
        "http://link.happy.page/#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "https://link.happy.page:8443/#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "https://link.happy.page.example.com/#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "https://user@link.happy.page/#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "https://link.happy.page/x#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "https://link.happy.page/?q=1#1/k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "https://app.happy.engineering/",
        "happy://k3x9q2m7p0a4b8c1d5e6f7g2/agents/a1",
        "not a url",
        `https://link.happy.page/#1/${"x".repeat(5000)}`,
    ])
        expect(happyUniversalLinkUrl(web, { webpageURL })).toBeUndefined();
});
