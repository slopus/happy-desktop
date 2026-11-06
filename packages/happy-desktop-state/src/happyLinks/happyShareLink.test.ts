import { describe, expect, it } from "vitest";
import { happyExternalLinkParse } from "./happyInstanceLink.js";
import {
    happyShareLinkFormat,
    happyShareLinkParse,
    happyShareLinksRewrite,
    type HappyShareLinkRole,
} from "./happyShareLink.js";

/*
 * The vectors are link.happy.page's own (`link.happy.page/src/link.test.ts` in
 * slopus/happy-link), so the app writes and reads exactly what the page does.
 */

const INSTANCE = "k3x9q2m7p0a4b8c1d5e6f7g2";
const OTHER = "m1n2b3v4c5x6z7l8k9j0h1g2";
const ID = "t7bgxjt05aexj73frl6ul37e";
const PAGE = "https://link.happy.page/#";

describe("round trip", () => {
    const cases: [string, string, HappyShareLinkRole?][] = [
        [`happy://${INSTANCE}/agents/${ID}`, `1/${INSTANCE}/agents/${ID}`],
        [`happy://${INSTANCE}/agents/${ID}`, `1/${INSTANCE}/agents/${ID}?as=task`, "task"],
        [`happy://${INSTANCE}/agents/${ID}`, `1/${INSTANCE}/agents/${ID}?as=bot`, "bot"],
        [`happy://${INSTANCE}/agents/${ID}`, `1/${INSTANCE}/agents/${ID}?as=subtask`, "subtask"],
        [`happy://${INSTANCE}/agents/${ID}`, `1/${INSTANCE}/agents/${ID}?as=subagent`, "subagent"],
        [`happy://${INSTANCE}/agents/${ID}`, `1/${INSTANCE}/agents/${ID}?as=session`, "session"],
        [`happy://${INSTANCE}/artifacts/${ID}`, `1/${INSTANCE}/artifacts/${ID}`],
        [
            `happy://${INSTANCE}/artifacts/${ID}?version=12`,
            `1/${INSTANCE}/artifacts/${ID}?version=12`,
        ],
        [`happy://${INSTANCE}/workspaces/${ID}`, `1/${INSTANCE}/workspaces/${ID}`],
        [`happy://${INSTANCE}/projects/${ID}`, `1/${INSTANCE}/projects/${ID}`],
        [`happy://${INSTANCE}/surfaces/${ID}`, `1/${INSTANCE}/surfaces/${ID}`],
        [`happy://${INSTANCE}/users/${ID}`, `1/${INSTANCE}/users/${ID}`],
        [
            `happy://${INSTANCE}/workspaces/ws_1/services/web-2`,
            `1/${INSTANCE}/workspaces/ws_1/services/web-2`,
        ],
        [
            `happy://${INSTANCE}/agents/${ID}/files/src/main.ts#L42`,
            `1/${INSTANCE}/agents/${ID}/files/src/main.ts?lines=42`,
        ],
        [
            `happy://${INSTANCE}/workspaces/${ID}/files/docs/My%20Notes.md#L3-L9`,
            `1/${INSTANCE}/workspaces/${ID}/files/docs/My%20Notes.md?lines=3-9`,
        ],
    ];
    for (const [url, payload, as] of cases)
        it(payload, () => {
            expect(happyShareLinkFormat(url, as)).toBe(`${PAGE}${payload}`);
            expect(happyShareLinkParse(`${PAGE}${payload}`)).toEqual({
                url,
                instanceId: INSTANCE,
                ...(as === undefined ? {} : { as }),
            });
        });
});

