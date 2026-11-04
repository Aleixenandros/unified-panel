// SPDX-License-Identifier: Apache-2.0

import Adw from 'gi://Adw';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Gtk from 'gi://Gtk';

import {ExtensionPreferences, gettext as _} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

import {capitalize, formatDateTime} from './lib/format.js';
import {
    BLOCKS, PRESETS, findPreset, migrateLegacySettings, parseLayout, serializeLayout,
} from './lib/layout.js';

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

const BLOCK_INFO = {
    'header': {
        title: N_('Large clock'),
        subtitle: N_('Time and date'),
        icon: 'preferences-system-time-symbolic',
    },
    'media': {
        title: N_('Now Playing card'),
        subtitle: N_('Media controls'),
        icon: 'audio-x-generic-symbolic',
    },
    'quick-settings': {
        title: N_('Quick settings'),
        subtitle: N_('Network, sound, brightness, power…'),
        icon: 'emblem-system-symbolic',
    },
    'notifications': {
        title: N_('Notifications'),
        subtitle: N_('Notification list'),
        icon: 'preferences-system-notifications-symbolic',
    },
    'calendar': {
        title: N_('Calendar'),
        subtitle: N_('With events, world clocks and weather'),
        icon: 'x-office-calendar-symbolic',
    },
};

function N_(text) {
    return text;
}

