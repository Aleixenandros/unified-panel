// SPDX-License-Identifier: GPL-2.0-or-later

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {capitalize, formatDateTime} from './lib/format.js';

const DATE_MENU_FORMATTER_UUID = 'date-menu-formatter@marcinjakubowski.github.com';

const PATTERN_HELP = [
    ['%H:%M', '24h'],
    ['%-l:%M %p', '12h'],
    ['%S', N_('seconds')],
    ['%a / %A', N_('short / full weekday')],
    ['%-d / %d', N_('day of month')],
    ['%b / %B', N_('short / full month')],
    ['%m', N_('month number')],
    ['%Y / %y', N_('year')],
    ['%V', N_('week number')],
    ['\\n', N_('new line')],
];

function N_(text) {
    return text;
}

export default class UnifiedPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        window._settings = settings;
        window.set_default_size(640, 760);

        window.add(this._buildPanelPage(settings));
        window.add(this._buildClockPage(settings));
    }

    // ── Page 1: the unified panel ─────────────────────────────────────

    _buildPanelPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Panel'),
            icon_name: 'view-grid-symbolic',
        });

        const content = new Adw.PreferencesGroup({
            title: _('Content'),
            description: _('Choose what is merged into the unified panel. When both the notifications and the calendar are merged, clicking the clock opens the unified panel.'),
        });
        page.add(content);

        content.add(this._switchRow(settings, 'unify-notifications',
            _('Notifications'), _('Notification list, Windows style')));
        content.add(this._switchRow(settings, 'unify-calendar',
            _('Calendar'), _('Calendar, events, world clocks and weather')));
        content.add(this._switchRow(settings, 'show-media',
            _('Now Playing card'), _('Media controls, macOS style. When off, players stay in the notification list.')));
        content.add(this._switchRow(settings, 'show-header',
            _('Large clock'), _('Time and date on top of the controls')));

        const look = new Adw.PreferencesGroup({title: _('Layout')});
        page.add(look);

        const sides = ['left', 'right'];
        const sideRow = new Adw.ComboRow({
            title: _('Notifications and calendar column'),
            model: Gtk.StringList.new([_('Left'), _('Right')]),
            selected: Math.max(0, sides.indexOf(settings.get_string('notifications-side'))),
        });
        sideRow.connect('notify::selected', () =>
            settings.set_string('notifications-side', sides[sideRow.selected]));
        look.add(sideRow);

        look.add(this._patternRow(settings, 'header-date-format',
            _('Large clock date format'), _('%A, %B %-d')));

        look.add(this._switchRow(settings, 'hide-messages-indicator',
            _('Hide unread dot'), _('The dot next to the top bar clock')));

        return page;
    }

    // ── Page 2: top bar clock (Date Menu Formatter style) ─────────────

    _buildClockPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Clock'),
            icon_name: 'preferences-system-time-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('Top bar clock'),
            description: _('Show the date and time in the top bar with your own format.'),
        });
        page.add(group);

        if (this._isDateMenuFormatterEnabled()) {
            const warning = new Adw.ActionRow({
                title: _('“Date Menu Formatter” is enabled'),
                subtitle: _('Disable one of the two clock formatters to avoid showing two clocks.'),
            });
            warning.add_prefix(new Gtk.Image({icon_name: 'dialog-warning-symbolic'}));
            group.add(warning);
        }

        group.add(this._switchRow(settings, 'custom-clock',
            _('Custom format'), _('Replace the default clock text')));

        const patternRow = this._patternRow(settings, 'clock-format', _('Format'), null);
        settings.bind('custom-clock', patternRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(patternRow);

        const sizeRow = new Adw.SpinRow({
            title: _('Font size'),
            subtitle: _('In points, 0 uses the theme size'),
            adjustment: new Gtk.Adjustment({lower: 0, upper: 32, step_increment: 1}),
        });
        settings.bind('clock-font-size', sizeRow, 'value', Gio.SettingsBindFlags.DEFAULT);
        settings.bind('custom-clock', sizeRow, 'sensitive', Gio.SettingsBindFlags.GET);
        group.add(sizeRow);

        const help = new Adw.PreferencesGroup({
            title: _('Format codes'),
            description: _('Uses the GLib date format. Example: %a %-d %b  %H:%M. For two lines, use \\n and a smaller font size (around 8 pt).'),
        });
        page.add(help);

        for (const [code, meaning] of PATTERN_HELP) {
            const row = new Adw.ActionRow({title: code, subtitle: _(meaning)});
            row.add_css_class('monospace');
            help.add(row);
        }

        return page;
    }

    // ── Helpers ───────────────────────────────────────────────────────

    _switchRow(settings, key, title, subtitle) {
        const row = new Adw.SwitchRow({title, subtitle});
        settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        return row;
    }

    /** Text entry for a date pattern with a live preview below it. */
    _patternRow(settings, key, title, placeholder) {
        const row = new Adw.EntryRow({
            title,
            text: settings.get_string(key),
            show_apply_button: true,
        });

        const preview = new Gtk.Label({css_classes: ['dim-label'], margin_end: 6});
        row.add_suffix(preview);

        const updatePreview = () => {
            const pattern = row.text || placeholder || '';
            const text = formatDateTime(pattern);
            preview.label = text === null
                ? _('Invalid format')
                : capitalize(text).replaceAll('\n', ' / ');
        };

        row.connect('changed', updatePreview);
        row.connect('apply', () => settings.set_string(key, row.text));
        updatePreview();

        // Keep the preview fresh while the window is open.
        const timerId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 1, () => {
            updatePreview();
            return GLib.SOURCE_CONTINUE;
        });
        row.connect('destroy', () => GLib.source_remove(timerId));

        return row;
    }

    _isDateMenuFormatterEnabled() {
        const shell = new Gio.Settings({schema_id: 'org.gnome.shell'});
        return shell.get_strv('enabled-extensions').includes(DATE_MENU_FORMATTER_UUID) &&
            !shell.get_boolean('disable-user-extensions');
    }
}
