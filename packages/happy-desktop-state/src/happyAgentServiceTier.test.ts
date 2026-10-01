import { expect, it } from "vitest";
import {
    happyAgentServiceTierFromWire,
    happyAgentServiceTiersFromWire,
    happyAgentServiceTierToWire,
} from "./happyAgentServiceTier.js";

it("preserves Ultrafast through the wire boundary and keeps Fast mapped to priority", () => {
    expect(happyAgentServiceTierToWire(happyAgentServiceTierFromWire("ultrafast"))).toBe(
        "ultrafast",
    );
    expect(happyAgentServiceTierToWire(happyAgentServiceTierFromWire("priority"))).toBe("priority");
    expect(happyAgentServiceTierFromWire("priority")).toBe("fast");
    expect(happyAgentServiceTierFromWire("default")).toBeUndefined();
    expect(happyAgentServiceTierToWire(undefined)).toBeNull();
    expect(happyAgentServiceTierFromWire("future-tier")).toBeUndefined();
    expect(
        happyAgentServiceTiersFromWire(["future-tier", "ultrafast", "priority", "ultrafast"]),
    ).toEqual(["fast", "ultrafast"]);
});
