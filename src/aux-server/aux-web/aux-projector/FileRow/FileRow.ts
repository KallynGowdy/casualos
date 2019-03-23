import Vue, { ComponentOptions } from 'vue';
import Component from 'vue-class-component';
import {Prop, Inject} from 'vue-property-decorator';
import { SubscriptionLike } from 'rxjs';
import { Object, File, getShortId, AuxObject } from '@yeti-cgi/aux-common';
import FileValue from '../FileValue/FileValue';
import { appManager } from '../../shared/AppManager';

@Component({
    components: {
        'file-value': FileValue
    }
})
export default class FileRow extends Vue {
    @Prop() file: AuxObject;
    @Prop() tags: string[];
    @Prop({ default: false }) readOnly: boolean;
    @Prop({}) updateTime: number;

    get fileManager() {
        return appManager.fileManager;
    }

    private _sub: SubscriptionLike;

    constructor() {
        super();
    }

    toggleFile(file: AuxObject) {
        this.fileManager.selectFile(file);
    }

    onTagChanged(tag: string) {
        this.$emit('tagChanged', tag);
    }

    getShortId(file: Object) {
        return getShortId(file);
    }

    tagFocusChanged(file: Object, tag: string, focused: boolean) {
        this.$emit('tagFocusChanged', {
            file,
            tag,
            focused
        });
    }
};