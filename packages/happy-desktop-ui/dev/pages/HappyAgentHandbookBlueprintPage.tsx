import type {
    HandbookCategory,
    HandbookChangeRequest,
    HandbookChangeRequestSnapshot,
    HandbookChangeRequestSummary,
    HandbookDocument,
    HandbookDocumentSnapshot,
    HandbookRevision,
    HandbookSnapshot,
} from "happy-desktop-state";
import { useState } from "react";
import type { DocumentEditorUser } from "../../src/DocumentEditor";
import { HappyAgentHandbookChangeRequestPage } from "../../src/pages/handbook/HappyAgentHandbookChangeRequestPage";
import {
    HappyAgentHandbookDocumentPage,
    type HandbookDocumentContentView,
} from "../../src/pages/handbook/HappyAgentHandbookDocumentPage";
import { HappyAgentHandbookPage } from "../../src/pages/handbook/HappyAgentHandbookPage";
import type { HandbookLabels, HandbookPerson } from "../../src/pages/handbook/handbookPresentation";
import { ComponentPage, FullScreenSpecimen } from "../kit";
import { documentDocFromMarkdown } from "./documentFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "P-048";

const WINDOW = { width: 1100, height: 760 } as const;
const MINUTE = 60_000;
const NOW = Date.UTC(2026, 10, 24, 18, 0);

const PEOPLE: readonly HandbookPerson[] = [
    { id: "u_ada", name: "Ada Okafor" },
    { id: "u_kirill", name: "Kirill Petrov" },
    { id: "u_mina", name: "Mina Sato" },
];

/** Fixed, so the specimens never depend on the clock. */
const labels: HandbookLabels = {
    time: (at) => {
        const minutes = Math.round((NOW - at) / MINUTE);
        if (minutes < 60) return `${String(minutes)}m`;
        if (minutes < 60 * 24) return `${String(Math.round(minutes / 60))}h`;
        return `${String(Math.round(minutes / 60 / 24))}d`;
    },
    person: (userId) =>
        PEOPLE.find((person) => person.id === userId) ?? { id: userId, name: "A person" },
    agent: () => "Release bot",
};

const categories: readonly HandbookCategory[] = [
    {
        id: "compute",
        name: "Compute",
        description: "How to use compute: computers, pools, and what runs where.",
        builtIn: true,
        protected: false,
    },
    {
        id: "security",
        name: "Security",
        description: "Security rules agents and people follow.",
        builtIn: true,
        protected: true,
    },
    {
        id: "meta",
        name: "Meta",
        description: "Rules about the handbook itself and its security.",
        builtIn: true,
        protected: true,
    },
    {
        id: "onboarding",
        name: "Onboarding",
        description: "What a new teammate reads in their first week.",
        builtIn: false,
        protected: false,
    },
];

const abilities = { edit: true, editMetadata: true, manage: true, propose: true, merge: true };

const gpu: HandbookDocument = {
    id: "hb_gpu",
    title: "Running jobs on the GPU pool",
    slug: "gpu-pool",
    path: "/handbook/compute/gpu-pool.md",
    categoryId: "compute",
    authorUserId: "u_kirill",
    maintainerUserId: "u_kirill",
    summary:
        "Lease a GPU computer from the shared pool, keep jobs under four hours, and release the lease when the run ends.",
    summarySource: "team",
    revision: 7,
    seq: 412,
    version: "v7-412",
    createdAt: NOW - 20 * 24 * 60 * MINUTE,
    updatedAt: NOW - 40 * MINUTE,
    deletedAt: null,
    openChangeRequests: 2,
    abilities,
};

const secrets: HandbookDocument = {
    ...gpu,
    id: "hb_secrets",
    title: "Handling secrets",
    slug: "secrets",
    path: "/handbook/security/secrets.md",
    categoryId: "security",
    authorUserId: "u_ada",
    maintainerUserId: "u_ada",
    summary:
        "Secrets live in the cluster's secret store and are attached per command; never paste one into a chat or a file.",
    summarySource: "titles",
    revision: 3,
    updatedAt: NOW - 3 * 60 * MINUTE,
    openChangeRequests: 1,
    abilities: { edit: false, editMetadata: false, manage: false, propose: true, merge: false },
};

const firstWeek: HandbookDocument = {
    ...gpu,
    id: "hb_week",
    title: "Your first week",
    slug: "first-week",
    path: "/handbook/onboarding/first-week.md",
    categoryId: "onboarding",
    authorUserId: "u_mina",
    maintainerUserId: "u_mina",
    summary: null,
    summarySource: null,
    revision: 1,
    updatedAt: NOW - 2 * MINUTE,
    openChangeRequests: 0,
};

const handbook: HandbookSnapshot = {
    loading: false,
    missing: false,
    categories,
    documents: [gpu, secrets, firstWeek],
    abilities: { create: true, manage: false },
};

const GPU_TEXT = `# Running jobs on the GPU pool

Lease a computer from the **gpu** pool before starting a job.

## Limits

- Keep a job under four hours.
- Release the lease when the run ends.

## Checkpoints

Write a checkpoint every 30 minutes to the job's vault.
`;

