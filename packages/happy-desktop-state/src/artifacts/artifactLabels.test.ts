import { describe, expect, it } from "vitest";
import {
    happyAgentArtifactAuthorLabel,
    happyAgentArtifactSourceLabel,
    happyAgentArtifactTypeLabel,
    type HappyAgentArtifactNames,
} from "./artifactLabels.js";
import {
    happyAgentArtifactAuthorProject,
    happyAgentArtifactSourceProject,
    happyAgentArtifactTypeProject,
} from "./artifactProject.js";
import type { ArtifactAuthor, ArtifactSource } from "@slopus/happy-agent-client";

const names: HappyAgentArtifactNames = {
    bot: (id) => (id === "bot_chief" ? "Chief of Staff" : undefined),
    task: (id) => (id === "task_q3" ? "Q3 report" : undefined),
    project: (id) => (id === "prj_happy" ? "happy" : undefined),
    workspace: (id) => (id === "wsp_feature" ? "artifacts" : undefined),
    agent: (id) => (id === "agt_chat" ? "Draft the release notes" : undefined),
    user: (id) => (id === "usr_ada" ? "Ada" : undefined),
};

/** A wire value whose kind a newer daemon added and this build never heard of. */
const fromTheFuture = <Value>(value: object): Value => value as Value;

describe("where an artifact was made", () => {
    it("names each known place by what the window lists it as", () => {
        expect(
            happyAgentArtifactSourceLabel(
                { kind: "bot", botId: "bot_chief", agentId: "agt_1" },
                names,
            ),
        ).toBe("Chief of Staff");
        expect(
            happyAgentArtifactSourceLabel(
                { kind: "task", taskId: "task_q3", agentId: null },
                names,
            ),
        ).toBe("Q3 report");
        expect(
            happyAgentArtifactSourceLabel(
                { kind: "project", projectId: "prj_happy", agentId: "agt_1" },
                names,
            ),
        ).toBe("happy");
        expect(
            happyAgentArtifactSourceLabel(
                {
                    kind: "workspace",
                    workspaceId: "wsp_feature",
                    projectId: "prj_happy",
                    agentId: "agt_1",
                },
                names,
            ),
        ).toBe("happy / artifacts");
        expect(happyAgentArtifactSourceLabel({ kind: "agent", agentId: "agt_chat" }, names)).toBe(
            "Draft the release notes",
        );
    });

    it("says what kind of place it was when the window does not list it", () => {
        expect(
            happyAgentArtifactSourceLabel({ kind: "bot", botId: "bot_gone", agentId: null }, {}),
        ).toBe("A bot");
        expect(
            happyAgentArtifactSourceLabel(
                {
                    kind: "workspace",
                    workspaceId: "wsp_gone",
                    projectId: "prj_happy",
                    agentId: null,
                },
                names,
            ),
        ).toBe("happy / workspace");
        expect(happyAgentArtifactSourceLabel({ kind: "agent", agentId: "agt_gone" }, names)).toBe(
            "A conversation",
        );
        expect(happyAgentArtifactSourceLabel(null, names)).toBe("Outside a chat");
    });

    it("reads a source kind it does not know as elsewhere, keeping its conversation", () => {
        const source = happyAgentArtifactSourceProject(
            fromTheFuture<ArtifactSource>({
                kind: "channel",
                channelId: "c1",
                agentId: "agt_chat",
            }),
        );
        expect(source).toEqual({ kind: "unknown", agentId: "agt_chat" });
        expect(happyAgentArtifactSourceLabel(source, names)).toBe("Elsewhere");
        expect(
            happyAgentArtifactSourceProject(fromTheFuture<ArtifactSource>({ kind: "channel" })),
        ).toEqual({ kind: "unknown", agentId: null });
    });
});

describe("who made a change", () => {
    it("names an agent by its bot, then by its conversation", () => {
        expect(
            happyAgentArtifactAuthorLabel(
                { kind: "agent", agentId: "agt_sub", botId: "bot_chief" },
                names,
            ),
        ).toBe("Chief of Staff");
        expect(
            happyAgentArtifactAuthorLabel(
                { kind: "agent", agentId: "agt_chat", botId: null },
                names,
            ),
        ).toBe("Draft the release notes");
        expect(
            happyAgentArtifactAuthorLabel({ kind: "agent", agentId: "agt_gone", botId: null }, {}),
        ).toBe("An agent");
    });

    it("names a person, and the one person of a standalone installation as the reader", () => {
        expect(happyAgentArtifactAuthorLabel({ kind: "user", userId: "usr_ada" }, names)).toBe(
            "Ada",
        );
        expect(happyAgentArtifactAuthorLabel({ kind: "user", userId: "usr_bob" }, names)).toBe(
            "A person",
        );
        expect(happyAgentArtifactAuthorLabel({ kind: "user", userId: null }, names)).toBe("You");
    });

    it("reads an author kind it does not know as someone", () => {
        const author = happyAgentArtifactAuthorProject(
            fromTheFuture<ArtifactAuthor>({ kind: "service", serviceId: "s1" }),
        );
        expect(author).toEqual({ kind: "unknown" });
        expect(happyAgentArtifactAuthorLabel(author, names)).toBe("Someone");
    });
});

describe("what an artifact is", () => {
    it("names every known type and falls back for a type it does not know", () => {
        expect(happyAgentArtifactTypeLabel(happyAgentArtifactTypeProject("markdown"))).toBe(
            "Markdown",
        );
        expect(happyAgentArtifactTypeLabel(happyAgentArtifactTypeProject("image_series"))).toBe(
            "Image series",
        );
        expect(happyAgentArtifactTypeProject("spreadsheet")).toBe("unknown");
        expect(happyAgentArtifactTypeLabel(happyAgentArtifactTypeProject("spreadsheet"))).toBe(
            "Artifact",
        );
    });
});
