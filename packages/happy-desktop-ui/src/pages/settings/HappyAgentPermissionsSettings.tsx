import { useRef, type ReactNode } from "react";
import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Checkbox } from "../../Checkbox";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
import { SearchField } from "../../TitleBar";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** The fixed palette a zone's colour is picked from. */
export type HappyAgentZoneColorName =
    | "gray"
    | "red"
    | "orange"
    | "amber"
    | "green"
    | "teal"
    | "blue"
    | "indigo"
    | "purple"
    | "pink";

/** The palette in the order the picker offers it. */
export const HAPPY_AGENT_ZONE_PALETTE: readonly HappyAgentZoneColorName[] = [
    "gray",
    "red",
    "orange",
    "amber",
    "green",
    "teal",
    "blue",
    "indigo",
    "purple",
    "pink",
];

const COLOR_LABEL: Readonly<Record<HappyAgentZoneColorName, string>> = {
    gray: "Gray",
    red: "Red",
    orange: "Orange",
    amber: "Amber",
    green: "Green",
    teal: "Teal",
    blue: "Blue",
    indigo: "Indigo",
    purple: "Purple",
    pink: "Pink",
};

/** A team member, as a zone names them. */
export interface HappyAgentZonePersonRow {
    readonly id: string;
    /** Already worded where they saved no name. */
    readonly name: string;
    readonly imageUrl?: string;
    /** Their role, such as "Admin", where the server named it. */
    readonly role?: string;
}

/** A team bot, as a critical zone lists it. */
export interface HappyAgentZoneBotRow {
    readonly id: string;
    readonly name: string;
    readonly imageUrl?: string;
}

/** One zone, as the list shows it. */
export interface HappyAgentZoneRow {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    /** The team's one default zone, open to every member. */
    readonly isDefault: boolean;
    readonly critical: boolean;
    readonly color: HappyAgentZoneColorName;
    readonly imageUrl?: string;
    /** Who may join besides owners and admins: every member, or the ones listed. */
    readonly members: "everyone" | readonly HappyAgentZonePersonRow[];
    /** The bots whose agents may join a critical zone; absent on any other. */
    readonly bots?: readonly HappyAgentZoneBotRow[];
    /** Its author, shown only; absent for the seeded zones. */
    readonly owner?: HappyAgentZonePersonRow;
    readonly agentCount: number;
}

/**
 * A zone's picture, or a tile in its colour where it has none, with a home
 * for the default zone, a shield for a critical one and a globe for the rest.
 * The colour is the zone's, never its state.
 */
export function HappyAgentZoneMark(props: {
    readonly isDefault: boolean;
    readonly critical: boolean;
    readonly color: HappyAgentZoneColorName;
    readonly imageUrl?: string;
    readonly size?: "medium" | "large";
}) {
    return (
        <span
            aria-hidden="true"
            className="happy-agent-zones__mark"
            data-color={props.color}
            data-happy-desktop-ui="zone-mark"
            data-size={props.size ?? "medium"}
        >
            {props.imageUrl ? (
                <img
                    alt=""
                    className="happy-agent-zones__mark-image"
                    draggable={false}
                    src={props.imageUrl}
                />
            ) : (
                <Icon
                    name={props.isDefault ? "home" : props.critical ? "shield" : "globe"}
                    size={props.size === "large" ? 24 : 18}
                />
            )}
        </span>
    );
}

function agentsText(count: number): string {
    return `${String(count)} ${count === 1 ? "agent" : "agents"}`;
}

function botsText(count: number): string {
    if (count === 0) return "No bots";
    return `${String(count)} ${count === 1 ? "bot" : "bots"}`;
}

function membersText(members: HappyAgentZoneRow["members"]): string {
    if (members === "everyone") return "Every member";
    if (members.length === 0) return "Only owners and admins";
    return members.map((member) => member.name).join(", ");
}

