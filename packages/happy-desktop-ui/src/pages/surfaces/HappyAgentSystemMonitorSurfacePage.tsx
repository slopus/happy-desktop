import type { CSSProperties, ReactNode } from "react";
import type {
    HappyAgentSystemMonitorSnapshot,
    HappyAgentSystemMonitorProcessColumn,
} from "happy-desktop-state";
import { Ionicon } from "../../vectorIcons/VectorIcon";
import { ScrollArea } from "../../Scrollbar";
import {
    HappyAgentSurfaceHeader,
    type HappyAgentSurfaceChatToggle,
} from "./HappyAgentSurfaceHeader";
import type { HappyAgentSurfaceView } from "./surfacePresentation";
import {
    SystemMonitorHistoryChart as Trend,
    SystemMonitorAsciiMeter as Meter,
    SystemMonitorAsciiCores,
} from "./systemMonitorGraphics";
import { HappyAgentSystemMonitorProcessesPanel } from "./HappyAgentSystemMonitorProcessesPanel";
import { DitherChart } from "../../dither/DitherChart";
import {
    systemMonitorBytes as bytes,
    systemMonitorPercent as percent,
    systemMonitorRatio as ratio,
} from "./systemMonitorFormat";

export interface HappyAgentSystemMonitorSurfacePageProps {
    /** Who else is looking at the Surface, for its header; see `HappyAgentSurfaceHeader`. */
    viewers?: ReactNode;
    surface: HappyAgentSurfaceView;
    monitor: HappyAgentSystemMonitorSnapshot;
    onProcessFilterChange: (value: string) => void;
    onProcessSortChange: (column: HappyAgentSystemMonitorProcessColumn) => void;
    chat?: HappyAgentSurfaceChatToggle;
    className?: string;
    style?: CSSProperties;
}

const rate = (value: number | null) => (value === null ? "—" : `${bytes(value)}/s`);
const temperature = (value: number | null) => (value === null ? "—" : `${Math.round(value)} °C`);

function uptime(seconds: number): string {
    const days = Math.floor(seconds / 86400);
    const hours = Math.floor(seconds / 3600) % 24;
    const minutes = Math.floor(seconds / 60) % 60;
    return days > 0 ? `${days}d ${hours}h` : `${hours}h ${minutes}m`;
}

function Detail(props: { label: string; value: string; meter?: number | null }) {
    return (
        <div className="system-monitor__detail">
            <span>{props.label}</span>
            {props.meter === undefined ? (
                <span>{props.value}</span>
            ) : (
                <div className="system-monitor__detail-metric">
                    <Meter value={props.meter} label={props.label} compact />
                    <span>{props.value}</span>
                </div>
            )}
        </div>
    );
}

function Card(props: {
    title: string;
    icon: "hardware-chip-outline" | "layers-outline" | "cube-outline" | "server-outline";
    tone: string;
    value: string;
    subtitle: string;
    chart: ReactNode;
    children: ReactNode;
}) {
    return (
        <section className="system-monitor__card" data-tone={props.tone}>
            <div className="system-monitor__card-heading">
                <span className="system-monitor__glyph">
                    <Ionicon name={props.icon} size={18} />
                </span>
                <h2>{props.title}</h2>
            </div>
            <div className="system-monitor__summary">
                <div className="system-monitor__reading">
                    <strong>{props.value}</strong>
                    <span title={props.subtitle}>{props.subtitle}</span>
                </div>
                {props.chart}
            </div>
            <div className="system-monitor__details">{props.children}</div>
        </section>
    );
}

