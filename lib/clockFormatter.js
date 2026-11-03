// SPDX-License-Identifier: GPL-2.0-or-later
//
// Custom format for the top bar clock, inspired by the idea of the
// "Date Menu Formatter" extension. The original clock label is hidden
// (not destroyed) and a new label is shown next to it.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Pango from 'gi://Pango';
import St from 'gi://St';

import {formatDateTime, patternShowsSeconds} from './format.js';

export class ClockFormatter {
    /**
     * @param {object} dateMenu `Main.panel.statusArea.dateMenu`
     * @param {Gio.Settings} settings the extension settings
     */
    constructor(dateMenu, settings) {
        this._dateMenu = dateMenu;
        this._original = dateMenu._clockDisplay;
        this._pattern = settings.get_string('clock-format');
        this._withSeconds = patternShowsSeconds(this._pattern);
        this._timeoutId = 0;

        const fontSize = settings.get_int('clock-font-size');
        this._label = new St.Label({
            style_class: 'clock unified-panel-clock',
            style: fontSize > 0 ? `font-size: ${fontSize}pt;` : null,
            y_align: Clutter.ActorAlign.CENTER,
        });
        this._label.clutter_text.ellipsize = Pango.EllipsizeMode.NONE;
        this._label.clutter_text.line_alignment = Pango.Alignment.CENTER;

        this._original.get_parent().insert_child_above(this._label, this._original);
        this._original.hide();
        this._dateMenu.label_actor = this._label;

        // The shell's WallClock tells us about time zone changes and resume
        // from suspend; our own timer handles the regular ticks.
        dateMenu._clock.connectObject('notify::clock', () => this._update(), this);

        this._update();
        this._scheduleTick();
    }

    _update() {
        this._label.text = formatDateTime(this._pattern) ?? this._original.text;
    }

    _scheduleTick() {
        const now = GLib.DateTime.new_now_local();
        const msIntoSecond = now.get_microsecond() / 1000;
        const delay = this._withSeconds
            ? 1000 - msIntoSecond
            : (60 - now.get_second()) * 1000 - msIntoSecond;

        this._timeoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, Math.max(delay, 50), () => {
            this._update();
            this._scheduleTick();
            return GLib.SOURCE_REMOVE;
        });
    }

    destroy() {
        if (this._timeoutId) {
            GLib.source_remove(this._timeoutId);
            this._timeoutId = 0;
        }
        this._dateMenu._clock.disconnectObject(this);

        this._label.destroy();
        this._original.show();
        this._dateMenu.label_actor = this._original;
    }
}
