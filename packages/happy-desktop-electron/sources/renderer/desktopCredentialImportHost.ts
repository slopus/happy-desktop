import {
    UserError,
    type HappyAgentCredentialImportHost,
    type HappyAgentCredentialImportResult,
} from "happy-desktop-state";
import type { DesktopHappyCloud } from "../shared/desktopContract";

/**
 * Settings' credential import for one Happy Cloud server, through the shell:
 * the shell reads this computer's credentials and sends the picked ones to
 * the server, and this window only ever sees them masked.
 */
export function desktopCredentialImportHostCreate(
    cloud: Pick<DesktopHappyCloud, "credentialScan" | "credentialImport">,
    connectionId: string,
): HappyAgentCredentialImportHost {
    return {
        async scan(options) {
            const found = await cloud.credentialScan({ shell: options.shell });
            return found.map((entry) => ({
                id: entry.id,
                vendorName: entry.vendorName,
                use:
                    entry.use.kind === "import"
                        ? { kind: "import" }
                        : entry.use.kind === "signIn"
                          ? { kind: "signIn", providerId: entry.use.providerId }
                          : { kind: "unsupported", reason: entry.use.reason },
                source: entry.source,
                label: entry.label,
                ...(entry.account === undefined ? {} : { account: entry.account }),
                ...(entry.masked === undefined ? {} : { masked: entry.masked }),
            }));
        },
        async import(items) {
            const answer = await cloud.credentialImport(connectionId, items);
            if (!answer.ok) throw new UserError(answer.message, answer.code);
            return new Map(
                answer.value.map((result): [string, HappyAgentCredentialImportResult] => [
                    result.id,
                    result.ok
                        ? {
                              ok: true,
                              duplicate: result.duplicate,
                              ...(result.account === undefined ? {} : { account: result.account }),
                          }
                        : { ok: false, code: result.code, message: result.message },
                ]),
            );
        },
    };
}
