import { useState } from "react";
import {
    conversationActionBlockParse,
    type ChatActionBlock as ChatActionBlockModel,
    type ChatActionChoice,
} from "happy-desktop-state";
import { ChatActionBlock, type ChatActionBlockPress } from "../../src/ChatActionBlock";
import { MessageSettingsLinksContext } from "../../src/MessageMarkdown";
import { ComponentPage, DimensionRule, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-330";

/*
 * Every block below is the HTML an agent writes, read by
 * `@slopus/happy-agent-client`'s own grammar: the page draws exactly the tree
 * a reply would.
 */
const blockOf = (html: string): ChatActionBlockModel => {
    const block = conversationActionBlockParse(html, 0);
    if (block === undefined) throw new Error(`The client refused a fixture block:\n${html}`);
    return block;
};

const MENU = blockOf(`<menu>
  <button data-action="reply" data-emphasis>Push it</button>
  <button data-action="reply" data-text="Not yet, run the tests first">Not yet</button>
  <button data-action="reply">Show me the diff</button>
</menu>`);

const PROVIDERS = blockOf(`<menu>
  <button data-action="onboarding.next" data-step="claude" data-mark="claude" data-connected data-emphasis>Claude</button>
  <button data-action="onboarding.next" data-step="codex" data-mark="openai">ChatGPT</button>
  <button data-action="onboarding.next" data-step="grok" data-mark="grok">Grok</button>
  <button data-action="onboarding.next" data-step="gemini" data-mark="gemini">Gemini</button>
</menu>`);

/* `deploy` is in no registry: drawn, never pressable. */
const UNKNOWN = blockOf(`<menu>
  <button data-action="deploy">Deploy to production</button>
  <button data-action="reply">Wait</button>
</menu>`);

const CHECKLIST = blockOf(`<form data-action="reply">
  <label><input type="checkbox" value="claude" checked> Claude Code <small>Signed in as you@example.com</small></label>
  <label><input type="checkbox" value="codex"> Codex</label>
  <label><input type="checkbox" value="grok" disabled> Grok <small>Not installed</small></label>
  <button type="submit" data-emphasis data-empty-label="Skip for now">Use selected</button>
  <button type="button" data-action="reply" data-text="None of these">None of these</button>
</form>`);

const TABLE =
    blockOf(`<form data-action="reply" data-table data-columns="Use|Project|Branch|Changed">
  <label><input type="checkbox" value="desktop" checked> happy-desktop <small>~/code/happy-desktop</small><small>main</small><small>2 hours ago</small></label>
  <label><input type="checkbox" value="agent"> happy-agent <small>~/code/happy-agent</small><small>chat-onboarding</small><small>yesterday</small></label>
  <label><input type="checkbox" value="site"> website <small>~/code/website</small><small>main</small><small>last week</small></label>
  <button type="submit" data-emphasis>Add projects</button>
</form>`);

const CODE = blockOf(`<form data-action="onboarding.next" data-step="sign-in-code">
  <input type="text" placeholder="Paste the code">
  <button type="submit" data-emphasis>Send code</button>
</form>`);

const STEPS = blockOf(`<ol data-steps>
  <li data-status="done" data-mark="claude">Claude Code installed <small>2.1.4 in ~/.local/bin</small></li>
  <li data-status="running">Signing in</li>
  <li data-status="pending">First answer</li>
  <li data-status="failed">Phone pairing <small>The phone did not answer in time.</small></li>
</ol>`);

const STATUSES = (["info", "running", "done", "failed"] as const).map((tone) =>
    blockOf(
        `<output data-status="${tone}">${
            {
                info: "Your profile is saved on this computer only.",
                running: "Reading your Git settings…",
                done: "Claude answered in 1.2 s.",
                failed: "Codex could not sign in. <small>The browser window was closed.</small>",
            }[tone]
        }</output>`,
    ),
);

const TREE = blockOf(`<ul data-tree>
  <li>~/code
    <ul>
      <li>happy-desktop</li>
      <li>happy-agent
        <ul><li>packages</li></ul>
      </li>
    </ul>
  </li>
  <li>~/Documents</li>
</ul>`);

const PHONE_APP = blockOf(`<figure data-phone-app></figure>`);
const INVITE = blockOf(`<figure data-invite data-role="member"></figure>`);
const SERVER_LINK = blockOf(`<figure data-server-link></figure>`);

/* The settings pages a team window has; opening one is the reader's own navigation. */
const SETTINGS_LINKS = { has: (page: string) => page !== "computes", open: () => undefined };

/** A block a reader can press here: the press is drawn as its choice, as a recorded one is. */
function Pressable(props: { readonly block: ChatActionBlockModel }) {
    const [choice, setChoice] = useState<ChatActionChoice | undefined>(undefined);
    return (
        <ChatActionBlock
            block={props.block}
            {...(choice ? { choice } : {})}
            onInvoke={(press: ChatActionBlockPress) => setChoice(press.choice)}
            spinnerFrame={0}
        />
    );
}

const column = {
    display: "flex",
    flexDirection: "column",
    alignItems: "stretch",
    gap: "24px",
    padding: "28px",
    width: "620px",
} as const;

export function ChatActionBlockPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="Inline UI an agent writes into its reply, read by the client package's closed grammar and drawn from the typed tree: outline buttons, a checklist or table, a code field, steps, a status line, a tree, and live figures. A press locks the block and moves nothing."
            title="ChatActionBlock"
        >
            <div className="specimen-grid">
                <Specimen
                    detail="36px outline buttons · 8px gap · one emphasized in ink · press one"
                    label="Menu"
                    number="C-330a"
                    stage="surface"
                >
                    <div style={column}>
                        <DimensionRule label="button 36 · gap 8" />
                        <Pressable block={MENU} />
                        <Pressable block={PROVIDERS} />
                    </div>
                </Specimen>
                <Specimen
                    detail="chosen: selected fill, the rest fade, labels keep their weight · an unknown action is drawn but inert"
                    label="Answered and inert"
                    number="C-330b"
                    stage="surface"
                >
                    <div style={column}>
                        <ChatActionBlock block={MENU} choice={{ kind: "button", index: 1 }} />
                        <ChatActionBlock block={PROVIDERS} choice={{ kind: "button", index: 0 }} />
                        <Pressable block={UNKNOWN} />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="18px checkboxes in the 20px mark slot · submit 12px below · its empty label while nothing is ticked"
                    label="Checklist"
                    number="C-330c"
                    stage="surface"
                >
                    <div style={column}>
                        <Pressable block={CHECKLIST} />
                        <ChatActionBlock
                            block={CHECKLIST}
                            choice={{ kind: "checklist", values: ["claude", "codex"] }}
                        />
                    </div>
                </Specimen>
                <Specimen
                    detail="headings in secondary ink · one hairline per row · columns never break inside a word"
                    label="Table"
                    number="C-330d"
                    stage="surface"
                >
                    <div style={column}>
                        <Pressable block={TABLE} />
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="240px field and its submit · what is typed goes to the press only, and the field empties"
                    label="Code field"
                    number="C-330e"
                    stage="surface"
                >
                    <div style={column}>
                        <Pressable block={CODE} />
                        <ChatActionBlock block={CODE} choice={{ kind: "submitted" }} />
                    </div>
                </Specimen>
                <Specimen
                    detail="16px marks in a 20px slot · muted details · spinner pinned for the still"
                    label="Steps and status"
                    number="C-330f"
                    stage="surface"
                >
                    <div style={column}>
                        <ChatActionBlock block={STEPS} spinnerFrame={0} />
                        {STATUSES.map((block, index) => (
                            <ChatActionBlock block={block} key={index} spinnerFrame={0} />
                        ))}
                    </div>
                </Specimen>
            </div>

            <div className="specimen-grid">
                <Specimen
                    detail="the app's file tree, every folder open"
                    label="Tree"
                    number="C-330g"
                    stage="surface"
                >
                    <div style={column}>
                        <ChatActionBlock block={TREE} />
                    </div>
                </Specimen>
                <Specimen
                    detail="download codes need nothing live · a team figure is the way into its Settings page, disabled where this window has none"
                    label="Figures"
                    number="C-330h"
                    stage="surface"
                >
                    <MessageSettingsLinksContext.Provider value={SETTINGS_LINKS}>
                        <div style={column}>
                            <ChatActionBlock block={PHONE_APP} />
                            <ChatActionBlock block={INVITE} />
                            <ChatActionBlock block={SERVER_LINK} />
                            <ChatActionBlock
                                block={blockOf(`<figure data-compute-join></figure>`)}
                            />
                        </div>
                    </MessageSettingsLinksContext.Provider>
                </Specimen>
            </div>
        </ComponentPage>
    );
}