function HappyAgentZoneOwner(props: {
    readonly owner: HappyAgentZonePersonRow;
    /** Beside an "Owner" label, the name alone. */
    readonly nameOnly?: boolean;
}) {
    return (
        <span className="happy-agent-zones__owner" data-happy-desktop-ui="zone-owner">
            <Avatar
                initials={props.owner.name.slice(0, 1).toUpperCase()}
                placeholderSeed={props.owner.id}
                size="xs"
                {...(props.owner.imageUrl ? { imageUrl: props.owner.imageUrl } : {})}
            />
            <span className="happy-agent-zones__owner-name">
                {props.nameOnly ? props.owner.name : `Owned by ${props.owner.name}`}
            </span>
        </span>
    );
}

/** The default zone's badge, or a critical zone's. */
function HappyAgentZoneTags(props: { readonly zone: HappyAgentZoneRow }) {
    if (props.zone.isDefault) return <span className="happy-agent-zones__tag">Default</span>;
    if (props.zone.critical)
        return (
            <span className="happy-agent-zones__tag" data-critical="">
                Critical
            </span>
        );
    return null;
}

/** A zone's row, which opens its page. */
function HappyAgentZoneItem(props: {
    readonly zone: HappyAgentZoneRow;
    onOpen: (zoneId: string) => void;
}) {
    const zone = props.zone;
    return (
        <button
            className="happy-agent-zones__row"
            data-happy-desktop-ui="zone"
            onClick={() => props.onOpen(zone.id)}
            type="button"
        >
            <HappyAgentZoneMark
                color={zone.color}
                critical={zone.critical}
                isDefault={zone.isDefault}
                {...(zone.imageUrl ? { imageUrl: zone.imageUrl } : {})}
            />
            <span className="happy-agent-zones__text">
                <span className="happy-agent-zones__title">
                    <span className="happy-agent-zones__name">{zone.name}</span>
                    <HappyAgentZoneTags zone={zone} />
                    <span className="happy-agent-zones__color" data-color={zone.color}>
                        <span className="happy-agent-zones__swatch-dot" />
                        {COLOR_LABEL[zone.color]}
                    </span>
                </span>
                {zone.description ? (
                    <span className="happy-agent-zones__description">{zone.description}</span>
                ) : null}
                <span className="happy-agent-zones__meta" data-wrap="">
                    {[
                        membersText(zone.members),
                        ...(zone.bots ? [botsText(zone.bots.length)] : []),
                        agentsText(zone.agentCount),
                    ].join(" · ")}
                </span>
                {zone.owner ? <HappyAgentZoneOwner owner={zone.owner} /> : null}
            </span>
            <span aria-hidden="true" className="happy-agent-zones__row-actions">
                <Icon name="chevron-right" size={16} />
            </span>
        </button>
    );
}

export interface HappyAgentPermissionsSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    /** Whether the reader may create, change and delete zones. */
    readonly manage: boolean;
    /** The default zone first, then the other zones, then the critical ones. */
    readonly zones: readonly HappyAgentZoneRow[];
    onZoneCreate: () => void;
    /** Opens a zone's page, for anyone; it is read-only without `zones.manage`. */
    onZoneOpen: (zoneId: string) => void;
}

/**
 * Settings › Permissions on a Happy Cloud server: the team's zones, the
 * default one first and the critical ones last, with who may join each and
 * how many agents are in it. Someone without
 * `zones.manage` reads the same list with nothing to change.
 */
export function HappyAgentPermissionsSettings(props: HappyAgentPermissionsSettingsProps) {
    if (props.error)
        return (
            <Banner tone="danger" title="Zones unavailable">
                {props.error}
            </Banner>
        );
    if (props.loading)
        return (
            <Box className="happy-agent-settings__pending">
                <Spinner size={16} />
                <span>Reading the zones…</span>
            </Box>
        );
    return (
        <>
            {props.manage ? null : (
                <Banner tone="info">
                    Only owners, admins and roles allowed to manage zones can change them.
                </Banner>
            )}
            <HappyAgentSettingsSection
                description="An agent joins one zone, once. Until it does, it can't use computers, repositories or plugin tools. Critical plugin tools run only in a critical zone. Owners and admins may join any zone."
                title="Zones"
            >
                <Box className="happy-agent-zones__list" data-happy-desktop-ui="zones">
                    {props.zones.map((zone) => (
                        <HappyAgentZoneItem key={zone.id} onOpen={props.onZoneOpen} zone={zone} />
                    ))}
                </Box>
            </HappyAgentSettingsSection>
            {props.manage ? (
                <Box className="happy-agent-zones__actions">
                    <Button
                        icon="plus"
                        onClick={props.onZoneCreate}
                        size="small"
                        variant="secondary"
                    >
                        Add zone
                    </Button>
                </Box>
            ) : null}
        </>
    );
}

