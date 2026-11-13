import { expect, it } from "vitest";
import { computeProject } from "./projection.js";

it("projects a computer binding with its name and whether it is online", () => {
    expect(
        computeProject({
            type: "computer",
            computerId: "0192f0c4-7d1e-7a3b-9c2d-4e5f6a7b8c9d",
            label: "Build farm",
            status: "online",
        }),
    ).toEqual({
        kind: "computer",
        computerId: "0192f0c4-7d1e-7a3b-9c2d-4e5f6a7b8c9d",
        label: "Build farm",
        online: true,
    });
    expect(computeProject({ type: "computer", computerId: "c1", status: "offline" })).toEqual({
        kind: "computer",
        computerId: "c1",
        online: false,
    });
});

it("states no presence until the server has said", () => {
    expect(computeProject({ type: "computer", computerId: "c1", label: "laptop" })).toEqual({
        kind: "computer",
        computerId: "c1",
        label: "laptop",
    });
    expect(computeProject({ type: "none" })).toEqual({ kind: "none" });
});

it("shows nothing for a binding this client does not know yet", () => {
    const future = JSON.parse(
        '{"type":"cluster","clusterId":"k1","status":"online"}',
    ) as Parameters<typeof computeProject>[0];
    expect(computeProject(future)).toBeUndefined();
});
