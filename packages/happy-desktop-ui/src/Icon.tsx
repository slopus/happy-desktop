import { partitionComponentProps } from "./componentProps";
import { type CSSProperties } from "react";
import { drawnGlyphs, type DrawnGlyphName } from "./drawnGlyphs";
import { ioniconsGlyphs, type IoniconName } from "./vectorIcons/ioniconsGlyphs";
import { octiconsGlyphs, type OcticonName } from "./vectorIcons/octiconsGlyphs";
export type IconName =
    | "home"
    | "inbox"
    | "chat"
    | "agents"
    | "tasks"
    | "list"
    | "files"
    | "search"
    | "settings"
    | "call"
    | "clock"
    | "question"
    | "history"
    | "plus"
    | "send"
    | "check"
    | "check-circle"
    | "copy"
    | "chevron-down"
    | "chevron-left"
    | "chevron-right"
    | "chevron-up"
    | "file-diff"
    | "close"
    | "branch"
    | "merge"
    | "spark"
    | "doc"
    | "code"
    | "braces"
    | "image"
    | "play"
    | "stop"
    | "pause"
    | "at"
    | "hash"
    | "bell"
    | "more"
    | "arrow-down"
    | "arrow-right"
    | "arrow-up"
    | "shield"
    | "lock"
    | "eye"
    | "eye-off"
    | "link"
    | "open-external"
    | "fold"
    | "unfold"
    | "locate"
    | "mobile"
    | "smile"
    | "paperclip"
    | "mic"
    | "users"
    | "star"
    | "reply"
    | "zap"
    | "terminal"
    | "globe"
    | "filter"
    | "edit"
    | "compose"
    | "sun"
    | "moon"
    | "coffee"
    | "sidebar-collapse"
    | "sidebar-expand"
    | "panel-collapse"
    | "panel-expand"
    | "trash"
    | "archive"
    | "alert"
    | "unlink"
    | "plugin"
    | "package"
    | "dice"
    | "calendar"
    | "repeat"
    | "location"
    | "dot"
    | "pulse"
    | "feed"
    | "width-expand"
    | "width-center"
    | "full-screen"
    | "vault";
export type IconProps = {
    name: IconName;
    /*
     * The chrome sizes run 12–20. 24 and 32 exist for the places a glyph is the
     * subject rather than an affordance beside one — an application mark and a
     * hero mark — where a 20px glyph inside a 48 or 64px tile reads as a speck
     * rather than as the thing's face.
     */
    size?: 12 | 14 | 16 | 18 | 20 | 24 | 32;
    color?: string;
    className?: string;
    style?: CSSProperties;
    "aria-label"?: string;
    "data-testid"?: string;
};
/*
 * The curated house icon vocabulary, backed by the font-based vector sets ported
 * verbatim from Happy's `@expo/vector-icons` usage (Ionicons and Octicons). Each
 * curated `IconName` resolves to one upstream glyph in one set, so a name renders
 * the exact glyph Happy renders while call sites keep the small, stable
 * `IconName` union. Outline Ionicons variants are chosen so the set reads with a
 * consistent light stroke weight; the few code/repository affordances that only
 * Octicons carries (branch, merge, braces, hash) come from Octicons, and so does
 * the pencil, the one Octicons draws legibly at 16.
 *
 * The glyph itself is a Private Use Area codepoint painted in the icon font, so
 * there is no path data or optical centering to tune here — the font supplies a
 * box-centered glyph. Regenerate the glyphmaps from upstream rather than editing
 * a codepoint here.
 *
 * A `mirrored` name renders its glyph flipped across the vertical axis. It exists
 * for a pair of affordances that are the same act at opposite edges of the window
 * — collapsing the left sidebar and collapsing the right panel — where only one
 * handedness is drawn. The flip is presentation, not a new glyph: the same shape
 * is painted, so the two edges read as one idea instead of borrowing an unrelated
 * symbol for one of them.
 *
 * Every curated name paints at one optical size and one stroke weight: the
 * Ionicons outline drawing, a 1px stroke at 16 with outer shapes in a 14px live
 * area. The keylines follow Lucide's proportions (DESIGN.md, "Icon slots and
 * optical size"): a framed shape fills the live area, a bare plus 2/3 of the
 * slot, and a bare cross a little less, because its diagonals reach further.
 *
 * An `opticalScale` name paints its glyph scaled about the box's centre without
 * changing the box, for an upstream drawing that falls outside its keyline. The
 * scale lives here, once per name, so no call site grows its own box or
 * font-size to compensate. Octicons are drawn edge to edge on their 16 grid
 * with a 1.5px stroke, so the whole family is set at 14/16 to land in the
 * Ionicons live area and lose most of that extra weight.
 *
 * A `minimumSize` name keeps the drawing it has at that size in any smaller
 * box. The plus and cross are bare strokes with nothing enclosed: below 16 the
 * house stroke thins under a pixel and they fade beside the 13px labels they
 * sit next to, which is why the hover-revealed 12px row and tab controls hold
 * them at their 16px drawing. The box stays what layout asked for.
 *
 * An `opticalOffset` name moves its glyph inside the box, for an asymmetric
 * drawing whose upstream centring puts the part the eye reads off its keyline.
 * Like the scale, it lives here once per name and never at a call site.
 *
 * The `drawn` set is the single hand-drawn family, kept to Ionicons' own stroke
 * and box metrics; see `drawnGlyphs.tsx` for why it exists and why nothing else
 * belongs in it.
 */
