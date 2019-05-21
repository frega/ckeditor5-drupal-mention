/**
 * @module drupalmention/drupalmention
 */

import Mention from "@ckeditor/ckeditor5-mention/src/mention";
import DrupalMentionUI from "./drupalmentionui";
import MentionEditing from "@ckeditor/ckeditor5-mention/src/mentionediting";

/**
 * Drupal Mention plugin.
 */
export default class DrupalMention extends Mention {
    /**
     * @inheritDoc
     */
    static get requires() {
        return [
            Mention
        ];
    }

    /**
     * @inheritDoc
     */
    static get pluginName() {
        return 'DrupalMention';
    }

    /**
     * @inheritDoc
     */
    static get requires() {
        return [ MentionEditing, DrupalMentionUI ];
    }

    /**
     * @inheritDoc
     */
    init() {
        this.editor.conversion.for( 'upcast' ).elementToAttribute( {
            view: {
                name: 'span',
                key: 'data-mention',
                classes: 'mention',
                attributes: {
                    href: true
                }
            },
            model: {
                key: 'mention',
                value: viewItem => this.editor.plugins.get( 'Mention' ).toMentionAttribute( viewItem )
            },
            converterPriority: 'high'
        } );

        this.editor.conversion.for( 'downcast' ).attributeToElement( {
            model: 'mention',
            view: ( modelAttributeValue, viewWriter ) => {
                // Do not convert empty attributes (lack of value means no mention).
                if ( !modelAttributeValue ) {
                    return;
                }

                let href;
                return viewWriter.createAttributeElement( 'span', {
                    class: 'mention',
                    'data-mention': modelAttributeValue.id,
                    href
                } );
            },
            converterPriority: 'high'
        } );
    }

}
