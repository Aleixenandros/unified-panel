// SPDX-License-Identifier: GPL-2.0-or-later
//
// Builds the unified panel inside GNOME's Quick Settings popup:
//
//   ┌─────────────────────────────┬──────────────────────────┐
//   │ Notifications (Windows 11)  │ Clock header   (macOS)   │
//   │  …notification list…        │ Now Playing card         │
//   │ Calendar, events, weather   │ Quick settings grid      │
//   └─────────────────────────────┴──────────────────────────┘
//
// GNOME's own widgets (notification list, calendar, quick settings) are
// moved, not re-implemented, so everything keeps working as in stock GNOME.
// Every change is undone in destroy().

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ClockHeader} from './clockHeader.js';
import {MediaCard} from './mediaCard.js';

/** Remembers where an actor lived so it can be put back later. */
class MovedActor {
    constructor(actor) {
        this.actor = actor;
        this.parent = actor.get_parent();
        this.index = this.parent?.get_children().indexOf(actor) ?? -1;
    }

    moveTo(newParent) {
        this.parent?.remove_child(this.actor);
        newParent.add_child(this.actor);
    }

    restore() {
        this.actor.get_parent()?.remove_child(this.actor);
        this.parent?.insert_child_at_index(this.actor, this.index);
    }
}

export class UnifiedPanel {
    /**
     * @param {Gio.Settings} settings the extension settings
     */
    constructor(settings) {
        this._settings = settings;
        this._moved = [];
        this._patches = [];
        this._laterId = 0;

        this._quickSettings = Main.panel.statusArea.quickSettings;
        this._dateMenu = Main.panel.statusArea.dateMenu;
        this._menu = this._quickSettings?.menu;

        if (!this._menu?._grid || !this._dateMenu?._messageList) {
            console.warn('[Unified Panel] Quick Settings or Date Menu not found; doing nothing');
            this._menu = null;
            return;
        }

        this._menu.close();
        this._dateMenu.menu.close();

        this._buildLayout();
        this._setupDateMenu();
        this._setupIndicator();

        this._menu.connectObject('open-state-changed', (_menu, isOpen) => {
            if (isOpen)
                this._onMenuOpened();
        }, this);
    }

    // ── Layout ────────────────────────────────────────────────────────

    _buildLayout() {
        const box = this._menu.box;
        const grid = this._menu._grid;
        const view = this._dateMenu._messageList._messageView;

        box.add_style_class_name('unified-panel');

        this._root = new St.BoxLayout({
            style_class: 'unified-panel-root',
            x_expand: true,
            y_expand: true,
        });
        box.insert_child_above(this._root, grid);

        this._controlColumn = new St.BoxLayout({
            style_class: 'unified-panel-column unified-panel-control-column',
            orientation: Clutter.Orientation.VERTICAL,
            y_expand: true,
        });

        this._unifyNotifications = this._settings.get_boolean('unify-notifications');
        this._unifyCalendar = this._settings.get_boolean('unify-calendar');

        if (this._unifyNotifications || this._unifyCalendar) {
            this._sideColumn = new St.BoxLayout({
                style_class: 'unified-panel-column unified-panel-side-column',
                orientation: Clutter.Orientation.VERTICAL,
                y_expand: true,
            });

            if (this._unifyNotifications) {
                this._sideColumn.add_child(new St.Label({
                    style_class: 'unified-panel-section-title',
                    text: _('Notifications'),
                }));

                const messageList = this._dateMenu._messageList;
                this._move(messageList, this._sideColumn);
                messageList.setCaptureContainer(this._menu.actor);
            }

            if (this._unifyCalendar) {
                // The column with the "today" button, calendar, events,
                // world clocks and weather.
                const calendarColumn = this._dateMenu._calendar.get_parent();
                this._move(calendarColumn, this._sideColumn);
                calendarColumn.add_style_class_name('unified-panel-calendar');
                this._calendarColumn = calendarColumn;
                this._calendarAlign = calendarColumn.x_align;
                calendarColumn.x_align = Clutter.ActorAlign.CENTER;
            }

            const onLeft = this._settings.get_string('notifications-side') === 'left';
            this._root.add_child(onLeft ? this._sideColumn : this._controlColumn);
            this._root.add_child(onLeft ? this._controlColumn : this._sideColumn);
        } else {
            this._root.add_child(this._controlColumn);
        }

        if (this._settings.get_boolean('show-header'))
            this._controlColumn.add_child(new ClockHeader(this._settings));

        if (this._settings.get_boolean('show-media')) {
            // Take media players out of the notification list...
            view._mediaSource.disconnectObject(view);
            [...view._playerToMessage.keys()].forEach(p => view._removePlayer(p));
            this._mediaView = view;
            // ...and show them in our own card instead.
            this._controlColumn.add_child(new MediaCard(view._mediaSource));
        }

        this._move(grid, this._controlColumn);

        // Quick settings submenus (Wi-Fi list, Bluetooth devices...) live in
        // an overlay positioned relative to the grid. GNOME only tracks the
        // grid's direct parents, so also follow our extra containers.
        for (const actor of [this._root, this._controlColumn, grid]) {
            actor.connectObject(
                'notify::x', () => this._queueOverlaySync(),
                'notify::y', () => this._queueOverlaySync(),
                this);
        }
    }

    _move(actor, newParent) {
        const moved = new MovedActor(actor);
        moved.moveTo(newParent);
        this._moved.push(moved);
    }

