import { Kind, type TSchema } from "@sinclair/typebox";

/* Kinds worth a function of their own; a literal or string check is shorter inline. */
const hoisted = new Set(["Array", "Intersect", "Object", "Record", "Tuple", "Union"]);

/**
 * `schema` with every subschema it reaches more than once given an `$id`, so
 * the compiler checks it in one shared function rather than inlining it at
 * each place; the four roles share the whole block union. A subschema that
 * already has an `$id` is a recursive type and is left as it is. The compiler
 * names a function by its `$id` alone, so a new one never takes an `$id` the
 * schema already uses anywhere, inside those recursive types included.
 */
export function schemaShared(schema: TSchema): TSchema {
    const seen = new Map<object, number>();
    const count = (node: unknown): void => {
        if (typeof node !== "object" || node === null) return;
        const times = (seen.get(node) ?? 0) + 1;
        seen.set(node, times);
        if (times > 1 || (Kind in node && "$id" in node)) return;
        for (const child of Object.values(node)) count(child);
    };
    count(schema);
    const taken = idsOf(schema);
    let next = 0;
    const idFree = (): string => {
        while (taken.has(`message${next}`)) next += 1;
        const id = `message${next}`;
        taken.add(id);
        return id;
    };
    const shared = new Map<object, unknown>();
    const rebuild = (node: unknown): unknown => {
        if (typeof node !== "object" || node === null) return node;
        const known = shared.get(node);
        if (known !== undefined) return known;
        if (Kind in node && "$id" in node) return node;
        let rebuilt: unknown;
        if (Array.isArray(node)) rebuilt = node.map(rebuild);
        else {
            const copy: Record<PropertyKey, unknown> = {};
            for (const key of Reflect.ownKeys(node))
                copy[key] = rebuild((node as Record<PropertyKey, unknown>)[key]);
            if (Kind in node && seen.get(node)! > 1 && hoisted.has(copy[Kind] as string))
                copy.$id = idFree();
            rebuilt = copy;
        }
        shared.set(node, rebuilt);
        return rebuilt;
    };
    return rebuild(schema) as TSchema;
}

/** Every `$id` a schema uses, however deep. */
function idsOf(schema: TSchema): Set<string> {
    const ids = new Set<string>();
    const visited = new Set<object>();
    const visit = (node: unknown): void => {
        if (typeof node !== "object" || node === null || visited.has(node)) return;
        visited.add(node);
        if (Kind in node && typeof (node as { $id?: unknown }).$id === "string")
            ids.add((node as { $id: string }).$id);
        for (const child of Object.values(node)) visit(child);
    };
    visit(schema);
    return ids;
}
