import type { ReactNode } from "react";
import {
    HappyAgentZonesSettings,
    HappyAgentSettingsShell,
    HappyAgentZoneDeleteDialog,
    HappyAgentZoneDetailsDialog,
    HappyAgentZonePage,
    HappyAgentZonePickDialog,
    HappyAgentZonePluginsSection,
    HappyAgentZonePoliciesSection,
    HappyAgentZonePolicyPage,
    type HappyAgentSettingsCategory,
    type HappyAgentZoneBotRow,
    type HappyAgentZoneDeleteDialogProps,
    type HappyAgentZoneDetailsDialogProps,
    type HappyAgentZoneDraftView,
    type HappyAgentZonePageProps,
    type HappyAgentZonePersonRow,
    type HappyAgentZonePluginRow,
    type HappyAgentZonePolicyPageProps,
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
    { group: "Agents", icon: "doc", id: "instructions", label: "Instructions", tone: "purple" },
    { group: "Agents", icon: "globe", id: "providers", label: "Inference", tone: "indigo" },
    { group: "Agents", icon: "terminal", id: "compute", label: "Compute", tone: "blue" },
    { group: "Agents", icon: "shield", id: "zones", label: "Zones", tone: "purple" },
    { group: "Agents", icon: "lock", id: "secrets", label: "Secrets", tone: "green" },
    { group: "Agents", icon: "zap", id: "usage", label: "Usage", tone: "teal" },
    { group: "Team", icon: "users", id: "members", label: "Members", tone: "orange" },
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

/** The installations the Payments zone lists, with their tools. */
const zonePlugins: readonly HappyAgentZonePluginRow[] = [
    {
        id: "i-stripe",
        name: "Stripe",
        policyCount: 0,
        tools: [
            {
                name: "create_refund",
                description: "Refunds a charge, in full or in part.",
                critical: true,
                policyCount: 1,
            },
            {
                name: "create_payment_link",
                description: "Makes a link a customer pays through.",
                critical: true,
                policyCount: 0,
            },
            {
                name: "list_charges",
                description: "Lists recent charges, newest first.",
                critical: false,
                policyCount: 0,
            },
        ],
    },
    {
        id: "i-ledger",
        name: "Ledger",
        label: "Finance",
        needsSetup: true,
        policyCount: 1,
        tools: [
            {
                name: "reconcile",
                description: "Matches payouts to ledger entries.",
                critical: false,
                policyCount: 0,
            },
            {
                name: "export_report",
                description: "Exports a month's ledger as CSV.",
                critical: false,
                policyCount: 0,
            },
        ],
    },
    // The built-in plugin lists no tools of its own.
    { id: "i-happy", name: "Happy", policyCount: 0, tools: [] },
];

/** The team's installations the zone doesn't list yet. */
const otherInstallations = [
    { id: "i-github", name: "GitHub" },
    { id: "i-linear", name: "Linear" },
    { id: "i-slack", name: "Slack" },
];

/** Every plugin and tool a policy of the Payments zone may be on. */
const policyTargets = [
    { value: "plugin:i-stripe", label: "Stripe · every tool" },
    { value: "tool:i-stripe/create_refund", label: "Stripe · create_refund" },
    { value: "tool:i-stripe/create_payment_link", label: "Stripe · create_payment_link" },
    { value: "tool:i-stripe/list_charges", label: "Stripe · list_charges" },
    { value: "plugin:i-ledger", label: "Ledger · Finance · every tool" },
    { value: "tool:i-ledger/reconcile", label: "Ledger · Finance · reconcile" },
    { value: "tool:i-ledger/export_report", label: "Ledger · Finance · export_report" },
];

const WEEKENDS_CODE = `# plugin access: no refunds on weekends, UTC.
from datetime import datetime, timezone

now = datetime.now(timezone.utc)
print("weekday", now.weekday())
if isinstance(request, Call) and request.tool == "create_refund":
    assert now.weekday() < 5, "Refunds are not issued on weekends."
`;

const WEEKENDS_CODE_TYPO = WEEKENDS_CODE.replace("request.tool ==", "request.tol ==");

const WEEKENDS_SAMPLE = JSON.stringify(
    {
        user: { id: "u-steve", roles: ["owner"], permissions: [] },
        agent: { id: "a_1", kind: "task", mode: "auto" },
        action: "call",
        request: { tool: "create_refund", arguments: { charge: "ch_3PqL2", amount: 4200 } },
    },
    null,
    2,
);

const TYPO_DIAGNOSTICS = [
    "policy.py:6:23: error[unresolved-attribute] Object of type `Call` has no attribute `tol`",
];

/** The window Happy opens at, and its minimum. */
const WINDOWS = [
    { width: 1100, height: 760 },
    { width: 720, height: 640 },
] as const;

/** A zone's page heading, in place of the Zones one, with a way back. */
interface Heading {
    readonly title: string;
    readonly description: string;
}

/** One screen of the settings window on Zones, at both review window sizes. */
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
            label={`Settings — Zones, ${String(window.width)} × ${String(window.height)}`}
            number={props.number}
            screen={`${props.screen}-${String(window.width)}x${String(window.height)}`}
            window={window}
        >
            {/* The overlay is fixed; the transform keeps a dialog inside its screen. */}
            <div style={{ display: "flex", transform: "translateZ(0)" }}>
                <HappyAgentSettingsShell
                    activeCategoryId="zones"
                    categories={categories}
                    description={
                        props.heading?.description ??
                        "Where agents work, and who may join each zone"
                    }
                    onCategorySelect={noop}
                    onClose={noop}
                    title={props.heading?.title ?? "Zones"}
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
        <HappyAgentZonesSettings
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
const ZONE_HEADING: Heading = { title: "Zones", description: "A zone, and who may join it" };

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

/** The Payments zone's page with what it may reach: its plugins, and the policies on them. */
function ReachPage(props: {
    readonly manage: boolean;
    readonly expanded: readonly string[];
    /** False for a server with plugins on zones but no policies yet. */
    readonly policies?: boolean;
}) {
    const policies = props.policies !== false;
    return (
        <Page
            computers={[{ id: "payments-01", name: "payments-01" }]}
            manage={props.manage}
            zoneId="z-payments"
        >
            <HappyAgentZonePluginsSection
                expanded={props.expanded}
                manage={props.manage}
                policies={policies}
                onAdd={noop}
                onRemove={noop}
                onToggle={noop}
                plugins={zonePlugins}
            />
            {policies ? (
                <HappyAgentZonePoliciesSection
                    canAdd
                    manage={props.manage}
                    onAdd={noop}
                    onOpen={noop}
                    policies={[
                        {
                            id: "p-weekends",
                            description: "No refunds on weekends",
                            targetLabel: "Stripe · create_refund",
                            enabled: true,
                        },
                        {
                            id: "p-exports",
                            description: "Ledger exports only for finance",
                            targetLabel: "Ledger · Finance · every tool",
                            enabled: false,
                        },
                    ]}
                />
            ) : null}
        </Page>
    );
}

/** The settings header over the "not on weekends" policy. */
const POLICY_HEADING: Heading = { title: "Policy", description: "Stripe · create_refund" };

/** The "not on weekends" policy on Stripe's refund tool, on its own page. */
function Policy(props: Partial<HappyAgentZonePolicyPageProps>) {
    return (
        <HappyAgentZonePolicyPage
            clock="2026-11-28T10:00:00Z"
            clockPinned
            code={WEEKENDS_CODE}
            deleting={false}
            description="No refunds on weekends"
            diagnostics={[]}
            edited={false}
            enabled
            manage
            onClockChange={noop}
            onClockPinnedChange={noop}
            onCodeChange={noop}
            onDelete={noop}
            onDescriptionChange={noop}
            onDiscard={noop}
            onEnabledChange={noop}
            onSampleChange={noop}
            onSave={noop}
            onTargetChange={noop}
            onTest={noop}
            sample={WEEKENDS_SAMPLE}
            saved
            saving={false}
            target="tool:i-stripe/create_refund"
            targetKind="tool"
            targets={policyTargets}
            testing={false}
            {...props}
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

export function HappyCloudZonesFlowPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Settings › Zones on a Happy Cloud server: the team's zones, the default one first and the critical ones last, with each zone's picture or colour, owner, who may join and how many agents are in it. A row opens the zone's page, built for reviewing who may reach it: a header with the zone's details, then its members and, on a critical zone, its bots, each added in its own modal and removed in place. The details modal holds the rest of the zone's settings and Delete. A member without zones.manage reads the same pages."
            title="Happy Cloud zones flow"
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
                detail="a zone's plugins, one expanded to its tools, and its policies"
                heading={ZONE_HEADING}
                number="17"
                screen="17-plugins"
            >
                <ReachPage expanded={["i-stripe"]} manage />
            </Screen>
            <Screen
                detail="adding a plugin installation to the zone"
                heading={ZONE_HEADING}
                number="18"
                screen="18-add-plugins"
            >
                <ReachPage expanded={[]} manage />
                <HappyAgentZonePickDialog
                    candidates={otherInstallations}
                    kind="plugins"
                    onAdd={noop}
                    onClose={noop}
                    onQueryChange={noop}
                    onToggle={noop}
                    query=""
                    saving={false}
                    selected={["i-linear"]}
                />
            </Screen>
            <Screen
                detail="the zone's plugins and policies, read-only for a member"
                heading={ZONE_HEADING}
                number="19"
                screen="19-plugins-read-only"
            >
                <ReachPage expanded={["i-stripe"]} manage={false} />
            </Screen>
            <Screen
                detail="a server with zones' plugins but no policies yet: nothing about policies"
                heading={ZONE_HEADING}
                number="26"
                screen="26-plugins-without-policies"
            >
                <ReachPage expanded={["i-stripe"]} manage policies={false} />
            </Screen>
            <Screen
                detail="writing a new policy"
                heading={{ title: "New policy", description: "Stripe · create_refund" }}
                number="20"
                screen="20-policy-new"
            >
                <Policy
                    clockPinned={false}
                    code={"# Deny by ending in a message, or with an assert:\n"}
                    description=""
                    saved={false}
                />
            </Screen>
            <Screen
                detail="not on weekends, tested on a Saturday: denied"
                heading={POLICY_HEADING}
                number="21"
                screen="21-policy-deny"
            >
                <Policy
                    test={{
                        verdict: "deny",
                        message: "Refunds are not issued on weekends.",
                        diagnostics: [],
                        output: "weekday 5\n",
                        durationMs: 0.8,
                    }}
                />
            </Screen>
            <Screen
                detail="not on weekends, tested on a Monday: allowed"
                heading={POLICY_HEADING}
                number="22"
                screen="22-policy-allow"
            >
                <Policy
                    clock="2026-11-30T10:00:00Z"
                    test={{
                        verdict: "allow",
                        diagnostics: [],
                        output: "weekday 0\n",
                        durationMs: 0.7,
                    }}
                />
            </Screen>
            <Screen
                detail="a typo, tested: an error with the type checker's findings"
                heading={POLICY_HEADING}
                number="23"
                screen="23-policy-error"
            >
                <Policy
                    code={WEEKENDS_CODE_TYPO}
                    edited
                    test={{
                        verdict: "error",
                        message:
                            'The policy "No refunds on weekends" doesn\'t type-check, so this is denied.',
                        diagnostics: TYPO_DIAGNOSTICS,
                        output: "",
                        durationMs: 0.3,
                    }}
                />
            </Screen>
            <Screen
                detail="saving a typo: refused with the type checker's findings"
                heading={POLICY_HEADING}
                number="24"
                screen="24-policy-refused"
            >
                <Policy
                    code={WEEKENDS_CODE_TYPO}
                    diagnostics={TYPO_DIAGNOSTICS}
                    edited
                    error="The policy doesn't type-check, so it wasn't saved."
                />
            </Screen>
            <Screen
                detail="a policy, read-only for a member"
                heading={POLICY_HEADING}
                number="25"
                screen="25-policy-read-only"
            >
                <Policy clockPinned={false} manage={false} />
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
