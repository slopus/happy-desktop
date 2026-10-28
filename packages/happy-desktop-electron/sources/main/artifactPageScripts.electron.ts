/**
 * The Electron side of `artifactPageScripts.test.ts`, run in a real Electron.
 *
 * It sets the artifact partition up the way `main.ts` does, serves one site
 * from the files the test hands it, and loads a window whose page carries the
 * app's own Content-Security-Policy and the webview the renderer's
 * `DesktopHtmlPreviewView` draws for an artifact. The guest is admitted, held
 * to its preferences, and bound to its site by the same functions `main.ts`
 * calls. Once the page reports what its scripts did, this writes that to the
 * file the test names and exits.
 */
import { writeFileSync } from "node:fs";
import { Readable } from "node:stream";
import { app, BrowserWindow, protocol, session } from "electron";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DesktopHtmlPreviewView } from "../renderer/desktopHtmlPreviewView";
import { happyArtifactPartition } from "../shared/desktopContract";
import {
    ArtifactGuests,
    artifactGuestAttach,
    artifactSessionConfigure,
    artifactWebPreferencesEnforce,
    artifactWebviewAdmitted,
} from "./artifactBrowser";
import { artifactSiteScheme, artifactSitesCreate, type ArtifactSiteClient } from "./artifactSite";

/** What the test hands over. */
export interface ArtifactPageScriptsCase {
    readonly artifactId: string;
    readonly files: readonly {
        readonly path: string;
        readonly mimeType: string;
        readonly text: string;
    }[];
    /** The app window's own Content-Security-Policy. */
    readonly policy: string;
}

/** The title the page takes once it has finished, followed by its report as JSON. */
const PAGE_DONE = "done ";

const input = JSON.parse(
    process.env.HAPPY_ARTIFACT_PAGE_SCRIPTS ?? "{}",
) as ArtifactPageScriptsCase;
const reportPath = process.env.HAPPY_ARTIFACT_PAGE_SCRIPTS_REPORT ?? "";

// As `main.ts` registers it.
protocol.registerSchemesAsPrivileged([
    {
        scheme: artifactSiteScheme,
        privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true },
    },
]);

const client: ArtifactSiteClient = {
    getArtifactVersion: (async (artifactId: string, number: number) => {
        const file = (entry: ArtifactPageScriptsCase["files"][number]) => ({
            mimeType: entry.mimeType,
            path: entry.path,
            sha256: "0".repeat(64),
            size: Buffer.byteLength(entry.text),
        });
        return {
            version: {
                artifactId,
                createdAt: "2026-10-11T00:00:00.000Z",
                createdBy: { kind: "user", userId: null },
                entry: file(input.files[0]!),
                files: input.files.map(file),
                number,
                source: null,
                title: "Page",
            },
        };
    }) as never,
    openArtifactFile: (async (_artifactId: string, _number: number, path: string) => {
        const entry = input.files.find((candidate) => candidate.path === path);
        const bytes = Buffer.from(entry?.text ?? "");
        return {
            statusCode: entry ? 200 : 404,
            headers: { "content-length": String(bytes.byteLength) },
            body: Readable.from([bytes]),
        };
    }) as never,
    openArtifactApi: (async () => {
        throw new Error("This page has no API.");
    }) as never,
    openArtifactComponent: (async () => {
        throw new Error("Standard components are not part of this fixture.");
    }) as never,
};

void app.whenReady().then(async () => {
    app.dock?.hide();
    const sites = artifactSitesCreate();
    const guests = new ArtifactGuests(sites);
    await artifactSessionConfigure(
        session.fromPartition(happyArtifactPartition, { cache: false }),
        sites,
        guests,
        undefined,
    );
    const source = await sites.register(client).open(input.artifactId, 1);
    const window = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
            contextIsolation: true,
            offscreen: true,
            sandbox: true,
            webviewTag: true,
        },
    });
    const refused: string[] = [];
    const report = (page: unknown): void => {
        writeFileSync(reportPath, JSON.stringify({ refused, page }));
        app.exit(0);
    };
    // A guest that never loads reports nothing of its own; this says so
    // rather than leaving the test to wait for its own deadline.
    setTimeout(() => report(null), 30_000).unref();
    window.webContents.on("will-attach-webview", (event, webPreferences, params) => {
        if (!artifactWebviewAdmitted(params, sites)) {
            refused.push(params.src);
            event.preventDefault();
            return;
        }
        artifactWebPreferencesEnforce(webPreferences);
    });
    window.webContents.on("did-attach-webview", (_event, guest) => {
        artifactGuestAttach(guest, guests, () => undefined);
        guest.on("page-title-updated", (_titleEvent, title) => {
            if (title.startsWith(PAGE_DONE)) report(JSON.parse(title.slice(PAGE_DONE.length)));
        });
    });
    const webview = renderToStaticMarkup(
        createElement(DesktopHtmlPreviewView, {
            canvas: "none",
            partition: happyArtifactPartition,
            popups: true,
            previewFailed: () => undefined,
            previewLoaded: () => undefined,
            source,
        }),
    );
    const policy = input.policy.replaceAll("&", "&amp;").replaceAll('"', "&quot;");
    await window.loadURL(
        `data:text/html;charset=utf-8,${encodeURIComponent(
            `<!doctype html><meta http-equiv="Content-Security-Policy" content="${policy}"><style>webview{display:flex;width:600px;height:400px}</style>${webview}`,
        )}`,
    );
});
