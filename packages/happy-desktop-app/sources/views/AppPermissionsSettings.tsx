import type {
    HappyAgentBot,
    HappyAgentZone,
    HappyAgentZonePerson,
    HappyAgentZonesSnapshot,
    HappyAgentZonesStore,
} from "happy-desktop-state";
import {
    HappyAgentPermissionsSettings,
    HappyAgentZoneDeleteDialog,
    HappyAgentZonePage,
    type HappyAgentZoneBotRow,
    type HappyAgentZonePersonRow,
    type HappyAgentZoneRow,
} from "happy-desktop-ui";

/**
 * Settings › Permissions on Happy Cloud, composed from its zones store: the
 * list, or the page of the zone opened from it. The settings window's header
 * leads back to the list while a page is open; see `appPermissionsHeading`.
 */
export function AppPermissionsSettings(props: {
    readonly snapshot: HappyAgentZonesSnapshot;
    readonly store: HappyAgentZonesStore;
    /** The team's bots, as the app lists them, which a critical zone may let in. */
    readonly bots: readonly HappyAgentBot[];
}) {
    const { snapshot, store } = props;
    const teamBots = props.bots.map(botRow);
    const open = snapshot.open;
    const deletion = snapshot.deletion;
    const opened = open?.zoneId === undefined ? undefined : zoneOf(snapshot, open.zoneId);
    const deleting = deletion ? zoneOf(snapshot, deletion.zoneId) : undefined;
    const people = [...snapshot.people.values()]
        .map(personRow)
        .sort((left, right) => left.name.localeCompare(right.name));
    const blocked = deleting ? deleteBlockedText(snapshot, deleting) : undefined;
    const deleteDialog = deletion ? (
        <HappyAgentZoneDeleteDialog
            {...(deletion.error ? { error: deletion.error.message } : {})}
            {...(blocked === undefined ? {} : { blocked })}
            deleting={deletion.deleting}
            name={deletion.name}
            onClose={() => store.zoneDeleteClose()}
            onDelete={() => store.zoneDelete()}
        />
    ) : null;
    if (!open)
        return (
            <HappyAgentPermissionsSettings
                {...(snapshot.error ? { error: snapshot.error.message } : {})}
                loading={snapshot.loading}
                manage={snapshot.manage}
                onZoneCreate={() => store.zoneCreateOpen()}
                onZoneOpen={(zoneId) => store.zoneOpen(zoneId)}
                zones={snapshot.zones.map((zone) => zoneRow(snapshot, teamBots, zone))}
            />
        );
    const criticalLocked =
        opened?.critical === true && open.draft.critical && onlyCritical(snapshot, opened);
    const deleteBlocked = opened ? deleteBlockedText(snapshot, opened) : undefined;
    return (
        <>
            <HappyAgentZonePage
                {...(open.error ? { error: open.error.message } : {})}
                {...(opened
                    ? {
                          zone: {
                              agentCount: opened.agentCount,
                              isDefault: opened.isDefault,
                              ...(opened.image ? { imageUrl: opened.image.url } : {}),
                              ...(criticalLocked
                                  ? {
                                        criticalLocked:
                                            "This is your team's only critical zone, and a team always keeps one. Make another zone critical first.",
                                    }
                                  : {}),
                              ...(deleteBlocked === undefined ? {} : { deleteBlocked }),
                          },
                      }
                    : {})}
                draft={open.draft}
                edited={open.edited}
                imageSaving={open.imageSaving}
                manage={snapshot.manage}
                onBotAdd={(botId) => store.zoneBotAdd(botId)}
                onBotRemove={(botId) => store.zoneBotRemove(botId)}
                onColorChange={(color) => store.zoneColorUpdate(color)}
                onCriticalChange={(critical) => store.zoneCriticalUpdate(critical)}
                onDelete={() => {
                    if (open.zoneId !== undefined) store.zoneDeleteOpen(open.zoneId);
                }}
                onDescriptionChange={(value) => store.zoneDescriptionUpdate(value)}
                onDiscard={() => {
                    if (open.zoneId === undefined) store.zoneClose();
                    else store.zoneDraftReset();
                }}
                onEveryoneChange={(everyone) => store.zoneMembersEveryoneUpdate(everyone)}
                onImagePick={(file) => store.zoneImageUpload(file)}
                onImageRemove={() => store.zoneImageRemove()}
                onMemberAdd={(userId) => store.zoneMemberAdd(userId)}
                onMemberRemove={(userId) => store.zoneMemberRemove(userId)}
                onNameChange={(value) => store.zoneNameUpdate(value)}
                onOwnerChange={(userId) => store.zoneOwnerUpdate(userId)}
                onSave={() => store.zoneSave()}
                people={people}
                saving={open.saving}
                teamBots={teamBots}
            />
            {/* Deleting is confirmed over the page it was asked from. */}
            {deleteDialog}
        </>
    );
}

/**
 * The settings header while a zone's page is open: its name, what kind of
 * zone it is, and the way back to the list. Nothing while the list is shown.
 */
export function appPermissionsHeading(
    snapshot: HappyAgentZonesSnapshot,
    store: HappyAgentZonesStore,
):
    | { readonly title: string; readonly description: string; readonly onBack: () => void }
    | undefined {
    const open = snapshot.open;
    if (!open) return undefined;
    const zone = open.zoneId === undefined ? undefined : zoneOf(snapshot, open.zoneId);
    return {
        title: zone?.name ?? "New zone",
        description: !zone
            ? "A zone agents can join"
            : zone.isDefault
              ? "The default zone, open to every member"
              : zone.critical
                ? "A critical zone"
                : "A zone",
        onBack: () => store.zoneClose(),
    };
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

function botRow(bot: HappyAgentBot): HappyAgentZoneBotRow {
    return { id: bot.id, name: bot.name, ...(bot.avatar ? { imageUrl: bot.avatar.url } : {}) };
}

/** Someone the zone names who is no longer on the team. */
function formerRow(userId: string): HappyAgentZonePersonRow {
    return { id: userId, name: "A former member" };
}

function zoneRow(
    snapshot: HappyAgentZonesSnapshot,
    teamBots: readonly HappyAgentZoneBotRow[],
    zone: HappyAgentZone,
): HappyAgentZoneRow {
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
        ...(zone.critical
            ? {
                  bots: zone.bots.map(
                      (botId) =>
                          teamBots.find((bot) => bot.id === botId) ?? {
                              id: botId,
                              name: "A deleted bot",
                          },
                  ),
              }
            : {}),
        ...(zone.owner === null ? {} : { owner: named(zone.owner) }),
        agentCount: zone.agentCount,
    };
}
