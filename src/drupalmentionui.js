/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md.
 */

/**
 * @module mention/mentionui
 */

import Collection from '@ckeditor/ckeditor5-utils/src/collection';
import clickOutsideHandler from '@ckeditor/ckeditor5-ui/src/bindings/clickoutsidehandler';
import { keyCodes } from '@ckeditor/ckeditor5-utils/src/keyboard';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';

import TextWatcher from "@ckeditor/ckeditor5-mention/src/textwatcher";

import MentionsView from '@ckeditor/ckeditor5-mention/src/ui/mentionsview';
import MentionListItemView from '@ckeditor/ckeditor5-mention/src/ui/mentionlistitemview';
import MentionUI from "@ckeditor/ckeditor5-mention/src/mentionui";

const VERTICAL_SPACING = 3;

const VALID_MENTION_DEFAULT_CHARACTERS = '_a-zA-Z0-9À-ž';

/**
 * The mention UI feature.
 *
 * @extends module:core/plugin~Plugin
 */
export default class DrupalMentionUI extends MentionUI {
    /**
     * @inheritDoc
     */
    static get pluginName() {
        return 'DrupalMentionUI';
    }

    /**
     * @inheritDoc
     */
    init() {
        // Key listener that handles navigation in mention view.
        this.editor.editing.view.document.on( 'keydown', ( evt, data ) => {
            if ( isHandledKey( data.keyCode ) && this.panelView.isVisible ) {
                data.preventDefault();
                evt.stop(); // Required for enter overriding.

                if ( data.keyCode == keyCodes.arrowdown ) {
                    this._mentionsView.selectNext();
                }

                if ( data.keyCode == keyCodes.arrowup ) {
                    this._mentionsView.selectPrevious();
                }

                if ( data.keyCode == keyCodes.enter || data.keyCode == keyCodes.tab || data.keyCode == keyCodes.space ) {
                    this._mentionsView.executeSelected();
                }

                if ( data.keyCode == keyCodes.esc ) {
                    this._hidePanelAndRemoveMarker();
                }
            }
        }, { priority: 'highest' } ); // Required to override enter.

        // Close the #panelView upon clicking outside of the plugin UI.
        clickOutsideHandler( {
            emitter: this.panelView,
            contextElements: [ this.panelView.element ],
            activator: () => this.panelView.isVisible,
            callback: () => this._hidePanelAndRemoveMarker()
        } );

        const feeds = this.editor.config.get( 'mention.feeds' );

        for ( const mentionDescription of feeds ) {
            const feed = mentionDescription.feed;

            const marker = mentionDescription.marker;

            if ( !marker || marker.length != 1 ) {
                /**
                 * The marker must be a single character.
                 *
                 * Correct markers: `'@'`, `'#'`.
                 *
                 * Incorrect markers: `'$$'`, `'[@'`.
                 *
                 * See {@link module:mention/mention~MentionConfig}.
                 *
                 * @error mentionconfig-incorrect-marker
                 */
                throw new CKEditorError( 'mentionconfig-incorrect-marker: The marker must be provided and be a single character.' );
            }

            const validMentionCharacters = mentionDescription.validCharacters || VALID_MENTION_DEFAULT_CHARACTERS;
            const minimumCharacters = mentionDescription.minimumCharacters || 0;
            const feedCallback = typeof feed == 'function' ? feed : createFeedCallback( feed );
            const watcher = this._setupTextWatcherForFeed( marker, minimumCharacters, validMentionCharacters );
            const itemRenderer = mentionDescription.itemRenderer;

            const definition = { watcher, marker, feedCallback, itemRenderer, validMentionCharacters };

            this._mentionsConfigurations.set( marker, definition );
        }
    }

    /**
     * Returns the valid mention characters.
     *
     * @private
     * @param {String} marker
     * @returns {module:mention/textwatcher~TextWatcher}
     */
    _getValidMentionCharacters( marker ) {
        const { validMentionCharacters } = this._mentionsConfigurations.get( marker );

        return validMentionCharacters;
    }

    /**
     * Creates the {@link #_mentionsView}.
     *
     * @private
     * @returns {module:mention/ui/mentionsview~MentionsView}
     */
    _createMentionView() {
        const locale = this.editor.locale;

        const mentionsView = new MentionsView( locale );

        this._items = new Collection();

        this.panelView.content.add( mentionsView );

        mentionsView.items.bindTo( this._items ).using( data => {
            const { item, marker } = data;

            const listItemView = new MentionListItemView( locale );

            const view = this._renderItem( item, marker );
            view.delegate( 'execute' ).to( listItemView );

            listItemView.children.add( view );
            listItemView.item = item;
            listItemView.marker = marker;

            listItemView.on( 'execute', () => {
                mentionsView.fire( 'execute', {
                    item,
                    marker
                } );
            } );

            return listItemView;
        } );

        mentionsView.on( 'execute', ( evt, data ) => {
            const editor = this.editor;
            const model = editor.model;

            const item = data.item;
            const marker = data.marker;

            const watcher = this._getWatcher( marker );

            const text = watcher.last;

            const textMatcher = createTextMatcher( marker, this._getValidMentionCharacters( marker ) );
            const matched = textMatcher( text );
            const matchedTextLength = matched.marker.length + matched.feedText.length;

            // Create a range on matched text.
            const end = model.createPositionAt( model.document.selection.focus );
            const start = end.getShiftedBy( -matchedTextLength );
            const range = model.createRange( start, end );

            this._hidePanelAndRemoveMarker();

            editor.execute( 'mention', {
                mention: item,
                text: item.text,
                marker,
                range
            } );

            editor.editing.view.focus();
        } );

        return mentionsView;
    }

