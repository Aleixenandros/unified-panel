// SPDX-License-Identifier: Apache-2.0
//
// "Now Playing" card for MPRIS players.
// It reuses GNOME Shell's own MprisSource, so no extra D-Bus watchers
// are created.

import Clutter from 'gi://Clutter';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Pango from 'gi://Pango';
import St from 'gi://St';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';

const PLAYING = 'Playing';

export const MediaCard = GObject.registerClass(
class MediaCard extends St.BoxLayout {
    /**
     * @param {object} source a GNOME Shell `Mpris.MprisSource`
     */
    constructor(source) {
        super({
            style_class: 'unified-panel-media',
            orientation: Clutter.Orientation.VERTICAL,
            x_expand: true,
            visible: false,
        });

        this._source = source;
        this._players = [];
        this._player = null;
        this._chosenByUser = false;

        this._buildUi();

        source.connectObject(
            'player-added', (_s, player) => this._addPlayer(player),
            'player-removed', (_s, player) => this._removePlayer(player),
            this);
        source.players.forEach(player => this._addPlayer(player));
    }

    _buildUi() {
        // Top row: cover, track info and "switch player" button
        const top = new St.BoxLayout({
            style_class: 'unified-panel-media-top',
            x_expand: true,
        });
        this.add_child(top);

        const infoButton = new St.Button({
            style_class: 'unified-panel-media-info-button',
            can_focus: true,
            x_expand: true,
            accessible_name: _('Open media player'),
        });
        infoButton.connect('clicked', () => {
            this._player?.raise();
            Main.panel.closeQuickSettings();
        });
        top.add_child(infoButton);

        const infoBox = new St.BoxLayout({style_class: 'unified-panel-media-info', x_expand: true});
        infoButton.set_child(infoBox);

        this._cover = new St.Icon({
            style_class: 'unified-panel-media-cover',
            y_align: Clutter.ActorAlign.CENTER,
        });
        infoBox.add_child(this._cover);

        const labels = new St.BoxLayout({
            orientation: Clutter.Orientation.VERTICAL,
            y_align: Clutter.ActorAlign.CENTER,
            x_expand: true,
        });
        infoBox.add_child(labels);

        this._appLabel = this._makeLabel('unified-panel-media-app');
        this._titleLabel = this._makeLabel('unified-panel-media-title');
        this._artistLabel = this._makeLabel('unified-panel-media-artist');
        labels.add_child(this._appLabel);
        labels.add_child(this._titleLabel);
        labels.add_child(this._artistLabel);

        this._switchButton = this._makeButton('view-more-horizontal-symbolic',
            _('Switch media player'), () => this._cyclePlayer());
        this._switchButton.y_align = Clutter.ActorAlign.START;
        top.add_child(this._switchButton);

        // Bottom row: playback controls
        const controls = new St.BoxLayout({
            style_class: 'unified-panel-media-controls',
            x_align: Clutter.ActorAlign.CENTER,
        });
        this.add_child(controls);

        this._prevButton = this._makeButton('media-skip-backward-symbolic',
            _('Previous track'), () => this._player?.previous());
        this._playButton = this._makeButton('media-playback-start-symbolic',
            _('Play or pause'), () => this._player?.playPause());
        this._playButton.add_style_class_name('unified-panel-media-play');
        this._nextButton = this._makeButton('media-skip-forward-symbolic',
            _('Next track'), () => this._player?.next());

        controls.add_child(this._prevButton);
        controls.add_child(this._playButton);
        controls.add_child(this._nextButton);
    }

    _makeLabel(styleClass) {
        const label = new St.Label({style_class: styleClass, x_expand: true});
        label.clutter_text.ellipsize = Pango.EllipsizeMode.END;
        return label;
    }

    _makeButton(iconName, accessibleName, callback) {
        const button = new St.Button({
            style_class: 'unified-panel-media-button',
            can_focus: true,
            accessible_name: accessibleName,
            child: new St.Icon({icon_name: iconName}),
        });
        button.connect('clicked', callback);
        return button;
    }

    _addPlayer(player) {
        if (this._players.includes(player))
            return;

        this._players.push(player);
        player.connectObject('changed', () => this._sync(), this);
        this._sync();
    }

    _removePlayer(player) {
        player.disconnectObject(this);
        this._players = this._players.filter(p => p !== player);
        if (this._player === player) {
            this._player = null;
            this._chosenByUser = false;
        }
        this._sync();
    }

    _cyclePlayer() {
        if (this._players.length < 2)
            return;

        const index = this._players.indexOf(this._player);
        this._player = this._players[(index + 1) % this._players.length];
        this._chosenByUser = true;
        this._sync();
    }

    /** Prefer the player the user chose, then a playing one, then the first. */
    _pickPlayer() {
        if (this._player && this._chosenByUser)
            return this._player;

        if (this._player?.status === PLAYING)
            return this._player;

        return this._players.find(p => p.status === PLAYING) ??
            this._player ?? this._players[0] ?? null;
    }

    _sync() {
        this._player = this._pickPlayer();
        const player = this._player;

        this.visible = player !== null;
        if (!player)
            return;

        this._appLabel.text = player.app?.get_name() ?? player.source?.title ?? '';
        this._appLabel.visible = this._appLabel.text !== '';
        this._titleLabel.text = player.trackTitle || _('Unknown title');
        this._artistLabel.text = (player.trackArtists ?? []).join(', ');
        this._artistLabel.visible = this._artistLabel.text !== '';

        if (player.trackCoverUrl) {
            this._cover.gicon = new Gio.FileIcon({
                file: Gio.File.new_for_uri(player.trackCoverUrl),
            });
            this._cover.remove_style_class_name('fallback');
        } else {
            this._cover.gicon = player.app?.get_icon() ??
                new Gio.ThemedIcon({name: 'audio-x-generic-symbolic'});
            this._cover.add_style_class_name('fallback');
        }

        this._playButton.child.icon_name = player.status === PLAYING
            ? 'media-playback-pause-symbolic'
            : 'media-playback-start-symbolic';
        this._prevButton.reactive = !!player.canGoPrevious;
        this._nextButton.reactive = !!player.canGoNext;
        this._switchButton.visible = this._players.length > 1;
    }
});
