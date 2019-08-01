import Vue, { ComponentOptions } from 'vue';
import Component from 'vue-class-component';
import { Prop, Inject } from 'vue-property-decorator';
import {
    isFilterTag,
    parseFilterTag,
    COMBINE_ACTION_NAME,
    AuxFile,
} from '@casual-simulation/aux-common';
import CombineIcon from '../public/icons/combine_icon.svg';
import { getColorForTags } from '../../shared/scene/ColorUtils';
import TagColor from '../TagColor/TagColor';
import MiniFile from '../MiniFile/MiniFile';

@Component({
    components: {
        'combine-icon': CombineIcon,
        'tag-color': TagColor,
        'mini-file': MiniFile,
    },
})
export default class FileTagMini extends Vue {
    @Prop() tag: string;

    /**
     * Whether the tag is allowed to be dragged from the file table into the world.
     */
    @Prop({ default: true })
    allowCloning: boolean;

    @Prop()
    files: AuxFile;

    get filterData() {
        return parseFilterTag(this.tag);
    }

    get isFilter() {
        return isFilterTag(this.tag);
    }

    get isCombine() {
        if (this.isFilter) {
            const data = this.filterData;
            return data.eventName === COMBINE_ACTION_NAME;
        } else {
            return false;
        }
    }

    constructor() {
        super();
    }
}
