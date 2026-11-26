import type { ReactNode } from "react";
import {
    HappyAgentPermissionsSettings,
    HappyAgentSettingsShell,
    HappyAgentZoneDeleteDialog,
    HappyAgentZoneDetailsDialog,
    HappyAgentZonePage,
    HappyAgentZonePickDialog,
    type HappyAgentSettingsCategory,
    type HappyAgentZoneBotRow,
    type HappyAgentZoneDeleteDialogProps,
    type HappyAgentZoneDetailsDialogProps,
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
    { id: "u-ana", name: "Ana Lima", role: "Member" },
    { id: "u-kirill", name: "Kirill", role: "Admin" },
    { id: "u-mia", name: "Mia Chen", role: "Member" },
    { id: "u-priya", name: "Priya Shah", role: "Finance" },
    { id: "u-steve", name: "Steve Korshakov", imageUrl: STEVE_PHOTO, role: "Owner" },
    { id: "u-tom", name: "Tom Becker", role: "Member" },
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

const zoneOf = (id: string): HappyAgentZoneRow => zones.find((zone) => zone.id === id)!;

/** The settings header over a zone's page, with the way back to the list. */
const ZONE_HEADING: Heading = { title: "Permissions", description: "A zone, and who may join it" };

/** A zone's page, as someone who may manage it sees it. */
function Page(props: Partial<HappyAgentZonePageProps> & { readonly zoneId: string }) {
    const { zoneId, ...rest } = props;
    return (
        <HappyAgentZonePage
            manage
            onBotRemove={noop}
            onBotsAdd={noop}
            onDetailsOpen={noop}
            onMemberRemove={noop}
            onMembersAdd={noop}
            zone={zoneOf(zoneId)}
            {...rest}
        />
    );
}

/** A listed zone's settings, as its details modal opens them. */
function draftOf(zone: HappyAgentZoneRow): HappyAgentZoneDraftView {
    return {
        name: zone.name,
        description: zone.description,
        critical: zone.critical,
        color: zone.color,
        everyone: zone.members === "everyone",
        owner: zone.owner?.id ?? null,
    };
}

/** A zone's details modal, or with `create` a new zone's. */
function Details(
    props: Partial<HappyAgentZoneDetailsDialogProps> & {
        readonly zoneId?: string;
        readonly create?: boolean;
    },
) {
    const { zoneId, create, ...rest } = props;
    const zone = create ? undefined : zoneOf(zoneId ?? "z-payments");
    return (
        <HappyAgentZoneDetailsDialog
            draft={
                zone
                    ? draftOf(zone)
                    : {
                          name: "",
                          description: "",
                          critical: false,
                          color: "blue",
                          everyone: true,
                          owner: null,
                      }
            }
            edited={false}
            imageSaving={false}
            manage
            onClose={noop}
            onColorChange={noop}
            onCriticalChange={noop}
            onDelete={noop}
            onDescriptionChange={noop}
            onEveryoneChange={noop}
            onImagePick={noop}
            onImageRemove={noop}
            onNameChange={noop}
            onOwnerChange={noop}
            onSave={noop}
            people={people}
            saving={false}
            {...(zone
                ? {
                      zone: {
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

/** Everyone a zone doesn't list yet, as its add modal offers them. */
function unlisted(zoneId: string): readonly HappyAgentZonePersonRow[] {
    const members = zoneOf(zoneId).members;
    return people.filter(
        (entry) => members === "everyone" || !members.some((member) => member.id === entry.id),
    );
}

export function HappyCloudPermissionsFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Settings › Permissions on a Happy Cloud server: the team's zones, the default one first and the critical ones last, with each zone's picture or colour, owner, who may join and how many agents are in it. A row opens the zone's page, built for reviewing who may reach it: a header with the zone's details, then its members and, on a critical zone, its bots, each added in its own modal and removed in place. The details modal holds the rest of the zone's settings and Delete. A member without zones.manage reads the same pages."
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
                <Details create />
            </Screen>
            <Screen
                detail="a critical zone with a picture, an owner, its members and a bot"
                heading={ZONE_HEADING}
                number="04"
                screen="04-critical"
            >
                <Page zoneId="z-payments" />
            </Screen>
            <Screen
                detail="a critical zone's details"
                heading={ZONE_HEADING}
                number="05"
                screen="05-critical-details"
            >
                <Page zoneId="z-payments" />
                <Details />
            </Screen>
            <Screen
                detail="adding members, two of them picked"
                heading={ZONE_HEADING}
                number="06"
                screen="06-add-members"
            >
                <Page zoneId="z-payments" />
                <HappyAgentZonePickDialog
                    candidates={unlisted("z-payments")}
                    kind="members"
                    onAdd={noop}
                    onClose={noop}
                    onQueryChange={noop}
                    onToggle={noop}
                    query=""
                    saving={false}
                    selected={["u-priya", "u-tom"]}
                />
            </Screen>
            <Screen
                detail="adding bots to a critical zone"
                heading={ZONE_HEADING}
                number="07"
                screen="07-add-bots"
            >
                <Page zoneId="z-payments" />
                <HappyAgentZonePickDialog
                    candidates={teamBots.slice(1)}
                    kind="bots"
                    onAdd={noop}
                    onClose={noop}
                    onQueryChange={noop}
                    onToggle={noop}
                    query=""
                    saving={false}
                    selected={["b-release"]}
                />
            </Screen>
            <Screen
                detail="a critical zone, read-only for a member"
                heading={ZONE_HEADING}
                number="08"
                screen="08-critical-read-only"
            >
                <Page manage={false} zoneId="z-payments" />
            </Screen>
            <Screen
                detail="a critical zone's details, read-only for a member"
                heading={ZONE_HEADING}
                number="09"
                screen="09-details-read-only"
            >
                <Page manage={false} zoneId="z-payments" />
                <Details manage={false} />
            </Screen>
            <Screen
                detail="the default zone: open to every member"
                heading={ZONE_HEADING}
                number="10"
                screen="10-default"
            >
                <Page zoneId="z-default" />
            </Screen>
            <Screen
                detail="the default zone's details: no owner, Critical or Delete"
                heading={ZONE_HEADING}
                number="11"
                screen="11-default-details"
            >
                <Page zoneId="z-default" />
                <Details zoneId="z-default" />
            </Screen>
            <Screen
                detail="a zone limited to its members, with agents in it"
                heading={ZONE_HEADING}
                number="12"
                screen="12-members"
            >
                <Page zoneId="z-research" />
            </Screen>
            <Screen
                detail="the seeded Critical zone, nobody and no bot listed"
                heading={ZONE_HEADING}
                number="13"
                screen="13-critical-empty"
            >
                <Page zoneId="z-critical" />
            </Screen>
            <Screen
                detail="turning off the last critical zone, which the cluster refused"
                heading={ZONE_HEADING}
                number="14"
                screen="14-save-refused"
            >
                <Page zoneId="z-critical" />
                <Details
                    draft={{ ...draftOf(zoneOf("z-critical")), critical: false }}
                    edited
                    error="A team keeps at least one critical zone."
                    zoneId="z-critical"
                />
            </Screen>
            <Screen
                detail="deleting an empty zone"
                heading={ZONE_HEADING}
                number="15"
                screen="15-delete"
            >
                <Page zoneId="z-sandbox" />
                <Delete />
            </Screen>
            <Screen
                detail="a deletion the cluster refused"
                heading={ZONE_HEADING}
                number="16"
                screen="16-delete-refused"
            >
                <Page zoneId="z-payments" />
                <Delete error="A team keeps at least one critical zone." name="Payments" />
            </Screen>
        </ComponentPage>
    );
}
