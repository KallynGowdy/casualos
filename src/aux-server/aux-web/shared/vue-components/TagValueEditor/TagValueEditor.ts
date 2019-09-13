import Vue from 'vue';
import Component from 'vue-class-component';
import { Prop, Watch } from 'vue-property-decorator';
import { File } from '@casual-simulation/aux-common';
import SimpleTagEditor from '../SimpleTagEditor/SimpleTagEditor';
import MonacoLoader from '../MonacoLoader/MonacoLoader';

const MonacoAsync = () => ({
    component: import('../MonacoTagEditor/MonacoTagEditor'),
    loading: MonacoLoader,

    delay: 50,
});

@Component({
    components: {
        'monaco-editor': <any>MonacoAsync,
        'simple-editor': SimpleTagEditor,
    },
})
export default class TagValueEditor extends Vue {
    @Prop({ required: true }) tag: string;
    @Prop({ required: true }) file: File;
    @Prop({ default: false }) showDesktopEditor: boolean;

    constructor() {
        super();
    }
}