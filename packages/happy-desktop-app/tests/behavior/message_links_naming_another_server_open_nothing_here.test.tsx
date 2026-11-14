import { fireEvent, render } from "@testing-library/react";
import { expect, it } from "vitest";
import type {
    HappyAgentArtifactTitlesSnapshot,
    HappyAgentGroupId,
    HappyAgentSessionListSnapshot,
} from "happy-desktop-state";
import { Message } from "happy-desktop-ui";
import {
    artifactTitlesStoreNoop,
    messageReferenceEntities,
    messageReferencesCreate,
} from "../../sources/messageReferences";

/*
 * A message read on one server can carry a link that names another
 * installation. What that link names lives there, not here, so it reads as a
 * placeholder and opens nothing; the same link naming this server, or no server,
 * opens here as before.
 */

const HERE = "aaaaaaaaaaaaaaaaaaaaaaaa";
const ELSEWHERE = "bbbbbbbbbbbbbbbbbbbbbbbb";

const list = {
    projects: {
        type: "ready",
        value: [
            {
                id: "prj_one",
                name: "happy-desktop",
                lifecycle: { phase: "ready" },
                conversations: [{ id: "ses_one", title: "Review", activity: "idle" }],
                worktrees: [],
            },
        ],
    },
    bots: [],
    tasks: [],
} as unknown as HappyAgentSessionListSnapshot;

function messageRender(instanceId: string | undefined) {
    const opened: string[] = [];
    const files: string[] = [];
    const references = messageReferencesCreate({
        instanceId,
        titles: new Map() as HappyAgentArtifactTitlesSnapshot,
        titlesStore: artifactTitlesStoreNoop,
        entities: messageReferenceEntities(list),
        onGroupOpen: (groupId: HappyAgentGroupId, agentId?: string) =>
            opened.push(`${groupId}/${agentId ?? ""}`),
    });
    const view = render(
        <Message
            agent
            author="Happy"
            body={[
                `Here: [plain](happy://agents/ses_one).`,
                `Same server: [mine](happy://${HERE}/agents/ses_one).`,
                `Elsewhere: [theirs](happy://${ELSEWHERE}/agents/ses_one).`,
                `A file elsewhere: [plan](happy://${ELSEWHERE}/agents/ses_one/files/plan.md).`,
                `A file here: [notes](happy://agents/ses_one/files/notes.md).`,
            ].join("\n\n")}
            onFileLinkOpen={(link) => files.push(link.path)}
            references={references}
        />,
    );
    const links = () =>
        [...view.container.querySelectorAll("a")].map((link) => link.textContent ?? "");
    return { view, opened, files, links };
}

it("opens a link naming this server, and leaves one naming another as a placeholder", () => {
    const { view, opened, files, links } = messageRender(HERE);
    expect(links()).toEqual(["Review", "Review", "notes"]);
    expect(view.container.textContent).toContain("Elsewhere: an unavailable agent.");
    expect(view.container.textContent).toContain("A file elsewhere: plan.");
    for (const link of view.container.querySelectorAll("a")) fireEvent.click(link);
    expect(opened).toEqual(["prj_one/ses_one", "prj_one/ses_one"]);
    expect(files).toEqual(["notes.md"]);
    view.unmount();
});

it("opens no instance link at all while this server has not said which it is", () => {
    const { view, links } = messageRender(undefined);
    expect(links()).toEqual(["Review", "notes"]);
    expect(view.container.textContent).toContain("Same server: an unavailable agent.");
    view.unmount();
});
