import {
    fieldContours,
    lobeField,
    lobeReach,
    loopResample,
    loopsPath,
    profileSampled,
    smoothUnion,
    stemCellBodies,
    type CellField,
    type CellLobe,
    type CellProfile,
} from "./cellField";
import {
    HAPPY_CELL_REST,
    happyCellNextSeed,
    happyCellPose,
    happyCellSeeded,
    type HappyCellShape,
} from "./happyCellGeometry";
import type { Point } from "./stemCellGeometry";

/** A mark's box in its animation canvas, in CSS pixels. */
export interface DivisionRect {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
}

/** A damped spring that keeps its velocity when its target moves. */
class Spring {
    constructor(
        public value: number,
        public target: number,
        private omega: number,
        private zeta: number,
        public velocity = 0,
    ) {}
    step(dt: number): void {
        const pull = this.omega * this.omega * (this.target - this.value);
        this.velocity += (pull - 2 * this.zeta * this.omega * this.velocity) * dt;
        this.value += this.velocity * dt;
    }
    settled(tolerance: number): boolean {
        return (
            Math.abs(this.target - this.value) < tolerance &&
            Math.abs(this.velocity) < tolerance * 10
        );
    }
    /** An identical spring: it moves exactly as this one while their targets agree. */
    twin(): Spring {
        return new Spring(this.value, this.target, this.omega, this.zeta, this.velocity);
    }
    /** The same motion, now heading for `target`. */
    retargeted(target: number): Spring {
        return new Spring(this.value, target, this.omega, this.zeta, this.velocity);
    }
    /** Keeps going from where it is, with a different stiffness and damping. */
    retune(motion: { omega: number; zeta: number }): void {
        this.omega = motion.omega;
        this.zeta = motion.zeta;
    }
    land(): void {
        this.value = this.target;
        this.velocity = 0;
    }
}

const Body = { omega: 13, zeta: 0.74 } as const;
const Travel = { omega: 9.5, zeta: 0.85 } as const;
const Shape = { omega: 11, zeta: 1 } as const;
const Neck = { omega: 15, zeta: 1 } as const;
const Thread = { omega: 11, zeta: 1 } as const;
/** The neck's radius at the start, and the fillet where it meets each cell, per px of mark. */
const NECK = 0.11;
const FILLET = 0.08;
/** How far along its way a daughter is when its neck starts to thin. */
const THIN_FROM = 0.2;

/** The numbers of a lobe that move: everything but its outline. */
const MOVING = ["x", "y", "size", "stretch", "tilt", "bend", "length"] as const;
type Moving = (typeof MOVING)[number];
const resting: Record<Moving, number> = {
    x: 0,
    y: 0,
    size: 0,
    stretch: 1,
    tilt: 0,
    bend: 0,
    length: 0,
};

/** One lobe whose every number is a spring, with its core riding inside it. */
class SpringLobe {
    constructor(
        readonly moving: Record<Moving, Spring>,
        readonly blend: Spring,
        public from: CellProfile,
        public to: CellProfile,
    ) {}
    get x(): Spring {
        return this.moving.x;
    }
    get y(): Spring {
        return this.moving.y;
    }
    get size(): Spring {
        return this.moving.size;
    }
    get springs(): Spring[] {
        return [...MOVING.map((key) => this.moving[key]), this.blend];
    }
    /**
     * Heads for a new outline from the one it has now: the current mix is
     * frozen as the start, so the outline does not move at the switch.
     */
    reshape(to: CellProfile): void {
        // Sampled, so outlines frozen division after division never nest.
        this.from = profileSampled(this.profileNow());
        this.to = to;
        this.blend.value = 0;
        this.blend.velocity = 0;
    }
    static at(lobe: CellLobe, motion: { omega: number; zeta: number }): SpringLobe {
        const spring = (value: number, m = motion) => new Spring(value, value, m.omega, m.zeta);
        const moving = Object.fromEntries(
            MOVING.map((key) => [key, spring(lobe[key] ?? resting[key])]),
        ) as Record<Moving, Spring>;
        return new SpringLobe(moving, spring(lobe.blend, Shape), lobe.from, lobe.to);
    }
    twin(): SpringLobe {
        const moving = Object.fromEntries(
            MOVING.map((key) => [key, this.moving[key].twin()]),
        ) as Record<Moving, Spring>;
        return new SpringLobe(moving, this.blend.twin(), this.from, this.to);
    }
    /** The outline as it is now, frozen, so the lobe can head somewhere new. */
    profileNow(): CellProfile {
        const { from, to } = this;
        const u = this.blend.value;
        return (theta) => from(theta) * (1 - u) + to(theta) * u;
    }
    /** Heads for `lobe` as it is drawn now, outline and all, from where it is. */
    morph(lobe: CellLobe): void {
        const { from, to, blend } = lobe;
        this.reshape(
            blend <= 0
                ? from
                : blend >= 1
                  ? to
                  : (theta) => from(theta) * (1 - blend) + to(theta) * blend,
        );
        this.aim({ ...lobe, blend: 1 });
    }
    aim(lobe: CellLobe): void {
        for (const key of MOVING) this.moving[key].target = lobe[key] ?? resting[key];
        this.blend.target = lobe.blend;
    }
    lobe(): CellLobe {
        const values = Object.fromEntries(
            MOVING.map((key) => [key, this.moving[key].value]),
        ) as Record<Moving, number>;
        return { ...values, from: this.from, to: this.to, blend: this.blend.value };
    }
}