    _queueOverlaySync() {
        if (this._laterId)
            return;

        const laters = global.compositor.get_laters();
        this._laterId = laters.add(Meta.LaterType.BEFORE_REDRAW, () => {
            this._laterId = 0;
            this._syncOverlay();
            return GLib.SOURCE_REMOVE;
        });
    }

    _syncOverlay() {
        const boxPointer = this._menu._boxPointer;
        const offset = this._menu._grid.apply_relative_transform_to_point(
            boxPointer, new Graphene.Point3D());

        for (const constraint of this._menu._overlay.get_constraints()) {
            if (!(constraint instanceof Clutter.BindConstraint) ||
                constraint.source !== boxPointer)
                continue;

            if (constraint.coordinate === Clutter.BindCoordinate.X)
                constraint.offset = offset.x;
            else if (constraint.coordinate === Clutter.BindCoordinate.Y)
                constraint.offset = offset.y;
        }
    }

    // ── Clock button behaviour ───────────────────────────────────────

    _setupDateMenu() {
        // Activating a notification or an event calls closeCalendar();
        // make that close the unified panel too.
        this._patch(Main.panel, 'closeCalendar', original => function () {
            original.call(this);
            this.statusArea.quickSettings.menu.close();
        });

        // When both the notifications and the calendar live in the unified
        // panel, the clock's own popup would be empty: open ours instead.
        if (!this._unifyNotifications || !this._unifyCalendar)
            return;

        const dateMenu = this._dateMenu;
        Main.panel.menuManager.removeMenu(dateMenu.menu);
        this._dateMenuRemoved = true;

        this._patch(dateMenu.menu, 'toggle', () => () => this._toggleFromClock());
    }

    _toggleFromClock() {
        if (this._menu.isOpen) {
            this._menu.close();
            return;
        }

        this._menu.open();
        // Point the popup arrow at the clock rather than the system icons.
        this._menu._boxPointer.setPosition(this._dateMenu, 0.5);
    }

    _onMenuOpened() {
        this._limitHeight();
        this._queueOverlaySync();

        if (!this._unifyCalendar)
            return;

        // Same as GNOME does when its calendar popup opens: select today.
        const now = new Date();
        this._dateMenu._calendar.setDate(now);
        this._dateMenu._date.setDate(now);
        this._dateMenu._eventsItem.setDate(now);
    }

    /**
     * Keep the popup inside the screen. GNOME sets max-height on the Quick
     * Settings menu actor, but that actor is only a 0×0 holder, so the
     * limit never reaches the content. Limit our root box instead; the
     * notification list and the events list then scroll.
     */
    _limitHeight() {
        const layout = Main.layoutManager;
        const monitorIndex = layout.findIndexForActor(this._quickSettings) ?? layout.primaryIndex;
        const workArea = layout.getWorkAreaForMonitor(monitorIndex);
        const scale = St.ThemeContext.get_for_stage(global.stage).scale_factor;

        // Room for the popup padding, border, arrow and screen margins.
        const chrome = 96;
        const maxHeight = Math.floor(workArea.height / scale) - chrome;
        this._root.style = `max-height: ${maxHeight}px;`;
    }

    _setupIndicator() {
        if (!this._settings.get_boolean('hide-messages-indicator'))
            return;

        const indicator = this._dateMenu._indicator;
        indicator.connectObject('notify::visible', () => {
            if (indicator.visible)
                indicator.hide();
        }, this);
        indicator.hide();
        this._hiddenIndicator = indicator;
    }

    /**
     * Replace obj[name] and remember how to undo it.
     *
     * @param {object} obj
     * @param {string} name
     * @param {Function} makeReplacement receives the original function
     */
    _patch(obj, name, makeReplacement) {
        const hadOwn = Object.hasOwn(obj, name);
        const original = obj[name];
        obj[name] = makeReplacement(original);
        this._patches.push(() => {
            if (hadOwn)
                obj[name] = original;
            else
                delete obj[name];
        });
    }

    // ── Teardown ─────────────────────────────────────────────────────

    destroy() {
        if (!this._menu)
            return;

        this._menu.close();
        this._menu.disconnectObject(this);

        if (this._laterId) {
            global.compositor.get_laters().remove(this._laterId);
            this._laterId = 0;
        }

        this._patches.reverse().forEach(undo => undo());
        this._patches = [];

        if (this._dateMenuRemoved)
            Main.panel.menuManager.addMenu(this._dateMenu.menu);

        if (this._hiddenIndicator) {
            this._hiddenIndicator.disconnectObject(this);
            this._hiddenIndicator._sync();
        }

        for (const actor of [this._root, this._controlColumn, this._menu._grid])
            actor.disconnectObject(this);

        if (this._calendarColumn) {
            this._calendarColumn.remove_style_class_name('unified-panel-calendar');
            this._calendarColumn.x_align = this._calendarAlign;
        }

        // Put GNOME's widgets back where they were, in reverse order,
        // before destroying our containers.
        this._moved.reverse().forEach(moved => moved.restore());
        this._moved = [];

        this._dateMenu._messageList.setCaptureContainer(this._dateMenu.menu.actor);

        this._root.destroy();
        this._root = null;

        // Give the media players back to the notification list.
        if (this._mediaView) {
            this._mediaView._setupMpris();
            this._mediaView = null;
        }

        this._menu.box.remove_style_class_name('unified-panel');
        this._menu._boxPointer.setPosition(this._quickSettings, this._menu._arrowAlignment);
        this._syncOverlay();
        this._menu = null;
    }
}
