import { useState } from "react";
import type { DocumentEditorUser } from "../../src/DocumentEditor";
import type { HappyAgentHandbookPerson } from "../../src/pages/handbook/handbookPresentation";
import type { HappyAgentHandbookEditorProps } from "../../src/pages/handbook/HappyAgentHandbookEditor";
import type {
    HappyAgentHandbookHistoryPanelProps,
    HappyAgentHandbookHistoryRow,
} from "../../src/pages/handbook/HappyAgentHandbookHistoryPanel";
import {
    HappyAgentHandbookPage,
    type HappyAgentHandbookListRow,
    type HappyAgentHandbookPageProps,
} from "../../src/pages/handbook/HappyAgentHandbookPage";
import {
    HappyAgentHandbookReviewSheet,
    type HappyAgentHandbookReviewEntry,
} from "../../src/pages/handbook/HappyAgentHandbookReviewSheet";
import { HappyAgentInstructionsSettings } from "../../src/pages/settings/HappyAgentInstructionsSettings";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";
import { useDocumentAlone, useDocumentPair, type DocumentWindow } from "./documentFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-050";

const WINDOW = { width: 1280, height: 792 } as const;
const MINIMUM = { width: 760, height: 670 } as const;

const noop = () => undefined;

const STEVE: HappyAgentHandbookPerson = { id: "u_steve", name: "Steve Korshakov" };
const KIRILL: HappyAgentHandbookPerson = { id: "u_kirill", name: "Kirill" };
const ANA: HappyAgentHandbookPerson = { id: "u_ana", name: "Ana Lima" };

const STEVE_WRITING: DocumentEditorUser = { name: "Steve", tone: "ocean" };
const KIRILL_WRITING: DocumentEditorUser = { name: "Kirill", tone: "ember" };

const APPLIED_DEPLOYS = `## Deploying

Deploy straight to production after CI passes.

- Desktop previews ship from \`main\` through the release workflow.
- Never deploy on a Friday afternoon.
`;

const DRAFT_DEPLOYS = `## Deploying

Deploy to staging first; promote to production after a smoke test.

- Desktop previews ship from \`main\` through the release workflow.
- Never deploy on a Friday afternoon.
- Write the rollback command into the deploy thread before you start.
`;

const ITEMS: readonly HappyAgentHandbookListRow[] = [
    {
        id: "hb_style",
        title: "Code style",
        alwaysInContext: true,
        pending: false,
        revision: 3,
        pendingPeople: [],
    },
    {
        id: "hb_deploys",
        title: "Deploys",
        alwaysInContext: false,
        pending: true,
        revision: 5,
        pendingPeople: [KIRILL, STEVE],
    },
    {
        id: "hb_oncall",
        title: "On-call",
        alwaysInContext: false,
        pending: false,
        revision: 2,
        pendingPeople: [],
    },
    {
        id: "hb_release",
        title: "Release notes",
        alwaysInContext: false,
        pending: true,
        revision: null,
        pendingPeople: [ANA],
    },
];

const PAGE: HappyAgentHandbookPageProps = {
    status: "ready",
    items: ITEMS,
    selectedId: "hb_deploys",
    canEdit: true,
    canApply: true,
    onItemSelect: noop,
    onItemCreate: noop,
    onApplyAll: noop,
};

function editorFor(
    window: DocumentWindow,
    change: Partial<HappyAgentHandbookEditorProps> = {},
): HappyAgentHandbookEditorProps {
    return {
        itemId: "hb_deploys",
        title: "Deploys",
        description: "How and when we ship each service",
        alwaysInContext: false,
        revision: 5,
        pending: true,
        pendingPeople: [KIRILL, STEVE],
        editedLabel: "edited 2 min ago",
        canEdit: true,
        canApply: true,
        content: { kind: "live", ...window },
        historyOpen: false,
        onTitleChange: noop,
        onDescriptionChange: noop,
        onAlwaysInContextChange: noop,
        onHistoryToggle: noop,
        onApply: noop,
        onDiscard: noop,
        onRemove: noop,
        ...change,
    };
}