describe("refuses whatever is not exactly a share link", () => {
    const fragments = [
        "",
        `2/${INSTANCE}/agents/${ID}`,
        `10/${INSTANCE}/agents/${ID}`,
        `1/${INSTANCE}/agents/${"a".repeat(4100)}`,
        // link.happy.engineering's v1: names something, but no installation.
        `1/agents/${ID}`,
        `1/artifacts/${ID}?version=2`,
        "hello",
        "1/",
        `1/${INSTANCE}`,
        `1/${INSTANCE}/`,
        `1/${INSTANCE.toUpperCase()}/agents/${ID}`,
        `1/${INSTANCE}x/agents/${ID}`,
        `1/9${INSTANCE.slice(1)}/agents/${ID}`,
        `1/${INSTANCE}/agent/${ID}`,
        `1/${INSTANCE}/agents/${ID}/`,
        `1/${INSTANCE}/agents/a.b`,
        `1/${INSTANCE}/sessions/${ID}`,
        `1/${INSTANCE}/agents/${ID}?title=Plan`,
        `1/${INSTANCE}/chief-of-staff?text=hi`,
        `1/${INSTANCE}/organizations/org_1/join`,
        `1/${INSTANCE}/agents/${ID}?as=task&as=bot`,
        `1/${INSTANCE}/agents/${ID}?as=Task`,
        `1/${INSTANCE}/agents/${ID}?as=admin`,
        `1/${INSTANCE}/agents/${ID}?as=`,
        `1/${INSTANCE}/agents/${ID}?`,
        `1/${INSTANCE}/artifacts/${ID}?as=task`,
        `1/${INSTANCE}/agents/${ID}?version=2`,
        `1/${INSTANCE}/artifacts/${ID}?version=0`,
        `1/${INSTANCE}/artifacts/${ID}?version=01`,
        `1/${INSTANCE}/artifacts/${ID}?version=1000000000`,
        `1/${INSTANCE}/agents/${ID}/files/a/../b`,
        `1/${INSTANCE}/agents/${ID}/files/a%2Fb`,
        `1/${INSTANCE}/agents/${ID}/files/a%5Cb`,
        `1/${INSTANCE}/agents/${ID}/files/a%00b`,
        `1/${INSTANCE}/agents/${ID}/files/a%zz`,
        `1/${INSTANCE}/agents/${ID}/files/a//b`,
        `1/${INSTANCE}/agents/${ID}/files/a.ts?lines=9-3`,
        `1/${INSTANCE}/agents/${ID}/files/a.ts?lines=L9`,
        `1/${INSTANCE}/agents/${ID}#x`,
        `1/${INSTANCE}/agents/${ID}?as=task#x`,
        "1/javascript:alert(1)",
    ];
    for (const fragment of fragments)
        it(JSON.stringify(fragment.slice(0, 80)), () => {
            expect(happyShareLinkParse(`${PAGE}${fragment}`)).toBeUndefined();
        });
    it("another host or scheme", () => {
        for (const url of [
            `https://link.happy.engineering/#1/${INSTANCE}/agents/${ID}`,
            `http://link.happy.page/#1/${INSTANCE}/agents/${ID}`,
            `https://link.happy.page.evil.com/#1/${INSTANCE}/agents/${ID}`,
            `https://evil.com/?https://link.happy.page/#1/${INSTANCE}/agents/${ID}`,
        ])
            expect(happyShareLinkParse(url), url).toBeUndefined();
    });
});

it("writes a share link only for a canonical instance link", () => {
    for (const url of [
        `happy://agents/${ID}`,
        `happy://${INSTANCE}/agents/${ID}/`,
        `happy://${INSTANCE}/agents/${ID}?as=task`,
        `happy://${INSTANCE}/agents/${ID}/files/a%2fb`,
        `${PAGE}1/${INSTANCE}/agents/${ID}`,
        `HAPPY://${INSTANCE}/agents/${ID}`,
    ])
        expect(happyShareLinkFormat(url), url).toBeUndefined();
    // The role is said of agents only.
    expect(happyShareLinkFormat(`happy://${INSTANCE}/artifacts/${ID}`, "task")).toBeUndefined();
});

it("opens from outside the app as the instance link it carries", () => {
    expect(happyExternalLinkParse(`${PAGE}1/${INSTANCE}/artifacts/${ID}?version=2`)).toMatchObject({
        kind: "instance",
        instanceId: INSTANCE,
        url: `happy://artifacts/${ID}?version=2`,
    });
    expect(happyExternalLinkParse(`${PAGE}1/agents/${ID}`)).toEqual({ kind: "unsupported" });
});

it("reads share links naming this instance in Markdown as the Happy links they carry", () => {
    const share = `${PAGE}1/${INSTANCE}/agents/${ID}?as=task`;
    const happy = `happy://${INSTANCE}/agents/${ID}`;
    const foreign = `${PAGE}1/${OTHER}/agents/${ID}`;
    const here = (instanceId: string) => instanceId === INSTANCE;
    expect(happyShareLinksRewrite(`See ${share}.`, here)).toBe(`See [](${happy}).`);
    expect(happyShareLinksRewrite(`See [the plan](${share}) now`, here)).toBe(
        `See [the plan](${happy}) now`,
    );
    expect(happyShareLinksRewrite(`<${share}>`, here)).toBe(`[](${happy})`);
    // Another server's, or any without an instance here, is a web address.
    expect(happyShareLinksRewrite(`See ${foreign}`, here)).toBe(`See ${foreign}`);
    expect(happyShareLinksRewrite(`See ${share}`, () => false)).toBe(`See ${share}`);
    // Code stays literal.
    expect(happyShareLinksRewrite(`\`${share}\` and ${share}`, here)).toBe(
        `\`${share}\` and [](${happy})`,
    );
    const fenced = `\`\`\`\n${share}\n\`\`\`\n${share}`;
    expect(happyShareLinksRewrite(fenced, here)).toBe(`\`\`\`\n${share}\n\`\`\`\n[](${happy})`);
});
