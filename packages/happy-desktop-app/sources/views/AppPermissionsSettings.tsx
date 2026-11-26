import type {
    HappyAgentZone,
    HappyAgentZonePerson,
    HappyAgentZonesSnapshot,
    HappyAgentZonesStore,
} from "happy-desktop-state";
import {
    HappyAgentPermissionsSettings,
    HappyAgentZoneDeleteDialog,
    HappyAgentZoneDialog,
    type HappyAgentZonePersonRow,
    type HappyAgentZoneRow,
} from "happy-desktop-ui";

/** Settings › Permissions on Happy Cloud, composed from its zones store. */
export function AppPermissionsSettings(props: {
    readonly snapshot: HappyAgentZonesSnapshot;
    readonly store: HappyAgentZonesStore;
}) {
    const { snapshot, store } = props;
    const editor = snapshot.editor;
    const deletion = snapshot.deletion;
    const editing = editor?.zoneId === undefined ? undefined : zoneOf(snapshot, editor.zoneId);
    const deleting = deletion ? zoneOf(snapshot, deletion.zoneId) : undefined;
    const people = [...snapshot.people.values()]
        .map(personRow)
        .sort((left, right) => left.name.localeCompare(right.name));
    const kindLocked = editing ? onlyOfKind(snapshot, editing) : false;
    const deleteBlocked = deleting ? deleteBlockedText(snapshot, deleting) : undefined;
    return (
        <>
            <HappyAgentPermissionsSettings
                {...(snapshot.error ? { error: snapshot.error.message } : {})}
                loading={snapshot.loading}
                manage={snapshot.manage}
                onZoneCreate={() => store.zoneCreateOpen()}
                onZoneEdit={(zoneId) => store.zoneEditOpen(zoneId)}
                zones={snapshot.zones.map((zone) => zoneRow(snapshot, zone))}
            />
            {/* The confirmation takes the zone's own dialog's place while it is up. */}
            {deletion ? (
                <HappyAgentZoneDeleteDialog
                    {...(deletion.error ? { error: deletion.error.message } : {})}
                    {...(deleteBlocked === undefined ? {} : { blocked: deleteBlocked })}
                    deleting={deletion.deleting}
                    name={deletion.name}
                    onClose={() => store.zoneDeleteClose()}
                    onDelete={() => store.zoneDelete()}
                />
            ) : editor ? (
                <HappyAgentZoneDialog
                    {...(editor.error ? { error: editor.error.message } : {})}
                    {...(editing
                        ? {
                              zone: {
                                  agentCount: editing.agentCount,
                                  ...(editing.image ? { imageUrl: editing.image.url } : {}),
                                  ...(kindLocked
                                      ? {
                                            kindLocked: `This is your team's only ${KIND_NAME[editing.kind]} zone. Add another before changing its kind.`,
                                        }
                                      : {}),
                              },
                          }
                        : {})}
                    draft={editor.draft}
                    imageSaving={editor.imageSaving}
                    onClose={() => store.zoneEditorClose()}
                    onColorChange={(color) => store.zoneColorUpdate(color)}
                    onDelete={() => {
                        if (editor.zoneId !== undefined) store.zoneDeleteOpen(editor.zoneId);
                    }}
                    onDescriptionChange={(value) => store.zoneDescriptionUpdate(value)}
                    onEveryoneChange={(everyone) => store.zoneMembersEveryoneUpdate(everyone)}
                    onImagePick={(file) => store.zoneImageUpload(file)}
                    onImageRemove={() => store.zoneImageRemove()}
                    onKindChange={(kind) => store.zoneKindUpdate(kind)}
                    onMemberAdd={(userId) => store.zoneMemberAdd(userId)}
                    onMemberRemove={(userId) => store.zoneMemberRemove(userId)}
                    onNameChange={(value) => store.zoneNameUpdate(value)}
                    onOwnerChange={(userId) => store.zoneOwnerUpdate(userId)}
                    onSave={() => store.zoneSave()}
                    people={people}
                    saving={editor.saving}
                />
            ) : null}
        </>
    );
}

const KIND_NAME = { default: "Default", critical: "Critical" } as const;

function zoneOf(snapshot: HappyAgentZonesSnapshot, zoneId: string): HappyAgentZone | undefined {
    return snapshot.zones.find((zone) => zone.id === zoneId);
}

/** Whether the cluster would refuse to leave the team without a zone of this one's kind. */
function onlyOfKind(snapshot: HappyAgentZonesSnapshot, zone: HappyAgentZone): boolean {
    return !snapshot.zones.some((other) => other.id !== zone.id && other.kind === zone.kind);
}

/** Why the cluster will refuse the deletion, as far as the list can tell. */
function deleteBlockedText(
    snapshot: HappyAgentZonesSnapshot,
    zone: HappyAgentZone,
): string | undefined {
    if (zone.agentCount > 0)
        return `${String(zone.agentCount)} ${zone.agentCount === 1 ? "agent is" : "agents are"} in it, and agents never leave a zone. Only an empty zone can be deleted.`;
    if (onlyOfKind(snapshot, zone))
        return `It's your team's only ${KIND_NAME[zone.kind]} zone, and a team always keeps one.`;
    return undefined;
}

function personRow(person: HappyAgentZonePerson): HappyAgentZonePersonRow {
    return {
        id: person.userId,
        name: person.name ?? "A member without a name",
        ...(person.photo ? { imageUrl: person.photo.url } : {}),
    };
}

/** Someone the zone names who is no longer on the team. */
function formerRow(userId: string): HappyAgentZonePersonRow {
    return { id: userId, name: "A former member" };
}

function zoneRow(snapshot: HappyAgentZonesSnapshot, zone: HappyAgentZone): HappyAgentZoneRow {
    const named = (userId: string): HappyAgentZonePersonRow => {
        const person = snapshot.people.get(userId);
        return person ? personRow(person) : formerRow(userId);
    };
    return {
        id: zone.id,
        name: zone.name,
        description: zone.description,
        kind: zone.kind,
        color: zone.color,
        ...(zone.image ? { imageUrl: zone.image.url } : {}),
        members: zone.members === null ? "everyone" : zone.members.map(named),
        ...(zone.owner === null ? {} : { owner: named(zone.owner) }),
        agentCount: zone.agentCount,
    };
}
