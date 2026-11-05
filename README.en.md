# Unified Panel

[Español](README.md) · **English**

A unified control center for GNOME Shell that mixes the **macOS Control
Center** and the **Windows 11 notification center** in one popup:

| Notifications column (Windows style) | Control column (macOS style)        |
|--------------------------------------|-------------------------------------|
| Notification list with “Clear”       | Large clock and date                |
| Calendar, events, world clocks       | “Now Playing” card (MPRIS)          |
| Weather                              | GNOME Quick Settings (Wi-Fi, Bluetooth, sound, brightness, power…) |

Both the clock and the system icons in the top bar open the same panel.
It also includes an optional custom clock format for the top bar, inspired
by the idea of *Date Menu Formatter*.

Supported: **GNOME Shell 51**. Works with Dash to Panel.

## Options

Open them with `./build.sh prefs` or from the Extensions app.

**Layout**
- Presets: notifications and calendar on the left or on the right, calendar
  on the left with the notifications next to the controls, one column with
  the calendar or the notifications on top, or controls only
- One or two columns
- Five blocks you can place freely: large clock, “Now Playing” card, quick
  settings, notifications and calendar. Each goes in the column you choose,
  in any order, or is not shown. Notifications and calendar that are not
  shown stay in the clock menu; without the “Now Playing” card, players
  stay in the notification list.
- With one column, the panel scrolls when it does not fit on the screen

**Panel**
- Events, world clocks and weather below the calendar (each on/off)
- “Notifications” title above the list (on/off)
- Hide the unread dot next to the clock
- Date format of the large clock

**Clock**
- Custom top bar clock format using GLib codes (`%a %-d %b  %H:%M`),
  `\n` for two lines, live preview, and font size

## Installation

Requires **GNOME Shell 51**. Check your version with `gnome-shell --version`.

### Option 1: from extensions.gnome.org

Install it with one click from
[its page on extensions.gnome.org](https://extensions.gnome.org/extension/11636/unified-panel/)
or from the **Extension Manager** app, searching for “Unified Panel”.

### Option 2: from a published release

1. Download `unified-panel@aleixenandros.me.shell-extension.zip` from the
   [latest release](https://github.com/Aleixenandros/unified-panel/releases/latest).
2. Install and enable it:

   ```sh
   gnome-extensions install --force unified-panel@aleixenandros.me.shell-extension.zip
   gnome-extensions enable unified-panel@aleixenandros.me
   ```

3. Log out and back in.

### Option 3: from source

No code compilation or Node.js needed: the `build.sh` script packs and
installs the extension with the standard GNOME tools.

```sh
git clone https://github.com/Aleixenandros/unified-panel.git
cd unified-panel
./build.sh
```

Without arguments it shows a menu with the most common actions. You can
also call it directly:

| Command                  | What it does                                          |
|--------------------------|-------------------------------------------------------|
| `./build.sh install -e`  | Build, install and enable the extension               |
| `./build.sh install`     | Build and install                                     |
| `./build.sh build`       | Only build the zip in `build/`                        |
| `./build.sh status`      | Version, compatibility with your GNOME and state      |
| `./build.sh prefs`       | Open the preferences                                  |
| `./build.sh uninstall`   | Uninstall                                             |
| `./build.sh help`        | All commands                                          |

If a tool is missing, the script prints the exact command to install it on
Fedora, Debian/Ubuntu, Arch or openSUSE.

When done, log out and back in to load the new version (required on
Wayland).

To update later:

```sh
git pull
./build.sh install
```

If you prefer `make`, the same shortcuts exist (`make install`, `make pack`…).

### Uninstall

```sh
gnome-extensions uninstall unified-panel@aleixenandros.me
```

or `./build.sh uninstall` if you installed it from source.

## Releasing a new version

From `main`, with no pending changes:

```sh
make release VERSION=2.1
```

This sets `version-name` in `metadata.json`, checks that the package
builds, commits, creates the `v2.1` tag and pushes it. When the tag
arrives, GitHub Actions (`.github/workflows/release.yml`) builds the zip
and creates the GitHub Release with the change notes.

Then download the zip from the Release and upload it by hand at
<https://extensions.gnome.org/upload/>, which has no automated upload.
extensions.gnome.org assigns the `version` number; we only control
`version-name`.

The zip is never stored in git: `build/` is in `.gitignore`.

## Project layout

```
extension.js         entry point: enable/disable, rebuilds on settings change
prefs.js             preferences window (libadwaita)
lib/unifiedPanel.js  moves GNOME's widgets into the Quick Settings popup
lib/layout.js        blocks, presets and settings migration (shared with prefs.js)
lib/mediaCard.js     “Now Playing” card
lib/clockHeader.js   large clock and date
lib/clockFormatter.js custom top bar clock
lib/format.js        date helpers shared with prefs.js
schemas/             GSettings schema (all options)
po/                  translations (es)
stylesheet.css       styles, light and dark theme friendly
build.sh             build, install, translations (also used by the Makefile)
.github/workflows/   automatic release publishing
```

## How it works (for contributors)

The extension does not re-implement GNOME's widgets: it **moves** the real
notification list, calendar column and Quick Settings grid into the chosen
layout (`layout` key, see `lib/layout.js`), and puts them back when disabled. That keeps Wi-Fi,
Bluetooth, sound, notifications, etc. behaving exactly like stock GNOME and
keeps this code small.

It relies on a few private GNOME Shell fields, all used in
`lib/unifiedPanel.js`. When a new GNOME version comes out, check these first:

- `Main.panel.statusArea.quickSettings.menu`: `_grid`, `_overlay`, `_boxPointer`
- `Main.panel.statusArea.dateMenu`: `_messageList`, `_calendar`, `_date`,
  `_eventsItem`, `_clocksItem`, `_weatherItem`, `_indicator`, `_clockDisplay`, `_clock`
- `_messageList._messageView`: `_mediaSource`, `_playerToMessage`,
  `_removePlayer()`, `_setupMpris()`

Guidelines:
- Plain modern JavaScript (ES modules), following the GNOME Shell code style.
- Every change made in `enable()` must be undone in `disable()`.
- User-visible strings go through `_()`; run `./build.sh pot` after changing them.

## License

Apache-2.0. See the [LICENSE](LICENSE) file.
