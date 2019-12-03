import Vue from 'vue';
import Component from 'vue-class-component';
import { Inject, Watch, Prop } from 'vue-property-decorator';
import {
    Bot,
    BotCalculationContext,
    calculateFormattedBotValue,
    calculateBotValue,
    isFormula,
} from '@casual-simulation/aux-common';
import { appManager } from '../../shared/AppManager';
import { ContextItem } from '../ContextItem';

@Component({
    components: {},
})
export default class MenuBot extends Vue {
    @Prop() item: ContextItem;
    @Prop() index: number;
    @Prop({ default: false })
    selected: boolean;

    label: string = '';
    labelColor: string = '#000';
    backgroundColor: string = '#FFF';

    @Watch('item')
    private async _botChanged(item: ContextItem) {
        if (item) {
            const simulation = _simulation(item);
            const calc = simulation.helper.createContext();
            this._updateLabel(calc, item.bot);
            this._updateColor(calc, item.bot);
        } else {
            this.label = '';
            this.labelColor = '#000';
            this.backgroundColor = '#FFF';
        }
    }

    constructor() {
        super();
    }

    mounted() {
        this._botChanged(this.item);
    }

    async click() {
        const simulation = _simulation(this.item);
        await simulation.helper.action('onClick', [this.item.bot]);
    }

    private _updateColor(calc: BotCalculationContext, bot: Bot) {
        if (bot.tags['auxColor']) {
            this.backgroundColor = calculateBotValue(calc, bot, 'auxColor');
        } else {
            this.backgroundColor = '#FFF';
        }
    }

    private _updateLabel(calc: BotCalculationContext, bot: Bot) {
        let label = bot.tags['aux.label'];
        if (label) {
            this.label = calculateFormattedBotValue(calc, bot, 'aux.label');
            const labelColor = bot.tags['aux.label.color'];
            if (labelColor) {
                this.labelColor = calculateFormattedBotValue(
                    calc,
                    bot,
                    'aux.label.color'
                );
            } else {
                this.labelColor = '#000';
            }
        } else {
            this.label = '';
        }
    }
}

function _simulation(item: any) {
    return appManager.simulationManager.simulations.get(item.simulationId);
}
