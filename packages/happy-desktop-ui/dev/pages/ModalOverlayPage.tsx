import { type ReactNode } from "react";
import { Button } from "../../src/Button";
import { CommandPalette } from "../../src/CommandPalette";
import { EmptyState } from "../../src/EmptyState";
import { Modal } from "../../src/Modal";
import { ModalOverlay } from "../../src/ModalOverlay";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-058";
/*
 * The overlay is `position: fixed`; a transformed wrapper establishes a
 * containing block so the specimen renders it inside a bounded, screenshot-safe
 * window frame instead of escaping to the viewport.
 */
function WindowFrame(props: { children: ReactNode; width: number; height: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                transform: "translateZ(0)",
                borderRadius: "8px",
                border: "1px solid var(--surface-pressed-overlay)",
                background: "var(--groupped-background)",
            }}
        >
            {props.children}
        </div>
    );
}

/* Top-placement specimens use a real-sized, non-transformed host. Positioning
 * the overlay absolutely bounds it to this frame while its cqh gutter resolves
 * from the overlay's own size container. The inset shadow marks the frame edge
 * without consuming any of its declared dimensions. */
function TopWindowFrame(props: { children: ReactNode; width: number; height: number }) {
    return (
        <div
            style={{
                position: "relative",
                width: `${props.width}px`,
                height: `${props.height}px`,
                overflow: "hidden",
                borderRadius: "8px",
                background: "var(--groupped-background)",
                boxShadow: "inset 0 0 0 1px var(--surface-pressed-overlay)",
            }}
        >
            {props.children}
        </div>
    );
}

function TopPalette() {
    return (
        <CommandPalette
            autoFocus={false}
            onClose={() => {}}
            onQueryChange={() => {}}
            placeholder="Search Happy Place…"
            query=""
        >
            <EmptyState
                description="Find channels, people, messages, and files across your workspace."
                icon="search"
                size="inline"
                title="Search Happy Place"
            />
        </CommandPalette>
    );
}
export function ModalOverlayPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="The single backdrop every modal-class surface sits on — one dim and stacking level with a 24px minimum safe area, a soft dim for a transient type-ahead such as the ⌘K palette, or a clear backdrop that dims nothing. Dialogs center by default; transient type-ahead surfaces may use the adaptive top placement."
            title="Modal overlay"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="scrim dim · card centered · 24px safe-area gutter"
                    label="Backdrop"
                    number="O-01"
                    stage="app"
                >
                    <WindowFrame height={420} width={720}>
                        <ModalOverlay onDismiss={() => {}}>
                            <Modal
                                footer={
                                    <>
                                        <Button size="medium" variant="ghost">
                                            Cancel
                                        </Button>
                                        <Button size="medium" variant="primary">
                                            Create channel
                                        </Button>
                                    </>
                                }
                                icon="hash"
                                onClose={() => {}}
                                size="medium"
                                title="Create a channel"
                            >
                                Channels organize conversation around a topic. People can join or
                                leave them at any time.
                            </Modal>
                        </ModalOverlay>
                    </WindowFrame>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="fixed inset:0 · z-index var(--happy-z-overlay) · 24px gutter"
                    label="Anatomy"
                    number="O-02"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="24px safe-area gutter" />
                        <WindowFrame height={300} width={560}>
                            <ModalOverlay onDismiss={() => {}}>
                                <Modal
                                    icon="link"
                                    onClose={() => {}}
                                    size="small"
                                    title="Copy link"
                                >
                                    Anyone with this link can join as a guest until it is revoked.
                                </Modal>
                            </ModalOverlay>
                        </WindowFrame>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="720 × 640 Electron minimum · 128px top · full 640 × 461 palette frame"
                    label="Top — Electron minimum"
                    number="O-03"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="720 × 640 host · top gutter 128" />
                        <TopWindowFrame height={640} width={720}>
                            <ModalOverlay
                                onDismiss={() => {}}
                                placement="top"
                                style={{ position: "absolute" }}
                            >
                                <TopPalette />
                            </ModalOverlay>
                        </TopWindowFrame>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="1024 × 704 design reference · 128px top · full 640 × 461 palette frame"
                    label="Top — design reference"
                    number="O-04"
                    stage="app"
                >
                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                        <DimensionRule label="1024 × 704 host · top gutter 128" />
                        <TopWindowFrame height={704} width={1024}>
                            <ModalOverlay
                                onDismiss={() => {}}
                                placement="top"
                                style={{ position: "absolute" }}
                            >
                                <TopPalette />
                            </ModalOverlay>
                        </TopWindowFrame>
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="soft backdrop · a light dim behind the ⌘K palette at the top placement · a press on it dismisses"
                    label="Soft — command palette"
                    number="O-06"
                    stage="app"
                >
                    <TopWindowFrame height={704} width={1024}>
                        <div
                            style={{
                                display: "flex",
                                flex: "1 1 auto",
                                flexDirection: "column",
                                gap: "8px",
                                padding: "24px",
                                color: "var(--text)",
                            }}
                        >
                            The window stays readable behind a soft dim.
                        </div>
                        <ModalOverlay
                            backdrop="soft"
                            onDismiss={() => {}}
                            placement="top"
                            style={{ position: "absolute" }}
                        >
                            <TopPalette />
                        </ModalOverlay>
                    </TopWindowFrame>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="clear backdrop · nothing dimmed, pointers pass through · a press outside the card dismisses"
                    label="Clear — command bar"
                    number="O-05"
                    stage="app"
                >
                    <WindowFrame height={520} width={720}>
                        <div
                            style={{
                                display: "flex",
                                flex: "1 1 auto",
                                flexDirection: "column",
                                gap: "8px",
                                padding: "24px",
                                color: "var(--text)",
                            }}
                        >
                            The window behind a clear overlay stays exactly as it is.
                        </div>
                        <ModalOverlay backdrop="clear" onDismiss={() => {}}>
                            <TopPalette />
                        </ModalOverlay>
                    </WindowFrame>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
