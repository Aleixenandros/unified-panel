// SPDX-License-Identifier: GPL-2.0-or-later
//
// Date/time helpers shared by the extension and the preferences window.
// Only GLib is imported here so this module also works in prefs.js.

import GLib from 'gi://GLib';

/**
 * Format a date with a GLib strftime-like pattern.
 * A literal "\n" in the pattern becomes a line break.
 *
 * @param {string} pattern
 * @param {GLib.DateTime} [dateTime]
 * @returns {string|null} the formatted text, or null if the pattern is invalid
 */
export function formatDateTime(pattern, dateTime = GLib.DateTime.new_now_local()) {
    return dateTime.format(pattern.replaceAll('\\n', '\n'));
}

/**
 * Whether the pattern shows seconds, so the clock must tick every second.
 *
 * @param {string} pattern
 * @returns {boolean}
 */
export function patternShowsSeconds(pattern) {
    return /%[-_0]?[SsTrc]/.test(pattern);
}

/**
 * Upper-case the first letter ("miércoles" -> "Miércoles").
 *
 * @param {string} text
 * @returns {string}
 */
export function capitalize(text) {
    return text ? text.charAt(0).toLocaleUpperCase() + text.slice(1) : text;
}
