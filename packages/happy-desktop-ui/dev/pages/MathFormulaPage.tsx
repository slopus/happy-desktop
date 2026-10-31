import {
    agentAuthor,
    happyAgentOwnerAuthor,
    type ComposerSnapshot,
    type ConversationAuthor,
    type ConversationEntry,
} from "happy-desktop-state";
import { type ReactNode } from "react";
import { ConversationDock } from "../../src/ConversationDock";
import { ConversationView } from "../../src/ConversationView";
import { MathFormula } from "../../src/MathFormula";
import { Message } from "../../src/Message";
import { ThemeScope } from "../../src/ThemeScope";
import { ComponentPage, DimensionRule, FullScreenSpecimen, Specimen } from "../kit";

/** The component plan this page documents. The selector and the page header read the same value. */
export const componentNumber = "C-297";

const noop = () => undefined;

const COMPOSER: ComposerSnapshot = {
    agentUserIds: [],
    attachments: [],
    capabilities: { commands: [], mentions: false, shellMode: false },
    focused: false,
    mentionCandidates: [],
    revision: 0,
    scopeId: "math-formula",
    submission: { status: "idle" },
    text: "",
};

const USER_QUESTION = String.raw`Can you check my derivation? I think the variance of the sample mean is $\operatorname{Var}(\bar X) = \sigma^2 / n$, because

$$\operatorname{Var}\Big(\frac{1}{n}\sum_{i=1}^{n} X_i\Big) = \frac{1}{n^2}\sum_{i=1}^{n}\operatorname{Var}(X_i)$$

Does that still hold when the \(X_i\) are correlated? Rerunning the sims costs $5 or $10 a batch, so I'd rather know first.`;

const AGENT_ANSWER =
    String.raw`Your step is right for **independent** draws. With correlation the cross terms come back. Writing $\Sigma_{ij} = \operatorname{Cov}(X_i, X_j)$:

\[
\operatorname{Var}(\bar X) = \frac{1}{n^2}\,\mathbf{1}^\top \Sigma\, \mathbf{1} = \frac{1}{n^2}\sum_{i=1}^{n}\sum_{j=1}^{n}\Sigma_{ij}
\]

For an equicorrelated process with variance $\sigma^2$ and correlation $\rho$, the covariance is

$$
\Sigma = \sigma^2\begin{pmatrix} 1 & \rho & \cdots & \rho \\ \rho & 1 & \cdots & \rho \\ \vdots & \vdots & \ddots & \vdots \\ \rho & \rho & \cdots & 1 \end{pmatrix}
$$

so the double sum collapses:

$$
\begin{aligned}
\operatorname{Var}(\bar X) &= \frac{\sigma^2}{n^2}\bigl(n + n(n-1)\rho\bigr) \\
&= \frac{\sigma^2}{n}\bigl(1 + (n-1)\rho\bigr).
\end{aligned}
$$

As $n \to \infty$ this tends to $\rho\,\sigma^2$, not $0$: averaging cannot remove shared noise. For a continuous kernel the same idea reads $\int_0^1\!\int_0^1 k(s,t)\,ds\,dt$. A quick numerical check:

` +
    "```python\nimport numpy as np\nn, rho, sigma = 50, 0.3, 2.0\ncov = sigma**2 * ((1 - rho) * np.eye(n) + rho)\nprint(cov.sum() / n**2, sigma**2 / n * (1 + (n - 1) * rho))\n```" +
    String.raw`

One formula from your notes didn't typeset: $\frac{1}{n$ is missing a closing brace.`;

const SERIES_FOLLOW_UP = String.raw`And the series you asked about earlier, written out:

$$e^{x} = \sum_{k=0}^{\infty}\frac{x^k}{k!} = 1 + x + \frac{x^2}{2!} + \frac{x^3}{3!} + \frac{x^4}{4!} + \frac{x^5}{5!} + \frac{x^6}{6!} + \frac{x^7}{7!} + \frac{x^8}{8!} + \frac{x^9}{9!} + \frac{x^{10}}{10!} + \frac{x^{11}}{11!} + \frac{x^{12}}{12!} + \cdots$$

It converges for every $x \in \mathbb{R}$.`;

