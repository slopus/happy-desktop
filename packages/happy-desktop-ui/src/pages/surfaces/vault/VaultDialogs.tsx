import { useState } from "react";
import {
    happyAgentVaultNameShown,
    happyAgentVaultNameProblem,
    happyAgentVaultRetentionEqual,
    happyAgentVaultRetentionPreset,
    happyAgentVaultRetentionPresetApply,
    happyAgentVaultRetentionProblem,
    type HappyAgentVaultItem,
    type HappyAgentVaultItemId,
    type HappyAgentVaultRetention,
    type HappyAgentVaultRetentionPreset,
    type HappyAgentVaultSettings,
} from "happy-desktop-state";
import { Banner } from "../../../Banner";
import { Button } from "../../../Button";
import { Ionicon } from "../../../vectorIcons/VectorIcon";
import { Modal } from "../../../Modal";
import { ModalOverlay } from "../../../ModalOverlay";
import { Select } from "../../../Select";
import { Switch } from "../../../Switch";
import { TextField } from "../../../TextField";

/**
 * A name asked for once: a new folder's, or an entry's new one. The vault's
 * name rules are checked as it is typed, so an artifact keeps its
 * `.artifact` and nothing else takes it.
 */
export function VaultNameDialog(props: {
    title: string;
    action: string;
    initialName: string;
    kind: HappyAgentVaultItem["kind"];
    /** One line under the field about what is being made. */
    note?: string;
    onSubmit: (name: string) => void;
    onClose: () => void;
}) {
    const [name, setName] = useState(props.initialName);
    const clean = name.trim();
    const problem = clean === "" ? undefined : happyAgentVaultNameProblem(clean, props.kind);
    const ready = clean.length > 0 && clean !== props.initialName && problem === undefined;
    const submit = () => {
        if (ready) props.onSubmit(name.trim());
    };
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                data-testid="happy-vault-name-dialog"
                footer={
                    <>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button disabled={!ready} onClick={submit} variant="primary">
                            {props.action}
                        </Button>
                    </>
                }
                onClose={props.onClose}
                size="small"
                title={props.title}
            >
                <div className="happy-vault-dialog">
                    <TextField
                        autoFocus
                        fullWidth
                        label="Name"
                        {...(problem === undefined ? {} : { error: problem })}
                        onSubmit={submit}
                        onValueChange={setName}
                        value={name}
                    />
                    {props.note ? <p className="happy-vault-dialog__note">{props.note}</p> : null}
                </div>
            </Modal>
        </ModalOverlay>
    );
}

/** One folder the picker offers, at its depth under the root. */
interface MoveTarget {
    readonly id: HappyAgentVaultItemId | null;
    readonly name: string;
    readonly depth: number;
}

/**
 * Every folder an item could move into, in the order the vault shows them:
 * the root, then each folder above its own folders. The item itself and,
 * for a folder, everything inside it are left out, since nothing goes inside
 * itself.
 */
function moveTargets(
    rootName: string,
    item: HappyAgentVaultItem,
    children: ReadonlyMap<HappyAgentVaultItemId | null, readonly HappyAgentVaultItem[]>,
): MoveTarget[] {
    const targets: MoveTarget[] = [{ id: null, name: rootName, depth: 0 }];
    const visit = (parentId: HappyAgentVaultItemId | null, depth: number): void => {
        for (const child of children.get(parentId) ?? []) {
            if (child.kind !== "folder" || child.id === item.id) continue;
            targets.push({ id: child.id, name: happyAgentVaultNameShown(child.name), depth });
            visit(child.id, depth + 1);
        }
    };
    visit(null, 1);
    return targets;
}

/**
 * Where an item goes, picked from the vault's folders, so moving never
 * depends on dragging. The folder it is in now is shown but cannot be picked.
 */
