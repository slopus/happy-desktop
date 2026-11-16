# File Viewer

## Where we are going

The file surfaces — Changes, All Files, and whatever a file opens into —
should look like one thing that was drawn on purpose. Today they are a pile of
small problems: text and icons that do not line up vertically with the header or
the mode controls, faded low-contrast type, a heavy divider between controls and
the list, and double-layer choice controls that put one box around the group and
another around the selected option.

The direction is the one we always want: more minimal, higher contrast, and more
color — but color that explains a difference rather than decorates.

Opening a file should open a real preview inside Happy, not a browser. Clicking
a JPEG shows the JPEG. Clicking a Markdown file shows a good Markdown viewer. A
video plays. That preview is one component, reused everywhere a file or a link
is opened. The only difference is where it lands: in Files a single click shows
it in the panel, beside the list it was picked from, and a double click or the
Open in tab button on the preview opens it as a main content tab; opened from
the main content it opens on the right.

## How we get there

First the layout. Keep one permanent Files tab in the sidebar, with Changes and
All Files as a radio-style sub-control inside it. The group has no enclosing
track, border, or background: unselected options sit directly on the main
surface, and only the selected option carries the same quiet selected fill as a
selected file row. Use this same one-layer treatment for the file viewer's other
exclusive controls, including Preview / Unified / Split / Edit and Rendered /
Source. Keep List / Tree flat, and make the tab, controls, icons, and rows share
one vertical rhythm. Drop the big divider between the controls and the list. We
are getting away from little rules and stripes everywhere, not just here.

The button that expands the right panel moves out of the content flow: put it in
the top right, to the right of the collapse button, rather than shifting all of
the content to make room for it.

Then the rows themselves. File icons should be colorful rather than neutral, and
they should come from the same source as the diff and tree component we already
use. The status vocabulary must actually mean something: U and M, and "Updated"
versus "Modified", are not a distinction anyone can read, and green on the wrong
one makes it worse. A new file is created — say that, and pick colors
accordingly. Changes uses the same quiet selected-row fill as All Files; do not
draw a colored stripe along the selected row.

Show the per-file change stat in Changes. The file name is the bright part; the
path is the gray part, and it may be hidden by default. Truncation belongs in the
middle of the path, never at the end where it eats the file name. Keep the whole
thing bounded, and let it scroll the way tool calls now do.

An open text file is the editor under its file tab, without another heavy title
band or a full path repeated along the bottom. Saving is Command-S, not a Save
button. Unsaved work is the classic dot beside the file name in its tab. Keep
the file and path treatment as compact as the diff library's file header.

Switching back to a file that is already loaded must show its content in the
same frame, without flashing the loading state. Syntax highlighting must also
be ready on repeat openings. Keep content attached to its open tab and retain a
simple bounded set of recent parsed editor states so the common repeat-open path
is immediate without allowing memory use to grow without limit. A loading
surface is only for a file whose content is not available yet.

Last, build the preview component and route file opens through it — binaries
first, especially images and video, then Markdown. Chat links reuse it instead
of the browser.

## How we know it is done

- Files remains one permanent sidebar tab, with Changes and All Files inside it
  as a sub-control rather than separate sidebar tabs.
- Exclusive file-viewer controls have no enclosing track or background.
  Unselected options sit directly on the surface; only the selected option uses
  the same quiet fill as a selected file row.
- The Files tab, scope control, List / Tree controls, icons, and rows stay
  aligned with no jumping, and the divider under the controls is gone.
- The panel expand control sits beside the collapse control and no longer shifts
  content.
- Text is high contrast, file icons are colorful and come from the diff/tree
  icon source, and every git status has a name and a color a person can read
  without asking what it means.
- Changes shows a per-file stat; the file name is prominent, the path is gray
  and truncates in the middle, and the list is bounded and scrollable.
- Selected rows use the same neutral fill in Changes and All Files, with no
  colored stripe.
- Text files have no Save button or bottom path; Command-S saves, and an unsaved
  tab shows a dot beside its file name.
- Returning to an already loaded file shows content and syntax highlighting in
  the same frame. Open tabs retain their content, a bounded cache retains recent
  editor parsing, and a genuinely unavailable file alone shows loading.
- Images, video, and Markdown open in Happy's own preview — beside the list in
  the panel on a single click in Files, in a main content tab on a double click
  or Open in tab, on the right from the main content — and never in a browser.