/** Formulas in every block the transcript sets, for the row-height model. */
const BLOCKS = String.raw`## Heading with $\sum_{k=1}^{n} k = \frac{n(n+1)}{2}$

- A tight item with \(e^{i\pi} + 1 = 0\) inline
- An item whose formula is lifted out:
  \[
  \nabla \cdot \mathbf{E} = \frac{\rho}{\varepsilon_0}
  \]
  and text after it
- Inline tall math $\displaystyle\int_0^1 \frac{dx}{\sqrt{1-x^2}}$ grows only its own line, while ordinary text in this item keeps wrapping on the 24 px rhythm around it.

> A quote: $\binom{n}{k} = \frac{n!}{k!\,(n-k)!}$, and the $n$-th term.

| Quantity | Formula |
| --- | --- |
| Mean | $\mu = \frac{1}{n}\sum_i x_i$ |
| Spread | $\sigma = \sqrt{\frac{1}{n}\sum_i (x_i - \mu)^2}$ |

A display formula KaTeX rejects keeps its source:

$$
\begin{pmatrix} a & b \end{bmatrix}
$$

Prices are not math: $5, $10, and $20.`;

function message(
    id: string,
    sender: ConversationAuthor,
    text: string,
    createdAt: string,
): ConversationEntry {
    return {
        kind: "message",
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: "math-formula",
            sequence: id,
            changePts: id,
            sender,
            text,
            attachments: [],
            reactions: [],
            createdAt,
        },
    };
}

const BLOCK_ENTRIES: readonly ConversationEntry[] = [
    message("10", agentAuthor, BLOCKS, "2026-10-17T09:50:00.000Z"),
    message("11", happyAgentOwnerAuthor, BLOCKS, "2026-10-17T09:51:00.000Z"),
];

const ENTRIES: readonly ConversationEntry[] = [
    message("1", happyAgentOwnerAuthor, USER_QUESTION, "2026-10-17T09:41:00.000Z"),
    message("2", agentAuthor, AGENT_ANSWER, "2026-10-17T09:41:20.000Z"),
    message("3", agentAuthor, SERIES_FOLLOW_UP, "2026-10-17T09:42:05.000Z"),
];

/** The product transcript, sized like a window, in one explicit appearance. */
function TranscriptWindow(props: {
    readonly entries: readonly ConversationEntry[];
    readonly mode: "light" | "dark";
}) {
    return (
        <ThemeScope mode={props.mode}>
            <div
                style={{
                    background: "var(--surface)",
                    display: "flex",
                    height: "100%",
                    width: "100%",
                }}
            >
                <ConversationView
                    agentAuthor={agentAuthor}
                    dock={
                        <ConversationDock
                            composer={COMPOSER}
                            composerPlaceholder="Message Happy…"
                            onComposerSend={noop}
                            onComposerValueChange={noop}
                            running={false}
                        />
                    }
                    conversationId={`math-formula-${props.mode}`}
                    entries={props.entries}
                    running={false}
                    style={{ flex: "1 1 auto", minWidth: 0 }}
                    title="Variance of a correlated mean"
                    viewerId={happyAgentOwnerAuthor.id}
                />
            </div>
        </ThemeScope>
    );
}

function frame(width: number, children: ReactNode) {
    return (
        <div
            style={{
                background: "var(--groupped-background)",
                border: "1px solid var(--divider)",
                borderRadius: "10px",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
                padding: "8px 0",
                width: `${String(width)}px`,
            }}
        >
            {children}
        </div>
    );
}

const row = { alignItems: "baseline", display: "flex", gap: "24px" } as const;