/** A cell part: a membrane lobe with the core inside it, offset from its centre. */
interface Part {
    membrane: SpringLobe;
    core: SpringLobe;
}

interface Daughter extends Part {
    readonly id: string;
    /** The fillet between it and Happy, membrane and core. */
    readonly join: Spring;
    readonly coreJoin: Spring;
    /**
     * The neck: a tube from Happy's centre to the daughter's, this radius. It
     * starts inside the waist, stretches as the daughter leaves, then thins to a
     * thread and breaks as the radius passes zero; below zero its stubs draw
     * back into both cells.
     */
    readonly neck: Spring;
    /** Where it set out from, to tell how far along it is. */
    readonly start: Point;
    thinning: boolean;
    snapped: boolean;
    /** It has come to rest in its row, reported once. */
    arrived: boolean;
}

/** How still a daughter must be to count as in its row: still to the eye, before the last fraction of a pixel. */
const ARRIVED = 0.5;

export interface DivisionFrame {
    /** Membrane and cores, as SVG paths in canvas pixels. */
    readonly membrane: string;
    readonly core: string;
}

/** A pose placed in a mark's box on the canvas. */
function placedIn(lobe: CellLobe, rect: DivisionRect): CellLobe {
    return {
        ...lobe,
        x: rect.x + lobe.x * rect.width,
        y: rect.y + lobe.y * rect.width,
        size: lobe.size * rect.width,
    };
}

/** A part's core as an offset from its membrane's centre. */
function coreOffset(core: CellLobe, membrane: CellLobe): CellLobe {
    return { ...core, x: core.x - membrane.x, y: core.y - membrane.y };
}

function stemCellTarget(id: string, rect: DivisionRect) {
    const bodies = stemCellBodies(id);
    const membrane: CellLobe = {
        x: rect.x + bodies.membrane.centre[0] * rect.width,
        y: rect.y + bodies.membrane.centre[1] * rect.width,
        size: bodies.membrane.size * rect.width,
        stretch: 1,
        from: bodies.membrane.profile,
        to: bodies.membrane.profile,
        blend: 1,
    };
    const core: CellLobe = {
        x: (bodies.core.centre[0] - bodies.membrane.centre[0]) * rect.width,
        y: (bodies.core.centre[1] - bodies.membrane.centre[1]) * rect.width,
        size: bodies.core.size * rect.width,
        stretch: 1,
        from: bodies.core.profile,
        to: bodies.core.profile,
        blend: 1,
    };
    return { membrane, core };
}

/**
 * Happy dividing on screen: its right lobe peels away underneath, stretches a
 * neck that thins and lets go, and slides into a new row as that row's stem
 * cell, while what is left of Happy swells round and starts to divide again.
 * Every quantity is a spring that keeps its velocity, so nothing steps; the
 * outline is traced afresh from the field every frame.
 */
export class HappyCellDivisionSim {
    /** Happy's shape as it is, or will be once it has formed again. */
    private shape: HappyCellShape;
    private rest;
    private round;
    private parent: Part;
    private bud: Part;
    private budJoin: Spring;
    private budCoreJoin: Spring;
    private readonly daughters: Daughter[] = [];
    private targets = new Map<string, DivisionRect>();
    private regrowing = false;
    private clock: number | undefined;
    private reported = false;

