import { useState } from "react";
import { Composer, type Mentionable } from "../../src/Composer";
import { renderMessageMarkdown } from "../../src/MessageMarkdown";
import type { MessageReferences } from "../../src/messageReferences";

/**
 * A demo, not a specimen: the real Composer and message body with a made-up
 * team, for recording mentions end to end — picking a teammate, deleting a
 * tag, sending, and the card behind a sent tag. Photos are read from
 * `people/<name>.jpg` beside the page when the host serves them.
 */
export const componentNumber = "B-002";

const TEAM = [
    { id: "u_alice", name: "Alice", role: "Product", photo: "alice" },
    { id: "u_bob", name: "Bob Martin", role: "Backend", photo: "bob" },
    { id: "u_carol", name: "Carol Diaz", role: "Design", photo: "carol" },
    { id: "u_dana", name: "Dana Kim", role: "Support", photo: "dana" },
] as const;
const VIEWER = "u_alice";

const people: Mentionable[] = TEAM.filter((person) => person.id !== VIEWER).map((person) => ({
    description: person.role,
    id: `user:${person.id}`,
    imageUrl: `people/${person.photo}.jpg`,
    initials: person.name.slice(0, 1),
    insertion: `[${person.name}](happy://users/${person.id})`,
    name: person.name,
    person: true,
}));

const references: MessageReferences = {
    view(reference) {
        const person = TEAM.find((candidate) => candidate.id === reference.id);
        if (reference.kind !== "user" || person === undefined)
            return { type: "text", label: "an unavailable reference" };
        return {
            type: "person",
            label: `@${person.name}`,
            name: person.name,
            imageUrl: `people/${person.photo}.jpg`,
            role: person.role,
            self: person.id === VIEWER,
        };
    },
    open() {},
};

export function MentionDemoPage() {
    const [value, setValue] = useState("");
    const [sent, setSent] = useState<string[]>([
        "[Alice](happy://users/u_alice) can you sign off on the annual discount?",
    ]);
    const typed = value.trim();
    return (
        <div data-mention-demo="" style={{ display: "flex", gap: 32, padding: 32 }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, width: 220 }}>
                {[
                    { name: "Pricing page", count: "2", mentioned: true },
                    { name: "Onboarding copy", count: "6", mentioned: false },
                    { name: "Support inbox", count: "99+", mentioned: false },
                ].map((row) => (
                    <div
                        key={row.name}
                        style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}
                    >
                        <span style={{ flex: 1 }}>{row.name}</span>
                        <span
                            className="happy-sidebar__item-unread-count"
                            data-mentioned={row.mentioned ? "" : undefined}
                        >
                            {row.mentioned ? "@" : null}
                            {row.count}
                        </span>
                    </div>
                ))}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 16, width: 640 }}>
                {sent.map((text, index) => (
                    <div
                        className="happy-message__body happy-message__body--markdown"
                        data-mention-demo-message=""
                        // Sent messages never move, so their order is their identity.
                        key={index}
                    >
                        {renderMessageMarkdown(
                            text,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            undefined,
                            references,
                        )}
                    </div>
                ))}
                <div style={{ marginTop: 160 }}>
                    <Composer
                        mentionPickerLabel="People"
                        mentions={people}
                        onSend={() => {
                            if (typed.length === 0) return;
                            setSent((messages) => [...messages, value]);
                            setValue("");
                        }}
                        onValueChange={setValue}
                        placeholder="Message Pricing page…"
                        value={value}
                    />
                </div>
            </div>
        </div>
    );
}