export interface HappyAgentZonePageProps {
    readonly zone: HappyAgentZoneRow;
    /** Whether the reader may change the zone; without it every part is read-only. */
    readonly manage: boolean;
    /** The member or bot whose removal is on its way. */
    readonly removing?: string;
    /** Why the last removal did not go through. */
    readonly error?: string;
    /** Opens the details modal, which holds the rest of the zone's settings. */
    onDetailsOpen: () => void;
    onMembersAdd: () => void;
    onMemberRemove: (userId: string) => void;
    onBotsAdd: () => void;
    onBotRemove: (botId: string) => void;
    /** Further sections of the zone, after who may join it. */
    children?: ReactNode;
}

/** "Critical · Listed members · 2 agents": what the header says under the zone's name. */
function zoneSummary(zone: HappyAgentZoneRow): string {
    return [
        zone.isDefault ? "Default" : zone.critical ? "Critical" : "Not critical",
        zone.members === "everyone" ? "Every member" : "Listed members",
        agentsText(zone.agentCount),
    ].join(" · ");
}

/** A listed member or bot on the zone's page, with Remove for someone who may change it. */
function HappyAgentZoneEntry(props: {
    readonly entry: HappyAgentZoneBotRow & { readonly role?: string };
    readonly type: "human" | "agent";
    readonly manage: boolean;
    readonly removing?: string;
    onRemove: (id: string) => void;
}) {
    const entry = props.entry;
    return (
        <Box className="happy-agent-zones__entry" data-happy-desktop-ui="zone-entry">
            <Avatar
                initials={entry.name.slice(0, 1).toUpperCase()}
                placeholderSeed={entry.id}
                size="sm"
                type={props.type}
                {...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {})}
            />
            <span className="happy-agent-zones__text">
                <span className="happy-agent-zones__name">{entry.name}</span>
                {entry.role ? <span className="happy-agent-zones__meta">{entry.role}</span> : null}
            </span>
            {props.manage ? (
                <Button
                    disabled={props.removing !== undefined && props.removing !== entry.id}
                    loading={props.removing === entry.id}
                    onClick={() => props.onRemove(entry.id)}
                    size="small"
                    variant="ghost"
                >
                    Remove
                </Button>
            ) : null}
        </Box>
    );
}

/**
 * One zone's page in Settings › Permissions, opened from its row, built for
 * reviewing who may reach it. The header names the zone and opens its
 * details modal; the body lists its members and, on a critical zone, its
 * bots, each added in its own modal and removed in place. Further sections
 * follow as `children`. Someone without `zones.manage` reads the same page.
 */