const SECRETS_TEXT = `# Handling secrets

Secrets live in the cluster's secret store.

- Attach a secret to the one command that needs it.
- Never paste a secret into a chat, a file, or a commit.
`;

const revisions: readonly HandbookRevision[] = [7, 6, 5, 4, 3, 2, 1].map((n) => ({
    n,
    kind: n === 1 ? "create" : n === 5 ? "changeRequest" : "edit",
    actorUserId: n === 5 ? "u_ada" : "u_kirill",
    actorAgentId: n === 6 ? "ag_release" : null,
    changeRequestId: n === 5 ? "cr_old" : null,
    createdAt: NOW - (8 - n) * 24 * 60 * MINUTE,
    updatedAt: NOW - (8 - n) * 24 * 60 * MINUTE + 4 * MINUTE,
}));

const requestSummary: HandbookChangeRequestSummary = {
    id: "cr_limits",
    documentId: "hb_gpu",
    title: "Raise the job limit to six hours",
    status: "open",
    baseSeq: 380,
    baseRevision: 6,
    authorUserId: "u_mina",
    authorAgentId: "ag_release",
    createdAt: NOW - 90 * MINUTE,
    updatedAt: NOW - 30 * MINUTE,
    resolvedAt: null,
    resolvedByUserId: null,
    mergedRevision: null,
    conflicts: null,
    rejectReason: null,
    abilities: { edit: false, withdraw: false, merge: true, reject: true },
};

const requests: readonly HandbookChangeRequestSummary[] = [
    requestSummary,
    {
        ...requestSummary,
        id: "cr_vault",
        title: "Name the checkpoint vault",
        authorAgentId: null,
        authorUserId: "u_ada",
        updatedAt: NOW - 5 * 60 * MINUTE,
    },
    {
        ...requestSummary,
        id: "cr_old",
        title: "Add a checkpoints section",
        status: "merged",
        authorAgentId: null,
        baseRevision: 4,
        mergedRevision: 5,
        conflicts: 0,
        updatedAt: NOW - 3 * 24 * 60 * MINUTE,
    },
];

const documentSnapshot = (
    document: HandbookDocument,
    text: string,
    change?: Partial<HandbookDocumentSnapshot>,
): HandbookDocumentSnapshot => ({
    documentId: document.id,
    loading: false,
    document,
    missing: false,
    text,
    seq: document.seq,
    revisions: { loading: false, entries: revisions, nextBefore: null, loadingMore: false },
    changeRequests: { loading: false, entries: requests },
    revisionSelected: null,
    revisionTexts: new Map(),
    ...change,
});

const USER: DocumentEditorUser = { name: "Kirill Petrov", tone: "ocean" };

function useContent(markdown: string): HandbookDocumentContentView {
    const [ydoc] = useState(() => documentDocFromMarkdown(markdown));
    return { kind: "live", ydoc, user: USER, sync: "saved" };
}

const PROPOSED_TEXT = GPU_TEXT.replace("under four hours", "under six hours").concat(
    "\nAsk in #compute before a run longer than six hours.\n",
);

const changeRequest: HandbookChangeRequest = {
    ...requestSummary,
    description: "Training runs keep hitting the four-hour wall. **Six** fits every run we have.",
    text: PROPOSED_TEXT,
};

const changeRequestSnapshot = (
    request: HandbookChangeRequest,
    preview: boolean,
): HandbookChangeRequestSnapshot => ({
    changeRequestId: request.id,
    loading: false,
    missing: false,
    detail: {
        changeRequest: request,
        baseText: GPU_TEXT.replace("every 30 minutes", "now and then"),
        currentText: GPU_TEXT,
        currentSeq: 412,
        mergePreview: preview
            ? {
                  text: PROPOSED_TEXT.replace("now and then", "every 30 minutes"),
                  conflicts: 1,
              }
            : null,
    },
});

const resolved = async (): Promise<void> => undefined;
const documentHandlers = {
    categories,
    labels,
    people: PEOPLE,
    onBack: () => undefined,
    onChangeRequestOpen: () => undefined,
    onTitleSave: resolved,
    onCategorySave: resolved,
    onMaintainerSave: resolved,
    onDelete: resolved,
    onRestore: resolved,
    onChangeRequestCreate: resolved,
    onRevisionSelect: () => undefined,
    onRevisionsMore: () => undefined,
};

const changeHandlers = {
    labels,
    documentTitle: gpu.title,
    onBack: () => undefined,
    onMerge: resolved,
    onReject: resolved,
    onWithdraw: resolved,
    onEdit: resolved,
};

