import { expect, it } from "vitest";
import "../theme.css";
import "../styles/icon.css";
import "../styles/vector-icon.css";
import "../styles/button.css";
import "../styles/copy-button.css";
import "../styles/code-block.css";
import "../styles/gen-ui.css";
import { createRenderer } from "../testing";
import {
    genUiActionsServed,
    genUiRenderParse,
    genUiRenderParseText,
    type GenUiAction,
} from "./genUiRender";
import { GenUiRenderView } from "./GenUiRenderView";
import actionsConformance from "./shared/conformance/actions.json";

/* The daemon's compiled reference documents, copied verbatim. */
const compiled = import.meta.glob<string>("../../dev/assets/genui/*.render.json", {
    eager: true,
    import: "default",
    query: "?raw",
});

const fileUrl = () => "data:,";

for (const [path, source] of Object.entries(compiled)) {
    it(`renders ${path.split("/").pop()}`, async () => {
        const document = genUiRenderParseText(source);
        const view = createRenderer();
        view.render(() => <GenUiRenderView document={document} fileUrl={fileUrl} still />, {
            width: 720,
            height: 900,
            padding: 16,
        });
        await view.ready();
        const root = view.container.querySelector('[data-happy-desktop-ui="gen-ui"]');
        expect(root).not.toBeNull();
        expect(root?.querySelector(".gen-ui-fallback")).toBeNull();
        expect(root?.firstElementChild).not.toBeNull();
        expect(root?.getBoundingClientRect().height).toBeGreaterThan(0);
    });
}

it("shows the fallback text for a document it cannot draw", async () => {
    const view = createRenderer();
    view.render(
        () => (
            <GenUiRenderView
                document={genUiRenderParse({ genuiRender: 9, fallback: "Release 2.41 is ready" })}
                fileUrl={fileUrl}
            />
        ),
        { width: 400, height: 120, padding: 16 },
    );
    await view.ready();
    expect(view.container.querySelector(".gen-ui-fallback")?.textContent).toBe(
        "Release 2.41 is ready",
    );
});

it("reports actions, keeps a single choice, and marks unsupported ones", async () => {
    const reported: Array<{ key: string; action: GenUiAction }> = [];
    const document = genUiRenderParse({
        genuiRender: 1,
        root: "root",
        elements: {
            root: { type: "box", props: { role: "actions" }, children: ["a", "b", "tool"] },
            a: {
                type: "button",
                props: {
                    label: "Ship it",
                    variant: "primary",
                    group: "decide",
                    action: { type: "message", text: "Ship it" },
                },
            },
            b: {
                type: "button",
                props: {
                    label: "Hold",
                    variant: "secondary",
                    group: "decide",
                    action: { type: "message", text: "Hold" },
                },
            },
            tool: {
                type: "button",
                props: {
                    label: "Rerun",
                    variant: "secondary",
                    action: { type: "tool", name: "rerun" },
                },
            },
        },
    });
    const view = createRenderer();
    view.render(
        () => (
            <GenUiRenderView
                actionsSupported={new Set(["message"])}
                document={document}
                fileUrl={fileUrl}
                onAction={(key, action) => {
                    reported.push({ key, action });
                }}
            />
        ),
        { width: 600, height: 120, padding: 16 },
    );
    await view.ready();
    const buttons = [...view.container.querySelectorAll<HTMLButtonElement>(".gen-ui-button")];
    expect(buttons.map((button) => button.textContent)).toEqual(["Ship it", "Hold", "Rerun"]);
    const [ship, hold, rerun] = buttons;
    expect(rerun?.disabled).toBe(true);
    expect(rerun?.title).toBe("Not supported yet");

    ship?.click();
    await expect.poll(() => reported.length).toBe(1);
    expect(reported[0]).toEqual({ key: "a", action: { type: "message", text: "Ship it" } });
    /* The first pick sticks; the rest of the group can no longer be chosen. */
    await expect.poll(() => hold?.disabled).toBe(true);
    hold?.click();
    expect(reported.length).toBe(1);
});

it("reports an image viewer tap to the host apart from actions", async () => {
    const opened: Array<[string, string, number]> = [];
    const document = genUiRenderParse({
        genuiRender: 1,
        root: "pic",
        elements: {
            pic: {
                type: "image",
                props: {
                    file: "a.jpg",
                    width: 4,
                    height: 3,
                    thumbhash: "",
                    alt: "Harbour",
                    viewer: { group: "trip", index: 2 },
                },
            },
        },
    });
    const view = createRenderer();
    view.render(
        () => (
            <GenUiRenderView
                document={document}
                fileUrl={fileUrl}
                onAction={() => {
                    throw new Error("a viewer tap is not an action");
                }}
                onViewerOpen={(key, group, index) => {
                    opened.push([key, group, index]);
                }}
            />
        ),
        { width: 400, height: 360, padding: 16 },
    );
    await view.ready();
    view.container.querySelector<HTMLButtonElement>(".gen-ui-image-open")?.click();
    expect(opened).toEqual([["pic", "trip", 2]]);
});

/* The spec's conformance cases: which element each host enables. Nothing is dropped. */
/* Every conformance host reports both capabilities. */
const REPORTED = { secretActions: true, plugins: true } as const;
const conformanceHosts = {
    happy_agent: genUiActionsServed({ backend: "happyAgent", origin: true, ...REPORTED }),
    happy_agent_without_origin: genUiActionsServed({
        backend: "happyAgent",
        origin: false,
        ...REPORTED,
    }),
    cluster: genUiActionsServed({ backend: "cluster", origin: true, ...REPORTED }),
} as const;

for (const [host, served] of Object.entries(conformanceHosts)) {
    it(`enables exactly the actions the spec's conformance expects for ${host}`, async () => {
        const view = createRenderer();
        view.render(
            () => (
                <GenUiRenderView
                    actionsSupported={served}
                    document={genUiRenderParse(actionsConformance.document)}
                    fileUrl={fileUrl}
                />
            ),
            { width: 600, height: 900, padding: 16 },
        );
        await view.ready();
        const enabled = Object.fromEntries(
            [...view.container.querySelectorAll<HTMLElement>("[data-gen-ui-key]")].map(
                (element) => [
                    element.dataset.genUiKey,
                    element instanceof HTMLButtonElement && !element.disabled,
                ],
            ),
        );
        const expected = Object.fromEntries(
            actionsConformance.cases.map((entry) => [
                entry.element,
                entry.enabled[host as keyof typeof conformanceHosts],
            ]),
        );
        expect(enabled).toEqual(expected);
    });
}
