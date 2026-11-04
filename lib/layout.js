// SPDX-License-Identifier: Apache-2.0
//
// Panel layout: which blocks are shown, in which column and in which
// order. Shared by the extension and the preferences window, so it must
// not import anything from GNOME Shell.
//
// The `layout` key stores an ordered list of "block:place" strings, e.g.
// ['notifications:left', 'calendar:left', 'header:right', ...], where
// place is 'left', 'right' or 'hidden'. With one column (`columns` = 1)
// left and right both just mean "shown" and only the order counts.

const N_ = text => text;

/** Every block, with its default place. */
export const BLOCKS = Object.freeze({
    'header': 'right',
    'media': 'right',
    'quick-settings': 'right',
    'notifications': 'left',
    'calendar': 'left',
});

export const PLACES = Object.freeze(['left', 'right', 'hidden']);

export const PRESETS = Object.freeze([
    {
        name: N_('Notifications and calendar on the left'),
        columns: 2,
        layout: ['notifications:left', 'calendar:left', 'header:right', 'media:right', 'quick-settings:right'],
    },
    {
        name: N_('Notifications and calendar on the right'),
        columns: 2,
        layout: ['header:left', 'media:left', 'quick-settings:left', 'notifications:right', 'calendar:right'],
    },
    {
        name: N_('Calendar on the left, notifications with the controls'),
        columns: 2,
        layout: ['calendar:left', 'header:right', 'media:right', 'quick-settings:right', 'notifications:right'],
    },
    {
        name: N_('One column, calendar on top'),
        columns: 1,
        layout: ['calendar:left', 'media:left', 'quick-settings:left', 'notifications:left', 'header:hidden'],
    },
    {
        name: N_('One column, notifications on top'),
        columns: 1,
        layout: ['header:left', 'notifications:left', 'media:left', 'quick-settings:left', 'calendar:left'],
    },
    {
        name: N_('Controls only'),
        columns: 1,
        layout: ['header:left', 'media:left', 'quick-settings:left', 'notifications:hidden', 'calendar:hidden'],
    },
]);

/**
 * Read a layout, fixing anything invalid: unknown blocks and duplicates
 * are dropped, missing blocks are added at the end in their default place,
 * and the quick settings are never hidden (they are the panel itself).
 *
 * @param {string[]} strv value of the `layout` key
 * @returns {{id: string, place: string}[]} every block once, in order
 */
export function parseLayout(strv) {
    const blocks = [];
    const seen = new Set();

    for (const entry of strv) {
        const [id, place] = entry.split(':');
        if (!Object.hasOwn(BLOCKS, id) || seen.has(id))
            continue;
        seen.add(id);
        blocks.push({id, place: validPlace(id, place)});
    }

    for (const [id, place] of Object.entries(BLOCKS)) {
        if (!seen.has(id))
            blocks.push({id, place});
    }

    return blocks;
}

function validPlace(id, place) {
    if (!PLACES.includes(place))
        return BLOCKS[id];
    if (id === 'quick-settings' && place === 'hidden')
        return BLOCKS[id];
    return place;
}

/**
 * @param {{id: string, place: string}[]} blocks
 * @returns {string[]} value for the `layout` key
 */
export function serializeLayout(blocks) {
    return blocks.map(({id, place}) => `${id}:${place}`);
}

/**
 * @param {number} columns
 * @param {string[]} strv value of the `layout` key
 * @returns {number} index in PRESETS, or -1 for a custom layout
 */
export function findPreset(columns, strv) {
    const key = layoutKey(columns, strv);
    return PRESETS.findIndex(preset => layoutKey(preset.columns, preset.layout) === key);
}

/** With one column, left and right are the same thing. */
function layoutKey(columns, strv) {
    const blocks = parseLayout(strv).map(({id, place}) =>
        columns === 1 && place !== 'hidden' ? `${id}:shown` : `${id}:${place}`);
    return `${columns}|${blocks.join(',')}`;
}

/**
 * Version 2.0 had one switch per block and a side for the notifications
 * column. Turn those into a layout once, then forget them.
 *
 * @param {Gio.Settings} settings
 */
export function migrateLegacySettings(settings) {
    const legacyKeys = ['unify-notifications', 'unify-calendar', 'show-header',
        'show-media', 'notifications-side'];
    if (settings.get_user_value('layout') !== null ||
        !legacyKeys.some(key => settings.get_user_value(key) !== null))
        return;

    const side = settings.get_string('notifications-side') === 'right' ? 'right' : 'left';
    const controls = side === 'left' ? 'right' : 'left';
    const place = (key, column) => settings.get_boolean(key) ? column : 'hidden';

    settings.set_strv('layout', serializeLayout([
        {id: 'notifications', place: place('unify-notifications', side)},
        {id: 'calendar', place: place('unify-calendar', side)},
        {id: 'header', place: place('show-header', controls)},
        {id: 'media', place: place('show-media', controls)},
        {id: 'quick-settings', place: controls},
    ]));
    legacyKeys.forEach(key => settings.reset(key));
}
