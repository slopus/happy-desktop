import { Avatar } from "../../Avatar";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { Button } from "../../Button";
import { CodeEditor } from "../../CodeEditor";
import { FormRow } from "../../FormRow";
import { Icon } from "../../Icon";
import { Select } from "../../Select";
import { Spinner } from "../../Spinner";
import { Switch } from "../../Switch";
import { TextField } from "../../TextField";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

/** One tool of an installation a zone lists. */
export interface HappyAgentZoneToolRow {
    readonly name: string;
    readonly description: string;
    /** Runs only in a critical zone. */
    readonly critical: boolean;
    /** Policies this zone has on this one tool. */
    readonly policyCount: number;
}

/** A plugin installation a zone lists, with its tools. */
export interface HappyAgentZonePluginRow {
    readonly id: string;
    /** The plugin's name, and the installation's label where it has one. */
    readonly name: string;
    readonly label?: string;
    readonly imageUrl?: string;
    /** Policies this zone has on the whole installation. */
    readonly policyCount: number;
    readonly tools: readonly HappyAgentZoneToolRow[];
}

function countText(count: number, one: string, many: string): string {
    return `${String(count)} ${count === 1 ? one : many}`;
}

function policiesText(count: number): string {
    return count === 0 ? "No policies" : countText(count, "policy", "policies");
}

function pluginMeta(plugin: HappyAgentZonePluginRow): string {
    const critical = plugin.tools.filter((tool) => tool.critical).length;
    return [
        countText(plugin.tools.length, "tool", "tools"),
        ...(critical > 0 ? [`${String(critical)} critical`] : []),
        ...(plugin.policyCount > 0
            ? [`${countText(plugin.policyCount, "policy", "policies")} on every tool`]
            : []),
    ].join(" · ");
}

export interface HappyAgentZonePluginsSectionProps {
    readonly plugins: readonly HappyAgentZonePluginRow[];
    /** The installations whose tools are shown. */
    readonly expanded: readonly string[];
    readonly manage: boolean;
    /** The installation whose removal is on its way. */
    readonly removing?: string;
    onAdd: () => void;
    onRemove: (installationId: string) => void;
    onToggle: (installationId: string) => void;
}

/**
 * The plugin installations a zone lists: only their tools reach agents in
 * it, and a critical tool only in a critical zone. Each expands to its tools,
 * with each one's critical badge and how many policies it has here.
 */
export function HappyAgentZonePluginsSection(props: HappyAgentZonePluginsSectionProps) {
    return (
        <>
            <HappyAgentSettingsSection
                description="Agents in this zone get the tools of the installations listed here, and a critical tool only if the zone is critical."
                title="Plugins"
            >
                {props.plugins.length === 0 ? (
                    <Box className="happy-agent-zones__none">
                        {"No plugins: agents in this zone have no plugin tools."}
                    </Box>
                ) : (
                    props.plugins.map((plugin) => {
                        const open = props.expanded.includes(plugin.id);
                        return (
                            <Box
                                className="happy-agent-zones__plugin"
                                data-happy-desktop-ui="zone-plugin"
                                key={plugin.id}
                            >
                                <Box className="happy-agent-zones__entry">
                                    <button
                                        aria-expanded={open}
                                        className="happy-agent-zones__disclosure"
                                        onClick={() => props.onToggle(plugin.id)}
                                        type="button"
                                    >
                                        <span
                                            aria-hidden="true"
                                            className="happy-agent-zones__chevron"
                                            data-open={open ? "" : undefined}
                                        >
                                            <Icon name="chevron-right" size={14} />
                                        </span>
                                        <Avatar
                                            initials={plugin.name.slice(0, 1).toUpperCase()}
                                            placeholderSeed={plugin.id}
                                            size="sm"
                                            type="agent"
                                            {...(plugin.imageUrl
                                                ? { imageUrl: plugin.imageUrl }
                                                : {})}
                                        />
                                        <span className="happy-agent-zones__text">
                                            <span className="happy-agent-zones__name">
                                                {plugin.label
                                                    ? `${plugin.name} · ${plugin.label}`
                                                    : plugin.name}
                                            </span>
                                            <span className="happy-agent-zones__meta">
                                                {pluginMeta(plugin)}
                                            </span>
                                        </span>
                                    </button>
                                    {props.manage ? (
                                        <Button
                                            disabled={
                                                props.removing !== undefined &&
                                                props.removing !== plugin.id
                                            }
                                            loading={props.removing === plugin.id}
                                            onClick={() => props.onRemove(plugin.id)}
                                            size="small"
                                            variant="ghost"
                                        >
                                            Remove
                                        </Button>
                                    ) : null}
                                </Box>
                                {open ? (
                                    <Box
                                        className="happy-agent-zones__tools"
                                        data-happy-desktop-ui="zone-plugin-tools"
                                    >
                                        {plugin.tools.length === 0 ? (
                                            <Box className="happy-agent-zones__none">
                                                It has no tools.
                                            </Box>
                                        ) : (
                                            plugin.tools.map((tool) => (
                                                <Box
                                                    className="happy-agent-zones__tool"
                                                    key={tool.name}
                                                >
                                                    <span className="happy-agent-zones__text">
                                                        <span className="happy-agent-zones__title">
                                                            <span className="happy-agent-zones__tool-name">
                                                                {tool.name}
                                                            </span>
                                                            {tool.critical ? (
                                                                <span
                                                                    className="happy-agent-zones__tag"
                                                                    data-critical=""
                                                                >
                                                                    Critical
                                                                </span>
                                                            ) : null}
                                                        </span>
                                                        {tool.description ? (
                                                            <span className="happy-agent-zones__meta">
                                                                {tool.description}
                                                            </span>
                                                        ) : null}
                                                    </span>
                                                    <span
                                                        className="happy-agent-zones__count"
                                                        data-none={
                                                            tool.policyCount === 0 ? "" : undefined
                                                        }
                                                    >
                                                        {policiesText(tool.policyCount)}
                                                    </span>
                                                </Box>
                                            ))
                                        )}
                                    </Box>
                                ) : null}
                            </Box>
                        );
                    })
                )}
            </HappyAgentSettingsSection>
            {props.manage ? (
                <Box className="happy-agent-zones__actions">
                    <Button icon="plus" onClick={props.onAdd} size="small" variant="secondary">
                        Add plugins
                    </Button>
                </Box>
            ) : null}
        </>
    );
}

