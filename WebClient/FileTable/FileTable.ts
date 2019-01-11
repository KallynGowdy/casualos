import Vue, { ComponentOptions } from 'vue';
import Component from 'vue-class-component';
import {Provide, Prop, Inject} from 'vue-property-decorator';
import { some } from 'lodash';
import {File, Object} from 'common/Files';
import { EventBus } from '../EventBus/EventBus';
import { fileTags } from 'common/Files/FileCalculations';
import { appManager } from '../AppManager';
import { FileManager } from '../FileManager';
import { SocketManager } from '../SocketManager';

import FileRow from '../FileRow/FileRow';
import TagEditor from '../TagEditor/TagEditor';
import AlertDialogOptions from '../App/DialogOptions/AlertDialogOptions';

@Component({
    components: {
        'file-row': FileRow,
        'tag-editor': TagEditor
    },
    inject: {
      fileManager: 'fileManager'
    }
})
export default class FileTable extends Vue {

    @Inject() private fileManager: FileManager;

    files: Object[] = [];
    tags: string[] = [];
    lastEditedTag: string = null;
    isMakingNewTag: boolean = false;
    newTag: string = 'myNewTag';

    get user() {
        return appManager.user;
    }

    get hasFiles() {
        return this.files.length > 0;
    }

    addTag() {
        if (this.isMakingNewTag) {
            // Check to make sure that the tag is unique.
            if (this.tagExists(this.newTag)) {
                var options = new AlertDialogOptions();
                options.title = 'Tag already exists';
                options.body = 'Tag \'' + this.newTag + '\' already exists on this file.';
                options.confirmText = "Close";

                // Emit dialog event.
                EventBus.$emit('showAlertDialog', options);
                return;
            }
            
            this.tags.push(this.newTag);
        } else {
            this.newTag = 'newTag';
        }
        this.isMakingNewTag = !this.isMakingNewTag;
    }

    cancelNewTag() {
        this.isMakingNewTag = false;
    }

    clearSelection() {
        this.fileManager.clearSelection();
    }

    onTagChanged(tag: string) {
        this.lastEditedTag = tag;
    }

    onTagFocusChanged(event: { file: Object, tag: string, focused: boolean }) {
        this.$emit('tagFocusChanged', event);
    }

    removeTag(tag: string) {
        if (tag === this.lastEditedTag || tag === this.newTag) {
            this.lastEditedTag = null;
            this.tags = fileTags(this.files, this.tags, []);
        }
    }

    tagHasValue(tag: string): boolean {
        return some(this.files, f => f.tags[tag]);
    }

    tagExists(tag: string): boolean {
        return this.tags.indexOf(tag, 0) !== -1;
    }

    constructor() {
        super();
    }

    async created() {
        await this.fileManager.init();

        this.files = [];
        this.tags = [];

        this.fileManager.selectedFilesUpdated.subscribe(event => {
            this.files = event.files;
            this.tags = fileTags(this.files, this.tags, this.lastEditedTag ? [this.lastEditedTag] : []);
        });
    }
};