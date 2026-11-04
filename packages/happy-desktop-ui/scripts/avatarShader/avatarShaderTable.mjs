// Reads happy-ios's AvatarShaderTable.swift: what the shader draws each of the
// 200 avatar placeholders with (its effect, colours, layout, angle and phase).
// That table is made by happy-ios's `scripts/generate-avatar-shader-table.mjs`
// from @craftedstudios/shaders' own `resolve` and `angleOf`, so desktop draws
// the same placeholder for the same index as the phone, to the digit.
import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The table in the happy checkout at `happy`, and the package version it names. */
export function avatarShaderTableRead(happy) {
    const swift = readFileSync(
        join(happy, "packages/happy-ios/Sources/HappyLayout/AvatarShaderTable.swift"),
        "utf8",
    );
    const version = /@craftedstudios\/shaders (\S+) \(MIT/.exec(swift)?.[1];
    if (!version)
        throw new Error("The Swift table does not name its @craftedstudios/shaders version");
    const numbers = (text) => text.split(",").map((value) => Number(value.trim()));
    const rows = [
        ...swift.matchAll(
            /\.init\(effect: \.(\w+), colors: \[(.*?)\], layout: SIMD4\((.*?)\), angle: (\S+), phase: (\S+)\),/g,
        ),
    ].map(([, effect, colors, layout, angle, phase]) => ({
        effect,
        colors: [...colors.matchAll(/SIMD3\((.*?)\)/g)].map(([, rgb]) => numbers(rgb)),
        layout: numbers(layout),
        angle: Number(angle),
        phase: Number(phase),
    }));
    if (rows.length !== 200) throw new Error(`The Swift table has ${rows.length} rows, not 200`);
    for (const row of rows) {
        if (row.colors.length !== 4 || row.colors.some((rgb) => rgb.length !== 3))
            throw new Error(
                `A row has colours other than four RGB triples: ${JSON.stringify(row)}`,
            );
        if (row.layout.length !== 4 || [...row.layout, row.angle, row.phase].some(Number.isNaN))
            throw new Error(`A row has an unreadable number: ${JSON.stringify(row)}`);
    }
    return { version, rows };
}
