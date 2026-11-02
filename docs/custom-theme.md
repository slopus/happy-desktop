# Custom theme

Happy Desktop has five appearance choices: System, Light, Dark, Midnight, and
Custom. Custom is the one a person shapes by hand, usually by asking an agent
("make it warmer", "darker sidebar", "teal accents"). The agent edits one file
and the window repaints within a moment. No reload or restart is needed.

## The file

Edit `~/.happy/desktop/config.json`. Read it first and merge these fields into
the existing object; do not replace unrelated preferences:

```json
{
    "version": 1,
    "appearance": "custom",
    "customTheme": {
        "base": "midnight",
        "colors": {
            "groupped-background": "#1d1a17",
            "surface": "#25211d",
            "text": "#ebdbb2",
            "text-secondary": "#a89984",
            "text-link": "#d79921"
        }
    }
}
```

- `version` is the desktop config version, currently `1`. There is no theme version.
- `appearance` is `"system"`, `"light"`, `"dark"`, `"midnight"`, or `"custom"`.
- `base` is `"light"`, `"dark"`, or `"midnight"`. Every role not listed in
  `customTheme.colors` comes from this palette, as does the light or dark color scheme of
  the window, browser tabs, and previews.
- `colors` maps role names to hex colours: `#rgb`, `#rgba`, `#rrggbb`, or
  `#rrggbbaa`. It may be empty or omitted.
- An omitted base defaults to Midnight; omitted colors default to an empty map.
- Unknown fields are ignored by the app but preserved on disk, including on app writes.
- Unknown roles and non-hex values are ignored individually; valid roles still apply.
- `permission-*`, `box-error-*`, and `box-warning-*` are not overridable: theme
  edits must not disguise permission choices or warnings.
- Invalid field types (including `"colors": null`) retain that field's last good
  value while running, or its default on startup. Other fields still apply.

The theme is only shown while Custom is selected (Settings → General → Theme,
the theme menu in the status bar, or the command palette). An agent can set
`"appearance": "custom"` in the same edit. Every accepted config change, not
only the theme, reaches the running app live. Older native shells and browser
development without the live config bridge hide Midnight and Custom.

## Checking a write

After writing, wait about a second and read `~/.happy/desktop/config.error.txt`
if present. It names every ignored field or role and explains each fallback;
the desktop debug log receives the same diagnostics. The sidecar is removed
once the config is clean. A sidecar keeps feedback next to the edited file
without adding diagnostic fields to the user's preferences.

Malformed JSON or a non-object root retains the last accepted config (defaults
on startup). The app never rewrites a file merely because it read something
odd, and refuses app writes while the document cannot be safely merged.
Correct the source document, not the sidecar.

App writes reread the on-disk object, merge only the preferences actually
changed, and atomically rename a temporary file. Agents should likewise reread
before editing, preserve unrelated and unknown fields, and use atomic rename.
Do not write a separate `theme.json`.

The app detects and retries edits made while it prepares its temporary file.
Ordinary filesystem rename has no compare-and-swap: an uncoordinated writer
can still race the final check and rename. Serialize agent edits to this file;
do not run multiple writers continuously against it.

Already-shipped older builds still reject unknown fields and new appearance
values; this cannot be fixed retroactively. Use a native build with live config
support before adding these fields. New builds parse preferences independently
and preserve unknown fields instead of resetting the document.

## Roles worth knowing

The full list is `THEME_COLOR_ROLES` in
`packages/happy-desktop-state/src/appearance/customTheme.ts`. Each role is a CSS
variable in `packages/happy-desktop-ui/src/theme.css` (for example `surface` is
`--surface`). The ones that shape the overall look:

| Role                                               | What it paints                                       |
| -------------------------------------------------- | ---------------------------------------------------- |
| `groupped-background`                              | The window floor: sidebar, rail, settings background |
| `surface`                                          | The main content panel, tabs, and cards              |
| `surface-high`                                     | Recessed areas such as code blocks                   |
| `surface-selected`, `surface-pressed`              | Selected and pressed rows                            |
| `header-background`                                | Panel headers; on Windows, also the title bar        |
| `divider`                                          | Hairlines between areas                              |
| `input-background`                                 | The composer and inputs                              |
| `user-message-background`                          | The person's own chat bubbles                        |
| `text`, `agent-message-text`, `user-message-text`  | Main text                                            |
| `text-secondary`, `groupped-section-title`         | Quieter text and section headings                    |
| `text-link`                                        | The accent: links, active states                     |
| `button-primary-background`, `button-primary-tint` | The main action button and its label                 |
| `composer-send-background`, `composer-send-icon`   | The round send button in the composer and its arrow  |
| `terminal-background`, `diff-context-bg`           | Terminal and diff backgrounds                        |

Surfaces should keep a visible step between them. On a dark base, raised areas
(`surface`, `input-background`) should be a little lighter than
`groupped-background`. Keep `button-primary-background` readable against the
surfaces around it.
