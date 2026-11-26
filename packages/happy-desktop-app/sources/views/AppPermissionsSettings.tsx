import {
    happyAgentZonePolicyTargetKey,
    happyAgentZonePolicyTargetRead,
    type HappyAgentBot,
    type HappyAgentZone,
    type HappyAgentZoneInstallation,
    type HappyAgentZonePerson,
    type HappyAgentZonePlugin,
    type HappyAgentZonePolicyTarget,
    type HappyAgentZonesSnapshot,
    type HappyAgentZonesStore,
} from "happy-desktop-state";
import {
    HappyAgentPermissionsSettings,
    HappyAgentZoneDeleteDialog,
    HappyAgentZoneDetailsDialog,
    HappyAgentZonePage,
    HappyAgentZonePickDialog,
    HappyAgentZonePluginsSection,
    HappyAgentZonePoliciesSection,
    HappyAgentZonePolicyPage,
    type HappyAgentZoneBotRow,
    type HappyAgentZoneCandidateRow,
    type HappyAgentZonePersonRow,
    type HappyAgentZoneRow,
} from "happy-desktop-ui";

/**
 * Settings › Permissions on Happy Cloud, composed from its zones store: the
 * list, or the page of the zone opened from it, with the zone's details
 * modal, the modals that add members and bots, and the delete confirmation
 * over either. The settings window's header leads back to the list while a
 * page is open; see `appPermissionsHeading`.
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
    const details = snapshot.details;
    const deletion = snapshot.deletion;
    const opened = open ? zoneOf(snapshot, open.zoneId) : undefined;
    const described = details?.zoneId === undefined ? undefined : zoneOf(snapshot, details.zoneId);
    const deleting = deletion ? zoneOf(snapshot, deletion.zoneId) : undefined;
    const people = [...snapshot.people.values()]
        .map(personRow)
        .sort((left, right) => left.name.localeCompare(right.name));
    const blocked = deleting ? deleteBlockedText(snapshot, deleting) : undefined;
    const criticalLocked =
        described?.critical === true &&
        details?.draft.critical === true &&
        onlyCritical(snapshot, described);
    const deleteBlocked = described ? deleteBlockedText(snapshot, described) : undefined;
    const pick = open?.pick;
    const reach = open?.reach.kind === "ready" ? open.reach : undefined;
    const listed: readonly string[] = !opened
        ? []
        : pick?.kind === "bots"
          ? opened.bots
          : pick?.kind === "plugins"
            ? (reach?.plugins.map((plugin) => plugin.id) ?? [])
            : (opened.members ?? []);
    const candidates: readonly HappyAgentZoneCandidateRow[] = (
        pick?.kind === "bots"
            ? teamBots
            : pick?.kind === "plugins"
              ? (reach?.installations.map(installationRow) ?? [])
              : people
    ).filter((candidate) => !listed.includes(candidate.id));
    const policy = open?.policy;
    const plugins = reach?.plugins ?? [];
    return (
        <>
            {opened && policy ? (
                <HappyAgentZonePolicyPage
                    {...(policy.error ? { error: policy.error.message } : {})}
                    {...(policy.testError ? { testError: policy.testError.message } : {})}
                    {...(policy.test
                        ? {
                              test: {
                                  verdict: policy.test.verdict,
                                  ...(policy.test.message === null
                                      ? {}
                                      : { message: policy.test.message }),
                                  diagnostics: policy.test.diagnostics,
                                  output: policy.test.output,
                                  ...(policy.test.traceback === null
                                      ? {}
                                      : { traceback: policy.test.traceback }),
                                  durationMs: policy.test.durationMs,
                              },
                          }
                        : {})}
                    clock={policy.clock}
                    clockPinned={policy.clockPinned}
                    code={policy.code}
                    deleting={policy.deleting}
                    description={policy.description}
                    diagnostics={policy.diagnostics}
                    edited={policy.edited}
                    enabled={policy.enabled}
                    manage={snapshot.manage}
                    onClockChange={(value) => store.zonePolicyClockUpdate(value)}
                    onClockPinnedChange={(pinned) => store.zonePolicyClockPinnedUpdate(pinned)}
                    onCodeChange={(value) => store.zonePolicyCodeUpdate(value)}
                    onDelete={() => store.zonePolicyDelete()}
                    onDescriptionChange={(value) => store.zonePolicyDescriptionUpdate(value)}
                    onDiscard={() => store.zonePolicyClose()}
                    onEnabledChange={(enabled) => store.zonePolicyEnabledUpdate(enabled)}
                    onSampleChange={(value) => store.zonePolicySampleUpdate(value)}
                    onSave={() => store.zonePolicySave()}
                    onTargetChange={(key) => {
                        const target = happyAgentZonePolicyTargetRead(key);
                        if (target) store.zonePolicyTargetUpdate(target);
                    }}
                    onTest={() => store.zonePolicyTest()}
                    sample={policy.sample}
                    saved={policy.policyId !== undefined}
                    saving={policy.saving}
                    target={happyAgentZonePolicyTargetKey(policy.target)}
                    targetKind={policy.target.kind}
                    targets={plugins
                        .flatMap((plugin) => [
                            { kind: "plugin" as const, installationId: plugin.id },
                            ...plugin.tools.map((tool) => ({
                                kind: "tool" as const,
                                installationId: plugin.id,
                                tool: tool.name,
                            })),
                        ])
                        .map((target) => ({
                            value: happyAgentZonePolicyTargetKey(target),
                            label: targetLabel(plugins, target),
                        }))}
                    testing={policy.testing}
                />
            ) : opened ? (
                <HappyAgentZonePage
                    {...(open?.error ? { error: open.error.message } : {})}
                    {...(open?.removing === undefined ? {} : { removing: open.removing })}
                    manage={snapshot.manage}
                    onBotRemove={(botId) => store.zoneBotRemove(botId)}
                    onBotsAdd={() => store.zoneBotsPickOpen()}
                    onDetailsOpen={() => store.zoneDetailsOpen()}
                    onMemberRemove={(userId) => store.zoneMemberRemove(userId)}
                    onMembersAdd={() => store.zoneMembersPickOpen()}
                    zone={zoneRow(snapshot, teamBots, opened)}
                >
                    {/* A server from before phase 2 lists no installations, and gets neither. */}
                    {reach ? (
                        <>
                            <HappyAgentZonePluginsSection
                                {...(open?.removing === undefined
                                    ? {}
                                    : { removing: open.removing })}
                                expanded={open?.expanded ?? []}
                                manage={snapshot.manage}
                                onAdd={() => store.zonePluginsPickOpen()}
                                onRemove={(installationId) =>
                                    store.zonePluginRemove(installationId)
                                }
                                onToggle={(installationId) =>
                                    store.zonePluginToggle(installationId)
                                }
                                plugins={reach.plugins.map((plugin) => ({
                                    id: plugin.id,
                                    name: plugin.name,
                                    ...(plugin.label === null ? {} : { label: plugin.label }),
                                    ...(plugin.image ? { imageUrl: plugin.image.url } : {}),
                                    policyCount: plugin.policyCount,
                                    tools: plugin.tools,
                                }))}
                            />
                            <HappyAgentZonePoliciesSection
                                canAdd={reach.plugins.length > 0}
                                manage={snapshot.manage}
                                onAdd={() => store.zonePolicyCreateOpen()}
                                onOpen={(policyId) => store.zonePolicyOpen(policyId)}
                                policies={reach.policies.map((entry) => ({
                                    id: entry.id,
                                    description: entry.description,
                                    targetLabel: targetLabel(reach.plugins, entry.target),
                                    enabled: entry.enabled,
                                }))}
                            />
                        </>
                    ) : null}
                </HappyAgentZonePage>
            ) : (
                <HappyAgentPermissionsSettings
                    {...(snapshot.error ? { error: snapshot.error.message } : {})}
                    loading={snapshot.loading}
                    manage={snapshot.manage}
                    onZoneCreate={() => store.zoneCreateOpen()}
                    onZoneOpen={(zoneId) => store.zoneOpen(zoneId)}
                    zones={snapshot.zones.map((zone) => zoneRow(snapshot, teamBots, zone))}
                />
            )}
            {details ? (
                <HappyAgentZoneDetailsDialog
                    {...(details.error ? { error: details.error.message } : {})}
                    {...(described
                        ? {
                              zone: {
                                  isDefault: described.isDefault,
                                  ...(described.image ? { imageUrl: described.image.url } : {}),
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
                    draft={details.draft}
                    edited={details.edited}
                    imageSaving={details.imageSaving}
                    manage={snapshot.manage}
                    onClose={() => store.zoneDetailsClose()}
                    onColorChange={(color) => store.zoneColorUpdate(color)}
                    onCriticalChange={(critical) => store.zoneCriticalUpdate(critical)}
                    onDelete={() => store.zoneDeleteOpen()}
                    onDescriptionChange={(value) => store.zoneDescriptionUpdate(value)}
                    onEveryoneChange={(everyone) => store.zoneEveryoneUpdate(everyone)}
                    onImagePick={(file) => store.zoneImageUpload(file)}
                    onImageRemove={() => store.zoneImageRemove()}
                    onNameChange={(value) => store.zoneNameUpdate(value)}
                    onOwnerChange={(userId) => store.zoneOwnerUpdate(userId)}
                    onSave={() => store.zoneDetailsSave()}
                    people={people}
                    saving={details.saving}
                />
            ) : null}
            {pick ? (
                <HappyAgentZonePickDialog
                    {...(pick.error ? { error: pick.error.message } : {})}
                    candidates={candidates}
                    kind={pick.kind}
                    onAdd={() => store.zonePickAdd()}
                    onClose={() => store.zonePickClose()}
                    onQueryChange={(value) => store.zonePickQueryUpdate(value)}
                    onToggle={(id) => store.zonePickToggle(id)}
                    query={pick.query}
                    saving={pick.saving}
                    selected={pick.selected}
                />
            ) : null}
            {deletion ? (
                <HappyAgentZoneDeleteDialog
                    {...(deletion.error ? { error: deletion.error.message } : {})}
                    {...(blocked === undefined ? {} : { blocked })}
                    deleting={deletion.deleting}
                    name={deletion.name}
                    onClose={() => store.zoneDeleteClose()}
                    onDelete={() => store.zoneDelete()}
                />
            ) : null}
        </>
    );
}

/**
 * The settings header while a zone's page is open: the way back to the list,
 * under the section's own name, since the page's header names the zone.
 * Nothing while the list is shown.
 */
export function appPermissionsHeading(
    snapshot: HappyAgentZonesSnapshot,
    store: HappyAgentZonesStore,
):
    | { readonly title: string; readonly description: string; readonly onBack: () => void }
    | undefined {
    const open = snapshot.open;
    if (!open || !zoneOf(snapshot, open.zoneId)) return undefined;
    const policy = open.policy;
    if (policy)
        return {
            title: policy.policyId === undefined ? "New policy" : "Policy",
            description: targetLabel(
                open.reach.kind === "ready" ? open.reach.plugins : [],
                policy.target,
            ),
            onBack: () => store.zonePolicyClose(),
        };
    return {
        title: "Permissions",
        description: "A zone, and who may join it",
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
        ...(person.role === null ? {} : { role: person.role }),
    };
}

/** "Stripe · create_refund", or "Stripe · every tool" for a policy on the whole installation. */
function targetLabel(
    plugins: readonly HappyAgentZonePlugin[],
    target: HappyAgentZonePolicyTarget,
): string {
    const plugin = plugins.find((entry) => entry.id === target.installationId);
    const name = plugin ? pluginName(plugin) : "A removed plugin";
    return `${name} · ${target.kind === "plugin" ? "every tool" : target.tool}`;
}

function pluginName(installation: HappyAgentZoneInstallation): string {
    return installation.label ? `${installation.name} · ${installation.label}` : installation.name;
}

function installationRow(installation: HappyAgentZoneInstallation): HappyAgentZoneCandidateRow {
    return {
        id: installation.id,
        name: pluginName(installation),
        ...(installation.image ? { imageUrl: installation.image.url } : {}),
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