const HISTORY_ROWS: readonly HappyAgentHandbookHistoryRow[] = [
    {
        kind: "session",
        key: "s:46-48",
        author: KIRILL,
        when: "Today 18:41–18:44",
        changes: 3,
    },
    {
        kind: "session",
        key: "s:42-45",
        author: STEVE,
        when: "Today 18:20–18:35",
        changes: 4,
    },
    {
        kind: "revision",
        key: "r:5",
        revision: 5,
        appliedBy: STEVE,
        when: "Nov 26, 17:02",
        note: "Fridays are off limits",
        contributors: [STEVE, ANA],
        current: true,
    },
    {
        kind: "session",
        key: "s:30-41",
        author: ANA,
        when: "Nov 26, 16:10–16:48",
        changes: 12,
    },
    {
        kind: "revision",
        key: "r:4",
        revision: 4,
        appliedBy: STEVE,
        when: "Nov 20, 11:30",
        contributors: [STEVE],
        current: false,
    },
];

const HISTORY: HappyAgentHandbookHistoryPanelProps = {
    status: "ready",
    rows: HISTORY_ROWS,
    expanded: new Map([
        ["s:42-45", { kind: "ready", before: APPLIED_DEPLOYS, after: DRAFT_DEPLOYS } as const],
    ]),
    more: true,
    loadingMore: false,
    canEdit: true,
    onToggle: noop,
    onRestore: noop,
    onMore: noop,
    onClose: noop,
};

const REVIEW_DEPLOYS: HappyAgentHandbookReviewEntry = {
    id: "hb_deploys",
    title: "Deploys",
    revision: 5,
    contributors: [KIRILL, STEVE],
    metadata: {
        kind: "ready",
        changes: [
            {
                label: "Description",
                from: "How we ship",
                to: "How and when we ship each service",
            },
        ],
    },
    comparison: { kind: "ready", before: APPLIED_DEPLOYS, after: DRAFT_DEPLOYS },
    editing: [],
    changedSinceOpened: false,
};

const REVIEW_RELEASE: HappyAgentHandbookReviewEntry = {
    id: "hb_release",
    title: "Release notes",
    revision: null,
    contributors: [ANA],
    metadata: { kind: "ready", changes: [] },
    comparison: {
        kind: "ready",
        before: "",
        after: "Every release says what changed for people, not for the code.\n",
    },
    editing: [],
    changedSinceOpened: false,
};

const REVIEW = {
    entries: [REVIEW_DEPLOYS, REVIEW_RELEASE],
    note: "Staging first",
    applying: false,
    onNoteChange: noop,
    onApply: noop,
    onClose: noop,
};

function SeveralEditors() {
    const [steve, kirill] = useDocumentPair(DRAFT_DEPLOYS, [STEVE_WRITING, KIRILL_WRITING]);
    return (
        <>
            <FullScreenSpecimen
                detail="Steve and Kirill write in the same draft at once, each with their own caret; every change merges as it arrives and is saved as it is typed. The list marks the item unapplied, with whose edits."
                label="Several editors, Steve's window"
                number="02"
                screen="02-several-editors-steve-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookPage {...PAGE} editor={editorFor(steve)} />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The same draft in Kirill's window, a moment later: his change is still on its way."
                label="Several editors, Kirill's window"
                number="02b"
                screen="02b-several-editors-kirill-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookPage
                    {...PAGE}
                    editor={editorFor({ ...kirill, sync: "saving" })}
                />
            </FullScreenSpecimen>
        </>
    );
}

function Pending() {
    const window = useDocumentAlone(DRAFT_DEPLOYS, STEVE_WRITING);
    return (
        <>
            <FullScreenSpecimen
                detail="An item with unapplied edits and its history open: Kirill's and Steve's sessions since revision 5, the revision agents follow, and the edits it published. Steve's session is open to its exact change, with Restore to draft."
                label="Pending, with history"
                number="03"
                screen="03-pending-history-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookPage
                    {...PAGE}
                    editor={editorFor(window, { historyOpen: true })}
                    history={HISTORY}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The same at Happy's smallest window."
                label="Pending, smallest window"
                number="03b"
                screen="03b-pending-760x670"
                window={MINIMUM}
            >
                <HappyAgentHandbookPage {...PAGE} editor={editorFor(window)} />
            </FullScreenSpecimen>
        </>
    );
}