    constructor(
        private readonly from: DivisionRect,
        shape: HappyCellShape,
    ) {
        this.shape = shape;
        ({ rest: this.rest, round: this.round } = this.posesOf(shape));
        const springPart = (p: { membrane: CellLobe; core: CellLobe }): Part => ({
            membrane: SpringLobe.at(p.membrane, Body),
            core: SpringLobe.at(p.core, Body),
        });
        this.parent = springPart(this.rest.left);
        this.bud = springPart(this.rest.right);
        this.budJoin = new Spring(this.rest.join, this.rest.join, Neck.omega, Neck.zeta);
        this.budCoreJoin = new Spring(this.rest.coreJoin, this.rest.coreJoin, Neck.omega, 1);
    }

    /** Happy at rest and swollen round, placed on screen. */
    private posesOf(shape: HappyCellShape) {
        const rest = happyCellPose(shape, HAPPY_CELL_REST);
        const lobe = (l: CellLobe) => placedIn(l, this.from);
        const part = (i: 0 | 1, pose = rest): { membrane: CellLobe; core: CellLobe } => {
            const membrane = lobe(pose.lobes[i]);
            return { membrane, core: coreOffset(lobe(pose.cores[i]), membrane) };
        };
        return {
            rest: {
                left: part(0),
                right: part(1),
                join: rest.join * this.from.width,
                coreJoin: rest.coreJoin * this.from.width,
            },
            round: part(0, happyCellPose(shape, 0)),
        };
    }

    /** The membrane seed Happy rests with once every division has settled. */
    get seed(): number {
        return this.shape.seed;
    }

    /**
     * Divide again: the bud Happy has now leaves for `to` and becomes stem cell
     * `id` there. Safe at any moment, including mid-division. For an `id` it
     * has already made, a different `to` re-aims that daughter; it returns
     * false.
     */
    divide(id: string, to: DivisionRect): boolean {
        const known = this.targets.get(id);
        if (known) {
            if (known.x !== to.x || known.y !== to.y || known.width !== to.width) {
                // Its row moved: it glides on toward the new place.
                this.targets.set(id, to);
                const daughter = this.daughters.find((d) => d.id === id);
                const target = stemCellTarget(id, to);
                daughter?.membrane.aim(target.membrane);
                daughter?.core.aim(target.core);
                this.reported = false;
            }
            return false;
        }
        this.targets.set(id, to);
        const bud = this.bud;
        const target = stemCellTarget(id, to);
        // Its centre travels; its outline, size and core settle into the stem cell.
        bud.membrane.x.retune(Travel);
        bud.membrane.y.retune(Travel);
        bud.membrane.reshape(target.membrane.to);
        bud.core.reshape(target.core.to);
        bud.membrane.aim(target.membrane);
        bud.core.aim(target.core);
        this.daughters.push({
            id,
            membrane: bud.membrane,
            core: bud.core,
            join: this.budJoin.retargeted(to.width * FILLET),
            coreJoin: this.budCoreJoin.retargeted(0),
            neck: new Spring(
                this.from.width * NECK,
                this.from.width * NECK * 0.8,
                Thread.omega,
                Thread.zeta,
            ),
            start: [bud.membrane.x.value, bud.membrane.y.value],
            thinning: false,
            arrived: false,
            snapped: false,
        });
        // What is left of Happy forms again from a new seed: its outline morphs
        // there while it swells round, so it never pops.
        this.shape = happyCellSeeded(this.shape, happyCellNextSeed(this.shape.seed));
        ({ rest: this.rest, round: this.round } = this.posesOf(this.shape));
        // A new bud, exactly where the parent is and joined with no fillet, is
        // the parent alone: nothing on screen changes until it moves.
        this.bud = { membrane: this.parent.membrane.twin(), core: this.parent.core.twin() };
        this.budJoin = new Spring(0, 0, Neck.omega, Neck.zeta);
        this.budCoreJoin = new Spring(0, 0, Neck.omega, Neck.zeta);
        for (const part of [this.parent, this.bud]) {
            part.membrane.morph(this.round.membrane);
            part.core.morph(this.round.core);
        }
        this.regrowing = false;
        this.reported = false;
        return true;
    }

    /** What is left of Happy has swollen round: it starts to divide again. */
    private regrow(): void {
        this.regrowing = true;
        this.parent.membrane.morph(this.rest.left.membrane);
        this.parent.core.morph(this.rest.left.core);
        // The bud takes on the right half's outline as it swells out.
        this.bud.membrane.morph(this.rest.right.membrane);
        this.bud.core.morph(this.rest.right.core);
        this.budJoin.target = this.rest.join;
        this.budCoreJoin.target = this.rest.coreJoin;
    }

    private springs(): Spring[] {
        return [
            ...this.parts().flatMap((part) => [...part.membrane.springs, ...part.core.springs]),
            this.budJoin,
            this.budCoreJoin,
            ...this.daughters.flatMap((daughter) => [
                daughter.join,
                daughter.coreJoin,
                daughter.neck,
            ]),
        ];
    }

