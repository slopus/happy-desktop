/** The addresses outside its own origin that the cloud web app knows. */
export interface CloudWebOrigins {
    /** The accounts service's origin, the only place sign-out may send the page on to. */
    readonly accountsOrigin: string;
    /** Where a person signs out to and switches servers from. */
    readonly pickerUrl: string;
}

/** Production's: what every build uses unless it names others. */
export const CLOUD_WEB_ORIGINS_PRODUCTION: CloudWebOrigins = {
    accountsOrigin: "https://auth.happy.engineering",
    pickerUrl: "https://happybases.com/",
};

/**
 * The addresses a build names in `HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN` and
 * `HAPPY_CLOUD_WEB_PICKER_URL`, else production's; read by the Vite config.
 * Each must be https: the accounts origin a bare origin, the picker its root.
 */
export function cloudWebOriginsRead(env: {
    readonly HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN?: string;
    readonly HAPPY_CLOUD_WEB_PICKER_URL?: string;
}): CloudWebOrigins {
    const accountsOrigin =
        env.HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN || CLOUD_WEB_ORIGINS_PRODUCTION.accountsOrigin;
    const pickerUrl = env.HAPPY_CLOUD_WEB_PICKER_URL || CLOUD_WEB_ORIGINS_PRODUCTION.pickerUrl;
    const accounts = new URL(accountsOrigin);
    if (accounts.protocol !== "https:" || accounts.origin !== accountsOrigin)
        throw new Error(
            `HAPPY_CLOUD_WEB_ACCOUNTS_ORIGIN must be an https origin: ${accountsOrigin}`,
        );
    const picker = new URL(pickerUrl);
    if (picker.protocol !== "https:" || picker.href !== `${picker.origin}/`)
        throw new Error(`HAPPY_CLOUD_WEB_PICKER_URL must be an https origin's root: ${pickerUrl}`);
    return { accountsOrigin, pickerUrl };
}

declare const __HAPPY_CLOUD_WEB_ORIGINS__: CloudWebOrigins | undefined;

/** This build's addresses. */
export const cloudWebOrigins: CloudWebOrigins =
    typeof __HAPPY_CLOUD_WEB_ORIGINS__ !== "undefined"
        ? __HAPPY_CLOUD_WEB_ORIGINS__
        : CLOUD_WEB_ORIGINS_PRODUCTION;
