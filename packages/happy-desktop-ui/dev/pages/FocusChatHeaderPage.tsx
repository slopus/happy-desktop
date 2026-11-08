import { useState, type ReactNode } from "react";
import { AppShell } from "../../src/AppShell";
import { Button } from "../../src/Button";
import { FocusChatHeader } from "../../src/FocusChatHeader";
import { TabbedPane } from "../../src/TabbedPane";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, FullScreenSpecimen, Specimen } from "../kit";

export const componentNumber = "C-342";

const WINDOW = { height: 640, width: 1024 } as const;
const noop = () => undefined;

function band(children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                boxShadow: "inset 0 -1px var(--divider)",
                display: "flex",
                height: "40px",
                paddingLeft: "12px",
                width: "720px",
            }}
        >
            {children}
        </div>
    );
}

/** A stand-in for the sidebar, so the slide has something to bring in. */
function SidebarSlot() {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                boxSizing: "border-box",
                color: "var(--text-secondary)",
                display: "flex",
                flexDirection: "column",
                font: "500 12px var(--happy-font-mono)",
                gap: "12px",
                height: "100%",
                padding: "56px 18px",
            }}
        >
            <span>Search</span>
            <span>New task</span>
            <span>Juno</span>
        </div>
    );
}

/** A stand-in for the onboarding conversation's column. */
function Transcript(props: { readonly released: boolean; readonly onRelease: () => void }) {
    return (
        <TabbedPane
            activeId="juno"
            onSelect={noop}
            size="medium"
            tabSizing="content"
            tabs={[{ id: "juno", label: "Juno", closable: false }]}
        >
            <div
                style={{
                    boxSizing: "border-box",
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    height: "100%",
                    margin: "0 auto",
                    maxWidth: "720px",
                    padding: "32px 24px",
                    width: "100%",
                }}
            >
                <p style={{ color: "var(--text)", font: "400 14px/22px var(--happy-font-ui)" }}>
                    Hi Olga, I’m Juno, acme’s chief of staff. Which AI should the team use?
                </p>
                <div>
                    <Button onClick={props.onRelease} size="small" variant="outline">
                        {props.released ? "Back to focus" : "Release focus"}
                    </Button>
                </div>
            </div>
        </TabbedPane>
    );
}

function FocusWindow(props: { readonly mode: "light" | "dark" }) {
    const [released, setReleased] = useState(false);
    return (
        <ThemeScope mode={props.mode}>
            <AppShell
                navigationChrome="integrated"
                sidebar={<SidebarSlot />}
                sidebarCollapsedLayout="overlay"
                sidebarCollapsible
                {...(released
                    ? {}
                    : {
                          focus: (
                              <FocusChatHeader
                                  face={{ placeholderSeed: "juno" }}
                                  name="Juno"
                                  onSkip={() => setReleased(true)}
                                  private
                                  setup="@acme"
                              />
                          ),
                      })}
            >
                <Transcript onRelease={() => setReleased(!released)} released={released} />
            </AppShell>
        </ThemeScope>
    );
}

export function FocusChatHeaderPage() {
    return (
        <ComponentPage
            contract="Props only"
            number={componentNumber}
            summary="The band over focus chat: the agent and its setup, and Skip setup. It fills AppShell's focus band while a setup's onboarding has the window; releasing focus slides the sidebar in."
            title="FocusChatHeader"
        >
            <Specimen detail="a team flow · Skip setup is always offered" label="Team" number="01">
                {band(
                    <FocusChatHeader
                        face={{ placeholderSeed: "juno" }}
                        name="Juno"
                        onSkip={noop}
                        setup="@acme"
                    />,
                )}
            </Specimen>
            <Specimen
                detail="a member’s own Chief of Staff on a team · the lock says only they see it"
                label="Private"
                number="01p"
            >
                {band(
                    <FocusChatHeader
                        face={{ placeholderSeed: "olga-chief" }}
                        name="Olga’s Chief of Staff"
                        onSkip={noop}
                        private
                        setup="@acme"
                    />,
                )}
            </Specimen>
            <Specimen
                detail="locally, before an AI is connected · no Skip yet"
                label="This Mac"
                number="02"
            >
                {band(<FocusChatHeader name="Chief of Staff" setup="This Mac" />)}
            </Specimen>
            <Specimen
                detail="the agent isn't listed yet · the setup alone"
                label="Name unknown"
                number="03"
            >
                {band(<FocusChatHeader onSkip={noop} setup="@design-guild" />)}
            </Specimen>
            {(["light", "dark"] as const).map((mode, index) => (
                <FullScreenSpecimen
                    detail={`${mode} · AppShell focus; Skip setup slides the sidebar in`}
                    key={mode}
                    label={`Focus chat · ${mode}`}
                    number={String(index + 4).padStart(2, "0")}
                    screen={`${String(index + 4).padStart(2, "0")}-focus-${mode}`}
                    window={WINDOW}
                >
                    <FocusWindow mode={mode} />
                </FullScreenSpecimen>
            ))}
        </ComponentPage>
    );
}
