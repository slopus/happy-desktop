import { afterEach, describe, expect, it, vi } from "vitest";
import {
    MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION,
    happyAgentVersionAtLeast,
    serverCompatibility,
} from "./compatibility.js";

afterEach(() => vi.unstubAllGlobals());
describe("explicit source daemon compatibility", () => {
    it("keeps source versions out of normal release builds", () => {
        expect(
            serverCompatibility({ daemon: "0.0.0", protocol: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION })
                .status,
        ).toBe("server_outdated");
    });
    it("allows the opted-in source build only with a current protocol", () => {
        vi.stubGlobal("__HAPPY_ALLOW_SOURCE_AGENT__", true);
        expect(
            serverCompatibility({ daemon: "0.0.0", protocol: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION })
                .status,
        ).toBe("compatible");
        expect(
            serverCompatibility({
                daemon: "0.0.0",
                protocol: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION - 1,
            }).status,
        ).toBe("server_outdated");
        expect(
            serverCompatibility({
                daemon: "0.4.43",
                protocol: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION,
            }).status,
        ).toBe("server_outdated");
    });
});

describe("version gates", () => {
    it("treat a feature first shipped in a preview as present in later releases", () => {
        const minimum = "0.4.84-preview.1";
        const versions = ["0.4.83", "0.4.83-preview.9", "0.4.84-preview.0"];
        for (const version of versions)
            expect(happyAgentVersionAtLeast(version, minimum)).toBe(false);
        for (const version of [
            "0.4.84-preview.1",
            "0.4.84-preview.12",
            "0.4.84",
            "0.4.85",
            "0.5.0",
        ])
            expect(happyAgentVersionAtLeast(version, minimum)).toBe(true);
        expect(happyAgentVersionAtLeast(undefined, minimum)).toBe(false);
    });
    it("accept CalVer daemons against the semantic version gates", () => {
        for (const daemon of ["2026.11.1", "2026.11.1-preview.1", "2026.1.12-preview.3"])
            expect(
                serverCompatibility({ daemon, protocol: MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION })
                    .status,
            ).toBe("compatible");
        expect(happyAgentVersionAtLeast("2026.11.1-preview.1", "0.4.87-preview.5")).toBe(true);
        expect(happyAgentVersionAtLeast("2026.11.1-preview.2", "2026.11.1-preview.10")).toBe(false);
        expect(happyAgentVersionAtLeast("2026.11.1-preview.10", "2026.11.1-preview.2")).toBe(true);
        expect(happyAgentVersionAtLeast("2026.11.1-preview.9", "2026.11.1")).toBe(false);
        expect(happyAgentVersionAtLeast("2026.11.1", "2026.11.1-preview.9")).toBe(true);
        expect(happyAgentVersionAtLeast("2026.11.2-preview.1", "2026.11.1")).toBe(true);
        expect(happyAgentVersionAtLeast("2026.12.1-preview.1", "2026.11.9")).toBe(true);
        expect(happyAgentVersionAtLeast("2027.1.1", "2026.12.30")).toBe(true);
    });
    it("orders a preview before the release it previews", () => {
        expect(happyAgentVersionAtLeast("0.4.44-preview.3", "0.4.44")).toBe(false);
        expect(happyAgentVersionAtLeast("0.4.44", "0.4.44")).toBe(true);
    });
});
