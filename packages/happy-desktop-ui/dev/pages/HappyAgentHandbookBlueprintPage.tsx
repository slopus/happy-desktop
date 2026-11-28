import { useState } from "react";
import type { DocumentEditorUser } from "../../src/DocumentEditor";
import type { HappyAgentHandbookPerson } from "../../src/pages/handbook/handbookPresentation";
import { handbookTreeOf } from "../../src/pages/handbook/handbookTree";
import type { HappyAgentHandbookEditorProps } from "../../src/pages/handbook/HappyAgentHandbookEditor";
import { HappyAgentHandbookFolderDialog } from "../../src/pages/handbook/HappyAgentHandbookFolderDialog";
import { HappyAgentHandbookMovePicker } from "../../src/pages/handbook/HappyAgentHandbookMovePicker";
import type {
    HappyAgentHandbookHistoryPanelProps,
    HappyAgentHandbookHistoryRow,
} from "../../src/pages/handbook/HappyAgentHandbookHistoryPanel";
import {
    HappyAgentHandbookPage,
    type HappyAgentHandbookFolderView,
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

/** The pages the item specimens open, with the state they show. */
const SPECIAL: Readonly<
    Record<
        string,
        {
            readonly id: string;
            readonly description?: string;
            readonly alwaysInContext?: boolean;
            readonly pending?: boolean;
            readonly revision?: number | null;
            readonly pendingPeople?: readonly HappyAgentHandbookPerson[];
        }
    >
> = {
    Deploys: {
        id: "hb_deploys",
        description: "How and when we ship each service",
        pending: true,
        revision: 5,
        pendingPeople: [KIRILL, STEVE],
    },
    "Code style": { id: "hb_style", alwaysInContext: true, revision: 3 },
    "On-call": { id: "hb_oncall", revision: 2 },
    "Release notes": {
        id: "hb_release",
        description: "What changed, for people rather than for the code",
        pending: true,
        revision: null,
        pendingPeople: [ANA],
    },
    "Kickoff call": {
        id: "hb_kickoff",
        description: "The first meeting with a new customer: agenda and owners",
    },
    "First 30 days": {
        id: "hb_first-30",
        description: "Milestones a new customer should reach in their first month of onboarding",
        pending: true,
        revision: 2,
        pendingPeople: [ANA],
    },
};

/** A category, its folders, and their pages, as a team like Octavius's files them. */
type Shelf = readonly [name: string, icon: string, folders: readonly Folder[]];
type Folder = readonly [name: string, pages: readonly string[], subfolders?: readonly Folder[]];

const SHELVES: readonly Shelf[] = [
    [
        "Sales",
        "trending-up-outline",
        [
            ["Enablement", ["Discovery calls", "Demo script"]],
            ["Forecast", ["Weekly commit", "Pipeline hygiene"]],
            ["Process", ["Deal desk", "Pricing approvals", "Handoff to success"]],
        ],
    ],
    [
        "Marketing",
        "megaphone-outline",
        [
            ["Operations", ["Campaign briefs", "Lead routing"]],
            ["Programs", ["Webinars", "Customer stories"]],
            ["Strategy", ["Positioning", "Messaging", "Launch tiers"]],
        ],
    ],
    [
        "Engineering",
        "code-slash-outline",
        [
            ["Architecture", ["Service map", "Data ownership"]],
            ["Delivery", ["Code review", "Code style"]],
            ["Reliability", ["Deploys", "On-call"]],
            ["Security", ["Secrets"]],
        ],
    ],
    [
        "Customer Success and Support",
        "headset-outline",
        [
            [
                "Customer Success",
                [],
                [
                    ["Adoption", ["Health scores", "Usage reviews"]],
                    ["Onboarding", ["Kickoff call", "First 30 days"]],
                    ["Renewals", ["Renewal playbook", "Churn risk"]],
                    ["Support", ["Escalations"]],
                ],
            ],
        ],
    ],
    [
        "Operations",
        "settings-outline",
        [
            ["Business Operations", ["Planning cadence", "Vendor reviews"]],
            ["Knowledge Management", ["Where things live", "Writing guide"]],
            ["Revops", ["CRM fields", "Territories", "Comp plans"]],
            ["Risk Management", ["Incident reviews"]],
        ],
    ],
    [
        "Finance",
        "wallet-outline",
        [
            ["Controls", ["Spend approvals", "Expense policy"]],
            ["Planning", ["Budget cycle", "Headcount plan"]],
            ["Reporting", ["Month-end close"]],
            ["Revenue Recognition", ["Contracts", "Usage billing"]],
        ],
    ],
    [
        "People and HR",
        "people-outline",
        [
            ["Compensation", ["Pay bands"]],
            ["Development", ["Career ladders", "Feedback"]],
            ["Talent", ["Interview loops", "Offers"]],
            ["Workplace", ["Remote work", "Travel"]],
        ],
    ],
    [
        "Product and Design",
        "color-palette-outline",
        [
            ["Analytics", ["Event naming"]],
            ["Delivery", ["Specs", "Release notes", "Betas"]],
            ["Discovery", ["Interviews", "Research repository"]],
            ["Strategy", ["Roadmap", "Principles"]],
        ],
    ],
    [
        "General",
        "grid-outline",
        [
            ["Communication", ["Meetings", "Async updates"]],
            ["Company", ["Mission", "Values", "Glossary"]],
            ["Governance", ["Decision records", "Policies"]],
        ],
    ],
];

const slug = (value: string): string => value.toLowerCase().replaceAll(/[^a-z0-9]+/gu, "-");

/** The fixture's folders and pages, with Deploys, Code style and Release notes in their places. */
const LIBRARY = ((): {
    folders: HappyAgentHandbookFolderView[];
    items: HappyAgentHandbookListRow[];
} => {
    const folders: HappyAgentHandbookFolderView[] = [];
    const items: HappyAgentHandbookListRow[] = [];
    const file = (folder: Folder, parentId: string, path: string): void => {
        const id = `hf_${slug(path)}`;
        folders.push({ id, parentId, name: folder[0], icon: null });
        for (const title of folder[1]) {
            const special = SPECIAL[title];
            items.push({
                id: special?.id ?? `hb_${slug(`${path}-${title}`)}`,
                title,
                description: special?.description ?? "",
                folderId: id,
                alwaysInContext: special?.alwaysInContext ?? false,
                pending: special?.pending ?? false,
                revision: special?.revision === undefined ? 1 : special.revision,
                pendingPeople: special?.pendingPeople ?? [],
            });
        }
        for (const child of folder[2] ?? []) file(child, id, `${path}-${child[0]}`);
    };
    for (const [name, icon, children] of SHELVES) {
        const id = `hf_${slug(name)}`;
        folders.push({ id, parentId: null, name, icon });
        for (const child of children) file(child, id, `${name}-${child[0]}`);
    }
    items.push({
        id: "hb_instructions",
        title: "Instructions",
        description: "What every agent on the team was told before the handbook",
        folderId: null,
        alwaysInContext: true,
        pending: false,
        revision: 1,
        pendingPeople: [],
    });
    return { folders, items };
})();

const RELIABILITY = "hf_engineering-reliability";
const TREE = handbookTreeOf(LIBRARY.folders, LIBRARY.items);

const PAGE: HappyAgentHandbookPageProps = {
    status: "ready",
    folders: LIBRARY.folders,
    items: LIBRARY.items,
    selectedId: "hb_deploys",
    canEdit: true,
    canApply: true,
    search: "",
    defaultExpandedIds: ["hf_customer-success-and-support-customer-success"],
    onSearchChange: noop,
    onItemSelect: noop,
    onHome: noop,
    onItemCreate: noop,
    onFolderCreate: noop,
    onFolderEdit: noop,
    onFolderMove: noop,
    onFolderDelete: noop,
    onApplyAll: noop,
};

/** The home, with its search typed into for real. */
function Home(props: Partial<HappyAgentHandbookPageProps>) {
    const [search, setSearch] = useState(props.search ?? "");
    return (
        <HappyAgentHandbookPage
            {...PAGE}
            selectedId={undefined}
            {...props}
            onSearchChange={setSearch}
            search={search}
        />
    );
}

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
        onMove: noop,
        onHandbookOpen: noop,
        breadcrumb: ["Engineering", "Reliability"],
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
                detail="Steve and Kirill write in the same draft at once, each with their own caret; every change merges as it arrives and is saved as it is typed. The page says it is unapplied, with whose edits, under where it is filed."
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
            detail="A member without handbook.edit or handbook.apply reads everything, the drafts included, but nothing is editable and there is no New page, New folder, Move, Apply, Apply all or Remove."
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

function HomeSpecimens() {
    return (
        <>
            <FullScreenSpecimen
                detail="Nine categories as tiles, three across: each with its icon, name and page count, then a small tree of its folders with their counts. Customer Success is open in place to its own folders; Instructions, filed nowhere, closes the grid in an unnamed tile. Hover a folder for its menu."
                label="Home"
                number="09"
                screen="09-home-1280x792"
                window={WINDOW}
            >
                <Home />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The home at Happy's smallest window: the grid drops to the columns that fit."
                label="Home, smallest window"
                number="09b"
                screen="09b-home-760x670"
                window={MINIMUM}
            >
                <Home />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Searching filters pages by title, description and folder path, here “onboard”: Onboarding's pages, found by their folder, each with its path and description."
                label="Search"
                number="10"
                screen="10-search-1280x792"
                window={WINDOW}
            >
                <Home search="onboard" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Move to… for a page: every folder as a tree under the categories' icons, with where it is now marked. Moving files it at once; nothing is applied and agents are not told."
                label="Move to…"
                number="11"
                screen="11-move-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookMovePicker
                    current={RELIABILITY}
                    onClose={noop}
                    onMove={noop}
                    target={{ kind: "item", id: "hb_deploys", title: "Deploys" }}
                    tree={TREE}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Moving the Engineering category: it cannot go inside itself, and its two levels rule out folders already three deep, such as Customer Success's. It is on its way into General."
                label="Move a folder"
                number="11b"
                screen="11b-move-folder-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookMovePicker
                    current={null}
                    moving="hf_general"
                    onClose={noop}
                    onMove={noop}
                    target={{ kind: "folder", id: "hf_engineering", title: "Engineering" }}
                    tree={TREE}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A new category names itself and picks its icon from the house set."
                label="New category"
                number="12"
                screen="12-new-category-1280x792"
                window={WINDOW}
            >
                <HappyAgentHandbookFolderDialog
                    icon="shield-checkmark-outline"
                    mode="create"
                    name="Legal"
                    onClose={noop}
                    onIconChange={noop}
                    onNameChange={noop}
                    onSubmit={noop}
                    saving={false}
                    topLevel
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A refused write says why on the page until it is dismissed: here, deleting a folder that still holds pages."
                label="Refused"
                number="13"
                screen="13-refused-1280x792"
                window={WINDOW}
            >
                <Home
                    failure="Only an empty folder can be deleted. Move its pages and folders out first; removed pages still count."
                    onFailureDismiss={noop}
                />
            </FullScreenSpecimen>
        </>
    );
}

export function HappyAgentHandbookBlueprintPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The team's handbook: pages filed in folders by team, written together, applied when they're ready, with a review that holds what was read and a history of every change."
            title="Handbook"
            width={WINDOW.width + 64}
        >
            <FullScreenSpecimen
                detail="A team with nothing written yet. Someone who may edit is offered a first page or a first category."
                label="Empty"
                number="01"
                screen="01-empty-1280x792"
                window={WINDOW}
            >
                <Home folders={[]} items={[]} />
            </FullScreenSpecimen>
            <HomeSpecimens />
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
