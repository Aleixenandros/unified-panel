// SPDX-License-Identifier: Apache-2.0

import GLib from 'gi://GLib';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ClockFormatter} from './lib/clockFormatter.js';
import {migrateLegacySettings} from './lib/layout.js';
import {UnifiedPanel} from './lib/unifiedPanel.js';

export default class UnifiedPanelExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        migrateLegacySettings(this._settings);

        // Any option change rebuilds everything: simple and predictable.
        // Changes made together (e.g. choosing a preset) rebuild only once.
        this._settings.connectObject('changed', () => this._queueRebuild(), this);
        this._build();
    }

    disable() {
        if (this._rebuildId) {
            GLib.source_remove(this._rebuildId);
            this._rebuildId = 0;
        }
        this._settings.disconnectObject(this);
        this._teardown();
        this._settings = null;
    }

    _build() {
        this._panel = new UnifiedPanel(this._settings);

        const dateMenu = Main.panel.statusArea.dateMenu;
        if (dateMenu && this._settings.get_boolean('custom-clock'))
            this._clock = new ClockFormatter(dateMenu, this._settings);
    }

    _teardown() {
        this._clock?.destroy();
        this._clock = null;
        this._panel?.destroy();
        this._panel = null;
    }

    _queueRebuild() {
        if (this._rebuildId)
            return;

        this._rebuildId = GLib.idle_add(GLib.PRIORITY_DEFAULT, () => {
            this._rebuildId = 0;
            this._teardown();
            this._build();
            return GLib.SOURCE_REMOVE;
        });
    }
}