export function HappyAgentZonePage(props: HappyAgentZonePageProps) {
    const zone = props.zone;
    const members = zone.members;
    return (
        <>
            <Box className="happy-agent-zones__header" data-happy-desktop-ui="zone-header">
                <HappyAgentZoneMark
                    color={zone.color}
                    critical={zone.critical}
                    isDefault={zone.isDefault}
                    size="large"
                    {...(zone.imageUrl ? { imageUrl: zone.imageUrl } : {})}
                />
                <span className="happy-agent-zones__text">
                    <span className="happy-agent-zones__title">
                        <span className="happy-agent-zones__name" data-size="large">
                            {zone.name}
                        </span>
                        <HappyAgentZoneTags zone={zone} />
                    </span>
                    <span className="happy-agent-zones__meta">{zoneSummary(zone)}</span>
                    {zone.description ? (
                        <span className="happy-agent-zones__description">{zone.description}</span>
                    ) : null}
                    {zone.owner ? <HappyAgentZoneOwner owner={zone.owner} /> : null}
                </span>
                <Button
                    icon={props.manage ? "edit" : undefined}
                    onClick={props.onDetailsOpen}
                    size="small"
                    variant="secondary"
                >
                    {props.manage ? "Edit details" : "Details"}
                </Button>
            </Box>
            {props.error ? (
                <Banner tone="danger" title="Not saved">
                    {props.error}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection
                description="Who may join, besides owners and admins, who may join any zone."
                title="Members"
            >
                {members === "everyone" ? (
                    <Box className="happy-agent-zones__none">
                        {zone.isDefault
                            ? "The default zone is open to every member."
                            : props.manage
                              ? "Every member may join. To list members instead, edit its details."
                              : "Every member may join."}
                    </Box>
                ) : members.length === 0 ? (
                    <Box className="happy-agent-zones__none">
                        Nobody is listed, so only owners and admins may join.
                    </Box>
                ) : (
                    members.map((member) => (
                        <HappyAgentZoneEntry
                            entry={member}
                            key={member.id}
                            manage={props.manage}
                            onRemove={props.onMemberRemove}
                            type="human"
                            {...(props.removing === undefined ? {} : { removing: props.removing })}
                        />
                    ))
                )}
            </HappyAgentSettingsSection>
            {props.manage && members !== "everyone" ? (
                <Box className="happy-agent-zones__actions">
                    <Button
                        icon="plus"
                        onClick={props.onMembersAdd}
                        size="small"
                        variant="secondary"
                    >
                        Add members
                    </Button>
                </Box>
            ) : null}
            {zone.critical ? (
                <>
                    <HappyAgentSettingsSection
                        description="A bot's agents may join only when the bot is listed here, whoever they work for."
                        title="Bots"
                    >
                        {(zone.bots ?? []).length === 0 ? (
                            <Box className="happy-agent-zones__none">
                                {"No bots, so no bot's agents may join."}
                            </Box>
                        ) : (
                            (zone.bots ?? []).map((bot) => (
                                <HappyAgentZoneEntry
                                    entry={bot}
                                    key={bot.id}
                                    manage={props.manage}
                                    onRemove={props.onBotRemove}
                                    type="agent"
                                    {...(props.removing === undefined
                                        ? {}
                                        : { removing: props.removing })}
                                />
                            ))
                        )}
                    </HappyAgentSettingsSection>
                    {props.manage ? (
                        <Box className="happy-agent-zones__actions">
                            <Button
                                icon="plus"
                                onClick={props.onBotsAdd}
                                size="small"
                                variant="secondary"
                            >
                                Add bots
                            </Button>
                        </Box>
                    ) : null}
                </>
            ) : null}
            {props.children}
        </>
    );
}

/** A zone's settings, as its details modal holds them. */
export interface HappyAgentZoneDraftView {
    readonly name: string;
    readonly description: string;
    readonly critical: boolean;
    readonly color: HappyAgentZoneColorName;
    /** Every member may join, or only the listed ones; a critical zone always lists them. */
    readonly everyone: boolean;
    readonly owner: string | null;
}

export interface HappyAgentZoneDetailsDialogProps {
    /** The zone the modal describes; absent while a new one is made. */
    readonly zone?: {
        readonly imageUrl?: string;
        /**
         * The default zone: its critical flag, owner and members are fixed,
         * and it can't be deleted.
         */
        readonly isDefault: boolean;
        /** Why it can't stop being critical, such as being the team's only critical zone. */
        readonly criticalLocked?: string;
        /** Why the cluster will refuse to delete it, as far as the list can tell. */
        readonly deleteBlocked?: string;
    };
    /** Whether the reader may change the zone; without it every setting is read-only. */
    readonly manage: boolean;
    readonly draft: HappyAgentZoneDraftView;
    /** Whether a setting changed since the modal opened. */
    readonly edited: boolean;
    /** The team's members, for its owner. */
    readonly people: readonly HappyAgentZonePersonRow[];
    readonly saving: boolean;
    readonly imageSaving: boolean;
    /** Why the last save or picture change did not go through. */
    readonly error?: string;
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    onCriticalChange: (critical: boolean) => void;
    onColorChange: (color: HappyAgentZoneColorName) => void;
    onOwnerChange: (userId: string | null) => void;
    onEveryoneChange: (everyone: boolean) => void;
    onImagePick: (file: File) => void;
    onImageRemove: () => void;
    onSave: () => void;
    /** Asks to delete it; only for an existing zone other than the default one. */
    onDelete: () => void;
    onClose: () => void;
}

const IMAGE_ACCEPT = "image/png,image/jpeg,image/webp,image/gif";
const NO_OWNER = "";

/** One radio choice with its explanation, in the zone form's own option style. */
function HappyAgentZoneOption(props: {
    readonly checked: boolean;
    readonly disabled: boolean;
    readonly label: string;
    readonly description: string;
    onSelect: () => void;
}) {
    return (
        <button
            aria-checked={props.checked}
            className="happy-agent-zones__option"
            disabled={props.disabled}
            onClick={props.onSelect}
            role="radio"
            type="button"
        >
            <span aria-hidden="true" className="happy-agent-zones__radio" />
            <span className="happy-agent-zones__option-text">
                <span className="happy-agent-zones__option-label">{props.label}</span>
                <span className="happy-agent-zones__option-description">{props.description}</span>
            </span>
        </button>
    );
}

/** A labelled part of the details modal. */
function HappyAgentZoneField(props: {
    readonly label: string;
    readonly hint?: string;
    readonly children: ReactNode;
}) {
    return (
        <Box className="happy-agent-zones__field">
            <span className="happy-agent-zones__field-label">{props.label}</span>
            {props.children}
            {props.hint ? <span className="happy-agent-zones__note">{props.hint}</span> : null}
        </Box>
    );
}

/**
 * Every setting of one zone, or of a new zone, in one modal opened from its
 * page's header: picture, name, description, colour, owner, whether it is
 * critical and whether every member may join, and Delete. It keeps the
 * cluster's rules: the default zone is open to everyone, never critical and
 * has no owner; a critical zone always lists its members; and a team keeps a
 * critical zone. Someone without `zones.manage` reads the same settings.
 */
export function HappyAgentZoneDetailsDialog(props: HappyAgentZoneDetailsDialogProps) {
    const imageInput = useRef<HTMLInputElement>(null);
    const draft = props.draft;
    const readOnly = !props.manage;
    const disabled = props.saving;
    const isDefault = props.zone?.isDefault === true;
    const owner = props.people.find((person) => person.id === draft.owner);
    const busy = props.saving || props.imageSaving;
    const close = (): void => {
        if (!busy) props.onClose();
    };
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    readOnly ? (
                        <Button onClick={close}>Done</Button>
                    ) : (
                        <>
                            <Button disabled={busy} onClick={close} variant="ghost">
                                Cancel
                            </Button>
                            <Button
                                disabled={
                                    props.imageSaving ||
                                    draft.name.trim() === "" ||
                                    (props.zone !== undefined && !props.edited)
                                }
                                loading={props.saving}
                                onClick={props.onSave}
                            >
                                {props.zone ? "Save" : "Create zone"}
                            </Button>
                        </>
                    )
                }
                onClose={busy ? undefined : close}
                size="large"
                title={props.zone ? (readOnly ? draft.name : "Edit details") : "New zone"}
            >
                <Box className="happy-agent-zones__form" data-happy-desktop-ui="zone-details">
                    {props.error ? (
                        <Banner tone="danger" title="Not saved">
                            {props.error}
                        </Banner>
                    ) : null}
                    <HappyAgentZoneField
                        label="Picture"
                        {...(readOnly
                            ? {}
                            : {
                                  hint: props.zone
                                      ? "PNG, JPEG, WebP or GIF, up to 8 MB. Without one it shows its colour."
                                      : "Add a picture once the zone is created. Until then it shows its colour.",
                              })}
                    >
                        <Box className="happy-agent-zones__picture">
                            <HappyAgentZoneMark
                                color={draft.color}
                                critical={draft.critical}
                                isDefault={isDefault}
                                size="large"
                                {...(props.zone?.imageUrl ? { imageUrl: props.zone.imageUrl } : {})}
                            />
                            {readOnly || !props.zone ? null : (
                                <>
                                    <Button
                                        disabled={disabled}
                                        loading={props.imageSaving}
                                        onClick={(event) => {
                                            event.currentTarget.focus();
                                            imageInput.current?.click();
                                        }}
                                        size="small"
                                        variant="secondary"
                                    >
                                        {props.zone.imageUrl ? "Replace" : "Upload"}
                                    </Button>
                                    {props.zone.imageUrl ? (
                                        <Button
                                            disabled={disabled || props.imageSaving}
                                            onClick={props.onImageRemove}
                                            size="small"
                                            variant="ghost"
                                        >
                                            Remove
                                        </Button>
                                    ) : null}
                                    <input
                                        accept={IMAGE_ACCEPT}
                                        hidden
                                        onChange={(event) => {
                                            const file = event.currentTarget.files?.[0];
                                            // Picking the same file again is a new choice.
                                            event.currentTarget.value = "";
                                            if (file) props.onImagePick(file);
                                        }}
                                        ref={imageInput}
                                        type="file"
                                    />
                                </>
                            )}
                        </Box>
                    </HappyAgentZoneField>
                    {readOnly ? (
                        <>
                            <HappyAgentZoneField label="Description">
                                <span className="happy-agent-zones__value" data-wrap="">
                                    {draft.description || "No description"}
                                </span>
                            </HappyAgentZoneField>
                            <HappyAgentZoneField label="Colour">
                                <span className="happy-agent-zones__color" data-color={draft.color}>
                                    <span className="happy-agent-zones__swatch-dot" />
                                    {COLOR_LABEL[draft.color]}
                                </span>
                            </HappyAgentZoneField>
                        </>
                    ) : (
                        <>
                            <TextField
                                disabled={disabled}
                                fullWidth
                                label="Name"
                                onSubmit={props.onSave}
                                onValueChange={props.onNameChange}
                                placeholder="Payments"
                                value={draft.name}
                            />
                            <TextField
                                disabled={disabled}
                                fullWidth
                                label="Description"
                                multiline
                                onValueChange={props.onDescriptionChange}
                                placeholder="What agents in this zone work on"
                                rows={3}
                                value={draft.description}
                            />
                            <HappyAgentZoneField label="Colour">
                                <Box
                                    aria-label="Colour"
                                    className="happy-agent-zones__swatches"
                                    role="radiogroup"
                                >
                                    {HAPPY_AGENT_ZONE_PALETTE.map((color) => (
                                        <button
                                            aria-checked={draft.color === color}
                                            aria-label={COLOR_LABEL[color]}
                                            className="happy-agent-zones__swatch"
                                            data-color={color}
                                            disabled={disabled}
                                            key={color}
                                            onClick={() => props.onColorChange(color)}
                                            role="radio"
                                            title={COLOR_LABEL[color]}
                                            type="button"
                                        >
                                            <span className="happy-agent-zones__swatch-dot" />
                                        </button>
                                    ))}
                                </Box>
                            </HappyAgentZoneField>
                        </>
                    )}
                    {isDefault ? (
                        <HappyAgentZoneField label="Who may join">
                            <span className="happy-agent-zones__value" data-wrap="">
                                Every member. The default zone is open to the whole team, is never
                                critical and has no owner.
                            </span>
                        </HappyAgentZoneField>
                    ) : (
                        <>
                            <HappyAgentZoneField
                                label="Owner"
                                hint="Shown as the zone's author. It grants nothing."
                            >
                                {readOnly ? (
                                    owner ? (
                                        <HappyAgentZoneOwner nameOnly owner={owner} />
                                    ) : (
                                        <span className="happy-agent-zones__value">No owner</span>
                                    )
                                ) : (
                                    <Select
                                        aria-label="Owner"
                                        disabled={disabled}
                                        onValueChange={(id) =>
                                            props.onOwnerChange(id === NO_OWNER ? null : id)
                                        }
                                        options={[
                                            { value: NO_OWNER, label: "No owner" },
                                            ...props.people.map((person) => ({
                                                value: person.id,
                                                label: person.name,
                                            })),
                                        ]}
                                        value={draft.owner ?? NO_OWNER}
                                        width={280}
                                    />
                                )}
                            </HappyAgentZoneField>
                            <Box className="happy-agent-zones__toggle">
                                <span className="happy-agent-zones__text">
                                    <span className="happy-agent-zones__field-label">Critical</span>
                                    <span className="happy-agent-zones__note">
                                        {props.zone?.criticalLocked ??
                                            "Critical plugin tools run only in a critical zone, and only the members and bots it lists may join."}
                                    </span>
                                </span>
                                {readOnly ? (
                                    <span className="happy-agent-zones__value">
                                        {draft.critical ? "Critical" : "Not critical"}
                                    </span>
                                ) : (
                                    <Switch
                                        aria-label="Critical"
                                        checked={draft.critical}
                                        disabled={
                                            disabled || props.zone?.criticalLocked !== undefined
                                        }
                                        onChange={props.onCriticalChange}
                                    />
                                )}
                            </Box>
                            <HappyAgentZoneField label="Who may join">
                                {readOnly ? (
                                    <span className="happy-agent-zones__value">
                                        {draft.everyone ? "Every member" : "Listed members"}
                                    </span>
                                ) : (
                                    <Box
                                        aria-label="Who may join"
                                        className="happy-agent-zones__options"
                                        role="radiogroup"
                                    >
                                        <HappyAgentZoneOption
                                            checked={draft.everyone}
                                            description={
                                                draft.critical
                                                    ? "A critical zone always lists who may join."
                                                    : "Every member of the team."
                                            }
                                            disabled={disabled || draft.critical}
                                            label="Every member"
                                            onSelect={() => props.onEveryoneChange(true)}
                                        />
                                        <HappyAgentZoneOption
                                            checked={!draft.everyone}
                                            description="Only the members listed on its page. Owners and admins may join any zone."
                                            disabled={disabled}
                                            label="Listed members"
                                            onSelect={() => props.onEveryoneChange(false)}
                                        />
                                    </Box>
                                )}
                            </HappyAgentZoneField>
                        </>
                    )}
                    {readOnly || !props.zone || isDefault ? null : (
                        <Box className="happy-agent-zones__danger">
                            <span className="happy-agent-zones__text">
                                <span className="happy-agent-zones__field-label">
                                    Delete this zone
                                </span>
                                <span className="happy-agent-zones__note">
                                    {props.zone.deleteBlocked ??
                                        "Only an empty zone can be deleted, and a team always keeps a critical zone."}
                                </span>
                            </span>
                            <Button
                                disabled={busy || props.zone.deleteBlocked !== undefined}
                                onClick={props.onDelete}
                                size="small"
                                variant="danger"
                            >
                                Delete…
                            </Button>
                        </Box>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

/** Someone a zone may list: a member with their role, or a bot. */
export interface HappyAgentZoneCandidateRow {
    readonly id: string;
    readonly name: string;
    readonly imageUrl?: string;
    /** A member's role, such as "Admin". */
    readonly role?: string;
}

export interface HappyAgentZonePickDialogProps {
    readonly kind: "members" | "bots";
    /** Who may be added: everyone not listed yet. */
    readonly candidates: readonly HappyAgentZoneCandidateRow[];
    readonly query: string;
    /** The IDs picked so far. */
    readonly selected: readonly string[];
    readonly saving: boolean;
    /** Why the last add did not go through. */
    readonly error?: string;
    onQueryChange: (value: string) => void;
    onToggle: (id: string) => void;
    onAdd: () => void;
    onClose: () => void;
}

/**
 * Adds several members, or on a critical zone several bots, to a zone at
 * once: a searchable list of those it doesn't list yet, each picked with a
 * checkbox, and Add for all of them.
 */
export function HappyAgentZonePickDialog(props: HappyAgentZonePickDialogProps) {
    const query = props.query.trim().toLowerCase();
    const shown = props.candidates.filter(
        (candidate) =>
            query === "" ||
            candidate.name.toLowerCase().includes(query) ||
            candidate.role?.toLowerCase().includes(query) === true,
    );
    const members = props.kind === "members";
    const close = (): void => {
        if (!props.saving) props.onClose();
    };
    const count = props.selected.length;
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    <>
                        <Button disabled={props.saving} onClick={close} variant="ghost">
                            Cancel
                        </Button>
                        <Button disabled={count === 0} loading={props.saving} onClick={props.onAdd}>
                            {count === 0 ? "Add" : `Add ${String(count)}`}
                        </Button>
                    </>
                }
                onClose={props.saving ? undefined : close}
                size="medium"
                subheader={
                    <Box className="happy-agent-zones__search">
                        <SearchField
                            onChange={props.onQueryChange}
                            placeholder={members ? "Search members" : "Search bots"}
                            shortcutHint={false}
                            value={props.query}
                        />
                    </Box>
                }
                title={members ? "Add members" : "Add bots"}
            >
                <Box className="happy-agent-zones__form" data-happy-desktop-ui="zone-pick">
                    {props.error ? (
                        <Banner tone="danger" title="Not added">
                            {props.error}
                        </Banner>
                    ) : null}
                    {shown.length === 0 ? (
                        <Box className="happy-agent-zones__none">
                            {props.candidates.length === 0
                                ? members
                                    ? "Every member is listed already."
                                    : "Every bot is listed already."
                                : `Nothing matches “${props.query.trim()}”.`}
                        </Box>
                    ) : (
                        <Box className="happy-agent-zones__picks">
                            {shown.map((candidate) => {
                                const picked = props.selected.includes(candidate.id);
                                return (
                                    <Box
                                        className="happy-agent-zones__pick"
                                        data-happy-desktop-ui="zone-pick-row"
                                        data-picked={picked ? "" : undefined}
                                        key={candidate.id}
                                    >
                                        <Checkbox
                                            aria-label={candidate.name}
                                            checked={picked}
                                            disabled={props.saving}
                                            onChange={() => props.onToggle(candidate.id)}
                                        />
                                        {/* The whole row picks; the checkbox keeps the keyboard. */}
                                        <button
                                            className="happy-agent-zones__pick-label"
                                            disabled={props.saving}
                                            onClick={() => props.onToggle(candidate.id)}
                                            tabIndex={-1}
                                            type="button"
                                        >
                                            <Avatar
                                                initials={candidate.name.slice(0, 1).toUpperCase()}
                                                placeholderSeed={candidate.id}
                                                size="sm"
                                                type={members ? "human" : "agent"}
                                                {...(candidate.imageUrl
                                                    ? { imageUrl: candidate.imageUrl }
                                                    : {})}
                                            />
                                            <span className="happy-agent-zones__text">
                                                <span className="happy-agent-zones__name">
                                                    {candidate.name}
                                                </span>
                                                {candidate.role ? (
                                                    <span className="happy-agent-zones__meta">
                                                        {candidate.role}
                                                    </span>
                                                ) : null}
                                            </span>
                                        </button>
                                    </Box>
                                );
                            })}
                        </Box>
                    )}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

export interface HappyAgentZoneDeleteDialogProps {
    readonly name: string;
    /**
     * Why the cluster will refuse, as far as this list can tell: agents in it,
     * or the team's only critical zone. The delete button is held back.
     */
    readonly blocked?: string;
    readonly deleting: boolean;
    /** The cluster's own words when it refused. */
    readonly error?: string;
    onDelete: () => void;
    onClose: () => void;
}

/**
 * Confirms deleting a zone, which only an empty zone may be, other than the
 * default one and the team's last critical zone.
 */
export function HappyAgentZoneDeleteDialog(props: HappyAgentZoneDeleteDialogProps) {
    const close = props.deleting ? undefined : props.onClose;
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    <>
                        <Button disabled={props.deleting} onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.blocked !== undefined}
                            loading={props.deleting}
                            onClick={props.onDelete}
                            variant="danger"
                        >
                            Delete zone
                        </Button>
                    </>
                }
                icon="trash"
                onClose={close}
                size="small"
                title={`Delete ${props.name}?`}
                tone="danger"
            >
                <Box className="happy-agent-zones__form" data-happy-desktop-ui="zone-delete">
                    {props.error ? (
                        <Banner tone="danger" title="Not deleted">
                            {props.error}
                        </Banner>
                    ) : props.blocked ? (
                        <Banner tone="warning" title="This zone can't be deleted">
                            {props.blocked}
                        </Banner>
                    ) : null}
                    {props.blocked === undefined && props.error === undefined ? (
                        <p className="happy-agent-zones__note">
                            Only an empty zone can be deleted, and a team always keeps at least one
                            critical zone.
                        </p>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
