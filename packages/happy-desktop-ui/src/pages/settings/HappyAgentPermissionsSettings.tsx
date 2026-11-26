import { useRef } from "react";
import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { Icon } from "../../Icon";
import { Modal } from "../../Modal";
import { ModalOverlay } from "../../ModalOverlay";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** What a zone is for: Default runs everyday tools, Critical the ones that need a members list. */
export type HappyAgentZoneKindName = "default" | "critical";

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

const KINDS: Readonly<
    Record<HappyAgentZoneKindName, { readonly label: string; readonly description: string }>
> = {
    default: {
        label: "Default",
        description: "For everyday work. Default plugin tools run here.",
    },
    critical: {
        label: "Critical",
        description:
            "For sensitive work. Critical plugin tools run only here, and only the members listed may join.",
    },
};

const KIND_ORDER: readonly HappyAgentZoneKindName[] = ["default", "critical"];

/** A team member, as a zone names them. */
export interface HappyAgentZonePersonRow {
    readonly id: string;
    /** Already worded where they saved no name. */
    readonly name: string;
    readonly imageUrl?: string;
}

/** One zone, as the list shows it. */
export interface HappyAgentZoneRow {
    readonly id: string;
    readonly name: string;
    readonly description: string;
    readonly kind: HappyAgentZoneKindName;
    readonly color: HappyAgentZoneColorName;
    readonly imageUrl?: string;
    /** Who may join besides owners and admins: every member, or the ones listed. */
    readonly members: "everyone" | readonly HappyAgentZonePersonRow[];
    /** Its author, shown only; absent for the seeded zones. */
    readonly owner?: HappyAgentZonePersonRow;
    readonly agentCount: number;
}

/**
 * A zone's picture, or a tile in its colour with its kind's glyph where it has
 * none. The colour is the zone's, never its state.
 */
export function HappyAgentZoneMark(props: {
    readonly kind: HappyAgentZoneKindName;
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
                    name={props.kind === "critical" ? "shield" : "globe"}
                    size={props.size === "large" ? 24 : 18}
                />
            )}
        </span>
    );
}

function agentsText(count: number): string {
    return `${String(count)} ${count === 1 ? "agent" : "agents"}`;
}

function membersText(members: HappyAgentZoneRow["members"]): string {
    if (members === "everyone") return "Every member may join";
    if (members.length === 0) return "Only owners and admins may join";
    return `${members.map((member) => member.name).join(", ")} may join`;
}

function HappyAgentZoneOwner(props: { readonly owner: HappyAgentZonePersonRow }) {
    return (
        <span className="happy-agent-zones__owner" data-happy-desktop-ui="zone-owner">
            <Avatar
                initials={props.owner.name.slice(0, 1).toUpperCase()}
                placeholderSeed={props.owner.id}
                size="xs"
                {...(props.owner.imageUrl ? { imageUrl: props.owner.imageUrl } : {})}
            />
            <span className="happy-agent-zones__owner-name">{`Owned by ${props.owner.name}`}</span>
        </span>
    );
}

function HappyAgentZoneItem(props: {
    readonly zone: HappyAgentZoneRow;
    readonly manage: boolean;
    onEdit: (zoneId: string) => void;
}) {
    const zone = props.zone;
    return (
        <Box className="happy-agent-zones__row" data-happy-desktop-ui="zone">
            <HappyAgentZoneMark
                color={zone.color}
                kind={zone.kind}
                {...(zone.imageUrl ? { imageUrl: zone.imageUrl } : {})}
            />
            <span className="happy-agent-zones__text">
                <span className="happy-agent-zones__title">
                    <span className="happy-agent-zones__name">{zone.name}</span>
                    <span className="happy-agent-zones__tag" data-kind={zone.kind}>
                        {KINDS[zone.kind].label}
                    </span>
                    <span className="happy-agent-zones__color" data-color={zone.color}>
                        <span className="happy-agent-zones__swatch-dot" />
                        {COLOR_LABEL[zone.color]}
                    </span>
                </span>
                {zone.description ? (
                    <span className="happy-agent-zones__description">{zone.description}</span>
                ) : null}
                <span className="happy-agent-zones__meta" data-wrap="">
                    {`${membersText(zone.members)} · ${agentsText(zone.agentCount)}`}
                </span>
                {zone.owner ? <HappyAgentZoneOwner owner={zone.owner} /> : null}
            </span>
            {props.manage ? (
                <span className="happy-agent-zones__row-actions">
                    <Button onClick={() => props.onEdit(zone.id)} size="small" variant="ghost">
                        Edit
                    </Button>
                </span>
            ) : null}
        </Box>
    );
}

