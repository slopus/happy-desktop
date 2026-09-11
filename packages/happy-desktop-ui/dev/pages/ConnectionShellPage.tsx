import { useState } from "react";
import { ConnectionShell, type ConnectionShellItem } from "../../src/ConnectionShell";
import { ConnectionSurface } from "../../src/ConnectionSurface";
import { LocalOnboardingScreen } from "../../src/LocalOnboardingScreen";
import { SplashScreen } from "../../src/SplashScreen";
import { Sidebar } from "../../src/Sidebar";
import { ComponentPage, Specimen } from "../kit";

export const componentNumber = "C-280";
/** An 8 × 8 fixture picture and a ThumbHash placeholder, so nothing loads over the network. */
const FIXTURE_AVATAR = {
    url: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAT0lEQVR4nGPorvk+ufrTrOp3i6perqx8srHiwY6K2wfKrzNgFT1edokBq+j5srMMWEWvlZ5kwCp6r+QIA1bRp8X7GbCKvi3ezYBV9EvRNgD7aoNVazUeBQAAAABJRU5ErkJggg==",
    thumbhash: "HAgGXxBVauaQSKZWmNmKFmhmhjAoCYMC",
};
const items: readonly ConnectionShellItem[] = [
    { id: "local", label: "This Mac", local: true, status: "connected", unread: true },
    {
        id: "work",
        label: "Work",
        local: false,
        status: "connected",
        avatar: FIXTURE_AVATAR,
        unread: true,
    },
    { id: "offline", label: "Offline server", local: false, status: "disconnected", unread: true },
    { id: "starting", label: "Starting", local: false, status: "connecting" },
    { id: "failed", label: "Unavailable", local: false, status: "error" },
];
export function ConnectionShellPage() {
    const [selected, select] = useState("local");
    const [connectingSelected, connectingSelect] = useState("starting");
    const [orderedItems, setOrderedItems] = useState(items);
    const reorder = (id: string, afterId: string | null) => {
        setOrderedItems((current) => {
            const moved = current.find((item) => item.id === id);
            if (!moved || moved.local) return current;
            const next = current.filter((item) => item.id !== id);
            const index = afterId === null ? 1 : next.findIndex((item) => item.id === afterId) + 1;
            next.splice(index, 0, moved);
            return next;
        });
    };
    return (
        <ComponentPage
            number={componentNumber}
            title="Connections"
            summary="A 56px connection rail outside each independent workspace. Home stays first above a separator; remote order is controlled without remounting workspaces."
        >
            <Specimen
                number="08"
                label="Unread activity · rail and sidebar"
                detail="Red dots show unread work. Connection badges sit at the tile's top-right; read items stay unmarked."
                stage="surface"
            >
                <div style={{ display: "flex", width: 416, height: 440 }}>
                    <ConnectionShell items={items} selectedId="local" onSelect={() => undefined}>
                        <Sidebar
                            title="This Mac"
                            style={{ width: 360 }}
                            activeItemId="windhoek"
                            onItemSelect={() => undefined}
                            sections={[
                                {
                                    id: "projects",
                                    label: "Projects",
                                    items: [
                                        {
                                            id: "happy",
                                            kind: "project",
                                            label: "Happy Desktop",
                                            initials: "H",
                                            unread: true,
                                        },
                                        {
                                            id: "windhoek",
                                            kind: "workspace",
                                            label: "windhoek",
                                            depth: 1,
                                            unread: true,
                                        },
                                        {
                                            id: "indicators",
                                            kind: "agent",
                                            label: "Unread indicators",
                                            depth: 2,
                                            unread: true,
                                        },
                                        {
                                            id: "layout",
                                            kind: "agent",
                                            label: "Sidebar layout",
                                            depth: 2,
                                        },
                                        { id: "main", kind: "workspace", label: "main", depth: 1 },
                                        {
                                            id: "website",
                                            kind: "project",
                                            label: "Website",
                                            initials: "W",
                                        },
                                    ],
                                },
                            ]}
                        />
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="01"
                label="Full-screen · reorderable connections"
                detail="8px red unread dots at the top-right of selected, image, and offline tiles. Drag remotes or use Alt+↑/↓; drafts survive."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 600 }}>
                    <ConnectionShell
                        items={orderedItems}
                        selectedId={selected}
                        onSelect={select}
                        onReorder={reorder}
                    >
                        {items.map((item) => (
                            <ConnectionSurface key={item.id} active={item.id === selected}>
                                <div
                                    style={{
                                        display: "flex",
                                        flexDirection: "column",
                                        gap: 16,
                                        padding: 32,
                                    }}
                                >
                                    <h2>{item.label}</h2>
                                    <label>
                                        Local draft{" "}
                                        <input
                                            aria-label={`${item.label} draft`}
                                            defaultValue="Keep this draft when switching"
                                        />
                                    </label>
                                </div>
                            </ConnectionSurface>
                        ))}
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="06"
                label="Windowed · saving order"
                detail="40px traffic-light lane plus 8px padding. Navigation stays available while reordering is pending."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 300 }}>
                    <ConnectionShell
                        items={items}
                        selectedId="local"
                        onSelect={() => undefined}
                        onReorder={() => undefined}
                        reordering
                        windowControls
                    >
                        <p>Saving the remote connection order.</p>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="07"
                label="Reorder failed"
                detail="A failed save leaves the confirmed order and all workspaces available."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 300 }}>
                    <ConnectionShell
                        items={items}
                        selectedId="local"
                        onSelect={() => undefined}
                        reorderError="Could not reorder connections. The host is offline."
                    >
                        <p>Work remains available.</p>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="02"
                label="Single connection"
                detail="No rail and no reserved width."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 300 }}>
                    <ConnectionShell
                        items={items.slice(0, 1)}
                        selectedId="local"
                        onSelect={() => undefined}
                    >
                        <ConnectionSurface active>
                            <p>One full-width workspace.</p>
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="03"
                label="Roster unavailable"
                detail="Retains the last known list."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 400 }}>
                    <ConnectionShell
                        items={items}
                        selectedId="local"
                        onSelect={() => undefined}
                        error="Offline"
                    >
                        <ConnectionSurface active>
                            <p>Cached workspace remains available.</p>
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="04"
                label="Existing onboarding"
                detail="The app's original profile screen, contained beside the rail."
                stage="surface"
            >
                <div style={{ display: "flex", width: 1000, height: 700 }}>
                    <ConnectionShell
                        items={items.slice(0, 2)}
                        selectedId="work"
                        onSelect={() => undefined}
                    >
                        <ConnectionSurface active>
                            <LocalOnboardingScreen
                                appearance="light"
                                view={{
                                    kind: "profile-required",
                                    name: "",
                                    email: "",
                                    busy: false,
                                }}
                                onAssistantsContinue={() => undefined}
                                onConnectRetry={() => undefined}
                                onHappyMobileConnect={() => undefined}
                                onHappyMobileSkip={() => undefined}
                                onProjectChoose={() => undefined}
                                onProfileNameChange={() => undefined}
                                onProfileEmailChange={() => undefined}
                                onProfileCreate={() => undefined}
                            />
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
            <Specimen
                number="05"
                label="Initial connection"
                detail="The existing splash stays beside the rail. Switch to This Mac while the remote connects."
                stage="surface"
            >
                <div style={{ display: "flex", width: 900, height: 600 }}>
                    <ConnectionShell
                        items={items.filter(
                            (item) => item.id === "local" || item.id === "starting",
                        )}
                        selectedId={connectingSelected}
                        onSelect={connectingSelect}
                    >
                        <ConnectionSurface active={connectingSelected === "local"}>
                            <p>This Mac remains available while the remote connects.</p>
                        </ConnectionSurface>
                        <ConnectionSurface active={connectingSelected === "starting"}>
                            <SplashScreen note="Connecting to Starting…" />
                        </ConnectionSurface>
                    </ConnectionShell>
                </div>
            </Specimen>
        </ComponentPage>
    );
}
