import type { HappyAgentZone } from "happy-desktop-state";

export type ZoneAccessLabel = Pick<HappyAgentZone, "id" | "name" | "color">;

/** Names the zones allowed to use a resource, without guessing at missing data. */
export function ZoneAccessLabels(props: {
    readonly ids: readonly string[] | null | undefined;
    readonly zones: readonly ZoneAccessLabel[];
}) {
    return (
        <span className="happy-agent-zone-chips">
            {props.ids === undefined
                ? "Zone access unavailable"
                : props.ids === null
                  ? "All zones"
                  : props.ids.length === 0
                    ? "No zones"
                    : props.ids.map((id) => {
                          const zone = props.zones.find((entry) => entry.id === id);
                          return (
                              <span
                                  className="happy-agent-zone-chips__chip"
                                  data-color={zone?.color ?? "gray"}
                                  key={id}
                              >
                                  <span
                                      aria-hidden="true"
                                      className="happy-agent-zones__swatch-dot"
                                  />
                                  {zone?.name ?? "Unknown zone"}
                              </span>
                          );
                      })}
        </span>
    );
}