    private parts(): Part[] {
        return [this.parent, this.bud, ...this.daughters];
    }

    /**
     * Advance to `now`, an animation frame's time in milliseconds. A frame the
     * browser dropped is caught up in time, never skipped in space.
     */
    advance(now: number): void {
        const seconds = this.clock === undefined ? 0 : Math.min((now - this.clock) / 1000, 1 / 20);
        this.clock = now;
        this.step(Math.max(seconds, 0));
        if (this.settled()) this.land();
    }

    /**
     * The daughters that have come to rest in their rows since last asked,
     * each once: let go of Happy and still to the eye, while Happy may still
     * be forming again.
     */
    arrivedReport(): string[] {
        const arrived: string[] = [];
        for (const daughter of this.daughters) {
            if (daughter.arrived || !daughter.snapped) continue;
            const springs = [
                ...daughter.membrane.springs,
                ...daughter.core.springs,
                daughter.join,
                daughter.coreJoin,
            ];
            if (!springs.every((spring) => spring.settled(ARRIVED))) continue;
            daughter.arrived = true;
            arrived.push(daughter.id);
        }
        return arrived;
    }

    /** True once each time everything comes to rest. */
    restReport(): boolean {
        if (this.reported || !this.settled()) return false;
        this.reported = true;
        return true;
    }

    /** Advance by `seconds`, in fixed sub-steps so every run is the same. */
    step(seconds: number): void {
        const dt = 1 / 480;
        for (let t = 0; t < seconds - 1e-9; t += dt) {
            for (const spring of this.springs()) spring.step(dt);
            for (const daughter of this.daughters) {
                if (daughter.snapped) continue;
                const p = this.parent.membrane;
                const d = daughter.membrane;
                const [sx, sy] = daughter.start;
                const way = Math.hypot(d.x.target - sx, d.y.target - sy);
                const along = way > 0 ? Math.hypot(d.x.value - sx, d.y.value - sy) / way : 1;
                if (!daughter.thinning && along > THIN_FROM) {
                    daughter.thinning = true;
                    daughter.neck.target = -1.5 * FILLET * this.from.width;
                }
                const gap =
                    Math.hypot(d.x.value - p.x.value, d.y.value - p.y.value) -
                    p.size.value -
                    d.size.value;
                if (daughter.neck.value < 0 && gap > daughter.join.value / 2) {
                    daughter.snapped = true;
                    daughter.join.target = 0;
                }
            }
            const swollen = this.parent.membrane.size.settled(this.from.width * 0.03);
            if (!this.regrowing && swollen && this.daughters.every((d) => d.snapped)) this.regrow();
        }
    }

    /** Whether everything has come to rest: Happy whole again, every daughter in its row. */
    settled(): boolean {
        return this.regrowing && this.springs().every((spring) => spring.settled(0.04));
    }

    /** Puts every spring exactly on its target, once settled. */
    land(): void {
        for (const spring of this.springs()) spring.land();
    }

    frame(): DivisionFrame {
        const scale = this.from.width;
        const corePlaced = (part: Part): CellLobe => {
            const core = part.core.lobe();
            return {
                ...core,
                x: part.membrane.x.value + core.x,
                y: part.membrane.y.value + core.y,
            };
        };
        return {
            membrane: traced(
                {
                    parent: this.parent.membrane.lobe(),
                    bud: this.bud.membrane.lobe(),
                    join: this.budJoin.value,
                },
                this.daughters.map((d) => ({
                    lobe: d.membrane.lobe(),
                    join: d.join.value,
                    neck: {
                        x0: this.parent.membrane.x.value,
                        y0: this.parent.membrane.y.value,
                        radius: d.neck.value,
                        fillet: FILLET * scale,
                    },
                })),
                scale / 64,
                scale / 36,
            ),
            core: traced(
                {
                    parent: corePlaced(this.parent),
                    bud: corePlaced(this.bud),
                    join: this.budCoreJoin.value,
                },
                this.daughters.map((d) => ({ lobe: corePlaced(d), join: d.coreJoin.value })),
                scale / 128,
                scale / 72,
            ),
        };
    }
}

interface Joined {
    readonly lobe: CellLobe;
    /** Its fillet with Happy. Daughters never blend with one another. */
    readonly join: number;
    /** A tube from (x0, y0) to the lobe's centre, filleted into Happy. */
    readonly neck?: { x0: number; y0: number; radius: number; fillet: number };
}

