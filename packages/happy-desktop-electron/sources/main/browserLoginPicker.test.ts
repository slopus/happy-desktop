import { afterAll, beforeAll, expect, it, vi } from "vitest";
import type { BrowserLoginCandidate } from "./browserLoginSources";

vi.mock("electron", () => ({ app: {}, dialog: {}, Menu: {}, shell: {} }));
const { browserLoginPickerTemplate } = await import("./browserPasswordGuest");
const { browserLoginsList } = await import("./browserLoginSources");

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
beforeAll(() => {
    Object.defineProperty(process, "platform", { value: "darwin" });
});
afterAll(() => {
    Object.defineProperty(process, "platform", platform);
});

function candidate(name: string, source: string): BrowserLoginCandidate {
    return {
        origin: "https://github.com",
        relation: "exact",
        name,
        source,
        use: async () => undefined,
    };
}

function labels(template: Electron.MenuItemConstructorOptions[]): string[] {
    return template.map((item) =>
        item.type === "separator"
            ? "────"
            : `${item.enabled === false ? "(disabled) " : ""}${item.label}`,
    );
}

it("says which browser the OS refused instead of claiming there are no saved logins", () => {
    const template = browserLoginPickerTemplate({
        origin: "https://github.com",
        fieldReady: true,
        candidates: [],
        accessDenied: ["Chrome"],
        accessDeniedExplain: () => undefined,
        choose: () => undefined,
    });

    expect(labels(template)).toEqual([
        "(disabled) github.com",
        "────",
        "macOS blocked access to Chrome’s saved logins…",
        "────",
        "(disabled) Happy reads these from your browsers and never stores passwords.",
    ]);
});

it("keeps other browsers' logins choosable beside a refused browser", () => {
    const chosen: string[] = [];
    const explained: string[] = [];
    const template = browserLoginPickerTemplate({
        origin: "https://github.com",
        fieldReady: true,
        candidates: [candidate("happy-test-user", "Arc")],
        accessDenied: ["Brave", "Chrome"],
        accessDeniedExplain: (browser) => explained.push(browser),
        choose: (picked) => chosen.push(picked.name),
    });

    expect(labels(template)).toEqual([
        "(disabled) github.com",
        "────",
        "happy-test-user · Arc",
        "────",
        "macOS blocked access to Brave’s saved logins…",
        "macOS blocked access to Chrome’s saved logins…",
        "────",
        "(disabled) Happy reads these from your browsers and never stores passwords.",
    ]);
    (template[2]!.click as () => void)();
    (template[5]!.click as () => void)();
    expect(chosen).toEqual(["happy-test-user"]);
    expect(explained).toEqual(["Chrome"]);
});

it("only names a refused browser on Windows, where there is no switch to point to", () => {
    Object.defineProperty(process, "platform", { value: "win32" });
    try {
        const template = browserLoginPickerTemplate({
            origin: "https://github.com",
            fieldReady: true,
            candidates: [],
            accessDenied: ["Edge"],
            accessDeniedExplain: () => undefined,
            choose: () => undefined,
        });
        expect(labels(template)).toContain(
            "(disabled) Windows blocked access to Edge’s saved logins",
        );
    } finally {
        Object.defineProperty(process, "platform", { value: "darwin" });
    }
});

it("still says there are no saved logins when nothing was refused", () => {
    const template = browserLoginPickerTemplate({
        origin: "https://github.com",
        fieldReady: true,
        candidates: [],
        accessDenied: [],
        accessDeniedExplain: () => undefined,
        choose: () => undefined,
    });

    expect(labels(template)).toContain("(disabled) No saved logins for this site");
});

it("names each refused browser once across sources, beside every source's logins", async () => {
    const listed = await browserLoginsList(
        [
            {
                list: async () => ({
                    candidates: [candidate("a", "Arc")],
                    accessDenied: ["Chrome"],
                }),
            },
            { list: async () => ({ candidates: [], accessDenied: ["Chrome", "Brave"] }) },
            { list: () => Promise.reject(new Error("unreadable")) },
        ],
        "https://github.com",
    );

    expect(listed.candidates.map((entry) => entry.name)).toEqual(["a"]);
    expect(listed.accessDenied).toEqual(["Brave", "Chrome"]);
});
