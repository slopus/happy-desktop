import { expect, it } from "vitest";
import { cloudAuthProductionRedirectUri } from "../shared/cloudAuthConfig";
import { cloudAuthCallbackRead } from "./cloudAuthCallback";

function callbackFromArguments(argv: readonly string[]): string | undefined {
    for (const argument of argv) {
        const callback = cloudAuthCallbackRead(argument, cloudAuthProductionRedirectUri);
        if (callback) return callback;
    }
    return undefined;
}

it("hands on a Windows callback as the redirect URI the sign-in sent", () => {
    // Windows adds a `/` path to the registered `"Happy.exe" "%1"` command's URL.
    const argv = [
        "C:\\Users\\r\\AppData\\Local\\Programs\\happy-desktop\\Happy.exe",
        "--allow-file-access-from-files",
        "happy-auth://callback/?code=01JC7Q4M2X9V8T6R5P3N1K0H2G&state=s7Yp",
    ];
    expect(callbackFromArguments(argv)).toBe(
        "happy-auth://callback?code=01JC7Q4M2X9V8T6R5P3N1K0H2G&state=s7Yp",
    );
    expect(
        cloudAuthCallbackRead("HAPPY-AUTH://callback/?code=c&state=s", "happy-auth://callback"),
    ).toBe("happy-auth://callback?code=c&state=s");
});

it("hands on a Linux xdg-open callback unchanged", () => {
    const argv = ["/opt/Happy/happy-desktop", "happy-auth://callback?code=c&state=s"];
    expect(callbackFromArguments(argv)).toBe("happy-auth://callback?code=c&state=s");
});

it("takes only the callback protocol and host", () => {
    expect(
        cloudAuthCallbackRead("happy://callback/?code=c", "happy-auth://callback"),
    ).toBeUndefined();
    expect(
        cloudAuthCallbackRead("happy-auth://other/?code=c", "happy-auth://callback"),
    ).toBeUndefined();
    expect(cloudAuthCallbackRead("not a url", "happy-auth://callback")).toBeUndefined();
});