export function HappyAgentHandbookBlueprintPage() {
    const gpuContent = useContent(GPU_TEXT);
    const secretsContent = useContent(SECRETS_TEXT);
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The team's handbook by category, one document's page with its shared text, and one change request's page."
            title="Handbook"
            width={WINDOW.width + 64}
        >
            <FullScreenSpecimen
                detail="Every category in the server's order, built-in ones marked and protected ones locked, each with its documents: summary or Summary pending, maintainer, version, when, and open change requests. An empty category still shows."
                label="Handbook"
                number="01"
                screen="01-handbook-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookPage
                    handbook={handbook}
                    labels={labels}
                    onDocumentCreate={resolved}
                    onDocumentOpen={() => undefined}
                    people={PEOPLE}
                    viewerId="u_kirill"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The New document form: title, a category (protected ones only for those who manage the handbook), and a maintainer, the reader by default."
                label="New document"
                number="02"
                screen="02-handbook-create-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookPage
                    handbook={handbook}
                    initialCreating
                    labels={labels}
                    onDocumentCreate={resolved}
                    onDocumentOpen={() => undefined}
                    people={PEOPLE}
                    viewerId="u_kirill"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Still reading the handbook."
                label="Handbook, loading"
                number="03"
                screen="03-handbook-loading-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookPage
                    handbook={{ ...handbook, loading: true, documents: [], categories: [] }}
                    labels={labels}
                    onDocumentCreate={resolved}
                    onDocumentOpen={() => undefined}
                    people={PEOPLE}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A document the reader maintains: its facts editable in place, its text open for writing."
                label="Document, editable"
                number="04"
                screen="04-document-editable-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookDocumentPage
                    {...documentHandlers}
                    content={gpuContent}
                    document={documentSnapshot(gpu, GPU_TEXT)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A Security document the reader may only propose changes to: its text is read only, and says why beside it."
                label="Document, protected"
                number="05"
                screen="05-document-protected-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookDocumentPage
                    {...documentHandlers}
                    content={secretsContent}
                    document={documentSnapshot(secrets, SECRETS_TEXT, {
                        changeRequests: { loading: false, entries: [] },
                    })}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The document's change requests, open ones first."
                label="Document, change requests"
                number="06"
                screen="06-document-changes-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookDocumentPage
                    {...documentHandlers}
                    content={gpuContent}
                    document={documentSnapshot(gpu, GPU_TEXT)}
                    initialTab="changes"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Its versions, newest first; a picked version's Markdown reads beside them."
                label="Document, history"
                number="07"
                screen="07-document-history-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookDocumentPage
                    {...documentHandlers}
                    content={gpuContent}
                    document={documentSnapshot(gpu, GPU_TEXT, {
                        revisionSelected: 5,
                        revisionTexts: new Map([[5, { state: "loaded", text: GPU_TEXT }]]),
                    })}
                    initialTab="history"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A deleted document: the reason it can't be written in, and Restore for those who manage it."
                label="Document, deleted"
                number="08"
                screen="08-document-deleted-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookDocumentPage
                    {...documentHandlers}
                    content={gpuContent}
                    document={documentSnapshot({ ...gpu, deletedAt: NOW - 10 * MINUTE }, GPU_TEXT)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="An open change request an agent proposed for a member, for its maintainer: what it changes against the version it was proposed on, with Merge and Reject."
                label="Change request, proposed changes"
                number="09"
                screen="09-change-request-proposed-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookChangeRequestPage
                    {...changeHandlers}
                    changeRequest={changeRequestSnapshot(changeRequest, true)}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="What merging it now would make of the document as it is, and how many blocks the server resolves itself."
                label="Change request, merge result"
                number="10"
                screen="10-change-request-merge-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookChangeRequestPage
                    {...changeHandlers}
                    changeRequest={changeRequestSnapshot(changeRequest, true)}
                    initialView="merge"
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The author's own open request: Edit and Withdraw."
                label="Change request, author"
                number="11"
                screen="11-change-request-author-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookChangeRequestPage
                    {...changeHandlers}
                    changeRequest={changeRequestSnapshot(
                        {
                            ...changeRequest,
                            abilities: { edit: true, withdraw: true, merge: false, reject: false },
                        },
                        true,
                    )}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A merged request: who merged it, its version, and the conflicts resolved."
                label="Change request, merged"
                number="12"
                screen="12-change-request-merged-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookChangeRequestPage
                    {...changeHandlers}
                    changeRequest={changeRequestSnapshot(
                        {
                            ...changeRequest,
                            status: "merged",
                            resolvedAt: NOW - 5 * MINUTE,
                            resolvedByUserId: "u_kirill",
                            mergedRevision: 8,
                            conflicts: 1,
                        },
                        false,
                    )}
                />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="A rejected request, with the reason its author reads."
                label="Change request, rejected"
                number="13"
                screen="13-change-request-rejected-1100x760"
                window={WINDOW}
            >
                <HappyAgentHandbookChangeRequestPage
                    {...changeHandlers}
                    changeRequest={changeRequestSnapshot(
                        {
                            ...changeRequest,
                            status: "rejected",
                            resolvedAt: NOW - 5 * MINUTE,
                            resolvedByUserId: "u_kirill",
                            rejectReason: "Six hours starves the pool; split the run instead.",
                        },
                        false,
                    )}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