export interface HappyAgentPermissionsSettingsProps {
    readonly loading: boolean;
    readonly error?: string;
    /** Whether the reader may create, change and delete zones. */
    readonly manage: boolean;
    /** Default zones first, then Critical. */
    readonly zones: readonly HappyAgentZoneRow[];
    onZoneCreate: () => void;
    onZoneEdit: (zoneId: string) => void;
}

/**
 * Settings › Permissions on a Happy Cloud server: the team's zones, grouped by
 * kind, with who may join each and how many agents are in it. Someone without
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
            {KIND_ORDER.map((kind) => {
                const zones = props.zones.filter((zone) => zone.kind === kind);
                return (
                    <HappyAgentSettingsSection
                        description={
                            kind === "default"
                                ? "An agent joins one zone, once. Until it does, it can't use computers, repositories or plugin tools. Owners and admins may join any zone."
                                : "Critical plugin tools run only for agents in a Critical zone. Only the members listed, owners and admins may join one."
                        }
                        key={kind}
                        title={kind === "default" ? "Default zones" : "Critical zones"}
                    >
                        <Box
                            className="happy-agent-zones__list"
                            data-happy-desktop-ui={`zones-${kind}`}
                        >
                            {zones.length === 0 ? (
                                <Box className="happy-agent-zones__none">No zone of this kind.</Box>
                            ) : (
                                zones.map((zone) => (
                                    <HappyAgentZoneItem
                                        key={zone.id}
                                        manage={props.manage}
                                        onEdit={props.onZoneEdit}
                                        zone={zone}
                                    />
                                ))
                            )}
                        </Box>
                    </HappyAgentSettingsSection>
                );
            })}
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
    readonly kind: HappyAgentZoneKindName;
    readonly color: HappyAgentZoneColorName;
    /** `null` lets every member join. */
    readonly members: readonly string[] | null;
    readonly owner: string | null;
}

