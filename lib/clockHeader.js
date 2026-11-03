// SPDX-License-Identifier: GPL-2.0-or-later
//
// Large time + date shown on top of the control column (macOS style).

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import GnomeDesktop from 'gi://GnomeDesktop';
import GObject from 'gi://GObject';
import St from 'gi://St';

import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {capitalize, formatDateTime} from './format.js';

export const ClockHeader = GObject.registerClass(
class ClockHeader extends St.BoxLayout {
    /**
     * @param {Gio.Settings} settings the extension settings
     */
    constructor(settings) {
        super({
            style_class: 'unified-panel-header',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });

        this._settings = settings;
        this._interfaceSettings = new Gio.Settings({schema_id: 'org.gnome.desktop.interface'});

        this._timeLabel = new St.Label({style_class: 'unified-panel-header-time'});
        this._dateLabel = new St.Label({style_class: 'unified-panel-header-date'});
        this.add_child(this._timeLabel);
        this.add_child(this._dateLabel);

        // WallClock ticks every minute and when the time zone or the
        // 12h/24h setting changes; we only use it as a timer.
        this._wallClock = new GnomeDesktop.WallClock({time_only: true});
        this._wallClock.connectObject('notify::clock', () => this._update(), this);
        this._interfaceSettings.connectObject('changed::clock-format', () => this._update(), this);

        this.connect('destroy', () => {
            this._wallClock = null;
            this._interfaceSettings = null;
        });

        this._update();
    }

    _update() {
        const now = GLib.DateTime.new_now_local();
        const use12h = this._interfaceSettings.get_string('clock-format') === '12h';
        this._timeLabel.text = now.format(use12h ? '%-l:%M %p' : '%H:%M');

        // Translators: header date format (GLib strftime syntax), e.g. "Wednesday, November 4"
        const datePattern = this._settings.get_string('header-date-format') || _('%A, %B %-d');
        this._dateLabel.text = capitalize(formatDateTime(datePattern, now) ?? '');
    }
});