type IconGlyph = (
    | { set: "drawn"; name: DrawnGlyphName }
    | { set: "ionicons"; name: IoniconName }
    | { set: "octicons"; name: OcticonName }
) & {
    mirrored?: true;
    opticalScale?: number;
    minimumSize?: 16;
    opticalOffset?: { x: number; y: number };
};
/* The Octicons 16 grid set inside the Ionicons 14px live area. */
const OCTICONS_SCALE = 14 / 16;
const glyphs: Record<IconName, IconGlyph> = {
    home: { set: "ionicons", name: "home-outline" },
    inbox: { set: "ionicons", name: "file-tray-outline" },
    chat: { set: "ionicons", name: "chatbubble-outline" },
    agents: { set: "ionicons", name: "hardware-chip-outline" },
    tasks: { set: "ionicons", name: "checkbox-outline" },
    list: { set: "ionicons", name: "list-outline" },
    files: { set: "ionicons", name: "documents-outline" },
    search: { set: "ionicons", name: "search-outline" },
    settings: { set: "ionicons", name: "settings-outline" },
    call: { set: "ionicons", name: "call-outline" },
    clock: { set: "ionicons", name: "time-outline" },
    // An agent stopped to ask the reader something: the turn is waiting on an
    // answer, not working. The circled outline sits beside `clock` as its pair.
    question: { set: "ionicons", name: "help-circle-outline" },
    history: { set: "octicons", name: "history" },
    // 10.5px of ink with a 1px stroke at 16: Lucide's 14-of-24 plus. Held at
    // that drawing in the 12px hover controls.
    plus: { set: "ionicons", name: "add-outline", minimumSize: 16 },
    send: { set: "ionicons", name: "paper-plane-outline" },
    check: { set: "ionicons", name: "checkmark-outline" },
    "check-circle": { set: "ionicons", name: "checkmark-circle-outline" },
    copy: { set: "ionicons", name: "copy-outline" },
    "chevron-down": { set: "ionicons", name: "chevron-down-outline" },
    "chevron-left": { set: "ionicons", name: "chevron-back-outline" },
    "chevron-right": { set: "ionicons", name: "chevron-forward-outline" },
    "chevron-up": { set: "ionicons", name: "chevron-up-outline" },
    // A bare cross: dismissing a thing where it is an affordance, and what went
    // wrong where it is not. In a danger or warning tone beside a failure it is
    // the house mark for trouble; `shield` says the opposite and is never it.
    // 9px of ink at 16, a little short of the plus: a cross's diagonals
    // already reach further than its square (Lucide's 12-of-24 x).
    close: {
        set: "ionicons",
        name: "close-outline",
        opticalScale: 1.1,
        minimumSize: 16,
        // Keep the painted cross centered when WebKit rounds its baseline on macOS.
        opticalOffset: { x: 0, y: -0.25 },
    },
    // The whole change read as one thing, rather than one file's diff: the mark
    // for the review stream and nothing else.
    "file-diff": { set: "octicons", name: "file-diff" },
    branch: { set: "octicons", name: "git-branch" },
    merge: { set: "octicons", name: "git-merge" },
    spark: { set: "ionicons", name: "sparkles-outline" },
    doc: { set: "ionicons", name: "document-text-outline" },
    code: { set: "ionicons", name: "code-slash-outline" },
    braces: { set: "octicons", name: "code" },
    // A locally installed plugin's own contribution: the piece that was added to
    // this window rather than shipped in it.
    plugin: { set: "ionicons", name: "extension-puzzle-outline" },
    // The shipped thing a contribution arrives in: a version of some code that
    // can be installed, updated, or removed. Distinct from the puzzle piece on
    // purpose, so managing packages never wears the glyph of using one.
    package: { set: "ionicons", name: "cube-outline" },
    image: { set: "ionicons", name: "image-outline" },
    // A shared calendar, and the events in it.
    calendar: { set: "ionicons", name: "calendar-outline" },
    // A shared vault of files: trays stacked on one another, a store of many
    // things kept together rather than one document or one inbox.
    vault: { set: "ionicons", name: "file-tray-stacked-outline" },
    // An event that happens again: the series it belongs to, not one occurrence.
    repeat: { set: "ionicons", name: "repeat-outline" },
    // Where an event happens.
    location: { set: "ionicons", name: "location-outline" },
    play: { set: "ionicons", name: "play-outline" },
    // A filled square: the universal "end what is running now".
    stop: { set: "ionicons", name: "square" },
    pause: { set: "ionicons", name: "pause-outline" },
    at: { set: "ionicons", name: "at-outline" },
    hash: { set: "octicons", name: "hash" },
    bell: { set: "ionicons", name: "notifications-outline" },
    more: { set: "ionicons", name: "ellipsis-horizontal" },
    "arrow-right": { set: "ionicons", name: "arrow-forward-outline" },
    "arrow-up": { set: "ionicons", name: "arrow-up-outline" },
    "arrow-down": { set: "ionicons", name: "arrow-down-outline" },
    // A shield with a checkmark on it: it says a thing is safe, not that a thing
    // went wrong. Nothing that failed may wear it.
    shield: { set: "ionicons", name: "shield-checkmark-outline" },
    lock: { set: "ionicons", name: "lock-closed-outline" },
    eye: { set: "ionicons", name: "eye-outline" },
    "eye-off": { set: "ionicons", name: "eye-off-outline" },
    link: { set: "ionicons", name: "link-outline" },
    // A box with an arrow leaving it: the same thing, opened somewhere of its
    // own. Never "a link" — `link` is that — and never a navigation arrow.
    "open-external": { set: "ionicons", name: "open-outline" },
    // Collapsing many things to their headers and opening them again. Octicons
    // draws the pair as arrows meeting a line and leaving it, which reads as
    // what happens to a list rather than to one row.
    fold: { set: "octicons", name: "fold" },
    unfold: { set: "octicons", name: "unfold" },
    // A page laid across the whole pane, or brought back to its reading
    // column: corners pushed out, and pulled back in.
    "width-expand": { set: "ionicons", name: "expand-outline" },
    "width-center": { set: "ionicons", name: "contract-outline" },
    // Taking the whole screen: four corner brackets framing nothing, not the
    // arrows `width-expand` pushes outwards inside the window.
    "full-screen": { set: "ionicons", name: "scan-outline" },
    // Finding your own place again: the crosshair that centres on where you
    // already are, not an arrow that takes you somewhere else.
    locate: { set: "ionicons", name: "locate-outline" },
    mobile: { set: "ionicons", name: "phone-portrait-outline" },
    smile: { set: "ionicons", name: "happy-outline" },
    paperclip: { set: "ionicons", name: "attach-outline" },
    mic: { set: "ionicons", name: "mic-outline" },
    users: { set: "ionicons", name: "people-outline" },
    star: { set: "ionicons", name: "star-outline" },
    reply: { set: "ionicons", name: "arrow-undo-outline" },
    zap: { set: "ionicons", name: "flash-outline" },
    terminal: { set: "ionicons", name: "terminal-outline" },
    globe: { set: "ionicons", name: "globe-outline" },
    filter: { set: "ionicons", name: "funnel-outline" },
    // Changing a thing that already exists: renaming it, editing it. Never for
    // starting something new; `compose` is that. A plain pencil, symmetric
    // about its diagonal. The Octicon keeps an open
    // outlined body, tip and eraser at 16 where Ionicons' narrow pencil body
    // fills in to one solid bar; the family scale sets it 13px across.
    edit: { set: "octicons", name: "pencil" },
    // Starting something new — a conversation, a message — as distinct from
    // `edit`, which changes a thing that already exists. Ionicons centres the
    // frame and the pencil leaving it together, which sets the frame, the part
    // the eye reads, 0.75px left of and 1px below the slot centre; the offset
    // puts the frame back on the centred square keyline, as Lucide's
    // `square-pen` draws it, and lets the pencil overshoot.
    compose: {
        set: "ionicons",
        name: "create-outline",
        opticalOffset: { x: 0.5, y: -1 },
    },
    sun: { set: "ionicons", name: "sunny-outline" },
    moon: { set: "ionicons", name: "moon-outline" },
    // A cup of coffee: the sign every keep-awake utility has used for keeping a
    // machine up, so the footer control reads without a label.
    coffee: { set: "ionicons", name: "cafe-outline" },
    // The panel and its column, with no arrow in it: the control says what the
    // window is made of, and the button's label says which way it goes. The
    // collapse name shows the column open, because that is the state you are in
    // when the control offers to close it; the expand name shows it put away
    // against the edge it hides at.
    "sidebar-collapse": { set: "drawn", name: "panel-rail" },
    "sidebar-expand": { set: "drawn", name: "panel-rail-collapsed" },
    // The column is drawn on the left, where the sidebar is. The panel names are
    // the same act at the other edge, so they paint the same shapes mirrored.
    "panel-collapse": { set: "drawn", name: "panel-rail", mirrored: true },
    "panel-expand": { set: "drawn", name: "panel-rail-collapsed", mirrored: true },
    trash: { set: "ionicons", name: "trash-outline" },
    archive: { set: "ionicons", name: "archive-outline" },
    // Something went wrong with the thing this glyph sits on — as distinct from
    // `shield`, which is about what an agent was allowed to do.
    alert: { set: "ionicons", name: "alert-circle-outline" },
    // The thing is still listed but what it pointed at is no longer there: a
    // checkout removed outside Happy, a link with nothing on the other end.
    unlink: { set: "ionicons", name: "unlink-outline" },
    // Chance, asked for: rolling a new set of faces for a bot.
    dice: { set: "ionicons", name: "dice-outline" },
    dot: { set: "ionicons", name: "ellipse" },
    pulse: { set: "ionicons", name: "pulse-outline" },
    // What happened on the installation: Activity, as GitHub draws its pulse.
    feed: { set: "octicons", name: "pulse" },
};
export const iconNames = Object.keys(glyphs) as IconName[];
function glyphContent(glyph: IconGlyph) {
    if (glyph.set === "drawn") {
        /*
         * The drawing fills the icon box rather than taking `size` directly, so
         * a drawn glyph answers a surface's box override exactly as a font
         * glyph answers an overridden font-size.
         */
        return (
            <svg fill="none" focusable="false" height="100%" viewBox="0 0 16 16" width="100%">
                {drawnGlyphs[glyph.name]}
            </svg>
        );
    }
    const codepoint =
        glyph.set === "ionicons" ? ioniconsGlyphs[glyph.name] : octiconsGlyphs[glyph.name];
    const character = String.fromCodePoint(codepoint);
    const scale = (glyph.opticalScale ?? 1) * (glyph.set === "octicons" ? OCTICONS_SCALE : 1);
    const offset = glyph.opticalOffset;
    if (scale === 1 && glyph.minimumSize === undefined && offset === undefined) return character;
    /*
     * The glyph is laid out at the box's own font-size, where its baseline lands
     * on the same pixel as every other glyph, and only then scaled about the
     * box's centre. A larger font-size would move the baseline to a fractional
     * position that each engine rounds its own way, setting the ink up to half
     * a pixel off centre. A minimum size is the one exception, and it stays on
     * whole pixels: a 16px line box centred in a 12 or 14px box overhangs it by
     * 2 or 1px. It is resolved in CSS against the font-size the box actually
     * renders at, so a surface that overrides an icon's box is still honoured.
     * An optical offset is declared in pixels at 16 and applied in em, so it
     * moves with the box; at 16 it is a whole number of device pixels.
     */
    return (
        <span
            className="happy-icon__glyph"
            style={{
                ...(scale === 1 ? null : { scale: String(scale) }),
                ...(offset === undefined
                    ? null
                    : { translate: `${offset.x / 16}em ${offset.y / 16}em` }),
                ...(glyph.minimumSize === undefined
                    ? null
                    : { fontSize: `max(${glyph.minimumSize}px, 1em)` }),
            }}
        >
            {character}
        </span>
    );
}
export function Icon(props: IconProps) {
    const [local] = partitionComponentProps(props, [
        "aria-label",
        "className",
        "color",
        "data-testid",
        "name",
        "size",
        "style",
    ]);
    const glyph = glyphs[local.name];
    const size = local.size ?? 16;
    return (
        <span
            aria-hidden={local["aria-label"] ? undefined : "true"}
            aria-label={local["aria-label"]}
            className={["happy-icon", local.className].filter(Boolean).join(" ")}
            data-glyph={glyph.name}
            data-happy-desktop-ui="icon"
            data-mirrored={glyph.mirrored ? "" : undefined}
            data-name={local.name}
            data-set={glyph.set}
            data-testid={local["data-testid"]}
            role={local["aria-label"] ? "img" : undefined}
            style={{
                fontSize: `${size}px`,
                lineHeight: 1,
                width: `${size}px`,
                height: `${size}px`,
                ...local.style,
                ...(local.color === undefined ? null : { color: local.color }),
            }}
        >
            {glyphContent(glyph)}
        </span>
    );
}
