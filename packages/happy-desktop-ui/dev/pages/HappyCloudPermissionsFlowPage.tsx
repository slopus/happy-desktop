import type { ReactNode } from "react";
import {
    HappyAgentPermissionsSettings,
    HappyAgentSettingsShell,
    HappyAgentZoneDeleteDialog,
    HappyAgentZonePage,
    type HappyAgentSettingsCategory,
    type HappyAgentZoneBotRow,
    type HappyAgentZoneDeleteDialogProps,
    type HappyAgentZoneDraftView,
    type HappyAgentZonePageProps,
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

/** The team's bots, which a critical zone may list. */
const teamBots: readonly HappyAgentZoneBotRow[] = [
    { id: "b-ledger", name: "Ledger reconciler" },
    { id: "b-release", name: "Release manager" },
    { id: "b-support", name: "Support triage" },
];

const person = (id: string): HappyAgentZonePersonRow => people.find((entry) => entry.id === id)!;

/**
 * The default zone and the seeded Critical zone, neither with an owner; a
 * zone limited to two members, with an owner; one anyone may join, with no
 * owner; and a critical zone someone made, with its own picture, an owner and
 * its members and one bot. The list comes default first, critical last.
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
        bots: [],
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
        bots: [teamBots[0]!],
        owner: person("u-steve"),
        agentCount: 0,
    },
];

/** The window Happy opens at, and its minimum. */
const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
] as const;

/** A zone's page heading, in place of the Permissions one, with a way back. */
interface Heading {
    readonly title: string;
    readonly description: string;
}

/** One screen of the settings window on Permissions, at both review window sizes. */
function Screen(props: {
    number: string;
    screen: string;
    detail: string;
    heading?: Heading;
    children: ReactNode;
}) {
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
                    description={
                        props.heading?.description ?? "The team's zones and who may join each"
                    }
                    onCategorySelect={noop}
                    onClose={noop}
                    title={props.heading?.title ?? "Permissions"}
                    {...(props.heading ? { onBack: noop } : {})}
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
            onZoneOpen={noop}
            zones={zones}
        />
    );
}

/** A listed zone's fields, as its page opens them. */
function draftOf(zone: HappyAgentZoneRow): HappyAgentZoneDraftView {
    return {
        name: zone.name,
        description: zone.description,
        critical: zone.critical,
        color: zone.color,
        members:
            zone.isDefault || zone.members === "everyone"
                ? null
                : zone.members.map((entry) => entry.id),
        bots: zone.bots?.map((bot) => bot.id) ?? [],
        owner: zone.owner?.id ?? null,
    };
}

const zoneOf = (id: string): HappyAgentZoneRow => zones.find((zone) => zone.id === id)!;

/** The heading a zone's page shows. */
function headingOf(zone: HappyAgentZoneRow | undefined): Heading {
    return {
        title: zone?.name ?? "New zone",
        description: zone
            ? zone.isDefault
                ? "The default zone, open to every member"
                : zone.critical
                  ? "A critical zone"
                  : "A zone"
            : "A zone agents can join",
    };
}

/** A zone's page as someone who may manage it sees it, or with `create` a new zone's. */
function Page(
    props: Partial<HappyAgentZonePageProps> & {
        readonly zoneId?: string;
        readonly create?: boolean;
    },
) {
    const { zoneId, create, ...rest } = props;
    const zone = create ? undefined : zoneOf(zoneId ?? "z-payments");
    return (
        <HappyAgentZonePage
            draft={
                zone
                    ? draftOf(zone)
                    : {
                          name: "",
                          description: "",
                          critical: false,
                          color: "blue",
                          members: null,
                          bots: [],
                          owner: null,
                      }
            }
            edited={false}
            imageSaving={false}
            manage
            onBotAdd={noop}
            onBotRemove={noop}
            onColorChange={noop}
            onCriticalChange={noop}
            onDelete={noop}
            onDescriptionChange={noop}
            onDiscard={noop}
            onEveryoneChange={noop}
            onImagePick={noop}
            onImageRemove={noop}
            onMemberAdd={noop}
            onMemberRemove={noop}
            onNameChange={noop}
            onOwnerChange={noop}
            onSave={noop}
            people={people}
            saving={false}
            teamBots={teamBots}
            {...(zone
                ? {
                      zone: {
                          agentCount: zone.agentCount,
                          isDefault: zone.isDefault,
                          ...(zone.imageUrl ? { imageUrl: zone.imageUrl } : {}),
                          ...(zone.agentCount > 0
                              ? {
                                    deleteBlocked: `${String(zone.agentCount)} agents are in it, and agents never leave a zone. Only an empty zone can be deleted.`,
                                }
                              : {}),
                      },
                  }
                : {})}
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
            summary="Settings › Permissions on a Happy Cloud server: the team's zones, the default one first and the critical ones last, with each zone's picture or colour, owner, who may join and how many agents are in it. A row opens the zone's own page, which holds every setting of the zone and deleting it, with the rules the cluster keeps; a member without zones.manage reads the same pages."
            title="Happy Cloud permissions flow"
        >
            <Screen detail="zones, for someone who may manage them" number="01" screen="01-list">
                <List manage />
            </Screen>
            <Screen detail="zones, read-only for a member" number="02" screen="02-read-only">
                <List manage={false} />
            </Screen>
            <Screen
                detail="a new zone"
                heading={headingOf(undefined)}
                number="03"
                screen="03-create"
            >
                <Page create />
            </Screen>
            <Screen
                detail="the default zone: open to everyone, no owner, not deletable"
                heading={headingOf(zoneOf("z-default"))}
                number="04"
                screen="04-default"
            >
                <Page zoneId="z-default" />
            </Screen>
            <Screen
                detail="a critical zone with a picture, an owner, its members and a bot, being edited"
                heading={headingOf(zoneOf("z-payments"))}
                number="05"
                screen="05-critical"
            >
                <Page
                    draft={{ ...draftOf(zoneOf("z-payments")), name: "Payments and refunds" }}
                    edited
                    zoneId="z-payments"
                />
            </Screen>
            <Screen
                detail="a critical zone, read-only for a member"
                heading={headingOf(zoneOf("z-payments"))}
                number="06"
                screen="06-critical-read-only"
            >
                <Page manage={false} zoneId="z-payments" />
            </Screen>
            <Screen
                detail="a zone limited to its members, with agents in it"
                heading={headingOf(zoneOf("z-research"))}
                number="07"
                screen="07-members"
            >
                <Page zoneId="z-research" />
            </Screen>
            <Screen
                detail="turning off the last critical zone, which the cluster refused"
                heading={headingOf(zoneOf("z-critical"))}
                number="08"
                screen="08-save-refused"
            >
                <Page
                    draft={{ ...draftOf(zoneOf("z-critical")), critical: false }}
                    edited
                    error="A team keeps at least one critical zone."
                    zoneId="z-critical"
                />
            </Screen>
            <Screen
                detail="deleting an empty zone"
                heading={headingOf(zoneOf("z-sandbox"))}
                number="09"
                screen="09-delete"
            >
                <Page zoneId="z-sandbox" />
                <Delete />
            </Screen>
            <Screen
                detail="a deletion the cluster refused"
                heading={headingOf(zoneOf("z-payments"))}
                number="10"
                screen="10-delete-refused"
            >
                <Page zoneId="z-payments" />
                <Delete error="A team keeps at least one critical zone." name="Payments" />
            </Screen>
        </ComponentPage>
    );
}