export default class UnifiedPanelPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        migrateLegacySettings(settings);
        window._settings = settings;
        window.set_default_size(640, 800);

        window.add(this._buildLayoutPage(window, settings));
        window.add(this._buildPanelPage(settings));
        window.add(this._buildClockPage(settings));
    }

    // ── Page 1: layout of the panel ───────────────────────────────────

    _buildLayoutPage(window, settings) {
        const page = new Adw.PreferencesPage({
            title: _('Layout'),
            icon_name: 'view-grid-symbolic',
        });

        const group = new Adw.PreferencesGroup({
            title: _('Layout'),
            description: _('Start from a preset and adjust it below. The panel changes as you go.'),
        });
        page.add(group);

        const presetRow = new Adw.ComboRow({
            title: _('Preset'),
            use_subtitle: true,
            model: Gtk.StringList.new([...PRESETS.map(preset => _(preset.name)), _('Custom')]),
        });
        group.add(presetRow);

        const columnsRow = new Adw.ComboRow({
            title: _('Columns'),
            model: Gtk.StringList.new([_('One'), _('Two')]),
        });
        group.add(columnsRow);

        let syncing = false;
        let blockGroups = [];

        const sync = () => {
            const columns = settings.get_int('columns');
            const preset = findPreset(columns, settings.get_strv('layout'));

            syncing = true;
            presetRow.selected = preset >= 0 ? preset : PRESETS.length;
            columnsRow.selected = columns - 1;
            syncing = false;

            blockGroups.forEach(blockGroup => page.remove(blockGroup));
            blockGroups = this._buildBlockGroups(settings, columns);
            blockGroups.forEach(blockGroup => page.add(blockGroup));
        };

        presetRow.connect('notify::selected', () => {
            const preset = PRESETS[presetRow.selected];
            if (syncing || !preset)
                return;

            // Write both keys at once, so the panel is rebuilt only once.
            const batch = this.getSettings();
            batch.delay();
            batch.set_int('columns', preset.columns);
            batch.set_strv('layout', preset.layout);
            batch.apply();
        });

        columnsRow.connect('notify::selected', () => {
            if (!syncing)
                settings.set_int('columns', columnsRow.selected + 1);
        });

        // Rebuild the rows once the change that caused it is over: the
        // widget that changed the setting may be one of those rows.
        let idleId = 0;
        const queueSync = () => {
            if (idleId)
                return;
            idleId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
                idleId = 0;
                sync();
                return GLib.SOURCE_REMOVE;
            });
        };
        const handlerIds = [
            settings.connect('changed::layout', queueSync),
            settings.connect('changed::columns', queueSync),
        ];
        window.connect('close-request', () => {
            handlerIds.forEach(id => settings.disconnect(id));
            if (idleId)
                GLib.source_remove(idleId);
            idleId = 0;
            return false;
        });

        sync();
        return page;
    }

    /**
     * One group per column, plus one for the blocks not shown.
     *
     * @param {Gio.Settings} settings
     * @param {number} columns
     * @returns {Adw.PreferencesGroup[]}
     */
    _buildBlockGroups(settings, columns) {
        const blocks = parseLayout(settings.get_strv('layout'));
        const save = () => settings.set_strv('layout', serializeLayout(blocks));

        const sections = columns === 2
            ? [
                {title: _('Left column'), places: ['left']},
                {title: _('Right column'), places: ['right']},
                {title: _('Not shown'), places: ['hidden']},
            ]
            : [
                {title: _('Column'), places: ['left', 'right']},
                {title: _('Not shown'), places: ['hidden']},
            ];
        const hiddenHelp = _('Notifications and calendar not shown here stay in the clock menu. Without the Now Playing card, players show up in the notification list.');

        const groups = [];
        for (const section of sections) {
            const members = blocks.filter(block => section.places.includes(block.place));
            const hidden = section.places.includes('hidden');
            if (hidden && members.length === 0)
                continue;

            const group = new Adw.PreferencesGroup({
                title: section.title,
                description: hidden ? hiddenHelp : null,
            });
            if (members.length === 0) {
                group.add(new Adw.ActionRow({
                    title: _('Empty column'),
                    subtitle: _('Move a block here with its menu'),
                    css_classes: ['dim-label'],
                }));
            }

            members.forEach((block, index) => {
                const neighbors = hidden ? [] : members;
                group.add(this._blockRow(block, index, neighbors, blocks, columns, save));
            });
            groups.push(group);
        }

        if (groups.length > 0) {
            groups[0].description = columns === 2
                ? _('Use the menu of each block to change its column, and the arrows to change its place in the column.')
                : _('Use the arrows to change the order of the blocks.');
        }
        return groups;
    }

    /**
     * @param {{id: string, place: string}} block the block of this row
     * @param {number} index its position in `neighbors`
     * @param {object[]} neighbors blocks it can swap places with
     * @param {object[]} blocks the whole layout, changed in place
     * @param {number} columns
     * @param {Function} save writes `blocks` to the settings
     * @returns {Adw.ActionRow}
     */
    _blockRow(block, index, neighbors, blocks, columns, save) {
        const info = BLOCK_INFO[block.id];
        const row = new Adw.ActionRow({title: _(info.title), subtitle: _(info.subtitle)});
        row.add_prefix(new Gtk.Image({icon_name: info.icon}));

        const choices = this._placeChoices(block.id, columns);
        if (choices.length > 1) {
            const dropDown = Gtk.DropDown.new_from_strings(choices.map(choice => choice.label));
            dropDown.valign = Gtk.Align.CENTER;
            dropDown.selected = Math.max(0,
                choices.findIndex(choice => choice.places.includes(block.place)));
            dropDown.connect('notify::selected', () => {
                const {places} = choices[dropDown.selected];
                if (places.includes(block.place))
                    return;
                // "Shown" with one column: keep the block's usual column
                // for when two columns are used again.
                block.place = places.length > 1 ? BLOCKS[block.id] : places[0];
                save();
            });
            row.add_suffix(dropDown);
        }

        const arrows = [
            ['go-up-symbolic', -1, _('Move up')],
            ['go-down-symbolic', 1, _('Move down')],
        ];
        for (const [iconName, delta, tooltip] of arrows) {
            const other = neighbors[index + delta];
            if (neighbors.length === 0)
                break;

            const button = new Gtk.Button({
                icon_name: iconName,
                tooltip_text: tooltip,
                valign: Gtk.Align.CENTER,
                css_classes: ['flat'],
                sensitive: other !== undefined,
            });
            button.connect('clicked', () => {
                const a = blocks.indexOf(block);
                const b = blocks.indexOf(other);
                [blocks[a], blocks[b]] = [blocks[b], blocks[a]];
                save();
            });
            row.add_suffix(button);
        }

        return row;
    }

    /**
     * @param {string} id
     * @param {number} columns
     * @returns {{label: string, places: string[]}[]} where the block can go
     */
    _placeChoices(id, columns) {
        const choices = columns === 2
            ? [
                {label: _('Left column'), places: ['left']},
                {label: _('Right column'), places: ['right']},
            ]
            : [{label: _('Shown'), places: ['left', 'right']}];

        // The quick settings are the panel itself.
        if (id !== 'quick-settings')
            choices.push({label: _('Not shown'), places: ['hidden']});
        return choices;
    }

    // ── Page 2: what each block shows ─────────────────────────────────

    _buildPanelPage(settings) {
        const page = new Adw.PreferencesPage({
            title: _('Panel'),
            icon_name: 'view-list-symbolic',
        });

        const calendar = new Adw.PreferencesGroup({
            title: _('Calendar'),
            description: _('Sections below the calendar when it is in the panel.'),
        });
        page.add(calendar);
        calendar.add(this._switchRow(settings, 'calendar-show-events',
            _('Events'), _('Appointments of the selected day')));
        calendar.add(this._switchRow(settings, 'calendar-show-world-clocks',
            _('World clocks'), _('Set them up in the Clocks app')));
        calendar.add(this._switchRow(settings, 'calendar-show-weather',
            _('Weather'), _('Set the location in the Weather app')));

        const notifications = new Adw.PreferencesGroup({title: _('Notifications')});
        page.add(notifications);
        notifications.add(this._switchRow(settings, 'show-notifications-title',
            _('Title'), _('“Notifications” above the list')));
        notifications.add(this._switchRow(settings, 'hide-messages-indicator',
            _('Hide unread dot'), _('The dot next to the top bar clock')));

        const header = new Adw.PreferencesGroup({title: _('Large clock')});
        page.add(header);
        header.add(this._patternRow(settings, 'header-date-format',
            _('Date format'), _('%A, %B %-d')));

        return page;
    }

    // ── Page 3: top bar clock (Date Menu Formatter style) ─────────────

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