/** A policy, as the zone's list shows it. */
export interface HappyAgentZonePolicyRow {
    readonly id: string;
    readonly description: string;
    /** What it is on, such as "Stripe · create_refund" or "Stripe · every tool". */
    readonly targetLabel: string;
    readonly enabled: boolean;
}

export interface HappyAgentZonePoliciesSectionProps {
    readonly policies: readonly HappyAgentZonePolicyRow[];
    readonly manage: boolean;
    /** Whether the zone lists an installation a policy could be on. */
    readonly canAdd: boolean;
    onAdd: () => void;
    onOpen: (policyId: string) => void;
}

/**
 * The zone's policies on its plugins and tools: short Python programs that
 * may deny a tool call in this zone. Each opens on its own page.
 */
export function HappyAgentZonePoliciesSection(props: HappyAgentZonePoliciesSectionProps) {
    return (
        <>
            <HappyAgentSettingsSection
                description="A policy on a plugin covers all of its tools here; one on a tool covers that tool. Every enabled policy must allow a call, after the zone's own checks."
                title="Policies"
            >
                {props.policies.length === 0 ? (
                    <Box className="happy-agent-zones__none">
                        No policies: every listed tool may be called.
                    </Box>
                ) : (
                    props.policies.map((policy) => (
                        <button
                            className="happy-agent-zones__row"
                            data-happy-desktop-ui="zone-policy"
                            key={policy.id}
                            onClick={() => props.onOpen(policy.id)}
                            type="button"
                        >
                            <span className="happy-agent-zones__text">
                                <span className="happy-agent-zones__title">
                                    <span className="happy-agent-zones__name">
                                        {policy.description}
                                    </span>
                                    {policy.enabled ? null : (
                                        <span className="happy-agent-zones__tag">Off</span>
                                    )}
                                </span>
                                <span className="happy-agent-zones__meta">
                                    {policy.targetLabel}
                                </span>
                            </span>
                            <span aria-hidden="true" className="happy-agent-zones__row-actions">
                                <Icon name="chevron-right" size={16} />
                            </span>
                        </button>
                    ))
                )}
            </HappyAgentSettingsSection>
            {props.manage && props.canAdd ? (
                <Box className="happy-agent-zones__actions">
                    <Button icon="plus" onClick={props.onAdd} size="small" variant="secondary">
                        Add policy
                    </Button>
                </Box>
            ) : null}
        </>
    );
}

/** What a policy test reported. */
export interface HappyAgentZonePolicyTestView {
    readonly verdict: "allow" | "deny" | "error";
    readonly message?: string;
    readonly diagnostics: readonly string[];
    readonly output: string;
    readonly traceback?: string;
    readonly durationMs: number;
}