function ReadOnly() {
    const window = useDocumentAlone(DRAFT_DEPLOYS, STEVE_WRITING);
    return (
        <FullScreenSpecimen
            detail="A member without handbook.edit or handbook.apply reads everything, the drafts included, but nothing is editable and there is no New item, Apply, Apply all or Remove."
            label="Read only"
            number="06"
            screen="06-read-only-1280x792"
            window={WINDOW}
        >
            <HappyAgentHandbookPage
                {...PAGE}
                canApply={false}
                canEdit={false}
                editor={editorFor(window, { canEdit: false, canApply: false })}
            />
        </FullScreenSpecimen>
    );
}

function ApplyWhileEditing() {
    return (
        <FullScreenSpecimen
            detail="Steve opened the review while Kirill keeps typing. The sheet holds what Steve reviewed (baseSeq) and says that Kirill's later changes stay unapplied."
            label="Apply while someone is editing"
            number="05"
            screen="05-apply-conflict-1280x792"
            window={WINDOW}
        >
            <HappyAgentHandbookReviewSheet
                {...REVIEW}
                entries={[{ ...REVIEW_DEPLOYS, editing: [KIRILL], changedSinceOpened: true }]}
                note=""
            />
        </FullScreenSpecimen>
    );
}

function SettingsLink() {
    const [opened, setOpened] = useState(0);
    return (
        <HappyAgentInstructionsSettings
            documents={[
                {
                    kind: "link",
                    id: "agents",
                    label: "AGENTS.md",
                    description:
                        "Given to every agent on this team, on top of the project's own AGENTS.md.",
                    title: "Instructions are now the Handbook",
                    message:
                        opened === 0
                            ? "The team's instructions are items in its handbook, written together and applied when they're ready."
                            : `Opened the Handbook ${String(opened)} time${opened === 1 ? "" : "s"}.`,
                    action: "Open Handbook",
                    onOpen: () => setOpened(opened + 1),
                },
                {
                    id: "security",
                    label: "SECURITY.md",
                    description:
                        "Applied when this team's agents are reviewed for whether an action is allowed.",
                    path: "Team SECURITY.md",
                    placeholder: "Rules for deciding which agent actions are allowed…",
                    value: "",
                    bytes: 0,
                    maximumBytes: 262_144,
                    onValueChange: noop,
                    onSave: noop,
                    onRevert: noop,
                },
            ]}
        />
    );
}

export function HappyAgentHandbookBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The team's handbook: items people write together, applied when they're ready, with a review that holds what was read and a history of every change."
            title="Handbook"
            width={WINDOW.width + 64}
        >
            <FullScreenSpecimen
                detail="A team with nothing written yet. Someone who may edit is offered a first item."
                label="Empty"
                number="01"
                screen="01-empty-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookPage {...PAGE} items={[]} selectedId={undefined} />
            </FullScreenSpecimen>
            <SeveralEditors />
            <Pending />
            <FullScreenSpecimen
                detail="Apply all: one review of every unapplied item, each the change from what agents follow now to the draft as the sheet opened, with the metadata that changes and whose edits it publishes. A new item is all added."
                label="Apply review"
                number="04"
                screen="04-apply-review-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookReviewSheet {...REVIEW} />
            </FullScreenSpecimen>
            <ApplyWhileEditing />
            <FullScreenSpecimen
                detail="Someone applied newer edits while the sheet was open, so the server refused this apply; nothing was published."
                label="Apply refused"
                number="05b"
                screen="05b-apply-stale-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookReviewSheet
                    {...REVIEW}
                    entries={[REVIEW_DEPLOYS]}
                    error="Someone applied newer edits to “Deploys” since you opened this. Close it and review again."
                />
            </FullScreenSpecimen>
            <ReadOnly />
            <Specimen
                detail="On a server with a handbook, Settings › Instructions sends the team's instructions there; the security policy stays."
                label="Settings › Instructions"
                number="07"
            >
                <div style={{ width: 720 }}>
                    <SettingsLink />
                </div>
            </Specimen>
            <Specimen
                detail="The review sheet by itself, while it applies."
                label="Review, applying"
                number="08"
            >
                <HappyAgentHandbookReviewSheet {...REVIEW} applying />
            </Specimen>
        </ComponentPage>
    );
}
