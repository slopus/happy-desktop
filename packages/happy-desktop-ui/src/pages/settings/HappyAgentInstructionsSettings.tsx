import { useState } from "react";
import { Banner } from "../../Banner";
import { Box } from "../../Box";
import { FileEditor } from "../../FileEditor";
import { MarkdownDocument } from "../../MarkdownDocument";
import { Spinner } from "../../Spinner";
import { Tabs } from "../../Tabs";
import { HappyAgentSettingsSection } from "./HappyAgentSettingsShell";

export type HappyAgentInstructionDocument = {
    /** Stable identity for switching between the peer global documents. */
    id: string;
    label: string;
    /** Where the machine keeps them, shown so it is clear what is being edited. */
    path: string;
    /** What this document controls. */
    description: string;
    placeholder: string;
    /** The draft: what the editor holds, which is not yet what the machine holds. */
    value: string;
    /** Unsaved edits exist. */
    dirty?: boolean;
    /** A write is in flight. */
    saving?: boolean;
    /** Set until the instructions have been read; the editor waits rather than showing empty. */
    loading?: boolean;
    /** Why they could not be read at all. */
    error?: string;
    /** Why the last write was refused — the machine's own reason. */
    saveError?: string;
    /** Why the local draft cannot currently be persisted. */
    saveDisabled?: boolean;
    saveDisabledReason?: string;
    /** The reader may read the document but not change it. */
    readOnly?: boolean;
    /** Bytes the draft occupies, and the most the machine will keep. */
    bytes: number;
    maximumBytes: number;
    onValueChange: (value: string) => void;
    onSave: () => void;
    onRevert: () => void;
};

export type HappyAgentInstructionsSettingsProps = {
    documents: readonly HappyAgentInstructionDocument[];
};

/**
 * The Instructions category: the machine-wide agent instructions and security
 * policy, edited as peer Markdown documents.
 *
 * It is a file rather than a form, so it is edited as one — the same editor a
 * workspace file opens in, reading as Markdown and writing as text. The size
 * limit is the machine's own: it is stated here as room left, and a write past
 * it is refused by the machine in its own words rather than by a Save button
 * that has quietly stopped working.
 */
export function HappyAgentInstructionsSettings(props: HappyAgentInstructionsSettingsProps) {
    const [activeId, setActiveId] = useState(props.documents[0]?.id ?? "");
    const active =
        props.documents.find((document) => document.id === activeId) ?? props.documents[0];
    if (!active) return null;
    const oversize = active.bytes > active.maximumBytes;
    return (
        <HappyAgentSettingsSection
            description={active.description}
            rows="cards"
            title="Global files"
        >
            <Tabs
                activeId={active.id}
                onSelect={setActiveId}
                size="small"
                tabs={props.documents.map(({ id, label }) => ({ id, label }))}
            />
            {active.error ? (
                <Banner tone="danger" title={`${active.label} unavailable`}>
                    {active.error}
                </Banner>
            ) : active.loading ? (
                <Box className="happy-agent-settings__pending">
                    <Spinner size={16} />
                    <span>{`Reading ${active.label}…`}</span>
                </Box>
            ) : (
                <Box className="happy-agent-settings__editor">
                    <FileEditor
                        banner={
                            active.saveError ? (
                                <Banner tone="danger" title="Not saved">
                                    {active.saveError}
                                </Banner>
                            ) : oversize ? (
                                <Banner tone="warning" title="Too long to keep">
                                    {`${active.label} is ${bytesLabel(active.bytes)}, and this machine keeps at most ${bytesLabel(active.maximumBytes)}.`}
                                </Banner>
                            ) : undefined
                        }
                        dirty={active.dirty}
                        initialFace={active.value.trim().length > 0 ? "rendered" : "source"}
                        key={active.id}
                        onRevert={active.onRevert}
                        onSave={active.onSave}
                        onValueChange={active.onValueChange}
                        path={active.path}
                        placeholder={active.placeholder}
                        readOnly={active.readOnly}
                        rendered={<MarkdownDocument text={active.value} />}
                        saving={active.saving}
                        saveDisabled={active.saveDisabled}
                        status={
                            (active.readOnly ? "Read only" : active.saveDisabledReason) ??
                            `${bytesLabel(active.bytes)} of ${bytesLabel(active.maximumBytes)}`
                        }
                        value={active.value}
                    />
                </Box>
            )}
        </HappyAgentSettingsSection>
    );
}

function bytesLabel(bytes: number): string {
    return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}
