import { useRef } from "react";
import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { FormRow } from "../../FormRow";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
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
                    {zone.isDefault ? (
                        <span className="happy-agent-zones__tag">Default</span>
                    ) : null}
                    {zone.critical ? (
                        <span className="happy-agent-zones__tag" data-critical="">
                            Critical
                        </span>
                    ) : null}
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

/** A zone's fields, as typed. */
export interface HappyAgentZoneDraftView {
    readonly name: string;
    readonly description: string;
    readonly critical: boolean;
    readonly color: HappyAgentZoneColorName;
    /** `null` lets every member join, which a critical zone can't. */
    readonly members: readonly string[] | null;
    /** The bots whose agents may join; only a critical zone lists any. */
    readonly bots: readonly string[];
    readonly owner: string | null;
}

export interface HappyAgentZonePageProps {
    /** The zone on the page; absent while a new one is made. */
    readonly zone?: {
        readonly imageUrl?: string;
        readonly agentCount: number;
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
    /** Whether the reader may change the zone; without it every field is read-only. */
    readonly manage: boolean;
    readonly draft: HappyAgentZoneDraftView;
    /** Whether a field changed since the page opened or last saved. */
    readonly edited: boolean;
    /** The team's members, for its owner and its members list. */
    readonly people: readonly HappyAgentZonePersonRow[];
    /** The team's bots, for a critical zone's bots list. */
    readonly teamBots: readonly HappyAgentZoneBotRow[];
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
    onMemberAdd: (userId: string) => void;
    onMemberRemove: (userId: string) => void;
    onBotAdd: (botId: string) => void;
    onBotRemove: (botId: string) => void;
    onImagePick: (file: File) => void;
    onImageRemove: () => void;
    onSave: () => void;
    /** Puts the fields back as they were; for a new zone, leaves it. */
    onDiscard: () => void;
    /** Asks to delete it; only for an existing zone other than the default one. */
    onDelete: () => void;
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

/**
 * Who a zone lists, members or bots: each with its avatar and name, and for
 * someone who may change it a Remove on each and a picker of the rest.
 */
function HappyAgentZoneRoster(props: {
    readonly listed: readonly string[];
    readonly candidates: readonly HappyAgentZoneBotRow[];
    /** Names an entry listed that is no longer among the candidates. */
    readonly missingName: string;
    readonly emptyText: string;
    readonly addLabel: string;
    readonly type: "human" | "agent";
    readonly readOnly: boolean;
    readonly disabled: boolean;
    readonly testId: string;
    onAdd: (id: string) => void;
    onRemove: (id: string) => void;
}) {
    const addable = props.candidates.filter((entry) => !props.listed.includes(entry.id));
    return (
        <Box className="happy-agent-zones__members" data-happy-desktop-ui={props.testId}>
            {props.listed.length === 0 ? (
                <Box className="happy-agent-zones__none">{props.emptyText}</Box>
            ) : (
                props.listed.map((id) => {
                    const entry = props.candidates.find((candidate) => candidate.id === id) ?? {
                        id,
                        name: props.missingName,
                    };
                    return (
                        <Box className="happy-agent-zones__member" key={id}>
                            <Avatar
                                initials={entry.name.slice(0, 1).toUpperCase()}
                                placeholderSeed={entry.id}
                                size="xs"
                                type={props.type}
                                {...(entry.imageUrl ? { imageUrl: entry.imageUrl } : {})}
                            />
                            <span className="happy-agent-zones__member-name">{entry.name}</span>
                            {props.readOnly ? null : (
                                <Button
                                    disabled={props.disabled}
                                    onClick={() => props.onRemove(id)}
                                    size="small"
                                    variant="ghost"
                                >
                                    Remove
                                </Button>
                            )}
                        </Box>
                    );
                })
            )}
            {props.readOnly || addable.length === 0 ? null : (
                <Select
                    aria-label={props.addLabel}
                    disabled={props.disabled}
                    fullWidth
                    onValueChange={(id) => {
                        if (id !== "") props.onAdd(id);
                    }}
                    options={addable.map((entry) => ({ value: entry.id, label: entry.name }))}
                    placeholder={`${props.addLabel}…`}
                    size="small"
                    value=""
                />
            )}
        </Box>
    );
}

/**
 * One zone's page in Settings › Permissions, opened from its row: what it is,
 * who and which bots may join it, and deleting it. Each part is a section of
 * its own, so further ones can stand beside them. Someone with `zones.manage`
 * changes it here and saves; anyone else reads the same page. The page says
 * the cluster's rules where they apply: the default zone is open to everyone
 * and has no owner, a critical zone always lists its members, and a team
 * keeps a critical zone.
 */
export function HappyAgentZonePage(props: HappyAgentZonePageProps) {
    const imageInput = useRef<HTMLInputElement>(null);
    const draft = props.draft;
    const readOnly = !props.manage;
    const disabled = props.saving;
    const isDefault = props.zone?.isDefault === true;
    const owner = props.people.find((person) => person.id === draft.owner);
    return (
        <>
            {props.error ? (
                <Banner tone="danger" title="Not saved">
                    {props.error}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection title="Zone">
                <FormRow
                    control={
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
                    }
                    description={
                        props.zone
                            ? readOnly
                                ? undefined
                                : "PNG, JPEG, WebP or GIF, up to 8 MB. Without one it shows its colour."
                            : "Add a picture once the zone is created. Until then it shows its colour."
                    }
                    label="Picture"
                />
                <FormRow
                    control={
                        readOnly ? (
                            <span className="happy-agent-zones__value">{draft.name}</span>
                        ) : (
                            <TextField
                                aria-label="Name"
                                disabled={disabled}
                                onSubmit={props.onSave}
                                onValueChange={props.onNameChange}
                                placeholder="Payments"
                                style={{ width: 220 }}
                                value={draft.name}
                            />
                        )
                    }
                    label="Name"
                />
                <FormRow
                    control={
                        readOnly ? (
                            <span className="happy-agent-zones__value" data-wrap="">
                                {draft.description || "No description"}
                            </span>
                        ) : (
                            <TextField
                                aria-label="Description"
                                disabled={disabled}
                                fullWidth
                                multiline
                                onValueChange={props.onDescriptionChange}
                                placeholder="What agents in this zone work on"
                                rows={3}
                                value={draft.description}
                            />
                        )
                    }
                    label="Description"
                    layout="stacked"
                />
                <FormRow
                    control={
                        readOnly ? (
                            <span className="happy-agent-zones__color" data-color={draft.color}>
                                <span className="happy-agent-zones__swatch-dot" />
                                {COLOR_LABEL[draft.color]}
                            </span>
                        ) : (
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
                        )
                    }
                    label="Colour"
                    layout={readOnly ? "inline" : "stacked"}
                />
                {isDefault ? null : (
                    <FormRow
                        control={
                            readOnly ? (
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
                                    width={220}
                                />
                            )
                        }
                        description="Shown as the zone's author. It grants nothing."
                        label="Owner"
                    />
                )}
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="Owners and admins may join any zone. A bot's agents may join a critical zone only when it lists the bot."
                title="Who may join"
            >
                {isDefault ? (
                    <FormRow
                        control={<span className="happy-agent-zones__value">Every member</span>}
                        description="The default zone is open to the whole team. It is never critical and has no owner."
                        label="Members"
                    />
                ) : (
                    <>
                        <FormRow
                            control={
                                <Switch
                                    aria-label="Critical"
                                    checked={draft.critical}
                                    disabled={
                                        readOnly ||
                                        disabled ||
                                        props.zone?.criticalLocked !== undefined
                                    }
                                    onChange={props.onCriticalChange}
                                />
                            }
                            description={
                                props.zone?.criticalLocked ??
                                "Critical plugin tools run only in a critical zone, and only the members and bots it lists may join."
                            }
                            label="Critical"
                        />
                        <FormRow
                            control={
                                <Box className="happy-agent-zones__field">
                                    {readOnly ? null : (
                                        <Box
                                            aria-label="Who may join"
                                            className="happy-agent-zones__options"
                                            role="radiogroup"
                                        >
                                            <HappyAgentZoneOption
                                                checked={draft.members === null}
                                                description={
                                                    draft.critical
                                                        ? "A critical zone always lists who may join."
                                                        : "Every member of the team."
                                                }
                                                disabled={disabled || draft.critical}
                                                label="Everyone"
                                                onSelect={() => props.onEveryoneChange(true)}
                                            />
                                            <HappyAgentZoneOption
                                                checked={draft.members !== null}
                                                description="Only the members listed below."
                                                disabled={disabled}
                                                label="Listed members"
                                                onSelect={() => props.onEveryoneChange(false)}
                                            />
                                        </Box>
                                    )}
                                    {draft.members === null ? (
                                        readOnly ? (
                                            <span className="happy-agent-zones__value">
                                                Every member
                                            </span>
                                        ) : null
                                    ) : (
                                        <HappyAgentZoneRoster
                                            addLabel="Add a member"
                                            candidates={props.people}
                                            disabled={disabled}
                                            emptyText="Nobody listed: only owners and admins may join."
                                            listed={draft.members}
                                            missingName="A former member"
                                            onAdd={props.onMemberAdd}
                                            onRemove={props.onMemberRemove}
                                            readOnly={readOnly}
                                            testId="zone-members"
                                            type="human"
                                        />
                                    )}
                                </Box>
                            }
                            label="Members"
                            layout="stacked"
                        />
                        {draft.critical ? (
                            <FormRow
                                control={
                                    <HappyAgentZoneRoster
                                        addLabel="Add a bot"
                                        candidates={props.teamBots}
                                        disabled={disabled}
                                        emptyText="No bots: no bot's agents may join."
                                        listed={draft.bots}
                                        missingName="A deleted bot"
                                        onAdd={props.onBotAdd}
                                        onRemove={props.onBotRemove}
                                        readOnly={readOnly}
                                        testId="zone-bots"
                                        type="agent"
                                    />
                                }
                                description="A bot's agents may join only when the bot is listed here, whoever they work for."
                                label="Bots"
                                layout="stacked"
                            />
                        ) : null}
                    </>
                )}
            </HappyAgentSettingsSection>
            {readOnly ? null : (
                <Box className="happy-agent-zones__actions" data-happy-desktop-ui="zone-actions">
                    <Button
                        disabled={props.imageSaving || draft.name.trim() === "" || !props.edited}
                        loading={props.saving}
                        onClick={props.onSave}
                        size="small"
                    >
                        {props.zone ? "Save changes" : "Create zone"}
                    </Button>
                    <Button
                        disabled={disabled || (props.zone !== undefined && !props.edited)}
                        onClick={props.onDiscard}
                        size="small"
                        variant="ghost"
                    >
                        {props.zone ? "Discard" : "Cancel"}
                    </Button>
                </Box>
            )}
            {readOnly || !props.zone || isDefault ? null : (
                <HappyAgentSettingsSection title="Delete">
                    <FormRow
                        control={
                            <Button
                                disabled={disabled || props.zone.deleteBlocked !== undefined}
                                icon="trash"
                                onClick={props.onDelete}
                                size="small"
                                variant="danger"
                            >
                                Delete zone
                            </Button>
                        }
                        description={
                            props.zone.deleteBlocked ??
                            "Only an empty zone can be deleted, and a team always keeps a critical zone."
                        }
                        label="Delete this zone"
                    />
                </HappyAgentSettingsSection>
            )}
        </>
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