export interface HappyAgentZonePolicyPageProps {
    /** Absent for a policy being written. */
    readonly saved: boolean;
    readonly manage: boolean;
    /** Every plugin and tool of the zone a policy may be on, by API key. */
    readonly targets: readonly { readonly value: string; readonly label: string }[];
    readonly target: string;
    readonly description: string;
    readonly code: string;
    readonly enabled: boolean;
    readonly edited: boolean;
    readonly saving: boolean;
    readonly deleting: boolean;
    readonly error?: string;
    /** The type checker's findings on the last save. */
    readonly diagnostics: readonly string[];
    readonly sample: string;
    readonly clockPinned: boolean;
    readonly clock: string;
    readonly testing: boolean;
    readonly test?: HappyAgentZonePolicyTestView;
    readonly testError?: string;
    onTargetChange: (target: string) => void;
    onDescriptionChange: (value: string) => void;
    onCodeChange: (value: string) => void;
    onEnabledChange: (enabled: boolean) => void;
    onSave: () => void;
    /** Leaves the page, dropping what isn't saved. */
    onDiscard: () => void;
    onDelete: () => void;
    onSampleChange: (value: string) => void;
    onClockPinnedChange: (pinned: boolean) => void;
    onClockChange: (value: string) => void;
    onTest: () => void;
}

const VERDICT_TEXT = { allow: "Allowed", deny: "Denied", error: "Error" } as const;

/** Lines of text the cluster sent, in monospace. */
function HappyAgentZoneMono(props: { readonly label: string; readonly text: string }) {
    return (
        <Box className="happy-agent-zones__field">
            <span className="happy-agent-zones__field-label">{props.label}</span>
            <pre className="happy-agent-zones__mono">{props.text}</pre>
        </Box>
    );
}

/**
 * One policy of a zone, on its own page: what it is on, its description, its
 * Python code and whether it runs, then a test that runs the code against a
 * sample input, at a pinned clock if asked, and shows the verdict, what it
 * printed, its traceback and how long it took. Saving is type-checked by the
 * cluster, whose findings show above the code. Without `zones.manage` the
 * policy is read-only; testing changes nothing and stays open.
 */
