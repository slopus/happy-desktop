/**
 * What a hidden first-launch smoke run reports about itself. Packaged builds
 * refuse Playwright's raw debugger switches, so the smoke reads this file
 * instead of attaching a debugger, then the app quits.
 */
export const desktopSmokeReportEnvironment = "HAPPY_DESKTOP_SMOKE_REPORT";
/** Where the welcome screen's capture goes; written only while it is on screen. */
export const desktopSmokeScreenshotEnvironment = "HAPPY_DESKTOP_SMOKE_SCREENSHOT";

export interface DesktopSmokeWindow {
    readonly visible: boolean;
    readonly focused: boolean;
}

export interface DesktopSmokeReport {
    readonly packaged: boolean;
    readonly platform: string;
    readonly arch: string;
    readonly welcomeVisible: boolean;
    readonly windowTitle: string;
    /**
     * Whether the window's analytics reports, as the window itself says
     * (`DO_NOT_TRACK` or the Settings switch turns it off); null when it did
     * not say.
     */
    readonly analyticsEnabled: boolean | null;
    /**
     * The window runs the published hosted renderer (Nightly), which can be
     * older than this shell and so say nothing about analytics.
     */
    readonly rendererHosted: boolean;
    readonly screenshotWritten: boolean;
    readonly hiddenMode: boolean;
    readonly dockVisible: boolean | null;
    readonly focusedWindow: boolean;
    readonly windows: readonly DesktopSmokeWindow[];
}
