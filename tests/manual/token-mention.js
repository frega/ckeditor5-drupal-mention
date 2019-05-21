import ClassicEditor from '@ckeditor/ckeditor5-editor-classic/src/classiceditor';
import Underline from '@ckeditor/ckeditor5-basic-styles/src/underline';
import Strikethrough from '@ckeditor/ckeditor5-basic-styles/src/strikethrough';
import EnterPlugin from '@ckeditor/ckeditor5-enter/src/enter';
import TypingPlugin from '@ckeditor/ckeditor5-typing/src/typing';
import ParagraphPlugin from '@ckeditor/ckeditor5-paragraph/src/paragraph';
import DrupalMention from "@frega/ckeditor5-drupal-mention/src/drupalmention";

const users = [
    { id: '@cflores-de-gùzman', avatar: 'm_1', name: 'Charles Flores-De Guzman' },
    { id: '@gjackson', avatar: 'm_2', name: 'Gerald Jackson' },
    { id: '@wreed', avatar: 'm_3', name: 'Wayne Reed' },
    { id: '@lgarcia', avatar: 'm_4', name: 'Louis Garcia' },
    { id: '@rwilson', avatar: 'm_5', name: 'Roy Wilson' },
    { id: '@mnelson', avatar: 'm_6', name: 'Matthew Nelson' },
    { id: '@rwilliams', avatar: 'm_7', name: 'Randy Williams' },
    { id: '@ajohnson', avatar: 'm_8', name: 'Albert Johnson' },
    { id: '@sroberts', avatar: 'm_9', name: 'Steve Roberts' },
    { id: '@kevans', avatar: 'm_10', name: 'Kevin Evans' },
    { id: '@mwilson', avatar: 'w_1', name: 'Mildred Wilson' },
    { id: '@mnelson', avatar: 'w_2', name: 'Melissa Nelson' },
    { id: '@kallen', avatar: 'w_3', name: 'Kathleen Allen' },
    { id: '@myoung', avatar: 'w_4', name: 'Mary Young' },
    { id: '@arogers', avatar: 'w_5', name: 'Ashley Rogers' },
    { id: '@dgriffin', avatar: 'w_6', name: 'Debra Griffin' },
    { id: '@dwilliams', avatar: 'w_7', name: 'Denise Williams' },
    { id: '@ajames', avatar: 'w_8', name: 'Amy James' },
    { id: '@randerson', avatar: 'w_9', name: 'Ruby Anderson' },
    { id: '@wlee', avatar: 'w_10', name: 'Wanda Lee' }
];

let mention = {
    feeds: [
        {
            marker: '@',
            feed: users,
            validCharacters: '-_a-zA-Z0-9À-ž',
        },
        {
            marker: '#',
            feed: [
                '#american', '#asian', '#baking', '#breakfast', '#cake', '#caribbean',
                '#chinese', '#chocolate'
            ],
        },
        {
            marker: '!',
            feed: [
                '!0', '!1', '!2', '!0:2',
            ],
            validCharacters: '0-9:',
        }
    ]
};


ClassicEditor
    .create( document.querySelector( '.chat__editor' ), {
        extraPlugins: [ DrupalMention, Underline, Strikethrough, EnterPlugin, TypingPlugin, ParagraphPlugin ],
        toolbar: {
            items: [
                'bold', 'italic', 'underline', 'strikethrough', '|', 'link', '|', 'undo', 'redo'
            ]
        },
        mention: mention
    } )
    .then( editor => {
        document.querySelector( '.chat-send' ).addEventListener( 'click', () => {
            console.log(editor.getData());
        } );
    } )
    .catch( err => {
        console.error( err.stack );
    } );
