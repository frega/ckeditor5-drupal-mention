/**
 * @module drupalmention/drupalmentionui
 */

import clickOutsideHandler from '@ckeditor/ckeditor5-ui/src/bindings/clickoutsidehandler';
import { keyCodes } from '@ckeditor/ckeditor5-utils/src/keyboard';
import CKEditorError from '@ckeditor/ckeditor5-utils/src/ckeditorerror';
import ContextualBalloon from '@ckeditor/ckeditor5-ui/src/panel/balloon/contextualballoon';
import Collection from '@ckeditor/ckeditor5-utils/src/collection';

import TextWatcher from "@ckeditor/ckeditor5-mention/src/textwatcher";
import featureDetection from './featuredetection';
import MentionUI from "@ckeditor/ckeditor5-mention/src/mentionui";
import MentionsView from "@ckeditor/ckeditor5-mention/src/ui/mentionsview";
import MentionListItemView from "@ckeditor/ckeditor5-mention/src/ui/mentionlistitemview";

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
        const editor = this.editor;

        /**
         * The contextual balloon plugin instance.
         *
         * @private
         * @member {module:ui/panel/balloon/contextualballoon~ContextualBalloon}
         */
        this._balloon = editor.plugins.get( ContextualBalloon );

        // Key listener that handles navigation in mention view.
        editor.editing.view.document.on( 'keydown', ( evt, data ) => {
            if ( isHandledKey( data.keyCode ) && this._isUIVisible ) {
                data.preventDefault();
                evt.stop(); // Required for Enter key overriding.

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
                    this._hideUIAndRemoveMarker();
                }
            }
        }, { priority: 'highest' } ); // Required to override the Enter key.

        // Close the dropdown upon clicking outside of the plugin UI.
        clickOutsideHandler( {
            emitter: this._mentionsView,
            activator: () => this._isUIVisible,
            contextElements: [ this._balloon.view.element ],
            callback: () => this._hideUIAndRemoveMarker()
        } );

        const feeds = editor.config.get( 'mention.feeds' );

        for ( const mentionDescription of feeds ) {
            const feed = mentionDescription.feed;

            const marker = mentionDescription.marker;

            const validMentionCharacters = mentionDescription.validCharacters || VALID_MENTION_DEFAULT_CHARACTERS;

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
                throw new CKEditorError( 'mentionconfig-incorrect-marker: The marker must be provided and it must be a single character.' );
            }

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
     * Registers a text watcher for the marker.
     *
     * @private
     * @param {String} marker
     * @param {Number} minimumCharacters
     * @param {String} validMentionCharacters
     * @returns {module:mention/textwatcher~TextWatcher}
     */
    _setupTextWatcherForFeed( marker, minimumCharacters, validMentionCharacters ) {
        const editor = this.editor;

        const watcher = new TextWatcher( editor, createTestCallback( marker, minimumCharacters, validMentionCharacters ), createTextMatcher( marker, validMentionCharacters ) );

        watcher.on( 'matched', ( evt, data ) => {
            const matched = data.matched;

            const selection = editor.model.document.selection;

            const focus = selection.focus;

            // The text watcher listens only to changed range in selection - so the selection attributes are not yet available
            // and you cannot use selection.hasAttribute( 'mention' ) just yet.
            // See https://github.com/ckeditor/ckeditor5-engine/issues/1723.
            const hasMention = focus.textNode && focus.textNode.hasAttribute( 'mention' );

            const nodeBefore = focus.nodeBefore;

            if ( hasMention || nodeBefore && nodeBefore.is( 'text' ) && nodeBefore.hasAttribute( 'mention' ) ) {
                return;
            }

            const { feedText, marker } = matched;

            const matchedTextLength = marker.length + feedText.length;

            // Create a marker range.
            const start = focus.getShiftedBy( -matchedTextLength );
            const end = focus.getShiftedBy( -feedText.length );

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
                        this._showUI( mentionMarker );
                    } else {
                        this._hideUIAndRemoveMarker();
                    }
                } );
        } );

        watcher.on( 'unmatched', () => {
            this._hideUIAndRemoveMarker();
        } );

        return watcher;
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

            const validMentionCharacters = this._getValidMentionCharacters( marker );

            const text = watcher.last;

            const textMatcher = createTextMatcher( marker, validMentionCharacters );
            const matched = textMatcher( text );
            const matchedTextLength = matched.marker.length + matched.feedText.length;

            // Create a range on matched text.
            const end = model.createPositionAt( model.document.selection.focus );
            const start = end.getShiftedBy( -matchedTextLength );
            const range = model.createRange( start, end );

            this._hideUIAndRemoveMarker();

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
}

// Creates a RegExp pattern for the marker.
//
// Function has to be exported to achieve 100% code coverage.
//
// @param {String} marker
// @param {Number} minimumCharacters
// @returns {RegExp}
export function createRegExp( marker, minimumCharacters, validMentionCharacters ) {
    const numberOfCharacters = minimumCharacters == 0 ? '*' : `{${ minimumCharacters },}`;
    const patternBase = featureDetection.isPunctuationGroupSupported ? '\\p{Ps}\\p{Pi}"\'' : '\\(\\[{"\'';

    return new RegExp( buildPattern( patternBase, marker, numberOfCharacters, validMentionCharacters ), 'u' );
}



// Helper to build a RegExp pattern string for the marker.
//
// @param {String} whitelistedCharacters
// @param {String} marker
// @param {Number} minimumCharacters
// @returns {String}
function buildPattern( whitelistedCharacters, marker, numberOfCharacters, validMentionCharacters ) {
    validMentionCharacters = validMentionCharacters || VALID_MENTION_DEFAULT_CHARACTERS;
    return `(^|[ ${ whitelistedCharacters }])([${ marker }])([${ validMentionCharacters }]${ numberOfCharacters }?)$`;
}

// Creates a test callback for the marker to be used in the text watcher instance.
//
// @param {String} marker
// @param {Number} minimumCharacters
// @returns {Function}
function createTestCallback( marker, minimumCharacters, validMentionCharacters ) {
    const regExp = createRegExp( marker, minimumCharacters, validMentionCharacters );

    return text => regExp.test( text );
}

// Creates a text matcher from the marker.
//
// @param {String} marker
// @returns {Function}
function createTextMatcher( marker, validMentionCharacters ) {
    const regExp = createRegExp( marker, 0, validMentionCharacters );

    return text => {
        const match = text.match( regExp );

        const marker = match[ 2 ];
        const feedText = match[ 3 ];

        return { marker, feedText };
    };
}

// The default feed callback.
function createFeedCallback( feedItems ) {
    return feedText => {
        const filteredItems = feedItems
        // Make the default mention feed case-insensitive.
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

// Checks if a given key code is handled by the mention UI.
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
