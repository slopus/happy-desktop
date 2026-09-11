import { afterEach, describe, expect, it, vi } from "vitest";
import { MINIMUM_HAPPY_AGENT_PROTOCOL_VERSION, serverCompatibility } from "./compatibility.js";

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
