// SPDX-License-Identifier: GPL-2.0-or-later

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {ClockFormatter} from './lib/clockFormatter.js';
import {UnifiedPanel} from './lib/unifiedPanel.js';

export default class UnifiedPanelExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        // Any option change rebuilds everything: simple and predictable.
        this._settings.connectObject('changed', () => this._rebuild(), this);
        this._build();
    }

    disable() {
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

    _rebuild() {
        this._teardown();
        this._build();
    }
}
