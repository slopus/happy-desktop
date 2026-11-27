import { Kind, Type, type TSchema } from "@sinclair/typebox";
import { TypeCompiler } from "@sinclair/typebox/compiler";
import { Value } from "@sinclair/typebox/value";
import { describe, expect, it } from "vitest";
import { schemaShared } from "./schemaShared.mjs";

/** The `$id` of every distinct subschema object, so one shared object counts once. */
function idsOf(node: unknown, ids: string[] = [], visited = new Set<object>()): string[] {
    if (typeof node !== "object" || node === null || visited.has(node)) return ids;
    visited.add(node);
    if (Kind in node && typeof (node as { $id?: unknown }).$id === "string")
        ids.push((node as { $id: string }).$id);
    for (const child of Object.values(node)) idsOf(child, ids, visited);
    return ids;
}

describe("schemaShared", () => {
    it("never names a shared subschema with an $id the schema already uses", () => {
        const point = Type.Object({ x: Type.String() });
        // Already named what the first shared subschema would otherwise be named.
        const named = Type.Object({ y: Type.Number() }, { $id: "message0" });
        const schema = Type.Object({ a: point, b: point, c: named });
        const shared = schemaShared(schema);

        const ids = idsOf(shared);
        expect(ids).toContain("message0");
        expect(new Set(ids).size).toBe(ids.length);

        const check = TypeCompiler.Compile(shared as TSchema);
        const valid = { a: { x: "" }, b: { x: "" }, c: { y: 1 } };
        const swapped = { a: { x: "" }, b: { x: "" }, c: { x: "" } };
        for (const value of [valid, swapped])
            expect(check.Check(value)).toBe(Value.Check(schema, value));
        expect(check.Check(valid)).toBe(true);
    });

    it("leaves an $id inside a recursive type taken", () => {
        const tree = Type.Recursive(
            (self) =>
                Type.Object({
                    children: Type.Array(self),
                    leaf: Type.Optional(Type.Object({ z: Type.Boolean() }, { $id: "message0" })),
                }),
            { $id: "tree" },
        );
        const point = Type.Object({ x: Type.String() });
        const schema = Type.Object({ a: point, b: point, tree });
        const ids = idsOf(schemaShared(schema));
        expect(ids.filter((id) => id === "message0")).toHaveLength(1);
        expect(new Set(ids).size).toBe(ids.length);
    });
});