export function HappyAgentZonePolicyPage(props: HappyAgentZonePolicyPageProps) {
    const readOnly = !props.manage;
    const busy = props.saving || props.deleting;
    const targetLabel =
        props.targets.find((option) => option.value === props.target)?.label ?? props.target;
    const test = props.test;
    return (
        <>
            {props.error ? (
                <Banner tone="danger" title="Not saved">
                    {props.error}
                </Banner>
            ) : null}
            <HappyAgentSettingsSection title="Policy">
                <FormRow
                    control={
                        readOnly || props.saved ? (
                            <span className="happy-agent-zones__value">{targetLabel}</span>
                        ) : (
                            <Select
                                aria-label="On"
                                disabled={busy}
                                onValueChange={props.onTargetChange}
                                options={[...props.targets]}
                                value={props.target}
                                width={280}
                            />
                        )
                    }
                    description="A policy on a plugin covers all of its tools in this zone."
                    label="On"
                />
                <FormRow
                    control={
                        readOnly ? (
                            <span className="happy-agent-zones__value" data-wrap="">
                                {props.description}
                            </span>
                        ) : (
                            <TextField
                                aria-label="Description"
                                disabled={busy}
                                fullWidth
                                onValueChange={props.onDescriptionChange}
                                placeholder="No refunds on weekends"
                                value={props.description}
                            />
                        )
                    }
                    description="Shown with the policy, and in its denials when it gives no message."
                    label="Description"
                    layout="stacked"
                />
                <FormRow
                    control={
                        readOnly ? (
                            <span className="happy-agent-zones__value">
                                {props.enabled ? "On" : "Off"}
                            </span>
                        ) : (
                            <Switch
                                aria-label="Enabled"
                                checked={props.enabled}
                                disabled={busy}
                                onChange={props.onEnabledChange}
                            />
                        )
                    }
                    description="A policy that is off is kept, and never runs."
                    label="Enabled"
                />
            </HappyAgentSettingsSection>
            <HappyAgentSettingsSection
                description="Python, run in a sandbox with user, agent, target and request. It allows by finishing, and denies with a failed assert or by ending in a message."
                rows="cards"
                title="Code"
            >
                {props.diagnostics.length > 0 ? (
                    <Banner tone="danger" title="It doesn't type-check">
                        <pre
                            className="happy-agent-zones__mono"
                            data-happy-desktop-ui="zone-policy-diagnostics"
                        >
                            {props.diagnostics.join("\n")}
                        </pre>
                    </Banner>
                ) : null}
                <Box className="happy-agent-zones__code" data-happy-desktop-ui="zone-policy-code">
                    <CodeEditor
                        name="policy.py"
                        onSave={props.onSave}
                        onValueChange={props.onCodeChange}
                        readOnly={readOnly || busy}
                        value={props.code}
                    />
                </Box>
            </HappyAgentSettingsSection>
            {readOnly ? null : (
                <Box
                    className="happy-agent-zones__actions"
                    data-happy-desktop-ui="zone-policy-actions"
                >
                    <Button
                        disabled={props.deleting || (props.saved && !props.edited)}
                        loading={props.saving}
                        onClick={props.onSave}
                        size="small"
                    >
                        {props.saved ? "Save changes" : "Create policy"}
                    </Button>
                    <Button disabled={busy} onClick={props.onDiscard} size="small" variant="ghost">
                        {props.saved && !props.edited ? "Done" : "Discard"}
                    </Button>
                    {props.saved ? (
                        <span className="happy-agent-zones__push">
                            <Button
                                disabled={props.saving}
                                icon="trash"
                                loading={props.deleting}
                                onClick={props.onDelete}
                                size="small"
                                variant="danger"
                            >
                                Delete policy
                            </Button>
                        </span>
                    ) : null}
                </Box>
            )}
            <HappyAgentSettingsSection
                description="Runs the code as written against a sample call, and saves nothing. Try one call it should allow and one it should deny."
                rows="cards"
                title="Test"
            >
                <Box className="happy-agent-zones__field">
                    <span className="happy-agent-zones__field-label">Sample input</span>
                    <Box className="happy-agent-zones__code" data-size="small">
                        <CodeEditor
                            name="input.json"
                            onValueChange={props.onSampleChange}
                            readOnly={props.testing}
                            value={props.sample}
                        />
                    </Box>
                    <span className="happy-agent-zones__note">
                        The zone and the plugin are filled in by the cluster.
                    </span>
                </Box>
                <Box className="happy-agent-zones__toggle">
                    <span className="happy-agent-zones__text">
                        <span className="happy-agent-zones__field-label">Pin the clock</span>
                        <span className="happy-agent-zones__note">
                            Every clock read answers this instant, such as a Saturday morning.
                        </span>
                    </span>
                    {props.clockPinned ? (
                        <TextField
                            aria-label="Clock"
                            disabled={props.testing}
                            onSubmit={props.onTest}
                            onValueChange={props.onClockChange}
                            placeholder="2026-11-28T10:00:00Z"
                            style={{ width: 220 }}
                            value={props.clock}
                        />
                    ) : null}
                    <Switch
                        aria-label="Pin the clock"
                        checked={props.clockPinned}
                        disabled={props.testing}
                        onChange={props.onClockPinnedChange}
                    />
                </Box>
                <Box className="happy-agent-zones__actions">
                    <Button
                        icon="play"
                        loading={props.testing}
                        onClick={props.onTest}
                        size="small"
                        variant="secondary"
                    >
                        Run test
                    </Button>
                </Box>
                {props.testError ? (
                    <Banner tone="danger" title="The test didn't run">
                        {props.testError}
                    </Banner>
                ) : null}
                {props.testing && !test ? (
                    <Box className="happy-agent-settings__pending">
                        <Spinner size={16} />
                        <span>Running the policy…</span>
                    </Box>
                ) : null}
                {test ? (
                    <Box
                        className="happy-agent-zones__result"
                        data-happy-desktop-ui="zone-policy-result"
                    >
                        <Box className="happy-agent-zones__verdict">
                            <span
                                className="happy-agent-zones__verdict-tag"
                                data-verdict={test.verdict}
                            >
                                {VERDICT_TEXT[test.verdict]}
                            </span>
                            <span className="happy-agent-zones__meta">
                                {`Ran in ${test.durationMs < 10 ? test.durationMs.toFixed(1) : String(Math.round(test.durationMs))} ms`}
                            </span>
                        </Box>
                        {test.message ? (
                            <span className="happy-agent-zones__value" data-wrap="">
                                {test.message}
                            </span>
                        ) : null}
                        {test.diagnostics.length > 0 ? (
                            <HappyAgentZoneMono
                                label="Diagnostics"
                                text={test.diagnostics.join("\n")}
                            />
                        ) : null}
                        {test.output ? (
                            <HappyAgentZoneMono label="Printed" text={test.output} />
                        ) : null}
                        {test.traceback ? (
                            <HappyAgentZoneMono label="Traceback" text={test.traceback} />
                        ) : null}
                    </Box>
                ) : null}
            </HappyAgentSettingsSection>
        </>
    );
}
