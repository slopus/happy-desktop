import type { ReactNode } from "react";
import {
    HappyAgentPermissionsSettings,
    HappyAgentSettingsShell,
    HappyAgentZoneDeleteDialog,
    HappyAgentZoneDialog,
    type HappyAgentSettingsCategory,
    type HappyAgentZoneDeleteDialogProps,
    type HappyAgentZoneDialogProps,
    type HappyAgentZonePersonRow,
    type HappyAgentZoneRow,
} from "../../src";
import { ComponentPage, FullScreenSpecimen } from "../kit";

/** The component plan this page documents. */
export const componentNumber = "P-049";

/** The settings categories a Happy Cloud server lists. */
const categories: readonly HappyAgentSettingsCategory[] = [
    { icon: "settings", id: "general", label: "General", tone: "gray" },
    { icon: "users", id: "account", label: "Account", tone: "blue" },
    { icon: "bell", id: "sharing", label: "Notifications", tone: "red" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "terminal", id: "compute", label: "Compute", tone: "blue" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
    { group: "Team", icon: "shield", id: "permissions", label: "Permissions", tone: "purple" },
    { group: "Team", icon: "repository", id: "repositories", label: "Repositories", tone: "gray" },
];

const noop = () => undefined;

/** The Payments zone's own picture, bundled so nothing loads over the network. */
const PAYMENTS_IMAGE = new URL("../assets/zone-payments.webp", import.meta.url).href;
const STEVE_PHOTO = new URL("../assets/user-profile-photo.webp", import.meta.url).href;

const people: readonly HappyAgentZonePersonRow[] = [
    { id: "u-ana", name: "Ana Lima" },
    { id: "u-kirill", name: "Kirill" },
    { id: "u-steve", name: "Steve Korshakov", imageUrl: STEVE_PHOTO },
    { id: "u-mia", name: "Mia Chen" },
];

const person = (id: string): HappyAgentZonePersonRow => people.find((entry) => entry.id === id)!;

/**
 * The default zone and the seeded Critical zone, neither with an owner; a
 * zone limited to two members, with an owner; one anyone may join, with no
 * owner; and a critical zone someone made, with its own picture, an owner and
 * its members. The list comes default first, critical last.
 */
const zones: readonly HappyAgentZoneRow[] = [
    {
        id: "z-default",
        name: "Default",
        description: "",
        isDefault: true,
        critical: false,
        color: "blue",
        members: "everyone",
        agentCount: 42,
    },
    {
        id: "z-research",
        name: "Research",
        description: "Experiments and prototypes. Nothing here touches production data.",
        isDefault: false,
        critical: false,
        color: "amber",
        members: [person("u-ana"), person("u-mia")],
        owner: person("u-ana"),
        agentCount: 3,
    },
    {
        id: "z-sandbox",
        name: "Sandbox",
        description: "Throwaway work for trying tools out.",
        isDefault: false,
        critical: false,
        color: "teal",
        members: "everyone",
        agentCount: 0,
    },
    {
        id: "z-critical",
        name: "Critical",
        description: "",
        isDefault: false,
        critical: true,
        color: "red",
        members: [],
        agentCount: 2,
    },
    {
        id: "z-payments",
        name: "Payments",
        description: "Stripe, refunds and the ledger. Agents here can move money.",
        isDefault: false,
        critical: true,
        color: "purple",
        imageUrl: PAYMENTS_IMAGE,
        members: [person("u-steve"), person("u-kirill")],
        owner: person("u-steve"),
        agentCount: 0,
    },
];

/** The window Happy opens at, and its minimum. */
const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
] as const;

