import { useSyncExternalStore } from "react";
import type {
    HandbookChangeRequestStore,
    HandbookDocumentContentStore,
    HandbookDocumentStore,
    HandbookStore,
    HappyAgentClockStore,
    HappyAgentTeamRoster,
    HappyAgentWorkspaceStore,
} from "happy-desktop-state";
import {
    HappyAgentHandbookChangeRequestPage,
    HappyAgentHandbookDocumentPage,
    HappyAgentHandbookPage,
    localAgoTime,
    type DocumentEditorUser,
    type HandbookDocumentContentView,
    type HandbookLabels,
    type HandbookPerson,
} from "happy-desktop-ui";
import { messageReferenceEntities } from "../messageReferences";

const PERSON_TONES = ["violet", "ember", "mint", "ocean", "rose", "amber"] as const;

/** The reader as everyone else in a shared document sees their caret, the same tone everywhere. */
function editorUserOf(team: HappyAgentTeamRoster | undefined): DocumentEditorUser {
    const userId = team?.viewerId ?? "";
    let hash = 0;
    for (const character of userId) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    const name = team?.members.find((member) => member.id === userId)?.name ?? "Someone";
    return { name, tone: PERSON_TONES[hash % PERSON_TONES.length]! };
}

/**
 * One Happy Cloud server's handbook: the list by category, one document when
 * `document` is given, or one change request when `changeRequest` is. Each
 * stays current on its own from the server's handbook events.
 */
export function HappyAgentHandbookSurface(props: {
    readonly handbook: HandbookStore;
    readonly document?: HandbookDocumentStore;
    readonly content?: HandbookDocumentContentStore;
    readonly changeRequest?: HandbookChangeRequestStore;
    readonly clock: HappyAgentClockStore;
    /** Names and faces the people the handbook credits; without it they are "A person". */
    readonly team?: HappyAgentTeamRoster;
    /** Names the agents this window knows; others are "An agent". */
    readonly workspace: HappyAgentWorkspaceStore;
    onHandbookOpen(): void;
    onDocumentOpen(documentId: string): void;
    onChangeRequestOpen(changeRequestId: string): void;
}) {
    const handbook = useSyncExternalStore(
        props.handbook.subscribe,
        props.handbook.get,
        props.handbook.get,
    );
    const now = useSyncExternalStore(props.clock.subscribe, props.clock.get, props.clock.get);
    const workspace = useSyncExternalStore(
        props.workspace.subscribe,
        props.workspace.get,
        props.workspace.get,
    );
    const agents = messageReferenceEntities(workspace.list).agents;
    const people: readonly HandbookPerson[] = (props.team?.members ?? []).map((member) => ({
        id: member.id,
        name: member.name,
        ...(member.imageUrl ? { imageUrl: member.imageUrl } : {}),
    }));
    const labels: HandbookLabels = {
        time: (at) => localAgoTime(at, now),
        person: (userId) =>
            people.find((person) => person.id === userId) ?? { id: userId, name: "A person" },
        agent: (agentId) => agents.get(agentId)?.label ?? "An agent",
    };
    if (props.changeRequest !== undefined)
        return (
            <HappyAgentHandbookChangeRequestSurface
                handbook={handbook}
                labels={labels}
                onDocumentOpen={props.onDocumentOpen}
                onHandbookOpen={props.onHandbookOpen}
                store={props.changeRequest}
            />
        );
    if (props.document !== undefined)
        return (
            <HappyAgentHandbookDocumentSurface
                categories={handbook.categories}
                {...(props.content ? { content: props.content } : {})}
                labels={labels}
                onChangeRequestOpen={props.onChangeRequestOpen}
                onHandbookOpen={props.onHandbookOpen}
                people={people}
                store={props.document}
                user={editorUserOf(props.team)}
            />
        );
    return (
        <HappyAgentHandbookPage
            handbook={handbook}
            labels={labels}
            onDocumentCreate={(input) =>
                props.handbook.documentCreate(input).then(props.onDocumentOpen)
            }
            onDocumentOpen={props.onDocumentOpen}
            people={people}
            {...(props.team?.viewerId === undefined ? {} : { viewerId: props.team.viewerId })}
        />
    );
}

const CONTENT_NONE = {
    subscribe: () => () => undefined,
    get: () => undefined,
} as const;

function HappyAgentHandbookDocumentSurface(props: {
    readonly store: HandbookDocumentStore;
    readonly content?: HandbookDocumentContentStore;
    readonly categories: import("happy-desktop-state").HandbookSnapshot["categories"];
    readonly labels: HandbookLabels;
    readonly people: readonly HandbookPerson[];
    readonly user: DocumentEditorUser;
    onHandbookOpen(): void;
    onChangeRequestOpen(changeRequestId: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const contentSource = props.content ?? CONTENT_NONE;
    const text = useSyncExternalStore(
        contentSource.subscribe,
        contentSource.get,
        contentSource.get,
    );
    const content = ((): HandbookDocumentContentView => {
        if (text === undefined || text.status === "loading") return { kind: "loading" };
        if (text.status === "missing") return { kind: "missing" };
        return {
            kind: "live",
            ydoc: text.ydoc,
            user: props.user,
            sync: text.sync,
            ...(text.failure === undefined ? {} : { failure: text.failure.message }),
            ...(props.content ? { onPointerPress: props.content.pointerPressUpdate } : {}),
        };
    })();
    return (
        <HappyAgentHandbookDocumentPage
            categories={props.categories}
            content={content}
            document={snapshot}
            labels={props.labels}
            onBack={props.onHandbookOpen}
            onCategorySave={store.categorySave}
            onChangeRequestCreate={(input) =>
                store.changeRequestCreate(input).then(props.onChangeRequestOpen)
            }
            onChangeRequestOpen={props.onChangeRequestOpen}
            onDelete={store.documentDelete}
            onMaintainerSave={store.maintainerSave}
            onRestore={store.documentRestore}
            onRevisionSelect={store.revisionSelect}
            onRevisionsMore={store.revisionsMore}
            onTitleSave={store.titleSave}
            people={props.people}
        />
    );
}

function HappyAgentHandbookChangeRequestSurface(props: {
    readonly store: HandbookChangeRequestStore;
    readonly handbook: import("happy-desktop-state").HandbookSnapshot;
    readonly labels: HandbookLabels;
    onHandbookOpen(): void;
    onDocumentOpen(documentId: string): void;
}) {
    const store = props.store;
    const snapshot = useSyncExternalStore(store.subscribe, store.get, store.get);
    const documentId = snapshot.detail?.changeRequest.documentId;
    const documentTitle =
        documentId === undefined
            ? undefined
            : props.handbook.documents.find((document) => document.id === documentId)?.title;
    return (
        <HappyAgentHandbookChangeRequestPage
            changeRequest={snapshot}
            {...(documentTitle ? { documentTitle } : {})}
            labels={props.labels}
            onBack={
                documentId === undefined
                    ? props.onHandbookOpen
                    : () => props.onDocumentOpen(documentId)
            }
            onEdit={store.changeRequestEdit}
            onMerge={store.changeRequestMerge}
            onReject={store.changeRequestReject}
            onWithdraw={store.changeRequestWithdraw}
        />
    );
}