    /**
     * Registers a text watcher for marker.
     *
     * @private
     * @param {String} marker
     * @param {Number} minimumCharacters
     * @returns {module:mention/textwatcher~TextWatcher}
     */
    _setupTextWatcherForFeed( marker, minimumCharacters, validMentionCharacters ) {
        const editor = this.editor;

        const watcher = new TextWatcher( editor, createTestCallback( marker, minimumCharacters, validMentionCharacters ), createTextMatcher( marker, validMentionCharacters ) );

        watcher.on( 'matched', ( evt, data ) => {
            const matched = data.matched;

            const selection = editor.model.document.selection;

            const hasMention = selection.hasAttribute( 'mention' );
            const nodeBefore = selection.focus.nodeBefore;

            if ( hasMention || nodeBefore && nodeBefore.is( 'text' ) && nodeBefore.hasAttribute( 'mention' ) ) {
                return;
            }

            const { feedText, marker } = matched;

            const matchedTextLength = marker.length + feedText.length;

            // create marker range
            const start = selection.focus.getShiftedBy( -matchedTextLength );
            const end = selection.focus.getShiftedBy( -feedText.length );

            const markerRange = editor.model.createRange( start, end );

            let mentionMarker;

            if ( editor.model.markers.has( 'mention' ) ) {
                mentionMarker = editor.model.markers.get( 'mention' );
            } else {
                mentionMarker = editor.model.change( writer => writer.addMarker( 'mention', {
                    range: markerRange,
                    usingOperation: false,
                    affectsData: false
                } ) );
            }

            this._getFeed( marker, feedText )
                .then( feed => {
                    this._items.clear();

                    for ( const feedItem of feed ) {
                        const item = typeof feedItem != 'object' ? { id: feedItem, text: feedItem } : feedItem;

                        this._items.add( { item, marker } );
                    }

                    if ( this._items.length ) {
                        this._showPanel( mentionMarker );
                    } else {
                        this._hidePanelAndRemoveMarker();
                    }
                } );
        } );

        watcher.on( 'unmatched', () => {
            this._hidePanelAndRemoveMarker();
        } );

        return watcher;
    }
}

// Returns balloon positions data callbacks.
//
// @returns {Array.<module:utils/dom/position~Position>}
function getBalloonPanelPositions( positionName ) {
    const positions = {
        // Positions panel to the south of caret rect.
        'caret_se': targetRect => {
            return {
                top: targetRect.bottom + VERTICAL_SPACING,
                left: targetRect.right,
                name: 'caret_se'
            };
        },

        // Positions panel to the north of caret rect.
        'caret_ne': ( targetRect, balloonRect ) => {
            return {
                top: targetRect.top - balloonRect.height - VERTICAL_SPACING,
                left: targetRect.right,
                name: 'caret_ne'
            };
        },

        // Positions panel to the south of caret rect.
        'caret_sw': ( targetRect, balloonRect ) => {
            return {
                top: targetRect.bottom + VERTICAL_SPACING,
                left: targetRect.right - balloonRect.width,
                name: 'caret_sw'
            };
        },

        // Positions panel to the north of caret rect.
        'caret_nw': ( targetRect, balloonRect ) => {
            return {
                top: targetRect.top - balloonRect.height - VERTICAL_SPACING,
                left: targetRect.right - balloonRect.width,
                name: 'caret_nw'
            };
        }
    };

    // Return only last position if it was matched to prevent panel from jumping after first match.
    if ( positions.hasOwnProperty( positionName ) ) {
        return [
            positions[ positionName ]
        ];
    }

    // As default return all positions callbacks.
    return [
        positions.caret_se,
        positions.caret_ne,
        positions.caret_sw,
        positions.caret_nw
    ];
}

// Creates a regex pattern for marker.
//
// @param {String} marker
// @param {Number} minimumCharacters
// @returns {String}
function createPattern( marker, minimumCharacters, validMentionCharacters ) {
    const numberOfCharacters = minimumCharacters == 0 ? '*' : `{${ minimumCharacters },}`;

    return `(^| )(\\${ marker })([${ validMentionCharacters }]${ numberOfCharacters }?)$`;
}

// Creates a test callback for marker to be used in text watcher instance.
//
// @param {String} marker
// @param {Number} minimumCharacters
// @returns {Function}
function createTestCallback( marker, minimumCharacters, validMentionCharacters ) {
    const regExp = new RegExp( createPattern( marker, minimumCharacters, validMentionCharacters ) );

    return text => regExp.test( text );
}

// Creates a text watcher matcher for marker.
//
// @param {String} marker
// @returns {Function}
function createTextMatcher( marker, validMentionCharacters ) {
    const regExp = new RegExp( createPattern( marker, 0, validMentionCharacters ) );

    return text => {
        const match = text.match( regExp );

        const marker = match[ 2 ];
        const feedText = match[ 3 ];

        return { marker, feedText };
    };
}

// Default feed callback
function createFeedCallback( feedItems ) {
    return feedText => {
        const filteredItems = feedItems
        // Make default mention feed case-insensitive.
            .filter( item => {
                // Item might be defined as object.
                const itemId = typeof item == 'string' ? item : String( item.id );

                // The default feed is case insensitive.
                return itemId.toLowerCase().includes( feedText.toLowerCase() );
            } )
            // Do not return more than 10 items.
            .slice( 0, 10 );

        return Promise.resolve( filteredItems );
    };
}

// Checks if given key code is handled by the mention ui.
//
// @param {Number}
// @returns {Boolean}
function isHandledKey( keyCode ) {
    const handledKeyCodes = [
        keyCodes.arrowup,
        keyCodes.arrowdown,
        keyCodes.enter,
        keyCodes.tab,
        keyCodes.space,
        keyCodes.esc
    ];

    return handledKeyCodes.includes( keyCode );
}