export interface HappyAgentZoneDialogProps {
    /** The zone being changed; absent while a new one is made. */
    readonly zone?: {
        readonly imageUrl?: string;
        readonly agentCount: number;
        /** Why its kind can't change, such as being the team's only zone of its kind. */
        readonly kindLocked?: string;
    };
    readonly draft: HappyAgentZoneDraftView;
    /** The team's members, for its owner and its members list. */
    readonly people: readonly HappyAgentZonePersonRow[];
    readonly saving: boolean;
    readonly imageSaving: boolean;
    /** Why the last save or picture change did not go through. */
    readonly error?: string;
    onNameChange: (value: string) => void;
    onDescriptionChange: (value: string) => void;
    onKindChange: (kind: HappyAgentZoneKindName) => void;
    onColorChange: (color: HappyAgentZoneColorName) => void;
    onOwnerChange: (userId: string | null) => void;
    onEveryoneChange: (everyone: boolean) => void;
    onMemberAdd: (userId: string) => void;
    onMemberRemove: (userId: string) => void;
    onImagePick: (file: File) => void;
    onImageRemove: () => void;
    onSave: () => void;
    /** Asks to delete it; only for an existing zone. */
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

/**
 * Creating or changing a zone: its name, picture, colour, kind, owner and who
 * may join. The form says the cluster's rules where they apply: a Critical zone
 * always lists its members, and a team keeps one zone of each kind.
 */
export function HappyAgentZoneDialog(props: HappyAgentZoneDialogProps) {
    const imageInput = useRef<HTMLInputElement>(null);
    const draft = props.draft;
    const busy = props.saving || props.imageSaving;
    const close = (): void => {
        if (!busy) props.onClose();
    };
    const listed = draft.members ?? [];
    const personOf = (id: string): HappyAgentZonePersonRow =>
        props.people.find((person) => person.id === id) ?? { id, name: "A former member" };
    const addable = props.people.filter((person) => !listed.includes(person.id));
    return (
        <ModalOverlay onDismiss={close}>
            <Modal
                footer={
                    <>
                        {props.zone ? (
                            <Button
                                className="happy-agent-zones__delete"
                                disabled={busy}
                                icon="trash"
                                onClick={props.onDelete}
                                variant="ghost"
                            >
                                Delete
                            </Button>
                        ) : null}
                        <Button disabled={busy} onClick={close} variant="ghost">
                            Cancel
                        </Button>
                        <Button
                            disabled={props.imageSaving || draft.name.trim() === ""}
                            loading={props.saving}
                            onClick={props.onSave}
                        >
                            {props.zone ? "Save" : "Create zone"}
                        </Button>
                    </>
                }
                leading={
                    <HappyAgentZoneMark
                        color={draft.color}
                        kind={draft.kind}
                        {...(props.zone?.imageUrl ? { imageUrl: props.zone.imageUrl } : {})}
                    />
                }
                onClose={busy ? undefined : close}
                size="medium"
                title={props.zone ? "Edit zone" : "New zone"}
            >
                <Box className="happy-agent-zones__form" data-happy-desktop-ui="zone-form">
                    {props.error ? (
                        <Banner tone="danger" title="Not saved">
                            {props.error}
                        </Banner>
                    ) : null}
                    <TextField
                        disabled={props.saving}
                        fullWidth
                        label="Name"
                        onSubmit={props.onSave}
                        onValueChange={props.onNameChange}
                        placeholder="Payments"
                        value={draft.name}
                    />
                    <TextField
                        disabled={props.saving}
                        fullWidth
                        label="Description"
                        multiline
                        onValueChange={props.onDescriptionChange}
                        placeholder="What agents in this zone work on"
                        rows={3}
                        value={draft.description}
                    />
                    <Box className="happy-agent-zones__field">
                        <span className="happy-agent-zones__field-label" id="happy-agent-zone-kind">
                            Kind
                        </span>
                        <Box
                            aria-labelledby="happy-agent-zone-kind"
                            className="happy-agent-zones__options"
                            role="radiogroup"
                        >
                            {KIND_ORDER.map((kind) => (
                                <HappyAgentZoneOption
                                    checked={draft.kind === kind}
                                    description={KINDS[kind].description}
                                    disabled={props.saving || props.zone?.kindLocked !== undefined}
                                    key={kind}
                                    label={KINDS[kind].label}
                                    onSelect={() => props.onKindChange(kind)}
                                />
                            ))}
                        </Box>
                        {props.zone?.kindLocked ? (
                            <span className="happy-agent-zones__note">{props.zone.kindLocked}</span>
                        ) : null}
                    </Box>
                    <Box className="happy-agent-zones__field">
                        <span className="happy-agent-zones__field-label" id="happy-agent-zone-join">
                            Who may join
                        </span>
                        <Box
                            aria-labelledby="happy-agent-zone-join"
                            className="happy-agent-zones__options"
                            role="radiogroup"
                        >
                            <HappyAgentZoneOption
                                checked={draft.members === null}
                                description={
                                    draft.kind === "critical"
                                        ? "A Critical zone always lists who may join."
                                        : "Every member of the team."
                                }
                                disabled={props.saving || draft.kind === "critical"}
                                label="Everyone"
                                onSelect={() => props.onEveryoneChange(true)}
                            />
                            <HappyAgentZoneOption
                                checked={draft.members !== null}
                                description="Only the members listed below. Owners and admins may join any zone."
                                disabled={props.saving}
                                label="Listed members"
                                onSelect={() => props.onEveryoneChange(false)}
                            />
                        </Box>
                        {draft.members === null ? null : (
                            <Box
                                className="happy-agent-zones__members"
                                data-happy-desktop-ui="zone-members"
                            >
                                {listed.length === 0 ? (
                                    <Box className="happy-agent-zones__none">
                                        Nobody listed yet: only owners and admins may join.
                                    </Box>
                                ) : (
                                    listed.map((id) => {
                                        const person = personOf(id);
                                        return (
                                            <Box className="happy-agent-zones__member" key={id}>
                                                <Avatar
                                                    initials={person.name.slice(0, 1).toUpperCase()}
                                                    placeholderSeed={person.id}
                                                    size="xs"
                                                    {...(person.imageUrl
                                                        ? { imageUrl: person.imageUrl }
                                                        : {})}
                                                />
                                                <span className="happy-agent-zones__member-name">
                                                    {person.name}
                                                </span>
                                                <Button
                                                    disabled={props.saving}
                                                    onClick={() => props.onMemberRemove(id)}
                                                    size="small"
                                                    variant="ghost"
                                                >
                                                    Remove
                                                </Button>
                                            </Box>
                                        );
                                    })
                                )}
                                {addable.length === 0 ? null : (
                                    <Select
                                        aria-label="Add a member"
                                        disabled={props.saving}
                                        fullWidth
                                        onValueChange={(id) => {
                                            if (id !== "") props.onMemberAdd(id);
                                        }}
                                        options={addable.map((person) => ({
                                            value: person.id,
                                            label: person.name,
                                        }))}
                                        placeholder="Add a member…"
                                        size="small"
                                        value=""
                                    />
                                )}
                            </Box>
                        )}
                    </Box>
                    <Select
                        disabled={props.saving}
                        fullWidth
                        hint="Shown as the zone's author. It grants nothing."
                        label="Owner"
                        onValueChange={(id) => props.onOwnerChange(id === NO_OWNER ? null : id)}
                        options={[
                            { value: NO_OWNER, label: "No owner" },
                            ...props.people.map((person) => ({
                                value: person.id,
                                label: person.name,
                            })),
                        ]}
                        value={draft.owner ?? NO_OWNER}
                    />
                    <Box className="happy-agent-zones__field">
                        <span className="happy-agent-zones__field-label">Picture</span>
                        {props.zone ? (
                            <Box className="happy-agent-zones__picture">
                                <HappyAgentZoneMark
                                    color={draft.color}
                                    kind={draft.kind}
                                    size="large"
                                    {...(props.zone.imageUrl
                                        ? { imageUrl: props.zone.imageUrl }
                                        : {})}
                                />
                                <Button
                                    disabled={props.saving}
                                    loading={props.imageSaving}
                                    onClick={(event) => {
                                        event.currentTarget.focus();
                                        imageInput.current?.click();
                                    }}
                                    size="small"
                                    variant="secondary"
                                >
                                    {props.zone.imageUrl ? "Replace picture" : "Upload picture"}
                                </Button>
                                {props.zone.imageUrl ? (
                                    <Button
                                        disabled={busy}
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
                            </Box>
                        ) : (
                            <span className="happy-agent-zones__note">
                                Add a picture once the zone is created. Until then it shows its
                                colour.
                            </span>
                        )}
                    </Box>
                    <Box className="happy-agent-zones__field">
                        <span
                            className="happy-agent-zones__field-label"
                            id="happy-agent-zone-color"
                        >
                            Colour
                        </span>
                        <Box
                            aria-labelledby="happy-agent-zone-color"
                            className="happy-agent-zones__swatches"
                            role="radiogroup"
                        >
                            {HAPPY_AGENT_ZONE_PALETTE.map((color) => (
                                <button
                                    aria-checked={draft.color === color}
                                    aria-label={COLOR_LABEL[color]}
                                    className="happy-agent-zones__swatch"
                                    data-color={color}
                                    disabled={props.saving}
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
                    </Box>
                </Box>
            </Modal>
        </ModalOverlay>
    );
}

export interface HappyAgentZoneDeleteDialogProps {
    readonly name: string;
    /**
     * Why the cluster will refuse, as far as this list can tell: agents in it,
     * or the team's only zone of its kind. The delete button is held back.
     */
    readonly blocked?: string;
    readonly deleting: boolean;
    /** The cluster's own words when it refused. */
    readonly error?: string;
    onDelete: () => void;
    onClose: () => void;
}

/** Confirms deleting a zone, which only an empty zone that isn't its kind's last may be. */
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
                            Default and one Critical zone.
                        </p>
                    ) : null}
                </Box>
            </Modal>
        </ModalOverlay>
    );
}