export function VaultMoveDialog(props: {
    item: HappyAgentVaultItem;
    rootName: string;
    /** The vault's live items by the folder holding them, each folder's in the order it lists them. */
    folders: ReadonlyMap<HappyAgentVaultItemId | null, readonly HappyAgentVaultItem[]>;
    onSubmit: (folderId: HappyAgentVaultItemId | null) => void;
    onClose: () => void;
}) {
    const [picked, setPicked] = useState<{ readonly id: HappyAgentVaultItemId | null }>();
    const targets = moveTargets(props.rootName, props.item, props.folders);
    const ready = picked !== undefined && picked.id !== props.item.parentId;
    const submit = () => {
        if (ready) props.onSubmit(picked.id);
    };
    return (
        <ModalOverlay onDismiss={props.onClose}>
            <Modal
                data-testid="happy-vault-move-dialog"
                footer={
                    <>
                        <Button onClick={props.onClose} variant="ghost">
                            Cancel
                        </Button>
                        <Button disabled={!ready} onClick={submit} variant="primary">
                            Move
                        </Button>
                    </>
                }
                onClose={props.onClose}
                size="small"
                title={`Move “${happyAgentVaultNameShown(props.item.name)}”`}
            >
                <div aria-label="Folders" className="happy-vault-move" role="listbox">
                    {targets.map((target) => {
                        const here = target.id === props.item.parentId;
                        const selected = picked !== undefined && picked.id === target.id;
                        return (
                            <button
                                aria-disabled={here}
                                aria-selected={selected}
                                className="happy-vault-move__row"
                                data-selected={selected ? "" : undefined}
                                key={target.id ?? ""}
                                onClick={() => {
                                    if (!here) setPicked({ id: target.id });
                                }}
                                onDoubleClick={() => {
                                    if (!here) props.onSubmit(target.id);
                                }}
                                role="option"
                                style={{ paddingLeft: `${String(10 + target.depth * 18)}px` }}
                                type="button"
                            >
                                <Ionicon
                                    className="happy-vault-move__glyph"
                                    name={target.id === null ? "file-tray-stacked" : "folder-sharp"}
                                    size={16}
                                />
                                <span className="happy-vault-move__name">{target.name}</span>
                                {here ? (
                                    <span className="happy-vault-move__note">Current folder</span>
                                ) : null}
                            </button>
                        );
                    })}
                </div>
            </Modal>
        </ModalOverlay>
    );
}

const PRESETS: readonly {
    readonly value: HappyAgentVaultRetentionPreset;
    readonly label: string;
    readonly description: string;
    readonly default?: true;
}[] = [
    {
        value: "timeMachine",
        label: "Time Machine",
        description: "Every version for a day, then daily for a month, then weekly",
        default: true,
    },
    { value: "everything", label: "Keep everything", description: "Never remove old versions" },
    {
        value: "lastTen",
        label: "Last 10 versions",
        description: "Keep the 10 newest versions of each file",
    },
    { value: "custom", label: "Custom", description: "Set the rules yourself" },
];

const TRASH_DAYS = [7, 14, 30, 60, 90, 180, 365];

/** A whole number typed into a field, or `NaN` while it is empty or not a number. */
function numberRead(value: string): number {
    return value.trim() === "" ? Number.NaN : Number(value);
}

function numberText(value: number): string {
    return Number.isNaN(value) ? "" : String(value);
}

/** A small number field set into a sentence. */
function DaysField(props: { label: string; value: number; onChange: (value: number) => void }) {
    return (
        <TextField
            aria-label={props.label}
            className="happy-vault-settings__number"
            onValueChange={(value) => props.onChange(numberRead(value))}
            size="small"
            value={numberText(props.value)}
        />
    );
}

/**
 * The vault's settings: which earlier versions it keeps, and how long the
 * Trash holds what is deleted. A named policy is one choice; Custom opens the
 * rules themselves. What is typed is the dialog's own until it is saved.
 */
