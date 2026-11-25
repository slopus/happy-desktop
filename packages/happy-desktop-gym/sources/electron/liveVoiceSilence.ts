import type { ElectronApplication, Page } from "playwright";
import type { LiveVoiceMedia } from "./liveVoiceMedia.js";

/**
 * Chromium's own automated-testing switch: audio sent to the output device is
 * muted in the audio service, whatever the page does.
 */
export const LIVE_VOICE_MUTE_SWITCH = "--mute-audio";

export interface LiveVoiceSilence {
    readonly switchPresent: boolean;
    readonly webContents: readonly { readonly id: number; readonly muted: boolean }[];
    readonly outputs: readonly { readonly muted: boolean; readonly volume: number }[];
}

/**
 * A live call's received audio is recorded, never played on the Mac's
 * speakers. Three independent layers keep it silent: the Chromium switch, every
 * WebContents muted by main (including any created later), and every media
 * element the page plays locked muted by `liveVoiceMediaInstall`.
 */
export async function liveVoiceSpeakersMute(app: ElectronApplication): Promise<void> {
    await app.evaluate(({ app: electronApp, webContents }) => {
        electronApp.on("web-contents-created", (_event, contents) => contents.setAudioMuted(true));
        for (const contents of webContents.getAllWebContents()) contents.setAudioMuted(true);
    });
}

/** Reads every layer and refuses to continue unless all of them are silent. */
export async function liveVoiceSpeakersVerify(
    app: ElectronApplication,
    page: Page,
): Promise<LiveVoiceSilence> {
    const main = await app.evaluate(({ app: electronApp, webContents }) => ({
        switchPresent: electronApp.commandLine.hasSwitch("mute-audio"),
        webContents: webContents
            .getAllWebContents()
            .map((contents) => ({ id: contents.id, muted: contents.isAudioMuted() })),
    }));
    const outputs = await page.evaluate(() =>
        (window as Window & { voiceGym?: LiveVoiceMedia }).voiceGym!.outputs(),
    );
    const silence = { ...main, outputs };
    if (
        !silence.switchPresent ||
        silence.webContents.length === 0 ||
        silence.webContents.some((contents) => !contents.muted) ||
        silence.outputs.some((output) => !output.muted || output.volume !== 0)
    )
        throw new Error(`The desktop window is not silent: ${JSON.stringify(silence)}`);
    return silence;
}
