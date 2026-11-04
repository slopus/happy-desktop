import { useState, type CSSProperties, type ReactNode } from "react";
import type {
    HappyAgentDeviceBridgeCapability,
    HappyAgentDeviceBridgeItem,
    HappyAgentDeviceBridgesSnapshot,
    HappyAgentLocalUsbDevice,
} from "happy-desktop-state";
import { Button } from "./Button";
import { ScrollArea } from "./Scrollbar";
import { TextField } from "./TextField";
import { Ionicon } from "./vectorIcons/VectorIcon";
import type { IoniconName } from "./vectorIcons/ioniconsGlyphs";

export type HappyAgentDevicesPanelProps = {
    /** One workspace's bridges, as its store projects them. */
    devices: HappyAgentDeviceBridgesSnapshot;
    onUsbAttach: (busId: string) => void;
    /** Programs in the workspace reach `localPort` on this computer at `workspacePort`. */
    onWorkspaceToLocalOpen: (localPort: number, workspacePort: number) => void;
    /** This Mac reaches `workspacePort` in the workspace at `localPort`. */
    onLocalToWorkspaceOpen: (workspacePort: number, localPort: number) => void;
    onBridgeClose: (id: string) => void;
    className?: string;
    "data-testid"?: string;
    style?: CSSProperties;
};

const STATUS_LABELS: Record<HappyAgentDeviceBridgeItem["status"], string> = {
    connecting: "Connecting…",
    open: "Open",
    reconnecting: "Reconnecting…",
    failed: "Stopped",
    closing: "Closing…",
};

