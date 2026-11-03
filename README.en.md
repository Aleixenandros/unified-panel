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

Open them with `make prefs` or from the Extensions app.

**Panel**
- Merge the notifications into the panel (on/off)
- Merge the calendar, events, world clocks and weather (on/off).
  If either one is off, the clock keeps its own popup with what is left.
- “Now Playing” card (on/off). When off, players stay in the notification list.
- Large clock header (on/off) and its date format
- Column side: notifications on the left or on the right
- Hide the unread dot next to the clock

**Clock**
- Custom top bar clock format using GLib codes (`%a %-d %b  %H:%M`),
  `\n` for two lines, live preview, and font size

## Install from source

No build step or Node.js is needed, only the standard GNOME tools.

```sh
make install          # pack + install for the current user
make enable           # first time only
```

On Wayland, log out and back in to load new code.

Other targets: `make pack`, `make prefs`, `make uninstall`, `make pot`
(refresh translations), `make check` (validate the settings schema).

## Project layout

```
extension.js         entry point: enable/disable, rebuilds on settings change
prefs.js             preferences window (libadwaita)
lib/unifiedPanel.js  moves GNOME's widgets into the Quick Settings popup
lib/mediaCard.js     “Now Playing” card
lib/clockHeader.js   large clock and date
lib/clockFormatter.js custom top bar clock
lib/format.js        date helpers shared with prefs.js
schemas/             GSettings schema (all options)
po/                  translations (es)
stylesheet.css       styles, light and dark theme friendly
```

## How it works (for contributors)

The extension does not re-implement GNOME's widgets: it **moves** the real
notification list, calendar column and Quick Settings grid into a new
two-column layout, and puts them back when disabled. That keeps Wi-Fi,
Bluetooth, sound, notifications, etc. behaving exactly like stock GNOME and
keeps this code small.

It relies on a few private GNOME Shell fields, all used in
`lib/unifiedPanel.js`. When a new GNOME version comes out, check these first:

- `Main.panel.statusArea.quickSettings.menu`: `_grid`, `_overlay`, `_boxPointer`
- `Main.panel.statusArea.dateMenu`: `_messageList`, `_calendar`, `_date`,
  `_eventsItem`, `_indicator`, `_clockDisplay`, `_clock`
- `_messageList._messageView`: `_mediaSource`, `_playerToMessage`,
  `_removePlayer()`, `_setupMpris()`

Guidelines:
- Plain modern JavaScript (ES modules), following the GNOME Shell code style.
- Every change made in `enable()` must be undone in `disable()`.
- User-visible strings go through `_()`; run `make pot` after changing them.

## License

GPL-2.0-or-later
