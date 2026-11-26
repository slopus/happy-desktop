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
    const criticalLocked = editing?.critical === true && onlyCritical(snapshot, editing);
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
                                  isDefault: editing.isDefault,
                                  ...(editing.image ? { imageUrl: editing.image.url } : {}),
                                  ...(criticalLocked
                                      ? {
                                            criticalLocked:
                                                "This is your team's only critical zone, and a team always keeps one. Make another zone critical first.",
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
                    onCriticalChange={(critical) => store.zoneCriticalUpdate(critical)}
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

function zoneOf(snapshot: HappyAgentZonesSnapshot, zoneId: string): HappyAgentZone | undefined {
    return snapshot.zones.find((zone) => zone.id === zoneId);
}

/** Whether the cluster would refuse to leave the team without a critical zone. */
function onlyCritical(snapshot: HappyAgentZonesSnapshot, zone: HappyAgentZone): boolean {
    return !snapshot.zones.some((other) => other.id !== zone.id && other.critical);
}

/** Why the cluster will refuse the deletion, as far as the list can tell. */
function deleteBlockedText(
    snapshot: HappyAgentZonesSnapshot,
    zone: HappyAgentZone,
): string | undefined {
    if (zone.agentCount > 0)
        return `${String(zone.agentCount)} ${zone.agentCount === 1 ? "agent is" : "agents are"} in it, and agents never leave a zone. Only an empty zone can be deleted.`;
    if (zone.critical && onlyCritical(snapshot, zone))
        return "It's your team's only critical zone, and a team always keeps one.";
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
        isDefault: zone.isDefault,
        critical: zone.critical,
        color: zone.color,
        ...(zone.image ? { imageUrl: zone.image.url } : {}),
        // The default zone is open to every member by definition.
        members: zone.isDefault || zone.members === null ? "everyone" : zone.members.map(named),
        ...(zone.owner === null ? {} : { owner: named(zone.owner) }),
        agentCount: zone.agentCount,
    };
}