/** Distance from (x, y) to the segment from (x0, y0) to (x1, y1). */
function segmentDistance(x: number, y: number, x0: number, y0: number, x1: number, y1: number) {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const length = dx * dx + dy * dy;
    const t = length > 0 ? Math.min(Math.max(((x - x0) * dx + (y - y0) * dy) / length, 0), 1) : 0;
    return Math.hypot(x - x0 - dx * t, y - y0 - dy * t);
}

/**
 * Happy — parent and bud joined — with each daughter joined to Happy alone,
 * traced. Daughters far enough apart are traced on their own small grids, all
 * snapped to one lattice, so an outline does not shift when a group splits.
 */
function traced(
    happy: { parent: CellLobe; bud: CellLobe; join: number },
    daughters: readonly Joined[],
    step: number,
    spacing: number,
): string {
    const parent = lobeField(happy.parent);
    const bud = lobeField(happy.bud);
    const happyField: CellField = (x, y) => smoothUnion(parent(x, y), bud(x, y), happy.join);
    const happyReach = Math.max(lobeReach(happy.parent), lobeReach(happy.bud));
    const fields = daughters.map((d) => lobeField(d.lobe));
    // Group 0 is Happy; daughters join a group when they could touch it.
    const members: { x: number; y: number; reach: number }[] = [
        {
            x: happy.parent.x,
            y: happy.parent.y,
            reach:
                happyReach + Math.hypot(happy.bud.x - happy.parent.x, happy.bud.y - happy.parent.y),
        },
        ...daughters.map((d) => ({ x: d.lobe.x, y: d.lobe.y, reach: lobeReach(d.lobe) })),
    ];
    const widest = Math.max(happy.join, ...daughters.map((d) => d.join));
    // A daughter still held by its neck is part of Happy's group however far it is.
    const held = (i: number) => {
        const neck = daughters[i - 1]?.neck;
        return neck !== undefined && neck.radius > -neck.fillet;
    };
    const group = members.map((_, i) => i);
    const root = (i: number): number => (group[i] === i ? i : root(group[i]!));
    for (let i = 1; i < members.length; i++)
        for (let j = 0; j < i; j++) {
            const a = members[i]!;
            const b = members[j]!;
            if (
                Math.hypot(a.x - b.x, a.y - b.y) < a.reach + b.reach + widest ||
                (j === 0 && held(i))
            )
                group[root(i)] = root(j);
        }
    const loops: Point[][] = [];
    for (const head of new Set(members.map((_, i) => root(i)))) {
        const inGroup = members.flatMap((_, i) => (root(i) === head ? [i] : []));
        const withHappy = inGroup.includes(0);
        const own = inGroup.filter((i) => i > 0).map((i) => i - 1);
        const field: CellField = (x, y) => {
            let value = Infinity;
            if (withHappy) {
                const h = happyField(x, y);
                value = h;
                for (const i of own) {
                    const { lobe, join, neck } = daughters[i]!;
                    const reach = neck
                        ? smoothUnion(
                              h,
                              segmentDistance(x, y, neck.x0, neck.y0, lobe.x, lobe.y) - neck.radius,
                              neck.fillet,
                          )
                        : h;
                    value = Math.min(value, smoothUnion(reach, fields[i]!(x, y), join));
                }
            } else for (const i of own) value = Math.min(value, fields[i]!(x, y));
            return value;
        };
        const snap = (value: number, out: number) =>
            (out < 0 ? Math.floor(value / step) : Math.ceil(value / step)) * step;
        const box = {
            x0: snap(Math.min(...inGroup.map((i) => members[i]!.x - members[i]!.reach)) - step, -1),
            y0: snap(Math.min(...inGroup.map((i) => members[i]!.y - members[i]!.reach)) - step, -1),
            x1: snap(Math.max(...inGroup.map((i) => members[i]!.x + members[i]!.reach)) + step, 1),
            y1: snap(Math.max(...inGroup.map((i) => members[i]!.y + members[i]!.reach)) + step, 1),
        };
        for (const loop of fieldContours(field, box, step))
            loops.push(loopResample(loop, Math.max(16, Math.round(perimeter(loop) / spacing))));
    }
    return loopsPath(loops);
}

function perimeter(loop: readonly Point[]): number {
    let length = 0;
    for (let i = 0; i < loop.length; i++) {
        const [x0, y0] = loop[i]!;
        const [x1, y1] = loop[(i + 1) % loop.length]!;
        length += Math.hypot(x1 - x0, y1 - y0);
    }
    return length;
}