/** A typed port, or the port it defaults to when left empty. */
function portRead(text: string, fallback?: number): number {
    const trimmed = text.trim();
    if (trimmed.length === 0) return fallback ?? Number.NaN;
    return /^\d+$/u.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function Capability(props: { label: string; capability: HappyAgentDeviceBridgeCapability }) {
    const available = props.capability.available;
    return (
        <li
            className="happy-agent-devices__capability"
            data-available={available ? "" : undefined}
            data-happy-desktop-ui="happy-agent-devices-capability"
        >
            <span className="happy-agent-devices__capability-mark" aria-hidden="true">
                <Ionicon
                    name={available ? "checkmark-circle" : "remove-circle-outline"}
                    size={14}
                />
            </span>
            <span className="happy-agent-devices__text">
                <span className="happy-agent-devices__title">{props.label}</span>
                {props.capability.available ? null : (
                    <span className="happy-agent-devices__detail">{props.capability.reason}</span>
                )}
            </span>
            <span className="happy-visually-hidden">
                {available ? "Available" : "Not available"}
            </span>
        </li>
    );
}

function Row(props: {
    icon: IoniconName;
    title: string;
    detail: readonly string[];
    error?: string | null;
    trailing?: ReactNode;
    tone?: "failed";
}) {
    return (
        <li
            className="happy-agent-devices__row"
            data-happy-desktop-ui="happy-agent-devices-row"
            data-tone={props.tone}
        >
            <span className="happy-agent-devices__row-icon" aria-hidden="true">
                <Ionicon name={props.icon} size={16} />
            </span>
            <span className="happy-agent-devices__text">
                <span className="happy-agent-devices__title" title={props.title}>
                    {props.title}
                </span>
                {props.detail.length > 0 ? (
                    <span className="happy-agent-devices__detail">{props.detail.join(" · ")}</span>
                ) : null}
                {props.error ? (
                    <span className="happy-agent-devices__error" role="status">
                        {props.error}
                    </span>
                ) : null}
            </span>
            {props.trailing ? (
                <span className="happy-agent-devices__row-action">{props.trailing}</span>
            ) : null}
        </li>
    );
}

function Section(props: { title: string; children: ReactNode; note?: ReactNode }) {
    return (
        <section
            className="happy-agent-devices__section"
            data-happy-desktop-ui="happy-agent-devices-section"
        >
            <h3 className="happy-agent-devices__heading">{props.title}</h3>
            {props.children}
            {props.note ? <p className="happy-agent-devices__note">{props.note}</p> : null}
        </section>
    );
}

function bridgeRow(
    bridge: HappyAgentDeviceBridgeItem,
    onClose: (id: string) => void,
    actionable: boolean,
): ReactNode {
    const status = STATUS_LABELS[bridge.status];
    const close = (
        <Button
            disabled={!actionable || bridge.status === "closing"}
            loading={bridge.status === "closing"}
            onClick={() => onClose(bridge.id)}
            size="small"
            variant="ghost"
        >
            Close
        </Button>
    );
    const elsewhere = bridge.heldHere ? [] : ["From another device"];
    if (bridge.kind === "usb") {
        const held =
            bridge.heldInterfaces.length === 0
                ? []
                : [
                      `This Mac kept interface${bridge.heldInterfaces.length === 1 ? "" : "s"} ${bridge.heldInterfaces.join(", ")}`,
                  ];
        return (
            <Row
                detail={[status, `${bridge.vendorId}:${bridge.productId}`, ...elsewhere, ...held]}
                error={bridge.error}
                icon={bridge.bluetooth ? "bluetooth-outline" : "hardware-chip-outline"}
                key={bridge.id}
                title={bridge.name}
                tone={bridge.status === "failed" ? "failed" : undefined}
                trailing={close}
            />
        );
    }
    const connections =
        bridge.connections === null
            ? []
            : [`${String(bridge.connections)} connection${bridge.connections === 1 ? "" : "s"}`];
    if (bridge.kind === "workspaceToLocal") {
        const workspacePort = bridge.workspacePort === null ? "…" : String(bridge.workspacePort);
        // Where another device sends it is that device's to know.
        const local = bridge.localPort === null ? "" : ` → Mac :${String(bridge.localPort)}`;
        return (
            <Row
                detail={[status, ...connections, ...elsewhere]}
                error={bridge.error}
                icon="arrow-back-outline"
                key={bridge.id}
                title={`Workspace :${workspacePort}${local}`}
                tone={bridge.status === "failed" ? "failed" : undefined}
                trailing={close}
            />
        );
    }
    return (
        <Row
            detail={[status, ...connections]}
            error={bridge.error}
            icon="arrow-forward-outline"
            key={bridge.id}
            title={`Mac :${String(bridge.localPort)} → Workspace :${String(bridge.workspacePort)}`}
            tone={bridge.status === "failed" ? "failed" : undefined}
            trailing={close}
        />
    );
}

function PortForm(props: {
    id: string;
    firstLabel: string;
    secondLabel: string;
    description: (first: string, second: string) => string;
    pending: boolean;
    error?: string;
    disabled: boolean;
    onSubmit: (first: number, second: number) => void;
}) {
    const [first, setFirst] = useState("");
    const [second, setSecond] = useState("");
    const firstPort = portRead(first);
    const secondShown = second.trim().length > 0 ? second.trim() : first.trim();
    const submit = () => {
        if (props.disabled || props.pending) return;
        props.onSubmit(firstPort, portRead(second, firstPort));
    };
    return (
        <div className="happy-agent-devices__form" data-happy-desktop-ui="happy-agent-devices-form">
            <p className="happy-agent-devices__note">
                {props.description(first.trim() || "N", secondShown || "N")}
            </p>
            <div className="happy-agent-devices__fields">
                <TextField
                    disabled={props.disabled}
                    id={`${props.id}-first`}
                    label={props.firstLabel}
                    onSubmit={submit}
                    onValueChange={setFirst}
                    placeholder="3000"
                    size="small"
                    value={first}
                />
                <TextField
                    disabled={props.disabled}
                    id={`${props.id}-second`}
                    label={props.secondLabel}
                    onSubmit={submit}
                    onValueChange={setSecond}
                    placeholder="Same"
                    size="small"
                    value={second}
                />
                <Button
                    disabled={props.disabled || first.trim().length === 0}
                    loading={props.pending}
                    onClick={submit}
                    size="small"
                    variant="secondary"
                >
                    Forward
                </Button>
            </div>
            {props.error ? (
                <p className="happy-agent-devices__error" role="status">
                    {props.error}
                </p>
            ) : null}
        </div>
    );
}

/**
 * HappyAgentDevicesPanel — a workspace's Devices tab: what the workspace's
 * machine can take from this Mac, the USB devices and Bluetooth adapters
 * plugged in here, the two directions a port can be forwarded, and every
 * bridge open to the workspace, with a way to close each.
 *
 * Presentational only: the snapshot carries every state, and each control
 * reports what was asked for. The port fields are the only state it keeps,
 * because what someone is typing belongs to the field until they submit it.
 */
export function HappyAgentDevicesPanel(props: HappyAgentDevicesPanelProps) {
    const { devices } = props;
    const capabilities = devices.capabilities;
    const hostReady = devices.host.status === "ready";
    const actionable = devices.support === "supported" && hostReady;
    const attachedHere = new Set(
        devices.bridges.flatMap((bridge) =>
            bridge.kind === "usb" && bridge.heldHere && bridge.busId !== null ? [bridge.busId] : [],
        ),
    );
    const usb = devices.usb;
    const deviceRow = (device: HappyAgentLocalUsbDevice): ReactNode => {
        const capability = device.bluetooth ? capabilities?.bluetooth : capabilities?.usb;
        const attached = attachedHere.has(device.busId);
        const attaching = devices.attaching.includes(device.busId);
        return (
            <Row
                detail={[
                    ...(device.manufacturer ? [device.manufacturer] : []),
                    `${device.vendorId}:${device.productId}`,
                ]}
                error={devices.usbError?.busId === device.busId ? devices.usbError.message : null}
                icon={device.bluetooth ? "bluetooth-outline" : "hardware-chip-outline"}
                key={device.busId}
                title={device.name}
                trailing={
                    attached ? (
                        <span className="happy-agent-devices__detail">Attached</span>
                    ) : (
                        <Button
                            disabled={!actionable || capability?.available !== true}
                            loading={attaching}
                            onClick={() => props.onUsbAttach(device.busId)}
                            size="small"
                            variant="secondary"
                        >
                            Attach
                        </Button>
                    )
                }
            />
        );
    };
    const usbList = (bluetooth: boolean, empty: string): ReactNode => {
        if (!usb)
            return (
                <p className="happy-agent-devices__note">Looking for devices on this computer…</p>
            );
        if (!usb.available) return <p className="happy-agent-devices__note">{usb.reason}</p>;
        const listed = usb.devices.filter((device) => device.bluetooth === bluetooth);
        if (listed.length === 0) return <p className="happy-agent-devices__note">{empty}</p>;
        return <ul className="happy-agent-devices__list">{listed.map(deviceRow)}</ul>;
    };

    const content = (
        <div className="happy-agent-devices" data-happy-desktop-ui="happy-agent-devices-panel">
            {devices.support === "unsupported" ? (
                <p className="happy-agent-devices__note">
                    The Happy Agent this workspace runs on cannot bridge devices or ports. Updating
                    it adds them.
                </p>
            ) : (
                <>
                    {devices.host.status === "appOutdated" ? (
                        <p className="happy-agent-devices__banner" role="status">
                            Update Happy to attach devices and forward ports.
                        </p>
                    ) : devices.host.status === "error" ? (
                        <p className="happy-agent-devices__error" role="status">
                            {devices.host.message}
                        </p>
                    ) : null}
                    {devices.error ? (
                        <p className="happy-agent-devices__error" role="status">
                            {devices.error}
                        </p>
                    ) : null}
                    <Section title="What the workspace can use">
                        {capabilities ? (
                            <ul className="happy-agent-devices__list">
                                <Capability capability={capabilities.usb} label="USB devices" />
                                <Capability
                                    capability={capabilities.bluetooth}
                                    label="Bluetooth adapters"
                                />
                                <Capability
                                    capability={capabilities.workspaceToLocal}
                                    label="The workspace can reach this computer"
                                />
                                <Capability
                                    capability={capabilities.localToWorkspace}
                                    label="This Mac can reach the workspace"
                                />
                            </ul>
                        ) : (
                            <p className="happy-agent-devices__note">
                                Checking the workspace’s machine…
                            </p>
                        )}
                    </Section>
                    {/* An app too old to hold bridges has nothing to offer from
                    this Mac, so only what Happy Agent itself knows is shown. */}
                    {devices.host.status === "appOutdated" ? null : (
                        <>
                            <Section title="USB devices">
                                {usbList(false, "No USB devices are plugged into this computer.")}
                            </Section>
                            <Section
                                note="An attached adapter becomes the workspace’s own Bluetooth controller. A spare USB adapter works best: macOS keeps the one it is using."
                                title="Bluetooth adapters"
                            >
                                {usbList(
                                    true,
                                    "No USB Bluetooth adapters are plugged into this computer.",
                                )}
                            </Section>
                            <Section title="Workspace to this computer">
                                <PortForm
                                    description={(local, workspace) =>
                                        `Programs in the workspace connect to 127.0.0.1:${workspace} and reach localhost:${local} on this computer.`
                                    }
                                    disabled={
                                        !actionable ||
                                        capabilities?.workspaceToLocal.available !== true
                                    }
                                    error={devices.workspaceToLocal.error}
                                    firstLabel="This Mac"
                                    id="happy-agent-devices-workspace-to-local"
                                    onSubmit={props.onWorkspaceToLocalOpen}
                                    pending={devices.workspaceToLocal.pending}
                                    secondLabel="Workspace"
                                />
                            </Section>
                            <Section title="This Mac to the workspace">
                                <PortForm
                                    description={(workspace, local) =>
                                        `Open localhost:${local} on this computer to reach port ${workspace} in the workspace.`
                                    }
                                    disabled={
                                        !actionable ||
                                        capabilities?.localToWorkspace.available !== true
                                    }
                                    error={devices.localToWorkspace.error}
                                    firstLabel="Workspace"
                                    id="happy-agent-devices-local-to-workspace"
                                    onSubmit={props.onLocalToWorkspaceOpen}
                                    pending={devices.localToWorkspace.pending}
                                    secondLabel="This Mac"
                                />
                            </Section>
                        </>
                    )}
                    <Section title="Open">
                        {devices.bridges.length === 0 ? (
                            <p className="happy-agent-devices__note">Nothing is bridged yet.</p>
                        ) : (
                            <ul className="happy-agent-devices__list">
                                {devices.bridges.map((bridge) =>
                                    bridgeRow(
                                        bridge,
                                        props.onBridgeClose,
                                        // Another device's bridge is closed through Happy
                                        // Agent alone; one held here, through this Mac.
                                        bridge.heldHere
                                            ? hostReady
                                            : devices.support === "supported",
                                    ),
                                )}
                            </ul>
                        )}
                    </Section>
                </>
            )}
        </div>
    );
    return (
        <ScrollArea
            className={["happy-agent-devices-scroll", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="happy-agent-devices-scroll"
            data-testid={props["data-testid"]}
            style={props.style}
            viewportClassName="happy-agent-devices-scroll__viewport"
        >
            <div className="happy-agent-devices-scroll__content">{content}</div>
        </ScrollArea>
    );
}
