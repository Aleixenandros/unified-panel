// SPDX-License-Identifier: Apache-2.0
//
// Builds the unified panel inside GNOME's Quick Settings popup. Its
// content is a list of blocks placed in one or two columns, as set in the
// `layout` and `columns` keys (see layout.js). The default layout:
//
//   ┌─────────────────────────────┬──────────────────────────┐
//   │ Notifications               │ Clock header             │
//   │  …notification list…        │ Now Playing card         │
//   │ Calendar, events, weather   │ Quick settings grid      │
//   └─────────────────────────────┴──────────────────────────┘
//
// GNOME's own widgets (notification list, calendar, quick settings) are
// moved, not re-implemented, so everything keeps working as in stock GNOME.
// Every change is undone in destroy().

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import GObject from 'gi://GObject';
import Graphene from 'gi://Graphene';
import Meta from 'gi://Meta';
import St from 'gi://St';

import {ensureActorVisibleInScrollView} from 'resource:///org/gnome/shell/misc/animationUtils.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

import {ClockHeader} from './clockHeader.js';
import {parseLayout} from './layout.js';
import {MediaCard} from './mediaCard.js';

/** Remembers where an actor lived so it can be put back later. */
class MovedActor {
    constructor(actor) {
        this.actor = actor;
        this.parent = actor.get_parent();
        this.index = this.parent?.get_children().indexOf(actor) ?? -1;
    }

    /** @param {Clutter.Actor|null} newParent null takes the actor out */
    moveTo(newParent) {
        this.parent?.remove_child(this.actor);
        newParent?.add_child(this.actor);
    }

    restore() {
        this.actor.get_parent()?.remove_child(this.actor);
        this.parent?.insert_child_at_index(this.actor, this.index);
    }
}

/**
 * A box whose minimum height is its natural height. Inside a scroll view
 * it makes the view scroll instead of squeezing the content (which would
 * shrink the notification list and hide the events below the calendar).
 */
