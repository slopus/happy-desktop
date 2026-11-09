import { useState } from "react";
import { AgentActivityRow } from "../../src/AgentActivityRow";
import { FilePreview } from "../../src/FilePreview";
import { FileTree, type FileTreeNode } from "../../src/FileTree";
import { FileRevealContext, type FileReveal } from "../../src/LinkContextMenu";
import { Message } from "../../src/Message";
import { Tabs } from "../../src/Tabs";
import { ComponentPage, Specimen } from "../kit";
import { happyAgentFileCreateTool } from "./happyAgentChatFixtures";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-338";

const SHOTS = "/Users/devdvlive/Happy/Bots/chief_of_staff/.context/shots";

const TREE: readonly FileTreeNode[] = [
    {
        id: "src",
        name: "src",
        kind: "directory",
        expanded: true,
        children: [
            { id: "src/FileTree.tsx", name: "FileTree.tsx", kind: "file", gitStatus: "modified" },
            {
                id: "src/FileRevealMenu.tsx",
                name: "FileRevealMenu.tsx",
                kind: "file",
                gitStatus: "added",
            },
        ],
    },
    { id: "README.md", name: "README.md", kind: "file" },
];

/**
 * Show in Finder, everywhere a file is named: a file link in a reply, a row of
 * the Files listing, a file viewer's header, and a tool call about one file.
 * The host here only reports what it would have revealed.
 */
export function FileRevealPage() {
    const [revealed, setRevealed] = useState<string>();
    const reveal: FileReveal = {
        path: (path) => setRevealed(path),
        link: (link) => setRevealed(link.path),
    };
    return (
        <FileRevealContext.Provider value={reveal}>
            <ComponentPage
                number={componentNumber}
                summary="Right-click a file anywhere it is named to show it selected in Finder."
                title="Show in Finder"
            >
                <div
                    data-testid="file-reveal-result"
                    style={{
                        position: "fixed",
                        bottom: 24,
                        left: "50%",
                        transform: "translateX(-50%)",
                        boxShadow: "0 6px 24px rgba(0,0,0,.4)",
                        zIndex: 5,
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: revealed ? "#1f6f3f" : "#2a2a2a",
                        color: "#fff",
                        font: "13px system-ui",
                        marginBottom: 16,
                    }}
                >
                    {revealed ? `Finder would select: ${revealed}` : "Finder: nothing revealed yet"}
                </div>
                <Specimen
                    detail="Absolute paths anywhere on the Mac"
                    label="A file link in a reply"
                    number="01"
                >
                    <Message
                        agent
                        author="Happy"
                        body={`Screenshots are in the shots folder: [now-1-1](${SHOTS}/now-1-1.png) · [now-1-2](${SHOTS}/now-1-2.png) · [notes](${SHOTS}/notes.md)`}
                        generationStatus="complete"
                        initials="H"
                        onFileOpen={() => {}}
                        time="19:20"
                        tone="mint"
                    />
                </Specimen>
                <Specimen detail="Files and folders" label="The Files listing" number="02">
                    <div style={{ width: 320, height: 140, display: "flex" }}>
                        <FileTree nodes={TREE} onReveal={(id) => setRevealed(id)} />
                    </div>
                </Specimen>
                <Specimen detail="The header names the file" label="A file viewer" number="03">
                    <div style={{ width: 640, height: 160, display: "flex" }}>
                        <FilePreview
                            content={{
                                type: "text",
                                text: "# Notes\n\nShow in Finder everywhere.",
                            }}
                            path="docs/notes/file-viewer.md"
                        />
                    </div>
                </Specimen>
                <Specimen detail="Main content and the side panel" label="A file tab" number="04">
                    <div style={{ width: 640 }}>
                        <Tabs
                            activeId="tab-refresh"
                            onSelect={() => undefined}
                            onTabMenuSelect={(tab, actionId) => {
                                if (actionId === "reveal" && tab.filePath)
                                    setRevealed(tab.filePath);
                            }}
                            tabMenuItems={(tab) =>
                                tab.filePath
                                    ? [
                                          {
                                              kind: "item",
                                              id: "reveal",
                                              label: "Show in Finder",
                                              icon: "folder-open",
                                          },
                                          { kind: "separator" },
                                          {
                                              kind: "item",
                                              id: "close",
                                              label: "Close",
                                              icon: "close",
                                          },
                                      ]
                                    : []
                            }
                            tabs={[
                                { id: "chat", label: "Chat", icon: "chat" },
                                {
                                    id: "tab-refresh",
                                    label: "refresh.ts",
                                    filePath: "src/auth/refresh.ts",
                                },
                            ]}
                        />
                    </div>
                </Specimen>
                <Specimen detail="The file the call read or wrote" label="A tool call" number="05">
                    <div style={{ width: 640 }}>
                        <AgentActivityRow
                            activity={{ kind: "tool", tool: happyAgentFileCreateTool }}
                            motion="calm"
                            treatment="focused"
                        />
                    </div>
                </Specimen>
            </ComponentPage>
        </FileRevealContext.Provider>
    );
}
