import { createRequire } from "node:module";
import { sep } from "node:path";
import { dirname, join, normalize } from "node:path/posix";

const require = createRequire(
    new URL("../packages/happy-desktop-electron/package.json", import.meta.url),
);
const electronBuilderRequire = createRequire(require.resolve("electron-builder/package.json"));
const { extractFile, listPackage } = electronBuilderRequire("@electron/asar");

function packagedPaths(archive) {
    return new Set(
        listPackage(archive).map((path) => path.replaceAll("\\", "/").replace(/^\//u, "")),
    );
}

/**
 * Verify files the main process reads by path rather than imports are packaged,
 * such as the artifact code renderer: a missing one only fails quietly at run time.
 */
export function packagedFilesVerify(archive, files) {
    const packaged = packagedPaths(archive);
    for (const file of files)
        if (!packaged.has(file)) throw new Error(`Packaged file is missing: ${file}`);
}

/** Verify every relative JavaScript import reachable from each packaged process entry. */
export function packagedMainModulesVerify(archive, entries) {
    const packaged = packagedPaths(archive);
    const pending = [...entries];
    const visited = new Set();
    while (pending.length > 0) {
        const file = pending.pop();
        if (visited.has(file)) continue;
        visited.add(file);
        if (!packaged.has(file)) throw new Error(`Packaged Electron module is missing: ${file}`);
        const source = extractFile(archive, file.replaceAll("/", sep)).toString("utf8");
        const imports = source.matchAll(/(?:from\s*|import\s*)\(?\s*["'](\.[^"']+)["']/gu);
        for (const match of imports) {
            const imported = normalize(join(dirname(file), match[1]));
            if (imported.endsWith(".js")) pending.push(imported);
        }
    }
}