const UnsqueezableBox = GObject.registerClass(
class UnsqueezableBox extends St.BoxLayout {
    vfunc_get_preferred_height(forWidth) {
        const [, natural] = super.vfunc_get_preferred_height(forWidth);
        return [natural, natural];
    }
});

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

        box.add_style_class_name('unified-panel');

        this._root = new St.BoxLayout({
            style_class: 'unified-panel-root',
            x_expand: true,
            y_expand: true,
        });
        box.insert_child_above(this._root, grid);

        const twoColumns = this._settings.get_int('columns') === 2;
        const blocks = parseLayout(this._settings.get_strv('layout'))
            .filter(block => block.place !== 'hidden');
        this._shown = new Set(blocks.map(block => block.id));

        this._columns = new Map();
        this._cards = new Set();
        if (!twoColumns)
            this._columns.set('left', this._newColumn(UnsqueezableBox));
        for (const {id, place} of blocks)
            this._addBlock(id, this._column(twoColumns ? place : 'left'));

        if (twoColumns) {
            for (const place of ['left', 'right']) {
                if (this._columns.has(place))
                    this._root.add_child(this._columns.get(place));
            }
        } else {
            // Everything in one column rarely fits on the screen: scroll.
            // The scroll view squeezes its direct child down to its
            // minimum, so the column goes inside a plain box.
            const content = new St.BoxLayout({
                orientation: Clutter.Orientation.VERTICAL,
                x_expand: true,
            });
            content.add_child(this._columns.get('left'));
            this._scrollView = new St.ScrollView({
                hscrollbar_policy: St.PolicyType.NEVER,
                overlay_scrollbars: true,
                x_expand: true,
                y_expand: true,
                child: content,
            });
            this._root.add_child(this._scrollView);

            this._scrollView.vadjustment.connectObject(
                'notify::value', () => this._queueOverlaySync(), this);
            global.stage.connectObject(
                'notify::key-focus', () => this._ensureFocusVisible(), this);
        }

        // Quick settings submenus (Wi-Fi list, Bluetooth devices...) live in
        // an overlay positioned relative to the grid. GNOME only tracks the
        // grid's direct parents, so also follow our extra containers.
        for (const actor of this._trackedActors()) {
            actor.connectObject(
                'notify::x', () => this._queueOverlaySync(),
                'notify::y', () => this._queueOverlaySync(),
                this);
        }
    }

    /** Scroll to the widget focused with the keyboard, if needed. */
    _ensureFocusVisible() {
        const focus = global.stage.key_focus;
        if (focus && focus !== this._scrollView && this._scrollView.contains(focus))
            ensureActorVisibleInScrollView(this._scrollView, focus);
    }

    _trackedActors() {
        return [this._root, ...this._columns.values(), this._menu._grid];
    }

    /**
     * @param {string} place 'left' or 'right'
     * @returns {St.BoxLayout} the column, created on first use
     */
    _column(place) {
        let column = this._columns.get(place);
        if (!column) {
            column = this._newColumn(St.BoxLayout);
            this._columns.set(place, column);
        }
        return column;
    }

    _newColumn(BoxClass) {
        return new BoxClass({
            style_class: 'unified-panel-column',
            orientation: Clutter.Orientation.VERTICAL,
            y_expand: true,
        });
    }

    /**
     * Notifications and calendar go in a rounded card. When they follow
     * each other in a column they share it, as in GNOME's clock popup.
     *
     * @param {St.BoxLayout} column
     * @returns {St.BoxLayout} the card
     */
    _card(column) {
        const last = column.get_last_child();
        if (this._cards.has(last))
            return last;

        const card = new St.BoxLayout({
            style_class: 'unified-panel-card',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
        });
        column.add_child(card);
        this._cards.add(card);
        return card;
    }

    _addBlock(id, column) {
        switch (id) {
        case 'header':
            column.add_child(new ClockHeader(this._settings));
            break;
        case 'media':
            this._addMediaCard(column);
            break;
        case 'quick-settings':
            this._move(this._menu._grid, column);
            break;
        case 'notifications':
            this._addNotifications(this._card(column));
            break;
        case 'calendar':
            this._addCalendar(this._card(column));
            break;
        }
    }

    _addMediaCard(column) {
        // Take media players out of the notification list...
        const view = this._dateMenu._messageList._messageView;
        view._mediaSource.disconnectObject(view);
        [...view._playerToMessage.keys()].forEach(p => view._removePlayer(p));
        this._mediaView = view;
        // ...and show them in our own card instead.
        column.add_child(new MediaCard(view._mediaSource));
    }

    _addNotifications(card) {
        if (this._settings.get_boolean('show-notifications-title')) {
            card.add_child(new St.Label({
                style_class: 'unified-panel-section-title',
                text: _('Notifications'),
            }));
        }

        const messageList = this._dateMenu._messageList;
        this._move(messageList, card);
        messageList.setCaptureContainer(this._menu.actor);
    }

    _addCalendar(card) {
        // The column with the "today" button, calendar, events, world
        // clocks and weather.
        const calendarColumn = this._dateMenu._calendar.get_parent();
        const separated = card.get_n_children() > 0;
        this._move(calendarColumn, card);

        calendarColumn.add_style_class_name('unified-panel-calendar');
        if (separated)
            calendarColumn.add_style_class_name('unified-panel-separated');
        this._calendarColumn = calendarColumn;
        this._calendarAlign = calendarColumn.x_align;
        calendarColumn.x_align = Clutter.ActorAlign.CENTER;

        // Take out the sections turned off; destroy() puts them back.
        const sections = [
            ['calendar-show-events', this._dateMenu._eventsItem],
            ['calendar-show-world-clocks', this._dateMenu._clocksItem],
            ['calendar-show-weather', this._dateMenu._weatherItem],
        ];
        for (const [key, section] of sections) {
            if (section?.get_parent() && !this._settings.get_boolean(key))
                this._move(section, null);
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
        if (!this._shown.has('notifications') || !this._shown.has('calendar'))
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

        if (!this._shown.has('calendar'))
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

        for (const actor of this._trackedActors())
            actor.disconnectObject(this);
        if (this._scrollView) {
            this._scrollView.vadjustment.disconnectObject(this);
            global.stage.disconnectObject(this);
        }

        if (this._calendarColumn) {
            this._calendarColumn.remove_style_class_name('unified-panel-calendar');
            this._calendarColumn.remove_style_class_name('unified-panel-separated');
            this._calendarColumn.x_align = this._calendarAlign;
        }

        // Put GNOME's widgets back where they were, in reverse order,
        // before destroying our containers.
        this._moved.reverse().forEach(moved => moved.restore());
        this._moved = [];

        this._dateMenu._messageList.setCaptureContainer(this._dateMenu.menu.actor);

        this._root.destroy();
        this._root = null;
        this._scrollView = null;
        this._columns = null;
        this._cards = null;

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
