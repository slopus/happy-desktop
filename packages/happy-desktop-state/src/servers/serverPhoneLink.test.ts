import { expect, it } from "vitest";
import { serverPhoneLinkFormat } from "./serverPhoneLink.js";

const TEAM = "k3x9q2m7p0a4b8c1d5e6f7g2";

it("names the server's instance and its normalized address, and nothing else", () => {
    expect(serverPhoneLinkFormat({ instanceId: TEAM, url: "https://happy.acme.example/" })).toBe(
        `happy://${TEAM}/server?url=https%3A%2F%2Fhappy.acme.example%2F`,
    );
    // A server behind a path prefix keeps it.
    expect(
        serverPhoneLinkFormat({ instanceId: TEAM, url: "https://edge.acme.example/happy/" }),
    ).toBe(`happy://${TEAM}/server?url=https%3A%2F%2Fedge.acme.example%2Fhappy%2F`);
});

it("has no code for a server a phone cannot add this way", () => {
    for (const url of [
        // Not reached over HTTPS, such as a loopback test server.
        "http://localhost:8080/",
        // Not in the host Happy Agent's normal form.
        "https://happy.acme.example",
        "https://HAPPY.acme.example/",
        "https://happy.acme.example:443/",
        "https://user:secret@happy.acme.example/",
        "https://happy.acme.example/?team=1",
        "https://happy.acme.example/#top",
        "not a url",
        `https://happy.acme.example/${"a".repeat(4096)}/`,
    ])
        expect(serverPhoneLinkFormat({ instanceId: TEAM, url }), url).toBeUndefined();
    // Its instance is not known yet.
    expect(serverPhoneLinkFormat({ url: "https://happy.acme.example/" })).toBeUndefined();
});
