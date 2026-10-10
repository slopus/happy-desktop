import { afterEach, describe, expect, it, vi } from "vitest";

const childProcess = vi.hoisted(() => ({ execFile: vi.fn() }));
vi.mock("node:child_process", async (importOriginal) => ({
    ...(await importOriginal<typeof import("node:child_process")>()),
    execFile: childProcess.execFile,
}));

import {
    defaultProcessHost,
    localRuntimeProbe,
    windowsExpand,
    windowsPathMerge,
    windowsRegistryPathParse,
    windowsRuntimeProbe,
    type HappyAgentProcessHost,
} from "./localHappyAgent";

const HKLM = "HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment";
const HKCU = "HKCU\\Environment";

const launch: NodeJS.ProcessEnv = {
    APPDATA: "C:\\Users\\alice\\AppData\\Roaming",
    Path: "C:\\Windows\\system32;C:\\Windows",
    SystemRoot: "C:\\Windows",
    USERPROFILE: "C:\\Users\\alice",
};

function registryOutput(key: string, type: string, value: string): string {
    return `\r\n${key}\r\n    Path    ${type}    ${value}\r\n\r\n`;
}

interface Call {
    readonly executable: string;
    readonly arguments_: readonly string[];
    readonly env?: NodeJS.ProcessEnv;
    readonly timeoutMs?: number;
}

/**
 * A machine whose commands live in `installed` (folder → file names) and whose
 * registry answers `registry` by key; a missing key fails like `reg.exe` does.
 */
function hostCreate(
    installed: Record<string, readonly string[]>,
    registry: Partial<Record<string, string | Error>>,
): HappyAgentProcessHost & { readonly calls: Call[] } {
    const calls: Call[] = [];
    return {
        calls,
        async execFile(executable, arguments_, options) {
            calls.push({ executable, arguments_, ...options });
            if (executable === "reg.exe") {
                const answer = registry[arguments_[1] ?? ""];
                if (answer instanceof Error) throw answer;
                if (answer === undefined)
                    throw new Error(
                        "ERROR: The system was unable to find the specified registry key or value.",
                    );
                return { stdout: answer, stderr: "" };
            }
            if (executable === "where.exe") {
                const command = arguments_[0] ?? "";
                for (const folder of (options.env?.PATH ?? "").split(";")) {
                    const file = (installed[folder] ?? []).find((name) =>
                        name.toLowerCase().startsWith(`${command}.`),
                    );
                    if (file) return { stdout: `${folder}\\${file}\r\n`, stderr: "" };
                }
                throw new Error("INFO: Could not find files for the given pattern(s).");
            }
            throw new Error(`Unexpected ${executable}`);
        },
    };
}