export function VaultSettingsDialog(props: {
    settings: HappyAgentVaultSettings;
    onSave: (retention: HappyAgentVaultRetention) => void;
    onClose: () => void;
}) {
    const settings = props.settings;
    return (
        <ModalOverlay onDismiss={props.onClose}>
            {settings.status === "ready" ? (
                <VaultSettingsForm
                    onClose={props.onClose}
                    onSave={props.onSave}
                    retention={settings.retention}
                />
            ) : (
                <Modal
                    data-testid="happy-vault-settings"
                    footer={
                        <Button onClick={props.onClose} variant="ghost">
                            Close
                        </Button>
                    }
                    icon="settings"
                    onClose={props.onClose}
                    size="medium"
                    title="Vault settings"
                >
                    <div className="happy-vault-dialog">
                        {settings.status === "loading" ? (
                            <p className="happy-vault-settings__note">Reading the settings…</p>
                        ) : (
                            <Banner
                                icon="alert"
                                title="The settings could not be read"
                                tone="warning"
                            >
                                {settings.error.message}
                            </Banner>
                        )}
                    </div>
                </Modal>
            )}
        </ModalOverlay>
    );
}

function VaultSettingsForm(props: {
    retention: HappyAgentVaultRetention;
    onSave: (retention: HappyAgentVaultRetention) => void;
    onClose: () => void;
}) {
    const [draft, setDraft] = useState(props.retention);
    const [custom, setCustom] = useState(
        () => happyAgentVaultRetentionPreset(props.retention) === "custom",
    );
    const preset = custom ? "custom" : happyAgentVaultRetentionPreset(draft);
    const problem = happyAgentVaultRetentionProblem(draft);
    const changed = !happyAgentVaultRetentionEqual(draft, props.retention);
    const update = (change: Partial<HappyAgentVaultRetention>) => setDraft({ ...draft, ...change });
    const trashOptions = [
        ...TRASH_DAYS.map((days) => ({ value: String(days), label: `${String(days)} days` })),
        ...(draft.trashDays !== null && !TRASH_DAYS.includes(draft.trashDays)
            ? [{ value: String(draft.trashDays), label: `${String(draft.trashDays)} days` }]
            : []),
        { value: "forever", label: "Forever" },
    ];
    return (
        <Modal
            data-testid="happy-vault-settings"
            footer={
                <>
                    <Button onClick={props.onClose} variant="ghost">
                        Cancel
                    </Button>
                    <Button
                        disabled={!changed || problem !== undefined}
                        onClick={() => props.onSave(draft)}
                        variant="primary"
                    >
                        Save
                    </Button>
                </>
            }
            icon="settings"
            onClose={props.onClose}
            size="medium"
            title="Vault settings"
        >
            <div className="happy-vault-dialog happy-vault-settings">
                <section className="happy-vault-settings__section">
                    <h3 className="happy-vault-settings__heading">Earlier versions</h3>
                    <div
                        aria-label="Which earlier versions the vault keeps"
                        className="happy-vault-settings__presets"
                        role="radiogroup"
                    >
                        {PRESETS.map((option) => (
                            <button
                                aria-checked={preset === option.value}
                                className="happy-vault-settings__preset"
                                data-happy-desktop-ui="vault-settings-preset"
                                key={option.value}
                                onClick={() => {
                                    if (option.value === "custom") {
                                        setCustom(true);
                                        return;
                                    }
                                    setCustom(false);
                                    setDraft(
                                        happyAgentVaultRetentionPresetApply(draft, option.value),
                                    );
                                }}
                                role="radio"
                                type="button"
                            >
                                <span aria-hidden="true" className="happy-vault-settings__radio" />
                                <span className="happy-vault-settings__preset-text">
                                    <span className="happy-vault-settings__preset-line">
                                        <span className="happy-vault-settings__preset-label">
                                            {option.label}
                                        </span>
                                        {option.default ? (
                                            <span className="happy-vault-tag">Default</span>
                                        ) : null}
                                    </span>
                                    <span className="happy-vault-settings__preset-description">
                                        {option.description}
                                    </span>
                                </span>
                            </button>
                        ))}
                    </div>
                    <p className="happy-vault-settings__note">Pinned versions are always kept.</p>
                    {custom ? (
                        <div
                            className="happy-vault-settings__custom"
                            data-happy-desktop-ui="vault-settings-custom"
                        >
                            <div className="happy-vault-settings__sentence">
                                <span>Keep every version for</span>
                                <DaysField
                                    label="Days every version is kept"
                                    onChange={(keepAllDays) => update({ keepAllDays })}
                                    value={draft.keepAllDays}
                                />
                                <span>days</span>
                            </div>
                            {draft.thinning.map((tier, index) => (
                                <div
                                    className="happy-vault-settings__sentence"
                                    // A step has no identity but its place in the list.
                                    key={index}
                                >
                                    <span>After</span>
                                    <DaysField
                                        label={`Days before step ${String(index + 1)} starts`}
                                        onChange={(afterDays) =>
                                            update({
                                                thinning: draft.thinning.map((item, at) =>
                                                    at === index ? { ...item, afterDays } : item,
                                                ),
                                            })
                                        }
                                        value={tier.afterDays}
                                    />
                                    <span>days, keep one every</span>
                                    <DaysField
                                        label={`Days between versions kept in step ${String(index + 1)}`}
                                        onChange={(everyDays) =>
                                            update({
                                                thinning: draft.thinning.map((item, at) =>
                                                    at === index ? { ...item, everyDays } : item,
                                                ),
                                            })
                                        }
                                        value={tier.everyDays}
                                    />
                                    <span>days</span>
                                    <Button
                                        aria-label={`Remove step ${String(index + 1)}`}
                                        icon="close"
                                        iconOnly
                                        onClick={() =>
                                            update({
                                                thinning: draft.thinning.filter(
                                                    (_, at) => at !== index,
                                                ),
                                            })
                                        }
                                        size="small"
                                        variant="ghost"
                                    />
                                </div>
                            ))}
                            {draft.thinning.length < 8 ? (
                                <div className="happy-vault-settings__sentence">
                                    <Button
                                        icon="plus"
                                        onClick={() => {
                                            const last = draft.thinning.at(-1);
                                            const after = Math.max(
                                                draft.keepAllDays,
                                                (last?.afterDays ?? 0) + 1,
                                            );
                                            update({
                                                thinning: [
                                                    ...draft.thinning,
                                                    {
                                                        afterDays: Number.isNaN(after) ? 7 : after,
                                                        everyDays: 7,
                                                    },
                                                ],
                                            });
                                        }}
                                        size="small"
                                        variant="ghost"
                                    >
                                        Add a step
                                    </Button>
                                </div>
                            ) : null}
                            <div className="happy-vault-settings__sentence">
                                <Switch
                                    checked={draft.maxVersions !== null}
                                    label="Keep at most"
                                    onChange={(on) => update({ maxVersions: on ? 100 : null })}
                                    size="small"
                                />
                                {draft.maxVersions === null ? null : (
                                    <>
                                        <DaysField
                                            label="Versions kept at most"
                                            onChange={(maxVersions) => update({ maxVersions })}
                                            value={draft.maxVersions}
                                        />
                                        <span>versions of each file</span>
                                    </>
                                )}
                            </div>
                            <div className="happy-vault-settings__sentence">
                                <Switch
                                    checked={draft.maxAgeDays !== null}
                                    label="Drop versions older than"
                                    onChange={(on) => update({ maxAgeDays: on ? 365 : null })}
                                    size="small"
                                />
                                {draft.maxAgeDays === null ? null : (
                                    <>
                                        <DaysField
                                            label="Days after which versions are dropped"
                                            onChange={(maxAgeDays) => update({ maxAgeDays })}
                                            value={draft.maxAgeDays}
                                        />
                                        <span>days</span>
                                    </>
                                )}
                            </div>
                        </div>
                    ) : null}
                </section>
                <section className="happy-vault-settings__section">
                    <h3 className="happy-vault-settings__heading">Trash</h3>
                    <div className="happy-vault-settings__sentence">
                        <span>Keep deleted items for</span>
                        <Select
                            aria-label="How long the Trash keeps deleted items"
                            onValueChange={(value) =>
                                update({ trashDays: value === "forever" ? null : Number(value) })
                            }
                            options={trashOptions}
                            size="small"
                            value={draft.trashDays === null ? "forever" : String(draft.trashDays)}
                            width={128}
                        />
                    </div>
                </section>
                {problem === undefined ? null : (
                    <p className="happy-vault-settings__problem" role="alert">
                        {problem}
                    </p>
                )}
            </div>
        </Modal>
    );
}