export function MathFormulaPage() {
    return (
        <ComponentPage
            number={componentNumber}
            summary="TeX typeset by KaTeX. Inline formulas sit on the body line and grow it only as much as their ink needs; display formulas take a centred line of their own and scroll sideways when wider than the body. A formula KaTeX cannot parse shows its source as code with a soft underline. The transcript measures every formula before it mounts, so rows land at their real height."
            title="MathFormula · message math"
        >
            <Specimen
                detail="Inline formulas inherit the text colour; a fraction or sum raises the line box only where it appears"
                label="Inline"
                number="00"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <div style={row}>
                        <MathFormula display={false} source="x^2 + y^2 = z^2" />
                        <MathFormula display={false} source={String.raw`\frac{a}{b}`} />
                        <MathFormula display={false} source={String.raw`\sum_{i=1}^{n} i`} />
                        <MathFormula display={false} source={String.raw`\sqrt{2}\,\pi`} />
                    </div>
                    <DimensionRule label="16 / 24 body line · KaTeX at 1.21 em" />
                </div>
            </Specimen>
            <Specimen
                detail="Display style, centred in its host; a 4 px inset keeps tall operators clear of the clip edge"
                label="Display"
                number="01"
                stage="surface"
            >
                <div
                    style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: "12px",
                        width: "560px",
                    }}
                >
                    <MathFormula
                        display
                        source={String.raw`\int_0^\infty e^{-x^2}\,dx = \frac{\sqrt{\pi}}{2}`}
                    />
                    <MathFormula
                        display
                        source={String.raw`\begin{bmatrix} a & b \\ c & d \end{bmatrix}^{-1} = \frac{1}{ad - bc}\begin{bmatrix} d & -b \\ -c & a \end{bmatrix}`}
                    />
                </div>
            </Specimen>
            <Specimen
                detail="Unparseable TeX keeps its source as code; hover shows KaTeX's reason"
                label="Fallback"
                number="02"
                stage="surface"
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
                    <MathFormula display={false} source={String.raw`\frac{1}{n`} />
                    <MathFormula display source={String.raw`\begin{pmatrix} a & b \end{bmatrix}`} />
                </div>
            </Specimen>
            <Specimen
                detail="Own bubble, incoming bubble, and an agent body; currency like $5 and $10 stays text"
                label="In messages"
                number="03"
                stage="app"
            >
                {frame(
                    760,
                    <>
                        <Message author="You" body={USER_QUESTION} own time="9:41" />
                        <Message
                            author="Maya Johnson"
                            body={String.raw`Isn't it just \(\rho\sigma^2\) in the limit? That matches $\lim_{n\to\infty}\frac{1+(n-1)\rho}{n} = \rho$.`}
                            time="9:41"
                        />
                        <Message
                            agent
                            author="Happy"
                            body={SERIES_FOLLOW_UP}
                            brandAvatar
                            time="9:42"
                        />
                    </>,
                )}
            </Specimen>
            <FullScreenSpecimen
                detail="The virtualized product transcript, light"
                label="Transcript · light"
                number="04"
                screen="01-transcript-light-1100x1400"
                window={{ width: 1100, height: 1400 }}
            >
                <TranscriptWindow entries={ENTRIES} mode="light" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The virtualized product transcript, dark"
                label="Transcript · dark"
                number="05"
                screen="02-transcript-dark-1100x1400"
                window={{ width: 1100, height: 1400 }}
            >
                <TranscriptWindow entries={ENTRIES} mode="dark" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The user's question at the window Happy opens at"
                label="User message"
                number="06"
                screen="03-user-message-light-1100x760"
                window={{ width: 1100, height: 760 }}
            >
                <TranscriptWindow entries={ENTRIES.slice(0, 1)} mode="light" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="The minimum window: the long series scrolls sideways"
                label="Minimum window"
                number="07"
                screen="04-transcript-dark-720x640"
                window={{ width: 720, height: 640 }}
            >
                <TranscriptWindow entries={ENTRIES} mode="dark" />
            </FullScreenSpecimen>
            <FullScreenSpecimen
                detail="Formulas in headings, lists, quotes, and tables, in an agent body and an own bubble"
                label="Every block"
                number="08"
                screen="05-blocks-light-1100x1800"
                window={{ width: 1100, height: 1800 }}
            >
                <TranscriptWindow entries={BLOCK_ENTRIES} mode="light" />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