describe("Windows PATH refresh", () => {
    it("reads the registry's PATH value, expanding REG_EXPAND_SZ variables", () => {
        expect(
            windowsRegistryPathParse(
                registryOutput(HKCU, "REG_EXPAND_SZ", "%USERPROFILE%\\.local\\bin;C:\\Tools"),
            ),
        ).toBe("%USERPROFILE%\\.local\\bin;C:\\Tools");
        expect(windowsRegistryPathParse(registryOutput(HKCU, "REG_SZ", "C:\\Tools"))).toBe(
            "C:\\Tools",
        );
        expect(windowsRegistryPathParse(`\r\n${HKCU}\r\n    Other    REG_SZ    x\r\n`)).toBe(
            undefined,
        );
        expect(
            windowsExpand("%userprofile%\\.local\\bin;%MISSING%\\bin;%SystemRoot%", launch),
        ).toBe("C:\\Users\\alice\\.local\\bin;%MISSING%\\bin;C:\\Windows");
        expect(
            windowsPathMerge(
                ["C:\\Windows\\system32", "C:\\Windows"],
                ["c:\\windows\\System32\\", "C:\\Tools"],
            ),
        ).toBe("C:\\Windows\\system32;C:\\Windows;C:\\Tools");
    });

    it("finds a command an installer put on the user PATH after Happy started", async () => {
        const host = hostCreate(
            { "C:\\Users\\alice\\.local\\bin": ["claude.exe"], "C:\\Windows": ["notepad.exe"] },
            {
                [HKLM]: registryOutput(
                    HKLM,
                    "REG_EXPAND_SZ",
                    "%SystemRoot%\\system32;%SystemRoot%",
                ),
                [HKCU]: registryOutput(HKCU, "REG_EXPAND_SZ", "%USERPROFILE%\\.local\\bin"),
            },
        );
        const probe = await windowsRuntimeProbe(host, launch, async () => false);

        expect(probe.assistants).toEqual({ claude: "C:\\Users\\alice\\.local\\bin\\claude.exe" });
        expect(probe.assistantsRefreshed).toEqual(["claude"]);
        expect(probe.environment.PATH).toBe(
            "C:\\Windows\\system32;C:\\Windows;C:\\Users\\alice\\.local\\bin",
        );
        // One PATH name only, so a child cannot see two different answers.
        expect(
            Object.keys(probe.environment).filter((key) => key.toLowerCase() === "path"),
        ).toEqual(["PATH"]);
        const registryCalls = host.calls.filter((call) => call.executable === "reg.exe");
        expect(registryCalls.map((call) => call.arguments_)).toEqual([
            ["query", HKLM, "/v", "Path"],
            ["query", HKCU, "/v", "Path"],
        ]);
        expect(registryCalls.every((call) => call.timeoutMs === 2_000)).toBe(true);
        expect(
            host.calls
                .filter((call) => call.executable === "where.exe")
                .every((call) => call.env?.PATH === probe.environment.PATH),
        ).toBe(true);
    });

    it("does not mark a command that was already on the launch PATH as refreshed", async () => {
        const host = hostCreate(
            { "C:\\Windows": ["claude.exe"] },
            { [HKCU]: registryOutput(HKCU, "REG_SZ", "C:\\Tools") },
        );
        const probe = await windowsRuntimeProbe(host, launch, async () => false);
        expect(probe.assistants).toEqual({ claude: "C:\\Windows\\claude.exe" });
        expect(probe.assistantsRefreshed).toEqual([]);
    });

    it("falls back to the launch PATH when a registry read fails or times out", async () => {
        const timedOut = Object.assign(new Error("Command failed: reg.exe"), { killed: true });
        const host = hostCreate(
            { "C:\\Windows": ["codex.cmd"] },
            { [HKLM]: timedOut /* HKCU is missing entirely */ },
        );
        const probe = await windowsRuntimeProbe(host, launch, async () => false);
        expect(probe.environment.PATH).toBe("C:\\Windows\\system32;C:\\Windows");
        expect(probe.assistants).toEqual({ codex: "C:\\Windows\\codex.cmd" });
        expect(probe.assistantsRefreshed).toEqual([]);
    });

    it("finds each assistant at its installer's default location when no PATH has it", async () => {
        const host = hostCreate({}, {});
        const present = new Set([
            "C:\\Users\\alice\\.local\\bin\\claude.exe",
            "C:\\Users\\alice\\AppData\\Roaming\\npm\\codex.cmd",
            "C:\\Users\\alice\\.grok\\bin\\grok.exe",
        ]);
        const checked: string[] = [];
        const probe = await windowsRuntimeProbe(host, launch, async (path) => {
            checked.push(path);
            return present.has(path);
        });
        expect(checked.sort()).toEqual([...present].sort());
        expect(probe.assistants).toEqual({
            claude: "C:\\Users\\alice\\.local\\bin\\claude.exe",
            codex: "C:\\Users\\alice\\AppData\\Roaming\\npm\\codex.cmd",
            grok: "C:\\Users\\alice\\.grok\\bin\\grok.exe",
        });
        expect(probe.assistantsRefreshed).toEqual(["claude", "codex", "grok"]);
    });

    it("hides the console window of every command the probe runs", async () => {
        childProcess.execFile.mockImplementation(
            (
                executable: string,
                arguments_: readonly string[],
                _options: unknown,
                callback: (error: Error | null, stdout: string, stderr: string) => void,
            ) => {
                if (executable === "reg.exe" && arguments_[1] === HKCU)
                    callback(null, registryOutput(HKCU, "REG_SZ", "C:\\Tools"), "");
                else callback(new Error("not found"), "", "");
            },
        );
        await windowsRuntimeProbe(defaultProcessHost, launch, async () => false);

        const calls = childProcess.execFile.mock.calls as [
            string,
            string[],
            { windowsHide?: boolean; shell?: unknown; timeout?: number },
        ][];
        const executables = calls.map(([executable]) => executable);
        expect(executables).toEqual(expect.arrayContaining(["reg.exe", "where.exe"]));
        for (const [executable, , options] of calls) {
            expect(options.windowsHide, executable).toBe(true);
            expect(options.shell, executable).toBeUndefined();
        }
        expect(
            calls.filter(([executable]) => executable === "reg.exe").map(([, , o]) => o.timeout),
        ).toEqual([2_000, 2_000]);
    });
});

describe.skipIf(process.platform === "win32")("POSIX runtime probe", () => {
    afterEach(() => childProcess.execFile.mockReset());

    it("asks only the login shell and never refreshes anything", async () => {
        const calls: string[] = [];
        const host: HappyAgentProcessHost = {
            async execFile(executable) {
                calls.push(executable);
                return {
                    stdout: [
                        "__HAPPY_NODE_PATH__=/usr/bin/node",
                        "__HAPPY_NODE_VERSION__=v22.11.0",
                        "__HAPPY_CLAUDE_PATH__=/Users/alice/.local/bin/claude",
                        "__HAPPY_CODEX_PATH__=",
                        "__HAPPY_GROK_PATH__=",
                        "PATH=/usr/bin:/Users/alice/.local/bin",
                        "",
                    ].join("\0"),
                    stderr: "",
                };
            },
        };
        const probe = await localRuntimeProbe(host, { SHELL: "/bin/zsh" }, "/bin/zsh");
        expect(calls).toEqual(["/bin/zsh"]);
        expect(probe.assistants).toEqual({ claude: "/Users/alice/.local/bin/claude" });
        expect(probe.assistantsRefreshed).toEqual([]);
    });
});