/** A daemon machine's live telemetry, including its last known sample during reconnects. */
export function HappyAgentSystemMonitorSurfacePage(props: HappyAgentSystemMonitorSurfacePageProps) {
    const { sample, status } = props.monitor;
    const history = sample?.history ?? [];
    const gpuValues =
        sample?.gpus
            .map((gpu) => gpu.usagePercent)
            .filter((value): value is number => value !== null) ?? [];
    const gpuUsage = gpuValues.length ? Math.max(...gpuValues) : null;
    const diskTotal = sample?.disks.reduce((sum, disk) => sum + disk.totalBytes, 0) ?? 0;
    const diskUsed = sample?.disks.reduce((sum, disk) => sum + disk.usedBytes, 0) ?? 0;
    const notices = {
        loading: "Connecting to this machine…",
        ready: "Live",
        reconnecting: "Reconnecting · showing last sample",
        missing: "This System Monitor is no longer available.",
        unsupported: "This Happy Agent does not support System Monitor yet.",
    };
    return (
        <div
            className={["system-monitor", props.className].filter(Boolean).join(" ")}
            data-happy-desktop-ui="system-monitor"
            style={props.style}
        >
            <HappyAgentSurfaceHeader
                viewers={props.viewers}
                surface={props.surface}
                {...(props.chat ? { chat: props.chat } : {})}
            />
            <ScrollArea
                className="system-monitor__scroll"
                viewportClassName="system-monitor__viewport"
            >
                <div className="system-monitor__content">
                    <div className="system-monitor__host">
                        <div className="system-monitor__host-copy">
                            <span className="system-monitor__eyebrow">Machine overview</span>
                            <h1>{sample?.host.hostname ?? "System Monitor"}</h1>
                            <span className="system-monitor__host-meta">
                                {sample
                                    ? `${sample.host.osName} · ${sample.host.arch} · Uptime ${uptime(sample.host.uptimeSeconds)}`
                                    : "CPU, graphics, memory, and storage at a glance"}
                            </span>
                        </div>
                        <span
                            className="system-monitor__status"
                            data-live={status === "ready"}
                            role="status"
                        >
                            <span />
                            {notices[status]}
                        </span>
                    </div>
                    {props.monitor.error ? (
                        <p className="system-monitor__notice">{props.monitor.error}</p>
                    ) : null}
                    <div className="system-monitor__cards">
                        <Card
                            title="CPU"
                            icon="hardware-chip-outline"
                            tone="cpu"
                            value={sample ? percent(sample.cpu.usagePercent) : "—"}
                            subtitle={sample?.cpu.model ?? "Waiting for processor data"}
                            chart={
                                <Trend
                                    points={history.map((point) => ({
                                        sampledAt: point.sampledAt,
                                        value: point.cpuPercent,
                                    }))}
                                    maximum={100}
                                    label="CPU usage history"
                                />
                            }
                        >
                            <SystemMonitorAsciiCores
                                values={sample?.cpu.perCoreUsagePercent ?? null}
                            />
                            <Detail
                                label="Logical cores"
                                value={sample ? String(sample.cpu.logicalCores) : "—"}
                            />
                            <Detail
                                label="Frequency"
                                value={
                                    sample?.cpu.speedMhz == null
                                        ? "—"
                                        : `${(sample.cpu.speedMhz / 1000).toFixed(2)} GHz`
                                }
                            />
                            <Detail
                                label="Temperature"
                                value={temperature(sample?.cpu.temperatureCelsius ?? null)}
                            />
                        </Card>
                        <Card
                            title="GPU"
                            icon="cube-outline"
                            tone="gpu"
                            value={percent(gpuUsage)}
                            subtitle={
                                sample
                                    ? sample.gpus.length
                                        ? sample.gpus.map((gpu) => gpu.name).join(" · ")
                                        : "No GPU detected"
                                    : "Waiting for graphics data"
                            }
                            chart={
                                <Trend
                                    points={history.map((point) => ({
                                        sampledAt: point.sampledAt,
                                        value: point.gpuPercent,
                                    }))}
                                    maximum={100}
                                    label="GPU usage history"
                                />
                            }
                        >
                            {sample?.gpus.length ? (
                                sample.gpus.map((gpu, index) => (
                                    <div
                                        className="system-monitor__device"
                                        key={`${gpu.name}-${index}`}
                                    >
                                        {sample.gpus.length > 1 ? (
                                            <Detail
                                                label={gpu.name}
                                                value={percent(gpu.usagePercent)}
                                            />
                                        ) : null}
                                        <Detail
                                            label="Video memory"
                                            value={
                                                gpu.memoryTotalBytes === null
                                                    ? "—"
                                                    : `${bytes(gpu.memoryUsedBytes)} / ${bytes(gpu.memoryTotalBytes)}`
                                            }
                                        />
                                        <Detail
                                            label="Temperature"
                                            value={temperature(gpu.temperatureCelsius)}
                                        />
                                        <Detail
                                            label="Power"
                                            value={
                                                gpu.powerWatts === null
                                                    ? "—"
                                                    : `${gpu.powerWatts.toFixed(1)} W`
                                            }
                                        />
                                    </div>
                                ))
                            ) : (
                                <p className="system-monitor__empty">
                                    {sample
                                        ? "Graphics metrics are unavailable on this machine."
                                        : "Graphics metrics will appear here."}
                                </p>
                            )}
                        </Card>
                        <Card
                            title="Memory"
                            icon="layers-outline"
                            tone="memory"
                            value={sample ? bytes(sample.memory.usedBytes) : "—"}
                            subtitle={
                                sample
                                    ? `of ${bytes(sample.memory.totalBytes)} physical memory`
                                    : "Waiting for memory data"
                            }
                            chart={
                                <Trend
                                    points={history.map((point) => ({
                                        sampledAt: point.sampledAt,
                                        value: point.memoryUsedBytes,
                                    }))}
                                    {...(sample ? { maximum: sample.memory.totalBytes } : {})}
                                    label="Memory usage history"
                                    valueFormat={bytes}
                                />
                            }
                        >
                            <Meter
                                value={
                                    sample
                                        ? ratio(sample.memory.usedBytes, sample.memory.totalBytes)
                                        : null
                                }
                                label="Physical memory used"
                            />
                            <Detail
                                label="Available"
                                value={bytes(sample?.memory.availableBytes ?? null)}
                            />
                            {sample && sample.memory.cachedBytes !== null ? (
                                <Detail
                                    label="Cached"
                                    value={bytes(sample.memory.cachedBytes)}
                                    meter={ratio(
                                        sample.memory.cachedBytes,
                                        sample.memory.totalBytes,
                                    )}
                                />
                            ) : null}
                            <Detail
                                label="Swap"
                                meter={
                                    sample?.memory.swapTotalBytes == null ||
                                    sample.memory.swapUsedBytes === null
                                        ? null
                                        : ratio(
                                              sample.memory.swapUsedBytes,
                                              sample.memory.swapTotalBytes,
                                          )
                                }
                                value={
                                    sample?.memory.swapTotalBytes == null
                                        ? "—"
                                        : `${bytes(sample.memory.swapUsedBytes)} / ${bytes(sample.memory.swapTotalBytes)}`
                                }
                            />
                        </Card>
                        <Card
                            title="Disk"
                            icon="server-outline"
                            tone="disk"
                            value={sample?.disks.length ? percent(ratio(diskUsed, diskTotal)) : "—"}
                            subtitle={
                                sample?.disks.length
                                    ? `${bytes(diskUsed)} of ${bytes(diskTotal)} used`
                                    : "No volumes available"
                            }
                            chart={
                                <div className="system-monitor__io-history">
                                    <div className="system-monitor__io-legend">
                                        <span>Read I/O</span>
                                        <span>Write I/O</span>
                                    </div>
                                    <DitherChart
                                        label="Disk read and write I/O history"
                                        series={[
                                            {
                                                id: "read",
                                                label: "Read",
                                                color: "blue",
                                                points: history.map((point) => ({
                                                    x: point.sampledAt,
                                                    value: point.diskReadBytesPerSecond,
                                                })),
                                            },
                                            {
                                                id: "write",
                                                label: "Write",
                                                color: "orange",
                                                points: history.map((point) => ({
                                                    x: point.sampledAt,
                                                    value: point.diskWriteBytesPerSecond,
                                                })),
                                            },
                                        ]}
                                        valueFormat={rate}
                                        xFormat={(x) => new Date(x).toLocaleTimeString("en-US")}
                                    />
                                </div>
                            }
                        >
                            <div className="system-monitor__throughput">
                                <Detail
                                    label="Read"
                                    value={rate(sample?.diskIo?.readBytesPerSecond ?? null)}
                                />
                                <Detail
                                    label="Write"
                                    value={rate(sample?.diskIo?.writeBytesPerSecond ?? null)}
                                />
                            </div>
                            {sample?.disks.map((disk) => (
                                <div
                                    className="system-monitor__volume"
                                    key={`${disk.device}:${disk.mountPoint}`}
                                >
                                    <Detail
                                        label={disk.mountPoint}
                                        value={`${bytes(disk.availableBytes)} free`}
                                    />
                                    <Meter
                                        value={ratio(disk.usedBytes, disk.totalBytes)}
                                        label={`${disk.mountPoint} storage used`}
                                    />
                                    <span className="system-monitor__volume-meta">
                                        {disk.fileSystem ?? "Unknown filesystem"} ·{" "}
                                        {bytes(disk.totalBytes)}
                                    </span>
                                </div>
                            ))}
                        </Card>
                    </div>
                    <HappyAgentSystemMonitorProcessesPanel
                        monitor={props.monitor}
                        onProcessFilterChange={props.onProcessFilterChange}
                        onProcessSortChange={props.onProcessSortChange}
                    />
                    <div className="system-monitor__footer">
                        <span>
                            {history.length > 1
                                ? `${Math.round(((history.at(-1)?.sampledAt ?? 0) - (history[0]?.sampledAt ?? 0)) / 1000)} seconds of activity`
                                : "Collecting activity history"}
                        </span>
                        <span>
                            {sample
                                ? `Sampled ${new Date(sample.sampledAt).toLocaleTimeString("en-US")} · Every ${(sample.intervalMs / 1000).toLocaleString("en-US")}s`
                                : "Waiting for the first sample"}
                        </span>
                    </div>
                </div>
            </ScrollArea>
        </div>
    );
}