/** One screen of the settings window on Permissions, at both review window sizes. */
function Screen(props: { number: string; screen: string; detail: string; children: ReactNode }) {
    return WINDOWS.map((window) => (
        <FullScreenSpecimen
            detail={props.detail}
            key={window.width}
            label={`Settings — Permissions, ${String(window.width)} × ${String(window.height)}`}
            number={props.number}
            screen={`${props.screen}-${String(window.width)}x${String(window.height)}`}
            window={window}
        >
            {/* The overlay is fixed; the transform keeps a dialog inside its screen. */}
            <div style={{ display: "flex", transform: "translateZ(0)" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="permissions"
                    categories={categories}
                    description="The team's zones and who may join each"
                    onCategorySelect={noop}
                    onClose={noop}
                    title="Permissions"
                >
                    {props.children}
                </HappyAgentSettingsShell>
            </div>
        </FullScreenSpecimen>
    ));
}

function List(props: { manage: boolean }) {
    return (
        <HappyAgentPermissionsSettings
            loading={false}
            manage={props.manage}
            onZoneCreate={noop}
            onZoneEdit={noop}
            zones={zones}
        />
    );
}

/** The Payments zone's dialog, or with `create` a new zone's, which has no picture yet. */
function Edit(props: Partial<HappyAgentZoneDialogProps> & { readonly create?: boolean }) {
    const { create, ...rest } = props;
    return (
        <HappyAgentZoneDialog
            draft={{
                name: "Payments",
                description: "Stripe, refunds and the ledger. Agents here can move money.",
                critical: true,
                color: "purple",
                members: ["u-steve", "u-kirill"],
                owner: "u-steve",
            }}
            imageSaving={false}
            onClose={noop}
            onColorChange={noop}
            onDelete={noop}
            onDescriptionChange={noop}
            onEveryoneChange={noop}
            onImagePick={noop}
            onImageRemove={noop}
            onCriticalChange={noop}
            onMemberAdd={noop}
            onMemberRemove={noop}
            onNameChange={noop}
            onOwnerChange={noop}
            onSave={noop}
            people={people}
            saving={false}
            {...(create
                ? {}
                : { zone: { agentCount: 0, isDefault: false, imageUrl: PAYMENTS_IMAGE } })}
            {...rest}
        />
    );
}

function Delete(props: Partial<HappyAgentZoneDeleteDialogProps>) {
    return (
        <HappyAgentZoneDeleteDialog
            deleting={false}
            name="Sandbox"
            onClose={noop}
            onDelete={noop}
            {...props}
        />
    );
}

export function HappyCloudPermissionsFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Settings › Permissions on a Happy Cloud server: the team's zones, the default one first and the critical ones last, with each zone's picture or colour, owner, who may join and how many agents are in it; creating and editing one, the rules the cluster keeps, and the read-only view a member sees."
            title="Happy Cloud permissions flow"
        >
            <Screen detail="zones, for someone who may manage them" number="01" screen="01-list">
                <List manage />
            </Screen>
            <Screen detail="zones, read-only for a member" number="02" screen="02-read-only">
                <List manage={false} />
            </Screen>
            <Screen detail="a new zone" number="03" screen="03-create">
                <List manage />
                <Edit
                    create
                    draft={{
                        name: "",
                        description: "",
                        critical: false,
                        color: "blue",
                        members: null,
                        owner: null,
                    }}
                />
            </Screen>
            <Screen
                detail="editing a Critical zone with a picture, an owner and its members"
                number="04"
                screen="04-edit-critical"
            >
                <List manage />
                <Edit />
            </Screen>
            <Screen
                detail="editing the default zone: open to everyone, no owner, not deletable"
                number="05"
                screen="05-edit-default"
            >
                <List manage />
                <Edit
                    draft={{
                        name: "Default",
                        description: "",
                        critical: false,
                        color: "blue",
                        members: null,
                        owner: null,
                    }}
                    zone={{ agentCount: 42, isDefault: true }}
                />
            </Screen>
            <Screen
                detail="editing a zone limited to its members"
                number="06"
                screen="06-edit-members"
            >
                <List manage />
                <Edit
                    draft={{
                        name: "Research",
                        description:
                            "Experiments and prototypes. Nothing here touches production data.",
                        critical: false,
                        color: "amber",
                        members: ["u-ana", "u-mia"],
                        owner: "u-ana",
                    }}
                    zone={{ agentCount: 3, isDefault: false }}
                />
            </Screen>
            <Screen
                detail="turning off the last critical zone, which the cluster refused"
                number="07"
                screen="07-save-refused"
            >
                <List manage />
                <Edit
                    draft={{
                        name: "Critical",
                        description: "",
                        critical: false,
                        color: "red",
                        members: [],
                        owner: null,
                    }}
                    error="A team keeps at least one critical zone."
                    zone={{ agentCount: 2, isDefault: false }}
                />
            </Screen>
            <Screen detail="deleting an empty zone" number="08" screen="08-delete">
                <List manage />
                <Delete />
            </Screen>
            <Screen
                detail="deleting a zone with agents in it: held back"
                number="09"
                screen="09-delete-blocked"
            >
                <List manage />
                <Delete
                    blocked="3 agents are in it, and agents never leave a zone. Only an empty zone can be deleted."
                    name="Research"
                />
            </Screen>
            <Screen detail="a deletion the cluster refused" number="10" screen="10-delete-refused">
                <List manage />
                <Delete error="A team keeps at least one critical zone." name="Payments" />
            </Screen>
        </ComponentPage>
    );
}
